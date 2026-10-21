---
title: Phase 6 — Bank & Government Personas
tags: [phase, bank, government, enterprise, loan-pipeline, scheme, p6]
phase: 6
duration: Weeks 15–18
scope: Full stack · Enterprise contracts · Loan and scheme pipelines
status: not-started
created: 2026-04-14
---

# Phase 6 — Bank & Government Personas

> [!important] Why enterprise comes last among personas
> Banks and government bodies require CGTMSE/DPIIT fields (on `startups` since Phase 0), the `connection_requests` table (live since Phase 4), and the `audit_log` (live since Phase 4). All plumbing is already in place. Phase 6 builds the persona-specific pipelines on top of it.

> [!note] The audit log is already live (moved to Phase 4)
> Enterprise sales conversations started at Phase 3. By now (Week 15), you may already have bank prospects in security review. The audit log being live since Phase 4 means you can answer "who queried our approved startups?" for any enterprise prospect.

---

## Prerequisites (from [[06-phase-5|Phase 5]])

- [ ] `connection_requests` table live with `investor_interest` type working
- [ ] `audit_log` live with Observatory and connection request logging
- [ ] Enterprise `plan_tier` grantable via admin
- [ ] Enterprise sales outreach active (started Phase 3)
- [ ] Audit log data available for 4+ weeks (since Phase 4)

---

## Step 1 — Bank profile

```sql
CREATE TABLE bank_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    is_visible_to_founders  BOOLEAN NOT NULL DEFAULT false,
    loan_types              TEXT[],
    min_mrr                 INTEGER,
    requires_gstin          BOOLEAN NOT NULL DEFAULT false,
    cgtmse_partner          BOOLEAN NOT NULL DEFAULT false,
    interest_rate_range     VARCHAR(50),
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);
```

---

## Step 2 — Government scheme profile

```sql
CREATE TABLE scheme_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    is_visible_to_founders  BOOLEAN NOT NULL DEFAULT false,
    scheme_name             VARCHAR(255) NOT NULL,
    sectors                 TEXT[],
    max_grant_amount        INTEGER,
    requires_dpiit_number   BOOLEAN NOT NULL DEFAULT false,
    application_deadline    DATE,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);
```

---

## Step 3 — Loan application pipeline

```sql
CREATE TABLE loan_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id),  -- bank's org
    startup_id              UUID NOT NULL REFERENCES startup_ideas(id),
    connection_request_id   UUID REFERENCES connection_requests(id),
    loan_amount             INTEGER,
    cgtmse_eligible         BOOLEAN NOT NULL DEFAULT false,
    stage                   VARCHAR(20) NOT NULL DEFAULT 'under_review'
                            CHECK (stage IN ('under_review','approved','disbursed','rejected')),
    assigned_officer        UUID REFERENCES users(id),
    notes                   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);

CREATE INDEX idx_loan_app_bank ON loan_applications(org_id, stage) WHERE deleted_at IS NULL;
```

**Stage flow:**
```
under_review → approved → disbursed
under_review → rejected
```

---

## Step 4 — Scheme application pipeline

```sql
CREATE TABLE scheme_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id),  -- govt's org
    startup_id              UUID NOT NULL REFERENCES startup_ideas(id),
    scheme_profile_id       UUID NOT NULL REFERENCES scheme_profiles(id),
    connection_request_id   UUID REFERENCES connection_requests(id),
    grant_amount            INTEGER,
    status                  VARCHAR(20) NOT NULL DEFAULT 'applied'
                            CHECK (status IN ('applied','shortlisted','approved','rejected')),
    assigned_officer        UUID REFERENCES users(id),
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);

CREATE INDEX idx_scheme_app_govt ON scheme_applications(org_id, status) WHERE deleted_at IS NULL;
```

---

## Step 5 — Connection requests: loan and scheme types

The `connection_requests` table already exists from Phase 4. Phase 6 adds the two remaining request types.

