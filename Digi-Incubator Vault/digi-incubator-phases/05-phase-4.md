---
title: Phase 4 — Investor Persona, Observatory & Deal Pipeline
tags: [phase, investor, observatory, deal-pipeline, two-sided, p4]
phase: 4
duration: Weeks 10–12
scope: Full stack · Second major persona · Makes platform two-sided
status: not-started
created: 2026-04-14
---

# Phase 4 — Investor Persona, Observatory & Deal Pipeline

> [!important] What this phase unlocks
> Investors are the highest-revenue per-customer persona (₹24,999–49,999/mo). The Observatory is the platform's core value proposition for them. This phase makes Digi Incubator a two-sided platform — founders create data, investors pay to discover it.

> [!danger] Two inversion findings directly change this phase
> 1. **Observatory 50-startup gate:** Do not open investor signups until ≥50 founders have `is_discoverable = true`. If investors arrive to an empty Observatory, early churn is permanent reputation damage. The gate is a hard prerequisite, not a suggestion.
> 2. **Audit log moves here from Phase 6:** Enterprise sales conversations started at Phase 3 (Week 8). By Week 12, banks may be in security review. The audit log must be live before that — not in Phase 6.

---

## Prerequisites (from [[04-phase-3|Phase 3]])

- [ ] Billing and Razorpay live
- [ ] Investor plan prices defined in `PLAN_PRICES`
- [ ] Enterprise flag grantable via admin
- [ ] Enterprise sales outreach initiated

---

## HARD GATE — Observatory readiness check

> [!danger] Do not begin investor onboarding until this query returns ≥ 50

```sql
SELECT COUNT(*) AS discoverable_count
FROM startup_ideas
WHERE is_discoverable = true
  AND conviction_score IS NOT NULL
  AND deleted_at IS NULL;
-- Must be >= 50 before investor persona launches
-- If < 50: run the Observatory seeding campaign, delay Phase 4 launch
```

**If the count is below 50:**
- Send an in-app prompt to every founder who completed their conviction score: *"Your startup can now appear to investors. Turn on discovery?"*
- Add the `is_discoverable` toggle to the onboarding completion screen
- Phase 4 launch date moves — not the quality gate

---

## Step 1 — Audit log table (moved from Phase 6)

> [!danger] Inversion fix — audit log must exist before enterprise security reviews
> Enterprise sales started at Phase 3 (Week 8). A bank's security team may ask "who queried our approved startups last week?" by Week 12. The audit log must be live. Moving it to Phase 6 (Week 15) means it's absent during the critical early sales window.

```sql
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    org_id      UUID,
    action      VARCHAR(100) NOT NULL,
    resource_id UUID,
    ip_address  INET,
    metadata    JSONB,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_action_created ON audit_log(action, created_at DESC);
```

**Actions to log from this phase:**
```python
AUDIT_ACTIONS = {
    'observatory_query',        # investor queries Observatory
    'connection_request_sent',  # investor sends request to founder
    'connection_accepted',      # founder accepts
    'connection_declined',      # founder declines
    'startup_viewed',           # investor opens startup detail from Observatory
}
```

```python
# core/audit.py
async def write_audit(
    user_id: UUID,
    action: str,
    org_id: UUID | None = None,
    resource_id: UUID | None = None,
    metadata: dict | None = None,
    ip: str | None = None
):
    await db.execute(
        """INSERT INTO audit_log (user_id, org_id, action, resource_id, ip_address, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        user_id, org_id, action, resource_id, ip, json.dumps(metadata or {})
    )
```

---

## Step 2 — Observatory DB view

> [!danger] Inversion fix — Python whitelist `OBSERVATORY_PUBLIC_FIELDS` is a code convention, not a database enforcement
> Any developer can add a JOIN to the Observatory query without realising the security implication. A PostgreSQL view enforces the whitelist at the database level — the application queries the view, never the raw table.

```sql
CREATE VIEW observatory_view AS
SELECT
    s.id,
    s.name,
    s.tagline,
    s.sector,
    s.stage,
    s.state,
    s.conviction_score,
    s.mrr,
    s.dpiit_number IS NOT NULL AS has_dpiit,
    s.gstin IS NOT NULL        AS has_gstin,
    s.business_model_type,
    s.created_at
FROM startup_ideas s
WHERE s.is_discoverable = true
  AND s.deleted_at IS NULL;

-- Application ALWAYS queries this view — never the raw startups table for Observatory
-- Private tables (planning_data, lean_canvas, agent_runs) are never accessible from here
```

---

## Step 3 — Observatory API with rate limiting

> [!danger] Inversion gap — no rate limiting on Observatory means competitor scraping is trivial
> A programmatic caller can pull all discoverable startup data with zero throttle. Add rate limiting before launch.

