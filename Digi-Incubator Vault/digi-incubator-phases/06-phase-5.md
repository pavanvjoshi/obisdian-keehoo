---
title: Phase 5 — Mentor Marketplace
tags: [phase, mentor, marketplace, commission, booking, p5]
phase: 5
duration: Weeks 13–14
scope: Full stack · Third persona · Commission revenue (Stream 4)
status: not-started
created: 2026-04-14
---

# Phase 5 — Mentor Marketplace

> [!important] Why mentor is a separate persona model
> Mentors use `user_id` as tenant — the one exception to the org-as-tenant rule. Mentoring is personal expertise. A mentor cannot have an analyst doing mentoring on their behalf. The middleware has two code paths: org-check and user-check. Mentor triggers the user-check path.

> [!note] Commission model — zero subscription barrier
> Mentors pay nothing to join. Digi Incubator earns 15% only when the mentor earns. This aligns incentives perfectly: Digi Incubator has direct financial incentive to drive bookings, not just sign-ups.

---

## Prerequisites (from [[05-phase-4|Phase 4]])

- [ ] `connection_requests` table live
- [ ] `audit_log` live and writing for cross-persona actions
- [ ] Investor persona fully functional
- [ ] Rate limiting middleware in place

---

## Step 1 — Mentor profile (user_id tenant)

> [!warning] `mentor_profiles` is the ONLY domain table keyed on `user_id` — not `org_id`
> This is a deliberate exception (Decision D-05 in [[07-decisions-log]]). The `TenantContext` for a mentor has `tenant_type='user'` and `tenant_id = user.id`. All repository functions for mentor data receive this context and query `WHERE user_id = ctx.tenant_id`.

```sql
CREATE TABLE mentor_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) UNIQUE,
    is_visible_to_founders  BOOLEAN NOT NULL DEFAULT false,
    domains                 TEXT[],
    experience_years        INTEGER,
    session_rate            INTEGER NOT NULL,  -- ₹/hour in rupees
    availability            TEXT[],
    bio                     TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMP NULL
);

CREATE INDEX idx_mentor_profile_user ON mentor_profiles(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_mentor_visible ON mentor_profiles(is_visible_to_founders, session_rate)
    WHERE is_visible_to_founders = true AND deleted_at IS NULL;
```

---

## Step 2 — Mentor persona in middleware

The `tenant_middleware` from [[01-phase-0|Phase 0]] already has both code paths. Phase 5 activates the mentor persona:

```python
# middleware/tenant_middleware.py — mentor path (already exists from Phase 0)
elif user.active_persona == 'mentor':
    request.state.ctx = TenantContext(
        tenant_id=user.id,      # user_id, not org_id
        tenant_type='user',
        role='owner',           # mentors always have full access to own data
        user_id=user.id
    )
```

**Repository pattern for mentor data:**
```python
# repositories/mentor_repo.py

async def get_mentor_profile(ctx: TenantContext) -> MentorProfile | None:
    if ctx.tenant_type != 'user':
        raise ValueError("Mentor repo requires user-scoped context")
    return await db.fetchrow(
        "SELECT * FROM mentor_profiles WHERE user_id=$1 AND deleted_at IS NULL",
        ctx.tenant_id  # this is user.id for mentors
    )
```

---

## Step 3 — Mentor session booking with commission locked at booking time

> [!important] Commission is calculated once and stored as fixed integers at booking
> `gross_amount = session_rate × (duration_mins / 60)` · `platform_fee = gross_amount × 0.15` · `mentor_payout = gross_amount − platform_fee`
> 
> These three values are written to `mentor_sessions` at booking and never recalculated. Refund and dispute logic reads from these fixed values. No floating point — all values in rupees as integers.

```sql
CREATE TABLE mentor_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_user_id  UUID NOT NULL REFERENCES users(id),
    founder_org_id  UUID NOT NULL REFERENCES organizations(id),
    startup_id      UUID NOT NULL REFERENCES startup_ideas(id),
    scheduled_at    TIMESTAMP NOT NULL,
    duration_mins   INTEGER NOT NULL,
    gross_amount    INTEGER NOT NULL,  -- rupees, locked at booking
    platform_fee    INTEGER NOT NULL,  -- 15% of gross, locked at booking
    mentor_payout   INTEGER NOT NULL,  -- gross - platform_fee, locked at booking
    status          VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','completed','cancelled')),
    payout_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (payout_status IN ('pending','paid')),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_mentor ON mentor_sessions(mentor_user_id, status);
CREATE INDEX idx_sessions_founder ON mentor_sessions(founder_org_id, status);
```