**Founder initiates loan application:**
```python
# api/authenticated/founder/discovery.py

@router.post("/banks/{bank_org_id}/apply")
async def apply_for_loan(
    bank_org_id: UUID,
    payload: LoanApplicationRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    startup = await startup_repo.get(ctx)

    # Create connection request
    req = await db.insert(connection_requests,
        from_org_id=ctx.tenant_id,
        to_org_id=bank_org_id,
        startup_id=startup.id,
        request_type='loan_application',
        message=payload.message
    )

    # Create loan application (pending bank acceptance)
    await db.insert(loan_applications,
        org_id=bank_org_id,
        startup_id=startup.id,
        connection_request_id=req.id,
        loan_amount=payload.requested_amount,
        cgtmse_eligible=bool(startup.dpiit_number)
    )

    await write_audit(ctx.user_id, 'loan_application_sent',
        org_id=ctx.tenant_id, resource_id=req.id)
    return req
```

**Bank accepts and enters loan pipeline:**
```python
async def accept_loan_request(request_id: UUID, ctx: TenantContext):
    async with db.transaction():
        req = await db.fetchrow(
            "SELECT * FROM connection_requests WHERE id=$1 AND to_org_id=$2 AND status='pending'",
            request_id, ctx.tenant_id
        )
        await db.execute(
            "UPDATE connection_requests SET status='accepted', responded_at=now() WHERE id=$1",
            request_id
        )
        # Update loan application stage
        await db.execute(
            "UPDATE loan_applications SET stage='under_review' WHERE connection_request_id=$1",
            request_id
        )
        await write_audit(ctx.user_id, 'loan_application_accepted', resource_id=request_id)
```

---

## Step 6 — GSTIN + DPIIT Observatory filters for bank/govt

These fields have been on `startup_ideas` since [[01-phase-0|Phase 0]] and are exposed via `observatory_view` as `has_gstin` and `has_dpiit`. Phase 6 adds the bank/govt-specific Observatory filters.

```python
# api/authenticated/bank/observatory.py

@router.get("/bank/observatory")
async def bank_observatory(
    min_mrr: int | None = None,
    requires_gstin: bool | None = None,
    cgtmse_eligible: bool | None = None,
    stage: str | None = None,
    ctx: TenantContext = Depends(get_tenant_context)
):
    await write_audit(ctx.user_id, 'observatory_query', org_id=ctx.tenant_id,
                      metadata={"persona": "bank"})

    return await db.fetch(
        """SELECT * FROM observatory_view
           WHERE ($1::int IS NULL OR mrr >= $1)
             AND ($2::bool IS NULL OR has_gstin = $2)
             AND ($3::bool IS NULL OR has_dpiit = $3)
             AND ($4::text IS NULL OR stage = $4)
           ORDER BY mrr DESC NULLS LAST
           LIMIT 50""",
        min_mrr, requires_gstin, cgtmse_eligible, stage
    )
```

---

## Step 7 — What bank/govt can NEVER access

> [!danger] Audit every Observatory query — private tables must never be touched
> Banks and government bodies pay significant amounts for Observatory access. The temptation to add "just one more field" is real. These tables must never appear in any query accessible to bank or govt personas.

| Never accessible | Always accessible via observatory_view |
|---|---|
| `planning_data` (all agent runs) | `name`, `tagline`, `sector`, `stage`, `state` |
| Lean canvas content | `conviction_score` |
| Financial projections | `mrr` (if founder made public) |
| GTM strategy | `has_dpiit` (boolean — presence only) |
| Investor deal notes | `has_gstin` (boolean — presence only) |
| Other bank's loan notes | Public milestones |
| Founder email (before consent) | — |

```python
# Integration test — must pass before Phase 6 launch
async def test_bank_cannot_access_private_data():
    bank_ctx = TenantContext(tenant_id=bank_org_id, tenant_type='org', ...)
    
    # Attempt to query planning_data as a bank — must be blocked
    with pytest.raises(PermissionError):
        await planning_repo.get_run_history(bank_ctx, 'market_research')
    
    # Observatory query — must return only whitelisted fields
    results = await bank_observatory_query(bank_ctx)
    for row in results:
        assert 'planning_data' not in row
        assert 'lean_canvas' not in row
        assert 'email' not in row
```

