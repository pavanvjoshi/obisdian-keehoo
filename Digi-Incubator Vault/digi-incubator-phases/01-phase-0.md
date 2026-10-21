---
title: Phase 0 — POC Stabilisation & Migration Foundation
tags: [phase, backend, schema, migration, p0]
phase: 0
duration: Weeks 1–2
scope: Backend only · No new features shipped
status: not-started
created: 2026-04-14
---

# Phase 0 — POC Stabilisation & Migration Foundation

> [!important] Why this phase exists
> The POC works for a single user with `session_id` as the tenant key. Before any feature is built, the data model must be correct. Every table that exists must gain `org_id`. Three new identity tables must be created. Building features on a wrong schema costs 10× more to fix later.

> [!danger] Inversion finding — do the data audit before writing any migration SQL
> The backfill SQL in [[03-core-schema]] assumes every `session_id` maps cleanly to one user and one idea. This is the happy-path assumption. Real POC data has orphaned sessions, expired sessions, and sessions with multiple ideas. Running the backfill SQL without auditing first will silently skip rows — those startup records disappear permanently from the new system.

---
## Prerequisites

- [ ] Access to POC PostgreSQL database
- [ ] Alembic configured and pointing at the correct DB
- [ ] All existing POC tests passing before any migration runs

---

## Step 0 — Data audit (before any Alembic migration)

> [!danger] Do not skip this step. Run it before writing a single migration file.

```sql
-- How many ideas exist?
SELECT COUNT(*) AS total FROM startup_ideas;

-- How many have no session_id?
SELECT COUNT(*) AS no_session FROM startup_ideas WHERE session_id IS NULL;

-- How many already have org_id (should be 0 in POC)?
SELECT COUNT(*) AS already_org FROM startup_ideas WHERE org_id IS NOT NULL;

-- Sessions with more than one idea — which org will they map to?
SELECT session_id, COUNT(*) AS idea_count
FROM startup_ideas
GROUP BY session_id
HAVING COUNT(*) > 1;

-- planning_data rows with no matching startup_idea
SELECT COUNT(*) FROM planning_data pd
LEFT JOIN startup_ideas si ON si.id = pd.idea_id
WHERE si.id IS NULL;
```

**Decision gate:** Review the results before proceeding.
- If sessions with >1 idea exist → decide which idea becomes the canonical one per org, or create separate orgs per idea
- If orphaned `planning_data` rows exist → manually classify before migration
- Document the row counts as a baseline audit record

---

## Step 1 — Create core identity tables

> [!note] These 4 tables must exist before any other multi-tenant feature. They do not require touching existing data.

### Migration: `users`

```sql
CREATE TABLE public.users (
	id varchar(36) NOT NULL,
	email varchar(255) NOT NULL,
	password_hash varchar(255) NOT NULL,
	created_at timestamp NOT NULL,
	active_persona varchar(50) DEFAULT 'founder'::character varying NOT NULL,
	deleted_at timestamp NULL,
	full_name varchar(255) NULL,
	phone varchar(30) NULL,
	CONSTRAINT ck_users_active_persona CHECK (((active_persona)::text = ANY ((ARRAY['founder'::character varying, 'investor'::character varying, 'mentor'::character varying, 'student'::character varying])::text[]))),
	CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

### Migration: `organizations`

```sql
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    org_type    VARCHAR(50) NOT NULL
                CHECK (org_type IN ('startup','vc_firm','individual_investor','bank','govt')),
                -- VARCHAR not ENUM — new org types need only a code change, not a DB migration
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMP NULL
);
```

### Migration: `memberships`

```sql
CREATE TABLE memberships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    role        VARCHAR(20) NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
    joined_at   TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMP NULL,
    UNIQUE (user_id, org_id)
);

-- Critical index — runs on EVERY authenticated request
CREATE INDEX idx_memberships_user_org
    ON memberships(user_id, org_id)
    WHERE deleted_at IS NULL;
```

### Migration: `invites`

```sql
CREATE TABLE invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    invited_email   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',
    token           VARCHAR(255) UNIQUE NOT NULL,
    invited_by      UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','declined','expired')),
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

### Migration: `subscriptions` 

> [!danger] Inversion fix — subscriptions table moves from Phase 3 to here
> Freemium gates in Phase 1 check `plan_tier` on this table. If this table doesn't exist until Phase 3, Phase 1 has no way to enforce run limits. Seed a `free` row at every signup — Phase 3 adds Razorpay integration, not table creation.

```sql
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    plan_tier       VARCHAR(20) NOT NULL DEFAULT 'free'
                    CHECK (plan_tier IN ('free','builder','scale','enterprise')),
    billing_cycle   VARCHAR(10) NULL CHECK (billing_cycle IN ('monthly','annual')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','cancelled','past_due')),
    expires_at      TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

**On signup — seed immediately:**
```python
# In the signup transaction — 3 inserts + 1 subscription seed
async def create_founder_org(user_id: UUID, org_name: str) -> Organization:
    async with db.transaction():
        org = await db.insert(organizations, name=org_name, org_type='startup')
        await db.insert(memberships, user_id=user_id, org_id=org.id, role='owner')
        await db.insert(subscriptions, org_id=org.id, plan_tier='free')  # seed free
    return org