```python
# middleware/observatory_middleware.py
from fastapi import Request
from app.core.redis import redis_client

async def observatory_rate_limit(request: Request, call_next):
    ctx = request.state.ctx
    key = f"observatory_rate:{ctx.tenant_id}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, 60)  # 1-minute window
    if count > 100:  # 100 requests/minute per org
        raise HTTPException(429, "Observatory rate limit exceeded")
    return await call_next(request)

# api/authenticated/investor/observatory.py
@router.get("/observatory")
async def query_observatory(
    sector: str | None = None,
    stage: str | None = None,
    state: str | None = None,
    conviction_min: int | None = None,
    conviction_max: int | None = None,
    has_gstin: bool | None = None,
    has_dpiit: bool | None = None,
    ctx: TenantContext = Depends(get_tenant_context)
):
    # Log every Observatory query for audit trail
    await write_audit(ctx.user_id, 'observatory_query', org_id=ctx.tenant_id)

    # Query ONLY the view — never the raw table
    results = await db.fetch(
        """SELECT * FROM observatory_view
           WHERE ($1::text IS NULL OR sector = $1)
             AND ($2::text IS NULL OR stage  = $2)
             AND ($3::text IS NULL OR state  = $3)
             AND ($4::int  IS NULL OR conviction_score >= $4)
             AND ($5::int  IS NULL OR conviction_score <= $5)
             AND ($6::bool IS NULL OR has_gstin = $6)
             AND ($7::bool IS NULL OR has_dpiit = $7)
           ORDER BY conviction_score DESC NULLS LAST
           LIMIT 50""",
        sector, stage, state, conviction_min, conviction_max, has_gstin, has_dpiit
    )
    return results
```

---

## Step 4 — Investor profile setup

```sql
CREATE TABLE investor_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    is_visible_to_founders  BOOLEAN NOT NULL DEFAULT false,
    thesis                  TEXT,
    sectors                 TEXT[],
    stage_preference        TEXT[],
    cheque_min              INTEGER,
    cheque_max              INTEGER,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);
```

---

## Step 5 — Solo angel — silent org creation

> [!note] Every solo investor gets an org even if they start alone
> If Karan's deal pipeline were scoped to `user_id`, adding an analyst later requires migrating every pipeline row. With a silent org from day one, adding a team member is one INSERT into memberships.

```python
async def create_investor_org(user_id: UUID, investor_type: str) -> Organization:
    """
    investor_type: 'solo_angel' → org_type='individual_investor'
                   'vc_firm'    → org_type='vc_firm'
    """
    async with db.transaction():
        org_type = 'individual_investor' if investor_type == 'solo_angel' else 'vc_firm'

        # Create org — silent for solo angels (not shown in their UI)
        org = await db.insert(organizations, name=f"investor-{user_id}", org_type=org_type)

        # Create membership
        await db.insert(memberships, user_id=user_id, org_id=org.id, role='owner')

        # Seed appropriate subscription plan
        plan = 'solo_angel' if investor_type == 'solo_angel' else 'vc_firm'
        await db.insert(subscriptions, org_id=org.id, plan_tier=plan, status='active')

        # Create investor profile
        await db.insert(investor_profiles, org_id=org.id)

    return org
```

---

## Step 6 — Deal pipeline

```sql
CREATE TABLE deal_pipeline (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id),
    startup_id              UUID NOT NULL REFERENCES startup_ideas(id),
    assigned_to             UUID REFERENCES users(id),
    stage                   VARCHAR(20) NOT NULL DEFAULT 'watchlist'
                            CHECK (stage IN ('watchlist','contacted','dd','term_sheet','closed','passed')),
    notes                   TEXT,
    connection_request_id   UUID REFERENCES connection_requests(id),
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);

CREATE INDEX idx_deal_pipeline_org ON deal_pipeline(org_id, stage) WHERE deleted_at IS NULL;
```

**Plan limits on deal pipeline:**
```python
PLAN_LIMITS['solo_angel']['max_deals'] = 50
PLAN_LIMITS['vc_firm']['max_deals'] = None      # unlimited
PLAN_LIMITS['vc_firm_large']['max_deals'] = None
```

---

## Step 7 — Connection requests (investor interest type)

```sql
CREATE TABLE connection_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_org_id         UUID NOT NULL REFERENCES organizations(id),
    to_org_id           UUID NOT NULL REFERENCES organizations(id),
    startup_id          UUID NOT NULL REFERENCES startup_ideas(id),
    investor_profile_id UUID REFERENCES investor_profiles(id),
    message             TEXT,
    request_type        VARCHAR(30) NOT NULL
                        CHECK (request_type IN ('investor_interest','loan_application','scheme_application')),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','declined')),
    decline_reason      TEXT,
    responded_at        TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_conn_req_to_org ON connection_requests(to_org_id, status);
CREATE INDEX idx_conn_req_from_org ON connection_requests(from_org_id, status);
```

> [!important] Contact emails are NEVER stored in connection_requests
> Email addresses are pulled from `users` ONLY after `status = 'accepted'`. Before acceptance, the investor has zero access to the founder's contact information.

