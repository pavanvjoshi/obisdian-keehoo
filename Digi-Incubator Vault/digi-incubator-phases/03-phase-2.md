---
title: Phase 2 — Multi-User, Invites & Workspace Switching
tags: [phase, multi-user, invites, auth, rbac, p2]
phase: 2
duration: Weeks 6–7
scope: Auth + Frontend · Validates Phase 0 schema investment
status: not-started
created: 2026-04-14
---

# Phase 2 — Multi-User, Invites & Workspace Switching

> [!important] Why this phase validates Phase 0
> The entire multi-tenant schema — `users`, `organizations`, `memberships`, `invites` — was built in Phase 0 for exactly this moment. A co-founder joining is one `INSERT` into `memberships`. If Phase 0 had been skipped, adding a second user would require migrating every `planning_data`, `idea_documents`, and `tasks` row. This phase proves the schema investment was correct.

---

## Prerequisites (from [[02-phase-1|Phase 1]])

- [ ] All 6 AI agents live with fire-and-poll async pattern
- [ ] Freemium enforcement working
- [ ] 4 multi-user UI constraints already baked in (triggered_by, org name in nav, org_id keyed state, invite slot reserved)
- [ ] `startup_milestones` table live
- [ ] Agent run history showing `triggered_by` user email

---

## Step 1 — Invite flow (backend)

The `invites` table exists from [[01-phase-0|Phase 0]]. This step wires the email and token flow.

```python
# services/invite_service.py

async def send_invite(ctx: TenantContext, invited_email: str, role: str) -> Invite:
    # Check role permission — only owner/admin can invite
    if ctx.role not in ('owner', 'admin'):
        raise HTTPException(403, "Insufficient role to send invites")

    # Check plan member limit
    await check_member_limit(ctx)

    # Generate token
    token = secrets.token_urlsafe(32)
    invite = await db.insert(invites,
        org_id=ctx.tenant_id,
        invited_email=invited_email,
        role=role,
        token=token,
        invited_by=ctx.user_id,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )

    # Send magic link email
    await email_service.send_invite(
        to=invited_email,
        invite_url=f"{settings.BASE_URL}/invite/accept?token={token}",
        org_name=await get_org_name(ctx.tenant_id)
    )
    return invite
```

### Plan member limits

```python
# services/billing_service.py — add to existing PLAN_LIMITS
PLAN_LIMITS = {
    'free':      {'members': 1},   # solo only
    'builder':   {'members': 3},   # up to 3
    'scale':     {'members': None}, # unlimited
    'enterprise':{'members': None},
}

async def check_member_limit(ctx: TenantContext):
    sub = await subscription_repo.get(ctx.tenant_id)
    limit = PLAN_LIMITS[sub.plan_tier]['members']
    if limit is None:
        return
    current = await membership_repo.count_active(ctx.tenant_id)
    if current >= limit:
        raise HTTPException(402, detail={"code": "member_limit_reached", "upgrade_to": "scale"})
```

---

## Step 2 — Invite redemption (new vs existing user)

> [!note] One magic link handles both paths — invitee has an account, or invitee is new
> The token encodes `org_id` and `role`. The landing page detects account existence by email lookup.

```python
# api/public/invite.py  ← public route, no tenant_middleware

@router.get("/invite/accept")
async def accept_invite_landing(token: str):
    invite = await db.fetchrow(
        "SELECT * FROM invites WHERE token=$1 AND status='pending' AND expires_at > now()",
        token
    )
    if not invite:
        raise HTTPException(404, "Invite not found or expired")

    # Check if email already has an account
    existing_user = await db.fetchrow(
        "SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL",
        invite['invited_email']
    )

    if existing_user:
        # Path A — existing user: just add membership
        return {"path": "login_and_join", "token": token, "email": invite['invited_email']}
    else:
        # Path B — new user: show signup form, then add membership
        return {"path": "signup_and_join", "token": token, "email": invite['invited_email']}


@router.post("/invite/redeem")
async def redeem_invite(token: str, user_id: UUID):
    """Called after login (Path A) or after new account creation (Path B)."""
    async with db.transaction():
        invite = await db.fetchrow(
            "SELECT * FROM invites WHERE token=$1 AND status='pending' AND expires_at > now()",
            token
        )
        if not invite:
            raise HTTPException(410, "Invite expired or already used")

        # Create membership
        await db.execute(
            "INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)"
            " ON CONFLICT (user_id, org_id) DO NOTHING",
            user_id, invite['org_id'], invite['role']
        )

        # Mark invite accepted
        await db.execute(
            "UPDATE invites SET status='accepted' WHERE id=$1",
            invite['id']
        )
    # Redirect to the org's dashboard
    return RedirectResponse(f"/dashboard?org_id={invite['org_id']}")
```

