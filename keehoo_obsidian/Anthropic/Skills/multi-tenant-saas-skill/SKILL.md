---
name: multi-tenant-saas
description: >
  Design and implement multi-tenant architecture for any SaaS product. Use this skill
  whenever the user asks about: multi-tenancy, tenant isolation, org-based data scoping,
  row-level security, shared-database architecture, tenant onboarding, permission systems,
  or designing schemas where multiple organisations or accounts share the same application.
  Also trigger when users ask "how do I separate data per customer", "how do I support
  teams/workspaces/organisations", or "how do I add multi-user support to my SaaS".
  Covers the full stack: data model → security middleware → pricing tiers → migration path.
---

# Multi-Tenant SaaS Design Skill

A decision-first framework for designing multi-tenant architecture in any SaaS. It extracts
the universal patterns from production-grade systems and applies them to your specific product.

---

## How to use this skill

This skill uses **progressive disclosure** — start at Step 1 and only go deeper when the
decision requires it. Reference files (in `references/`) contain exhaustive detail; read them
only when the relevant decision arises.

```
SKILL.md              ← You are here. Core decisions + templates.
references/
  01-isolation.md     ← When to use row-level vs schema vs DB isolation
  02-schema.md        ← Copy-paste schema templates for common SaaS shapes
  03-security.md      ← Middleware patterns, query injection, RLS examples
  04-pricing.md       ← Multi-sided and single-sided pricing architecture
  05-decisions.md     ← Master checklist of every architecture decision
```

---

## Step 1 — Establish the four fundamentals

Before writing a single table, answer these four questions. Everything downstream depends on them.

### Q1 — Who is the tenant?

> **The tenant is the unit that owns data — not necessarily the person who logs in.**

| Scenario | Tenant is... | Key column |
|---|---|---|
| Single user product (notes app, journal) | The user | `user_id` |
| Team product (project mgmt, CRM, Slack-like) | The organisation / workspace | `org_id` |
| Mixed (individual + team upgrade path) | Org always — even solo users get an org | `org_id` |
| Marketplace (buyers + sellers + platform) | Role-dependent — see `references/02-schema.md` | both |

**The silent org rule (critical for team products):**
> Every user type that could *ever* have a team member gets an `org` — even if they start solo.
>
> Reason: if you scope solo users to `user_id` and they grow a team later, you face a data
> migration. An org created silently at signup costs nothing and eliminates that migration forever.
>
> Exception: roles that are *inherently personal* (e.g. a freelance profile, a personal portfolio)
> use `user_id` directly. Test: "Can someone else legitimately share or inherit this data?"
> If no → `user_id`. If yes, even rarely → `org_id`.

---

### Q2 — What is your isolation strategy?

Three options. Pick based on stage, compliance needs, and operational budget:

| Strategy | How it works | Use when |
|---|---|---|
| **Row-level** (recommended at seed) | One DB, `org_id` column on every table, middleware enforces it | Seed–Series A, no enterprise compliance requirement |
| **Schema-per-tenant** | One DB, separate Postgres schema per tenant | Series A+, enterprise clients need stronger isolation |
| **DB-per-tenant** | Separate database instance per tenant | Regulated industries (healthcare, finance), very large tenants |

**Row-level is almost always the right start.** It is operationally simple, cheap, and gives
sufficient isolation when middleware is correctly implemented. Schema isolation can be added
as a paid tier for enterprise clients without changing application logic — just route the
connection differently.

→ Deep detail: `references/01-isolation.md`

---

### Q3 — Do you have multiple user roles or personas?

Users can belong to an org in different capacities. Two design choices:

**Option A — Single role per org** (simpler)
One `role` column on `memberships`: `owner | admin | member`. All users see the same dashboard,
just with different action permissions.

**Option B — Multiple personas / modes** (for multi-sided platforms)
Users operate in fundamentally different *modes* (e.g. buyer vs seller, founder vs investor).
Store as `active_persona` on `users`. Each persona may have a different tenant key and
different UI entirely.

> Only use Option B if the user's *entire experience* changes between modes. If it's just
> permission differences, use Option A with a role column.

---

### Q4 — Is there any intentional cross-tenant interaction?

Most multi-tenant systems are closed: tenant A never sees tenant B's data. But some
products are marketplaces or discovery platforms where cross-tenant visibility is a feature.

| If you have... | Pattern to use |
|---|---|
| Pure isolation (each tenant is self-contained) | No cross-tenant tables needed |
| Discovery/marketplace (one tenant finds another) | `connection_requests` bridge table |
| Shared reference data (e.g. product catalogue, public content) | Tenant-free tables (no `org_id`) |

**The bridge rule:** When two tenants interact, the interaction itself is a row in a shared
table (`connection_requests`, `invitations`, etc.). At no point does Tenant A get direct
query access to Tenant B's private tables.

---

## Step 2 — Core Schema Template

Every multi-tenant SaaS starts with these four tables. Customise the enums, add your
domain tables, but never remove these four.

```sql
-- 1. Identity: one row per human
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  -- Add: active_persona ENUM if using multi-persona (Option B above)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Tenant: one row per organisation / workspace
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  org_type        TEXT NOT NULL,   -- your SaaS-specific types e.g. 'startup|agency|enterprise'
  -- Add: plan_tier, settings JSONB, slug, etc.
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Membership: the join between people and orgs (many-to-many)
CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member', -- 'owner|admin|member'
  joined_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)  -- one membership per user per org
);

-- 4. Invitations: pending membership promises
CREATE TABLE invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  invited_email   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  token           TEXT UNIQUE NOT NULL,   -- magic-link token sent by email
  invited_by      UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending|accepted|declined|expired'
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Every domain table you add must have `org_id` as a non-nullable foreign key:**

```sql
-- Example: a generic "projects" domain table
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),  -- ← always here
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),          -- ← who created it
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);  -- ← always index the tenant key
```

→ Copy-paste templates for common patterns: `references/02-schema.md`

---

## Step 3 — Security Middleware (the most critical piece)

The tenant isolation guarantee lives in middleware, not in application code.
**Every query must use the tenant_id injected by middleware — never a value from the request body.**

```python
# Pseudocode — adapt to your framework (Express, FastAPI, Rails, etc.)

