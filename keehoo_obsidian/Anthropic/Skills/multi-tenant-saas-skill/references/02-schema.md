# Reference 02 — Schema Templates

> Copy-paste schema templates for common SaaS product shapes.
> Always start with the Core Four tables from SKILL.md, then add the pattern below.

---

## Template A — Single-Product B2B SaaS

The simplest multi-tenant shape. One product, multiple teams, standard RBAC.
(Examples: project management, CRM, task tracker, analytics dashboard)

```sql
-- Core four: users, organizations, memberships, invites (see SKILL.md)

-- Subscriptions: billing state per org
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  plan_tier       TEXT NOT NULL DEFAULT 'free',  -- 'free|starter|pro|enterprise'
  billing_cycle   TEXT,                           -- 'monthly|annual'
  status          TEXT NOT NULL DEFAULT 'active', -- 'active|cancelled|past_due|trialing'
  trial_ends_at   TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Your core domain entity (replace "projects" with your entity)
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_projects_org ON projects(org_id);

-- Audit log: every significant action (optional but highly recommended)
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  user_id         UUID,
  action          TEXT NOT NULL,   -- 'project.created', 'member.invited', etc.
  resource_type   TEXT,
  resource_id     UUID,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_org ON audit_log(org_id, created_at DESC);
```

**Tenant key rule:** Every query on `projects` filters by `org_id`. Never by `user_id` unless
showing a "created by me" view (which still first filters by `org_id`).

---

## Template B — Multi-Sided Platform / Marketplace

Two or more user types that need to find each other. One side creates supply; the other consumes it.
(Examples: investor + startup, freelancer + client, vendor + buyer, mentor + mentee)

```sql
-- Core four: users, organizations, memberships, invites (see SKILL.md)

-- Supply-side profile (discoverable by demand side)
-- Replace "vendor" with your supply-side entity name
CREATE TABLE vendor_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  is_discoverable     BOOLEAN NOT NULL DEFAULT false,  -- the visibility toggle
  -- Add: specialities[], rating, bio, region, price_range, etc.
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Demand-side profile (their preferences, not shared with supply side)
CREATE TABLE buyer_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  -- Add: budget_range, requirements, industry, etc.
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- The controlled bridge: the ONLY surface where two tenants interact
CREATE TABLE connection_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_org_id         UUID NOT NULL REFERENCES organizations(id),
  to_org_id           UUID NOT NULL REFERENCES organizations(id),
  request_type        TEXT NOT NULL,  -- 'inquiry|proposal|application|etc'
  message             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending|accepted|declined|expired'
  decline_reason      TEXT,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  -- Optional: reference to the specific resource being connected around
  resource_id         UUID  -- e.g., a specific job, listing, or product
);
CREATE INDEX idx_connections_from ON connection_requests(from_org_id);
CREATE INDEX idx_connections_to   ON connection_requests(to_org_id);

-- CRITICAL RULE: Private contact details (email, phone) are NEVER stored in connection_requests.
-- They are fetched from the users table ONLY after status = 'accepted'.

-- Public discovery table (no org_id filter — intentionally cross-tenant read)
-- Only contains fields explicitly whitelisted for public view
-- Internal details (notes, internal scoring, private data) are NEVER in this view
CREATE VIEW public_vendor_directory AS
  SELECT
    vp.id,
    o.name,
    -- Add only explicitly public fields here
    vp.is_discoverable
  FROM vendor_profiles vp
  JOIN organizations o ON o.id = vp.org_id
  WHERE vp.is_discoverable = true;
```

**The bridge rule:** `connection_requests` is the only table where `from_org_id != to_org_id`.
Every other query is strictly tenant-scoped. The bridge exists to enable opt-in interaction,
not to grant cross-tenant data access.

---

## Template C — Personal + Team hybrid

Users start with personal data, then can create or join a team/workspace.
(Examples: Notion, Figma, Linear — personal workspace plus team workspace)

```sql
-- Extended users table to support personal workspace
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  personal_org_id   UUID,  -- FK set after org creation; user's personal workspace
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- At signup: create user, create a personal org (type='personal'), create membership,
-- then set personal_org_id = new org's id — all in one transaction.

-- Personal org is just a normal org with org_type = 'personal'
-- Users can additionally create/join team orgs (org_type = 'team')
-- active_org_id in session determines which workspace is "active"

-- Shared items: resources a user shares across their personal and team orgs
CREATE TABLE shared_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_org_id    UUID NOT NULL REFERENCES organizations(id),  -- who published it
  resource_type   TEXT NOT NULL,
  resource_id     UUID NOT NULL,
  shared_with_org_id UUID REFERENCES organizations(id),  -- NULL = public
  permission      TEXT NOT NULL DEFAULT 'view',  -- 'view|comment|edit'
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Template D — Persona-switching (multi-role platform)

Users operate in fundamentally different modes, each with different data and UI.
(Examples: platform with both freelancers and clients, both founders and investors)

```sql
-- Extended users table
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  active_persona  TEXT NOT NULL DEFAULT 'default',  -- your persona enum
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Personas that use org-scoped tenancy
-- e.g., 'founder', 'investor', 'company', 'agency'
-- These personas: middleware uses org_id as tenant_id

-- Personas that use user-scoped tenancy
-- e.g., 'freelancer', 'individual', 'consultant'
-- These personas: middleware uses user_id as tenant_id
-- Use when: "Can you hire someone to do this role on your behalf?" → if NO, use user_id

-- Session table: tracks which org is active for org-scoped personas
CREATE TABLE user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  active_org_id   UUID REFERENCES organizations(id),  -- NULL for user-scoped personas
  created_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);
```

**Persona decision test:**
> "Can someone else legitimately log into this persona's account and see/do things on their behalf?"
> - YES (e.g., a firm's analyst acts for the firm) → org_id tenant
> - NO (e.g., a freelancer's personal reputation) → user_id tenant

---

## Common additions to the core schema

### Feature flags per org

```sql
CREATE TABLE org_feature_flags (
  org_id      UUID NOT NULL REFERENCES organizations(id),
  flag_name   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (org_id, flag_name)
);
```

### Usage metering (for usage-based pricing)

```sql
CREATE TABLE usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  user_id     UUID,
  event_type  TEXT NOT NULL,   -- 'api_call', 'ai_run', 'export', etc.
  quantity    INTEGER NOT NULL DEFAULT 1,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_usage_org_period ON usage_events(org_id, created_at DESC);
```

### Tenant-specific settings

```sql
CREATE TABLE org_settings (
  org_id      UUID PRIMARY KEY REFERENCES organizations(id),
  settings    JSONB NOT NULL DEFAULT '{}',  -- flexible key-value store
  updated_at  TIMESTAMPTZ DEFAULT now()
);
-- Example settings keys: 'timezone', 'locale', 'branding', 'allowed_domains', 'sso_config'
```

### Webhook registry (for integrations)

```sql
CREATE TABLE webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL,
  secret      TEXT NOT NULL,  -- HMAC secret for payload signing
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_webhooks_org ON webhooks(org_id);
```

---

## Tenant key reference card

| Table type | Tenant key | Rationale |
|---|---|---|
| Core domain entity | `org_id` | Belongs to the org, survives individual member changes |
| AI / compute job | `org_id` + `user_id` | Owned by org, triggered by a specific user |
| Individual profile | `user_id` | Personal to the human, cannot be delegated |
| Cross-tenant bridge | `from_org_id` + `to_org_id` | Controlled interaction between two tenants |
| Shared reference data | none | No tenant — read by everyone, written by platform |
| Audit log | `org_id` | Org's history, even if the user who acted has left |