---

## Step 3 — Role-based access control

The `role` field on `memberships` is already stored. Phase 2 enforces it as action-level guards.

```python
# core/rbac.py

ROLE_PERMISSIONS = {
    'owner': {
        'invite_member', 'remove_member', 'change_role',
        'delete_org', 'run_agent', 'edit_startup', 'view_data'
    },
    'admin': {
        'invite_member', 'remove_member',
        'run_agent', 'edit_startup', 'view_data'
    },
    'member': {
        'run_agent', 'view_data'
    }
}

def require_permission(permission: str):
    def check(ctx: TenantContext = Depends(get_tenant_context)):
        if permission not in ROLE_PERMISSIONS.get(ctx.role, set()):
            raise HTTPException(403, f"Role '{ctx.role}' cannot '{permission}'")
    return Depends(check)

# Usage in routes:
@router.delete("/org/member/{user_id}", dependencies=[require_permission('remove_member')])
async def remove_member(user_id: UUID, ctx: TenantContext = Depends(get_tenant_context)):
    ...
```

---

## Step 4 — Active org in session + org switcher

> [!warning] Session must store `active_org_id` for org-based personas
> When a user belongs to multiple orgs (e.g. founder of two startups), the session must know which org is currently active. Switching org = one UPDATE to the session, not to the database.

```python
# Session shape (stored in Redis or JWT)
{
    "user_id": "uuid",
    "active_persona": "founder",
    "active_org_id": "uuid-org-001",  # changes on org switch
}

# api/authenticated/session.py
@router.post("/session/switch-org")
async def switch_active_org(org_id: UUID, request: Request):
    user = await get_user_from_session(request)

    # Verify membership exists
    membership = await db.fetchrow(
        "SELECT role FROM memberships WHERE user_id=$1 AND org_id=$2 AND deleted_at IS NULL",
        user.id, org_id
    )
    if not membership:
        raise HTTPException(403, "Not a member of this organization")

    # Update session only — no DB write needed
    request.session['active_org_id'] = str(org_id)
    return {"switched_to": str(org_id)}
```

**UI — org switcher in nav:**
- Show org name in nav header (constraint 2 from Phase 1 — already reserved)
- If user has >1 startup org: show dropdown to switch
- Switching org clears all dashboard state and re-fetches for new `active_org_id`

---

## Step 5 — Persona switching

```python
@router.post("/session/switch-persona")
async def switch_persona(persona: str, request: Request):
    user = await get_user_from_session(request)

    valid = {'founder', 'investor', 'mentor', 'student'}
    if persona not in valid:
        raise HTTPException(400)

    # Update DB — active_persona is the source of truth
    await db.execute(
        "UPDATE users SET active_persona=$1 WHERE id=$2",
        persona, user.id
    )

    # Clear active_org_id from session — middleware will resolve for new persona
    request.session['active_persona'] = persona
    request.session.pop('active_org_id', None)

    return {"switched_to": persona}
```

> [!note] Switching persona does not delete data
> Switching from founder to mentor mode and back restores all founder data exactly as it was. The `active_persona` column controls which dashboard renders — the underlying data is untouched.

---

## Step 6 — Run attribution in the UI

Phase 1 ensured every `planning_data` row has a `user_id`. Phase 2 wires the display.

```python
# repositories/planning_repo.py
async def get_run_history(ctx: TenantContext, panel: str) -> list[dict]:
    return await db.fetch(
        """
        SELECT pd.*, u.email AS triggered_by_email
        FROM planning_data pd
        JOIN users u ON u.id = pd.user_id
        WHERE pd.org_id = $1
          AND pd.panel  = $2
          AND pd.deleted_at IS NULL
        ORDER BY pd.created_at DESC
        """,
        ctx.tenant_id, panel
    )
```