def tenant_middleware(request, handler):
    user = get_user_from_session(request)
    if not user:
        raise HTTP401()

    # Determine tenant key based on persona or role type
    if is_org_based(user):
        org_id = get_active_org_id_from_session(user)
        membership = db.query(
            "SELECT role FROM memberships WHERE user_id = %s AND org_id = %s",
            user.id, org_id
        )
        if not membership:
            raise HTTP403("Not a member of this organization")

        request.tenant_id   = org_id
        request.tenant_type = "org"
        request.role        = membership.role

    elif is_user_based(user):
        request.tenant_id   = user.id
        request.tenant_type = "user"
        request.role        = "owner"

    return handler(request)

# In every handler — use request.tenant_id, never client input
def get_projects(request):
    return db.query(
        "SELECT * FROM projects WHERE org_id = %s",
        request.tenant_id   # ← always from middleware, never from URL/body
    )
```

**The two golden rules:**
1. The client **never** decides which tenant's data they read. Middleware decides.
2. A missing `WHERE org_id = request.tenant_id` in any query is a data leak — treat it as a security bug, not a logic bug.

→ Full middleware examples, RLS patterns, and audit checklist: `references/03-security.md`

---

## Step 4 — Signup Flow & Anonymous-to-Tenant Promotion

### Standard signup (account required first)

```
User fills form → INSERT users → INSERT organizations → INSERT memberships → redirect to dashboard
```

Run all three INSERTs in a single database transaction. If any fails, roll back all three.

### Freemium / try-before-signup flow (captures value first)

Some SaaS products let users do work before signing up (the "idea capture" pattern).
During the anonymous phase, use a `session_id` (browser cookie) as a temporary key.
At signup, promote all anonymous work to the real org:

```sql
-- At signup completion, atomic promotion
BEGIN;
  INSERT INTO users ...        -- create identity
  INSERT INTO organizations ... -- create org
  INSERT INTO memberships ...   -- join them
  -- Promote anonymous work to the new org
  UPDATE your_domain_table
  SET org_id = :new_org_id, session_id = NULL
  WHERE session_id = :browser_session_id AND org_id IS NULL;
COMMIT;
```

**Use this pattern when conversion is a key metric** — capturing work before asking for
an account dramatically improves signup rates. Schedule a cleanup job to expire unclaimed
`session_id` rows after 30 days.

---

## Step 5 — Multi-Tenant Pricing Architecture

The most common mistake: building the right schema with the wrong pricing model.

### Single-sided SaaS (one user type)

```
Free tier  → limits on usage/seats/features
Paid tier  → removes limits, adds features
Enterprise → custom limits, SSO, SLA, annual contract
```

Gate by **usage volume** on free, not by feature type. Users who see value upgrade;
users who've never used a feature won't pay to unlock it.

### Multi-sided platform (multiple user types)

> **Subsidise supply. Charge demand.**
> The side that creates value for others (content, inventory, data) should be cheap or free.
> The side that *consumes* that value with measurable ROI should pay more.

```
Supply side (creates ecosystem value) → free or commission-only
Demand side (high ROI from platform)  → subscription, usage-based, or enterprise contract
```

**Subscription scope: org-level, not seat-level** for team products.
Per-seat pricing incentivises buyers to restrict access within their team. Org-level pricing
aligns everyone: more team members using the product = more value, not more cost.

→ Detailed pricing models, tier design, and multi-sided playbook: `references/04-pricing.md`

---

## Step 6 — Migration from Single-Tenant to Multi-Tenant (if applicable)

If you have an existing single-tenant codebase, follow this sequence:

```
Phase 1 — Schema migration
  □ Add organizations table
  □ Add memberships table
  □ Add org_id column (nullable) to every domain table
  □ Create one org per existing user, populate org_id, make NOT NULL

Phase 2 — Middleware
  □ Implement tenant_middleware (authenticate → resolve org → inject tenant_id)
  □ Audit every query for missing WHERE org_id = ... clause
  □ Add org_id index to every domain table

Phase 3 — Invites and onboarding
  □ Build invite flow (send token, accept, create membership)
  □ Test: can an invited user access data from a different org? (must return 403)

Phase 4 — Pricing & billing
  □ Add subscriptions table scoped to org_id
  □ Gate features by org plan, not user plan
```

→ Full migration checklist and rollback plan: `references/05-decisions.md`

---

## Quick-reference decision tree

```
New SaaS? Start here:
│
├── Will users ever have teammates sharing the same data?
│   ├── YES → Use org_id as tenant key (even for solo users — silent org rule)
│   └── NO  → Use user_id as tenant key
│
├── Stage?
│   ├── Seed/MVP → Row-level isolation (one DB, org_id on every table)
│   └── Enterprise → Add schema-per-tenant as premium tier option
│
├── Multiple user types with totally different UX?
│   ├── YES → Multi-persona design (active_persona on users)
│   └── NO  → Single role column on memberships (owner|admin|member)
│
└── Tenants ever need to discover/interact with each other?
    ├── YES → connection_requests bridge table pattern
    └── NO  → Pure isolation, no cross-tenant tables needed
```

---

*For exhaustive reference, read the files in `references/` as each decision arises.
Do not pre-load all reference files — load them on demand.*