```python
async def accept_connection_request(request_id: UUID, ctx: TenantContext):
    async with db.transaction():
        req = await db.fetchrow(
            "SELECT * FROM connection_requests WHERE id=$1 AND to_org_id=$2 AND status='pending'",
            request_id, ctx.tenant_id
        )
        if not req:
            raise HTTPException(404)

        await db.execute(
            "UPDATE connection_requests SET status='accepted', responded_at=now() WHERE id=$1",
            request_id
        )

        # Reveal contact info only now
        founder_email = await db.fetchval(
            """SELECT u.email FROM users u
               JOIN memberships m ON m.user_id=u.id
               WHERE m.org_id=$1 AND m.role='owner' AND m.deleted_at IS NULL""",
            req['to_org_id']
        )

        await write_audit(ctx.user_id, 'connection_accepted', resource_id=request_id)

        return {"accepted": True, "contact_email": founder_email}
```

---

## Step 8 — Investor directory for founders

Founders can browse investor profiles and send connection requests (subject to freemium limits).

```python
# api/authenticated/founder/discovery.py

@router.get("/investors")
async def browse_investors(
    sector: str | None = None,
    stage: str | None = None,
    ctx: TenantContext = Depends(get_tenant_context)
):
    return await db.fetch(
        """SELECT ip.*, o.name AS firm_name
           FROM investor_profiles ip
           JOIN organizations o ON o.id = ip.org_id
           WHERE ip.is_visible_to_founders = true
             AND ip.deleted_at IS NULL
             AND ($1::text IS NULL OR $1 = ANY(ip.sectors))
             AND ($2::text IS NULL OR $2 = ANY(ip.stage_preference))
           ORDER BY o.created_at DESC""",
        sector, stage
    )

@router.post("/investors/{investor_org_id}/connect")
async def send_investor_request(
    investor_org_id: UUID,
    payload: ConnectionRequestCreate,
    ctx: TenantContext = Depends(get_tenant_context)
):
    # Check monthly request limit (2/mo on free plan)
    await check_investor_request_limit(ctx)

    startup = await startup_repo.get(ctx)
    req = await db.insert(connection_requests,
        from_org_id=ctx.tenant_id,
        to_org_id=investor_org_id,
        startup_id=startup.id,
        request_type='investor_interest',
        message=payload.message
    )
    await write_audit(ctx.user_id, 'connection_request_sent', resource_id=req.id)
    return req
```

---

## Step 9 — Persona desync fix (session invalidation)

> [!warning] Inversion risk — multi-tab persona desync causes confusing 403 errors
> If Riya is removed from her startup while she has two browser tabs open, the second tab sends a stale `active_org_id` and gets a raw 403. The middleware must redirect gracefully, not crash.

The middleware update was done in [[01-phase-0|Phase 0]]. Phase 4 adds session invalidation on membership revoke:

```python
async def remove_member(org_id: UUID, user_id: UUID, ctx: TenantContext):
    await db.execute(
        "UPDATE memberships SET deleted_at=now() WHERE user_id=$1 AND org_id=$2",
        user_id, org_id
    )
    # Invalidate all sessions for this user — they'll be redirected to persona selector
    await redis_client.delete(f"session:{user_id}:*")
```

---

## Verification checklist

- [ ] Observatory 50-startup gate passes before launch
- [ ] Audit log table live with indexes
- [ ] All Observatory queries write to audit_log
- [ ] `observatory_view` created — application queries view only, never raw table
- [ ] Observatory rate limiting: 100 req/min per org
- [ ] Investor profile setup flow
- [ ] Solo angel silent org created on signup
- [ ] Deal pipeline CRUD with 6 stages
- [ ] Solo angel 50-deal limit enforced
- [ ] Connection request flow (investor interest type)
- [ ] Contact email revealed ONLY after `status='accepted'`
- [ ] Connection accepted logged to audit_log
- [ ] Founder investor directory with sector/stage filters
- [ ] 2 investor requests/mo enforced on free founder plan
- [ ] Membership revoke invalidates user sessions
- [ ] All three investor subscription tiers enforced (solo_angel, vc_firm, vc_firm_large)

---

## What is explicitly NOT done in Phase 4

> [!warning] These belong to later phases
- Do not build bank or govt profiles — Phase 6
- Do not build mentor booking — Phase 5
- Do not add `loan_application` or `scheme_application` request types yet — Phase 6
- Do not add PostgreSQL RLS — Phase 7

---

## Links

- Previous: [[04-phase-3|Phase 3 — Billing & Payments]]
- Next: [[06-phase-5|Phase 5 — Mentor Marketplace]]
- Two-way discovery design: [[04-two-way-discovery]]
- Investor persona: [[02-investor-vc]] · [[03-investor-solo]]
- Pricing: [[09-pricing-architecture]]
- Inversion: [[10-inversion-tenancy]] · [[11-inversion-pricing]]