```

---

## Step 2 — Add `org_id` and soft deletes to existing tables

> [!note] Keep `session_id` — both columns live together. The anonymous pre-signup path still uses `session_id`. Only after signup does `org_id` get stamped.

### `startup_ideas` → extended as `startups`

```sql
-- Add org_id (nullable during transition — filled after signup)
ALTER TABLE startup_ideas ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE startup_ideas ADD COLUMN is_discoverable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE startup_ideas ADD COLUMN dpiit_number VARCHAR(50);
ALTER TABLE startup_ideas ADD COLUMN gstin VARCHAR(20);
ALTER TABLE startup_ideas ADD COLUMN mrr INTEGER;
ALTER TABLE startup_ideas ADD COLUMN business_model_type VARCHAR(30)
    CHECK (business_model_type IN ('saas','physical_product','service','marketplace','deep_tech'));
ALTER TABLE startup_ideas ADD COLUMN deleted_at TIMESTAMP NULL;

-- Performance index for Observatory queries
CREATE INDEX idx_startups_observatory
    ON startup_ideas(is_discoverable, sector, state)
    WHERE is_discoverable = true;
```

### `planning_data` — extend and fix unique constraint

> [!warning] Drop the unique constraint before Phase 1 agents run. Without dropping it, Arjun's re-run overwrites Riya's — the entire multi-user agent history design breaks.

```sql
-- Drop the single-run-per-panel constraint
ALTER TABLE planning_data DROP CONSTRAINT IF EXISTS uq_planning_idea_panel;

-- Add tenant and audit columns
ALTER TABLE planning_data ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE planning_data ADD COLUMN user_id UUID REFERENCES users(id);

-- Inversion fix — add agent_version now, not Phase 7
-- Without this, agent v2 output format causes silent blank fields on v1 rows
ALTER TABLE planning_data ADD COLUMN agent_version VARCHAR(10) NOT NULL DEFAULT 'v1';

-- Critical performance index
CREATE INDEX idx_planning_data_org_panel
    ON planning_data(org_id, panel, created_at DESC);
```

### `idea_documents` and `tasks` — add org_id

```sql
ALTER TABLE idea_documents ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE idea_documents ADD COLUMN deleted_at TIMESTAMP NULL;
CREATE INDEX idx_idea_documents_org_id ON idea_documents(org_id);

ALTER TABLE tasks ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP NULL;
CREATE INDEX idx_tasks_org_id ON tasks(org_id);
```

---

## Step 3 — Promote `user_onboarding` data

Run this **only after** the data audit in Step 0 is complete and all rows are classified.

```sql
-- For each existing user_onboarding row, create a user + org + membership
-- This is pseudocode — run per-row after classification
INSERT INTO users (id, email, password_hash, active_persona)
SELECT user_id, email, password_hash, role
FROM user_onboarding
WHERE completed_at IS NOT NULL;

INSERT INTO organizations (id, name, org_type)
SELECT gen_random_uuid(), answers->>'startup_name', 'startup'
FROM user_onboarding
WHERE completed_at IS NOT NULL;

-- Stamp org_id on startup_ideas for promoted rows
UPDATE startup_ideas
SET org_id = :new_org_id
WHERE session_id = :browser_session_id
AND org_id IS NULL;
```

---

## Step 4 — Backfill `planning_data.org_id`

Run after Step 3. Do not run if org_id is not yet stamped on parent rows.

```sql
UPDATE planning_data pd
SET org_id = si.org_id,
    user_id = si.user_id_from_onboarding  -- fill from onboarding lookup
FROM startup_ideas si
WHERE pd.idea_id = si.id
AND si.org_id IS NOT NULL
AND pd.org_id IS NULL;

-- Verify: no planning_data rows left with NULL org_id for promoted ideas
SELECT COUNT(*) FROM planning_data
WHERE org_id IS NULL
AND idea_id IN (SELECT id FROM startup_ideas WHERE org_id IS NOT NULL);
-- Must return 0 before proceeding
```

---

## Step 5 — Build `TenantContext` and tenant middleware

> [!danger] Inversion fix — convention is not enforcement
> The original plan relied on developers remembering to pass `tenant_id` to every repository function. As the team grows, someone will forget. The `TenantContext` dataclass makes it impossible to call a repository function without a typed tenant context — the type checker catches it before runtime.

### `core/context.py`

```python
from dataclasses import dataclass, field
from uuid import UUID
from typing import Literal

@dataclass(frozen=True)
class TenantContext:
    tenant_id: UUID
    tenant_type: Literal['org', 'user']
    role: Literal['owner', 'admin', 'member']
    user_id: UUID  # always the authenticated user, even when tenant_type='org'
```

### `middleware/tenant_middleware.py`

```python
from fastapi import Request, HTTPException
from app.core.context import TenantContext