---

## Step 8 — Paid pilot admin flow

> [!important] PD-04 rule — no enterprise contract without a 3-month paid pilot first
> Target conversion: >70% of pilots convert to annual contract. If below 70%, it is a product problem, not a pricing problem.

```python
# api/authenticated/admin.py — internal admin endpoint

@router.post("/admin/enterprise/pilot")
async def create_enterprise_pilot(
    org_id: UUID,
    persona_type: Literal['bank', 'govt'],
    notes: str
):
    """
    Creates a 3-month paid pilot for bank or govt org.
    Pilot pricing: Bank ₹1L/3mo equivalent · Govt ₹50K/3mo equivalent
    Tracked separately — not via self-serve Razorpay.
    """
    pilot_expires = datetime.utcnow() + timedelta(days=90)
    await db.execute(
        """UPDATE subscriptions
           SET plan_tier='enterprise', status='active', expires_at=$1
           WHERE org_id=$2""",
        pilot_expires, org_id
    )
    await write_audit(
        user_id=admin_user_id,
        action='enterprise_pilot_created',
        org_id=org_id,
        metadata={"persona": persona_type, "notes": notes, "expires": str(pilot_expires)}
    )

@router.get("/admin/enterprise/pilots")
async def list_pilots():
    """Track pilot → contract conversion rate. Target: >70%."""
    return await db.fetch(
        """SELECT o.name, o.org_type, s.expires_at, s.status,
                  audit_log.created_at AS pilot_started
           FROM subscriptions s
           JOIN organizations o ON o.id = s.org_id
           LEFT JOIN audit_log ON audit_log.org_id = s.org_id
               AND audit_log.action = 'enterprise_pilot_created'
           WHERE s.plan_tier = 'enterprise'
           ORDER BY s.expires_at ASC"""
    )
```

---

## Step 9 — Enterprise pricing reference

| Customer | Pilot | Annual contract |
|---|---|---|
| Bank (small) | ₹1L / 3 months | ₹3L–₹5L / year |
| Bank (large) | ₹2L / 3 months | ₹12L–₹50L / year |
| State government | ₹50K / 3 months | ₹2L–₹5L / year |
| Central govt / DPIIT | ₹1L / 3 months | ₹10L–₹50L / year |

---

## Verification checklist

- [ ] `bank_profiles` and `scheme_profiles` CRUD (org-scoped)
- [ ] `loan_applications` pipeline with 4 stages
- [ ] `scheme_applications` pipeline with 4 statuses
- [ ] `connection_requests` for `loan_application` type: founder initiates → bank reviews
- [ ] `connection_requests` for `scheme_application` type: founder initiates → govt reviews
- [ ] GSTIN and DPIIT filters on bank Observatory endpoint
- [ ] Private data access test passes (bank cannot read planning_data, lean_canvas, emails)
- [ ] Pilot admin endpoint creates enterprise plan with 90-day expiry
- [ ] Pilot tracking dashboard showing conversion rate
- [ ] All enterprise actions logged to audit_log
- [ ] Bank/govt personas trigger org-check middleware path (not user-check)

---

## What is explicitly NOT done in Phase 6

> [!warning] These belong to Phase 7
- Do not add PostgreSQL RLS — Phase 7 (final production hardening)
- Do not build founding member pricing tier — Phase 7
- Do not build owner transfer flow — Phase 7
- Do not build Stage 7 journey agents — Phase 7

---

## Links

- Previous: [[06-phase-5|Phase 5 — Mentor Marketplace]]
- Next: [[08-phase-7|Phase 7 — Stage 7 Agents & Hardening]]
- Bank persona: [[04-bank]]
- Government persona: [[05-government]]
- Pricing: [[09-pricing-architecture]] (Stream 3)
- Inversion: [[10-inversion-tenancy]]