### Booking service

```python
# services/mentor_service.py

PLATFORM_COMMISSION_RATE = 0.15

async def book_session(
    founder_ctx: TenantContext,     # org-scoped — the startup is booking
    mentor_user_id: UUID,
    scheduled_at: datetime,
    duration_mins: int
) -> MentorSession:
    # Get mentor's session rate
    mentor_profile = await db.fetchrow(
        "SELECT session_rate FROM mentor_profiles WHERE user_id=$1 AND deleted_at IS NULL",
        mentor_user_id
    )
    if not mentor_profile:
        raise HTTPException(404, "Mentor not found")

    # Calculate commission — all integers, no floats
    gross_amount   = int(mentor_profile['session_rate'] * duration_mins / 60)
    platform_fee   = int(gross_amount * PLATFORM_COMMISSION_RATE)
    mentor_payout  = gross_amount - platform_fee

    # Get startup for session context
    startup = await startup_repo.get(founder_ctx)

    session = await db.insert(mentor_sessions,
        mentor_user_id=mentor_user_id,
        founder_org_id=founder_ctx.tenant_id,
        startup_id=startup.id,
        scheduled_at=scheduled_at,
        duration_mins=duration_mins,
        gross_amount=gross_amount,
        platform_fee=platform_fee,
        mentor_payout=mentor_payout,
        status='confirmed',
        payout_status='pending'
    )

    await write_audit(
        user_id=founder_ctx.user_id,
        action='mentor_session_booked',
        org_id=founder_ctx.tenant_id,
        resource_id=session.id,
        metadata={"gross_amount": gross_amount, "platform_fee": platform_fee}
    )

    return session
```

> [!tip] Booking is always free for founders — no plan gate
> Founders on any plan (including free Explorer) can book mentor sessions. The platform earns 15% commission regardless of founder plan. Do not add a subscription check on the booking endpoint.

---

## Step 4 — Payout tracking and batch job

```python
# workers/payout_worker.py

@celery_app.task
def process_mentor_payouts():
    """
    Batch job — runs daily or weekly.
    Marks completed sessions as paid and triggers Razorpay payout.
    """
    completed_unpaid = db.fetch(
        """SELECT ms.*, mp.razorpay_contact_id
           FROM mentor_sessions ms
           JOIN mentor_profiles mp ON mp.user_id = ms.mentor_user_id
           WHERE ms.status = 'completed'
             AND ms.payout_status = 'pending'
             AND ms.scheduled_at < now() - interval '2 days'"""
    )
    for session in completed_unpaid:
        try:
            # Trigger Razorpay payout to mentor
            razorpay_client.payout.create({
                "account_number": settings.RAZORPAY_ACCOUNT,
                "fund_account_id": session['razorpay_contact_id'],
                "amount": session['mentor_payout'] * 100,  # paise
                "currency": "INR",
                "mode": "NEFT",
                "purpose": "payout",
                "notes": {"session_id": str(session['id'])}
            })
            db.execute(
                "UPDATE mentor_sessions SET payout_status='paid' WHERE id=$1",
                session['id']
            )
        except Exception as e:
            # Log and continue — don't fail the entire batch
            logger.error(f"Payout failed for session {session['id']}: {e}")
```

---

## Step 5 — Review flywheel

```sql
CREATE TABLE mentor_reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES mentor_sessions(id) UNIQUE,
    reviewer_org_id     UUID NOT NULL REFERENCES organizations(id),
    reviewed_user_id    UUID NOT NULL REFERENCES users(id),
    rating              INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_mentor ON mentor_reviews(reviewed_user_id);
```

**Trigger review request:**
- When `mentor_sessions.status` changes to `'completed'` → send email to founder org with review link
- Review unlocks within 48 hours of session completion
- Average rating displayed on `mentor_profiles` — drives search ranking

```python
async def submit_review(
    founder_ctx: TenantContext,  # org-scoped
    session_id: UUID,
    rating: int,
    comment: str
) -> MentorReview:
    session = await db.fetchrow(
        "SELECT * FROM mentor_sessions WHERE id=$1 AND founder_org_id=$2 AND status='completed'",
        session_id, founder_ctx.tenant_id
    )
    if not session:
        raise HTTPException(404)

    review = await db.insert(mentor_reviews,
        session_id=session_id,
        reviewer_org_id=founder_ctx.tenant_id,
        reviewed_user_id=session['mentor_user_id'],
        rating=rating,
        comment=comment
    )

    # Update mentor's average rating
    avg = await db.fetchval(
        "SELECT AVG(rating)::float FROM mentor_reviews WHERE reviewed_user_id=$1",
        session['mentor_user_id']
    )
    await db.execute(
        "UPDATE mentor_profiles SET avg_rating=$1 WHERE user_id=$2",
        round(avg, 1), session['mentor_user_id']
    )
    return review
```