**Dashboard display for run history:**
```
Market Research
├── Run by arjun@startup.com · 2 hours ago  · v1 · completed     [View] [Compare]
├── Run by riya@startup.com  · 3 days ago   · v1 · completed     [View] [Compare]
└── Run by riya@startup.com  · 1 week ago   · v1 · completed     [View] [Archive]
```

---

## Step 7 — Second idea / workspace isolation test

> [!note] This is a validation test, not new feature work
> The schema already supports multiple orgs per user. This step verifies that data isolation actually works — Riya's EdTech startup data cannot appear in her HealthTech workspace.

**Test scenario:**
1. Create user Riya with EdTech startup org (org-001)
2. Create second org HealthTech for same user Riya (org-002)
3. Run market research as Riya in org-001
4. Switch `active_org_id` to org-002
5. Query `GET /agents/runs/history` — must return zero rows (org-002 has no runs)
6. Switch back to org-001 — must return EdTech runs

```python
# Test assertion
async def test_workspace_isolation():
    ctx_edtech   = TenantContext(tenant_id=org_001, ...)
    ctx_healthtech = TenantContext(tenant_id=org_002, ...)

    runs_edtech    = await planning_repo.get_run_history(ctx_edtech, 'market_research')
    runs_healthtech = await planning_repo.get_run_history(ctx_healthtech, 'market_research')

    assert len(runs_edtech) > 0
    assert len(runs_healthtech) == 0  # must be empty
```

---

## Step 8 — Deprecate agent output columns on `startup_ideas`

> [!warning] Only do this step after all reads go through `planning_data` exclusively
> The columns `research_report`, `lean_canvas_output`, `market_sizing_output`, `financial_projection_output`, `gtm_output` on `startup_ideas` were kept as nullable fallbacks through Phase 1. Now that all reads go through `planning_data`, deprecate them.

```sql
-- Verify: no active reads from these columns
-- Check application code — grep for research_report, lean_canvas_output in codebase
-- If zero hits: drop them

ALTER TABLE startup_ideas DROP COLUMN IF EXISTS research_status;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS research_report;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS lean_canvas_status;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS lean_canvas_output;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS market_sizing_status;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS market_sizing_output;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS financial_projection_status;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS financial_projection_output;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS gtm_status;
ALTER TABLE startup_ideas DROP COLUMN IF EXISTS gtm_output;
```

---

## Verification checklist

- [x] Invite email sends with correct magic link
- [x] New user path: invite link → signup → membership created → redirected to org dashboard
- [x] Existing user path: invite link → login → membership added → redirected to org dashboard
- [x] Expired / already-used invite returns clear error
- [x] Role permissions enforced: `member` cannot invite, `admin` cannot delete org, `owner` can do all
- [x] Plan member limits enforced: `free` blocks >1 member, `builder` blocks >3
- [x] Org switcher shows correct orgs for multi-org users
- [x] Persona switcher updates `users.active_persona`
- [x] Switching persona back restores previous data
- [x] Run history shows `triggered_by_email` correctly (Arjun's run labeled with Arjun's email)
- [x] Workspace isolation test passes (zero data bleed between orgs)
- [x] Agent output columns deprecated from `startup_ideas` after all reads verified

---

## What is explicitly NOT done in Phase 2

> [!warning] These belong to later phases
- Do not build the Razorpay upgrade flow — Phase 3
- Do not build the Observer page for investors — Phase 4
- Do not send plan upgrade emails — Phase 3
- Do not build owner transfer mechanism — Phase 7 (but note: only owner can delete org — if owner leaves, org is inaccessible until Phase 7 adds transfer flow)

---

## Links

- Previous: [[02-phase-1|Phase 1 — Founder Solo Mode]]
- Next: [[04-phase-3|Phase 3 — Billing & Payments]]
- Invite flow design: [[02-multi-user-invite]]
- Workspace switching: [[03-second-idea]]
- Security model: [[06-security-model]]