ORG_BASED_PERSONAS = {'founder', 'investor', 'bank', 'govt'}
USER_BASED_PERSONAS = {'mentor', 'student'}

async def tenant_middleware(request: Request, call_next):
    user = await get_user_from_session(request)
    if not user:
        raise HTTPException(401)

    if user.active_persona in ORG_BASED_PERSONAS:
        org_id = get_active_org_id(request, user)
        membership = await db.fetchrow(
            "SELECT role FROM memberships WHERE user_id=$1 AND org_id=$2 AND deleted_at IS NULL",
            user.id, org_id
        )
        if not membership:
            # Inversion fix: graceful redirect, not raw 403
            return RedirectResponse('/select-persona')

        # Validate persona matches org_type
        org = await db.fetchrow("SELECT org_type FROM organizations WHERE id=$1", org_id)
        if not persona_matches_org_type(user.active_persona, org['org_type']):
            raise HTTPException(403, "Persona and organization type mismatch")

        request.state.ctx = TenantContext(
            tenant_id=org_id,
            tenant_type='org',
            role=membership['role'],
            user_id=user.id
        )

    elif user.active_persona in USER_BASED_PERSONAS:
        request.state.ctx = TenantContext(
            tenant_id=user.id,
            tenant_type='user',
            role='owner',
            user_id=user.id
        )

    return await call_next(request)
```

### Route folder structure — apply security structurally

> [!danger] Inversion fix — flat `api/routes/` is dangerous
> The Observatory and pre-signup routes must not have `tenant_middleware` applied. A flat route folder has no structural signal — any developer can accidentally put a sensitive route in the wrong place.

```
app/api/
├── public/          ← No middleware — Observatory read, health, invite redemption
├── anonymous/       ← session_id only — pre-signup idea capture flow  
└── authenticated/   ← tenant_middleware applied here, TenantContext required
    ├── founder/
    ├── investor/
    ├── mentor/
    ├── bank/
    └── govt/
```

```python
# main.py — middleware only on authenticated router
app.include_router(public_router, prefix="/api/public")
app.include_router(anonymous_router, prefix="/api/anon")
app.include_router(
    authenticated_router,
    prefix="/api",
    dependencies=[Depends(tenant_middleware)]
)
```

---

## Step 6 — Session → org promotion transaction

This is the signup endpoint. It fires the 3-row transaction that converts an anonymous session into a full org.

```python
async def complete_signup(session_id: str, email: str, password: str, org_name: str):
    async with db.transaction():
        # Create user
        user = await db.insert(users, email=email, password_hash=hash(password))

        # Create org
        org = await db.insert(organizations, name=org_name, org_type='startup')

        # Create membership
        await db.insert(memberships, user_id=user.id, org_id=org.id, role='owner')

        # Seed free subscription — Phase 3 upgrades this row, doesn't create it
        await db.insert(subscriptions, org_id=org.id, plan_tier='free')

        # Stamp org_id on the anonymous idea — retain session_id as audit trail
        await db.execute(
            "UPDATE startup_ideas SET org_id=$1 WHERE session_id=$2 AND org_id IS NULL",
            org.id, session_id
        )
    return user, org
```

---

## Verification checklist

Before marking Phase 0 complete, every item must pass:

- [x] Data audit SQL run — row counts documented
- [x] All existing startup_ideas rows classified (has org_id or explicitly orphaned)
- [x] `users`, `organizations`, `memberships`, `invites`, `subscriptions` tables created
- [x] `startup_ideas` has `org_id`, `is_discoverable`, `dpiit_number`, `gstin`, `mrr`, `business_model_type`, `deleted_at`
- [x] `planning_data` has `org_id`, `user_id`, `agent_version` — UNIQUE constraint dropped
- [x] `idea_documents` and `tasks` have `org_id` and `deleted_at`
- [x] Three composite indexes created (`memberships`, `planning_data`, `startups`)
- [ ] `subscriptions` seeds a `free` row at every signup
- [x] `TenantContext` dataclass in `core/context.py`
- [x] `tenant_middleware.py` using `TenantContext`, with graceful persona-mismatch redirect
- [ ] Route folders split: `public/` `anonymous/` `authenticated/`
- [x] Middleware applied only to `authenticated/` router
- [ ] `session_id` path still works for pre-signup users
- [ ] POC tests still passing after all migrations

---

## What is explicitly NOT done in Phase 0

> [!warning] Do not do these yet — they belong to later phases
- Do not deprecate agent output columns (`research_report`, `lean_canvas_output`, etc.) — keep as nullable fallbacks until Phase 1 reads are fully through `planning_data`
- Do not build the invite email flow — Phase 2
- Do not build Razorpay integration — Phase 3
- Do not add PostgreSQL RLS policies — Phase 7 (final hardening)
- Do not build the Observatory view — Phase 4

---

## Links

- Next: [[02-phase-1|Phase 1 — Founder Solo Mode]]
- Schema reference: [[03-core-schema]]
- Security model: [[06-security-model]]
- Migration guide: [[08-poc-migration]]
- Decisions: [[07-decisions-log]]