---

## Step 6 — Mentor search for founders

```python
# api/authenticated/founder/mentors.py

@router.get("/mentors")
async def search_mentors(
    domain: str | None = None,
    max_rate: int | None = None,
    ctx: TenantContext = Depends(get_tenant_context)
):
    return await db.fetch(
        """SELECT mp.*, u.email,
                  COALESCE(avg_rating, 0) AS avg_rating,
                  COUNT(ms.id) AS total_sessions
           FROM mentor_profiles mp
           JOIN users u ON u.id = mp.user_id
           LEFT JOIN mentor_sessions ms ON ms.mentor_user_id = mp.user_id
               AND ms.status = 'completed'
           WHERE mp.is_visible_to_founders = true
             AND mp.deleted_at IS NULL
             AND ($1::text IS NULL OR $1 = ANY(mp.domains))
             AND ($2::int IS NULL OR mp.session_rate <= $2)
           GROUP BY mp.id, u.email
           ORDER BY avg_rating DESC, total_sessions DESC""",
        domain, max_rate
    )
```

---

## Step 7 — Bridge table security — both sides tested

> [!danger] Inversion risk — `mentor_sessions` bridges two tenancy models and needs independent security tests
> The mentor views the session from the user-check path (`WHERE mentor_user_id = ctx.tenant_id`). The founder views it from the org-check path (`WHERE founder_org_id = ctx.tenant_id`). Both paths must be tested independently to confirm neither can read the other's private data.

```python
# Test: mentor can only see their own sessions
async def test_mentor_session_isolation():
    mentor_ctx   = TenantContext(tenant_id=mentor_user_id, tenant_type='user', ...)
    impostor_ctx = TenantContext(tenant_id=other_mentor_id, tenant_type='user', ...)

    sessions = await mentor_repo.get_sessions(mentor_ctx)
    assert all(s['mentor_user_id'] == mentor_user_id for s in sessions)

    impostor_sessions = await mentor_repo.get_sessions(impostor_ctx)
    assert len(impostor_sessions) == 0  # cannot see other mentor's sessions

# Test: founder can only see sessions for their org
async def test_founder_session_isolation():
    founder_ctx = TenantContext(tenant_id=founder_org_id, tenant_type='org', ...)
    other_ctx   = TenantContext(tenant_id=other_org_id,   tenant_type='org', ...)

    sessions = await session_repo.get_for_founder(founder_ctx)
    assert all(s['founder_org_id'] == founder_org_id for s in sessions)

    other_sessions = await session_repo.get_for_founder(other_ctx)
    assert len(other_sessions) == 0
```

---

## Verification checklist

- [ ] `mentor_profiles` CRUD (user_id scoped)
- [ ] Mentor persona middleware path activates `tenant_type='user'`
- [ ] `mentor_sessions` table with 3 locked integers: `gross_amount`, `platform_fee`, `mentor_payout`
- [ ] Commission calculation: 15% platform fee, integer arithmetic only (no floats)
- [ ] Booking endpoint: no subscription gate for founders
- [ ] Payout worker runs and marks `payout_status='paid'` on completed sessions
- [ ] Review submission: only after session `status='completed'`
- [ ] Average rating updated on mentor profile after review
- [ ] Mentor search sorted by rating, then session count
- [ ] Bridge table security tests: both mentor-side and founder-side pass in isolation
- [ ] Mentor sessions logged to audit_log

---

## What is explicitly NOT done in Phase 5

> [!warning] These belong to later phases
- Do not add premium mentor listing (₹499/mo) — Phase 7 growth lever
- Do not build bank or govt profiles — Phase 6
- Do not add PostgreSQL RLS — Phase 7

---

## Links

- Previous: [[05-phase-4|Phase 4 — Investor & Observatory]]
- Next: [[07-phase-6|Phase 6 — Bank & Government]]
- Mentor marketplace flow: [[05-mentor-marketplace]]
- Mentor persona: [[06-mentor]]
- Pricing: [[09-pricing-architecture]] (Stream 4)
