# Reference 05 — Master Architecture Decisions Checklist

> The canonical list of every architectural decision in a multi-tenant SaaS.
> Use this as a review document before shipping, or as a design guide for a new system.
> Each decision has the options, the recommended choice, and the consequences.

---

## D-01 — Who is the tenant?

**Options:**
- User-as-tenant: `user_id` is the primary data key
- Org-as-tenant: `org_id` is the primary data key (with silent org for solo users)

**Recommendation:** Org-as-tenant for any product where a user might ever have a teammate.

**Consequences of org-as-tenant:**
- Every domain table INSERT must include `org_id`
- When a user leaves an org, their data stays (only membership row is deleted)
- Solo users get an org automatically — hide it in the UI if they'll never have teammates

---

## D-02 — What is the isolation strategy?

**Options:**
- Row-level isolation (one DB, `org_id` on every table)
- Schema-per-tenant (one DB, separate Postgres schema)
- Database-per-tenant (separate DB per org)

**Recommendation:** Row-level at seed. Schema isolation as enterprise tier upgrade.

**Consequences:**
- A missing WHERE clause in any query is a data leak — treat it as a security bug
- The security middleware is the single most critical infrastructure component
- Database-level RLS can be added as defence-in-depth

---

## D-03 — How are user roles handled?

**Options:**
- Single role column on memberships (`owner | admin | member`)
- Multi-persona switching (separate active mode per user, different tenant key)

**Recommendation:** Single role column unless fundamentally different UX per mode.

**Decision test:** "Does the user's entire UI and data model change based on their mode?" 
- Yes → multi-persona
- No (just permission differences) → role column on memberships

**Consequences of multi-persona:**
- `active_persona` on `users` must be updated on mode switch
- Session must store `active_org_id` for org-based personas
- Middleware must branch on persona type to determine tenant key

---

## D-04 — Should solo users get an org?

**Options:**
- No org for solo users — use `user_id` directly
- Silent org — create org automatically, hide from UI

**Recommendation:** Silent org for any user type that could ever grow a team.

**Decision test:** "Could this user type ever have a second person joining to share their data?"
- Yes (even rarely) → silent org from day one
- No (inherently personal, like a freelancer's personal reputation) → `user_id`

**Consequences of silent org:**
- All data uses `org_id` even for solo users — zero migration if they grow a team
- `org_type` column distinguishes solo users from team accounts in the UI

---

## D-05 — How are agent / AI job outputs stored?

**Options:**
- Output as columns on the parent entity (one column per agent type)
- Output as rows in a jobs/runs table (one row per execution)

**Recommendation:** Always rows, never columns.

**Consequences of row-per-run:**
- Full history preserved — any team member's run is a separate row
- Dashboard queries `ORDER BY created_at DESC` — most recent shown first
- `user_id` + `org_id` on every run row — owned by org, triggered by user
- Unique constraint on `(entity_id, job_type)` must NOT exist — multiple runs per type are expected
- Storage grows over time — plan archival strategy for old runs

---

## D-06 — How do tenants interact with each other?

**Options:**
- No cross-tenant interaction (pure isolation)
- Bridge table (`connection_requests`) as the only controlled surface
- Direct cross-tenant query access

**Recommendation:** Bridge table if interaction is needed. Never direct cross-tenant access.

**Consequences of bridge table:**
- Private contact details (email, phone) are NEVER stored in the bridge — fetched from `users` only after acceptance
- `request_type` column allows one bridge table to serve multiple interaction types
- The requesting tenant never gets read access to the receiving tenant's private tables

---

## D-07 — How is cross-tenant discovery handled?

**Options:**
- No discovery (pure B2B, tenants don't know each other exists)
- Opt-in discovery (`is_discoverable` flag on the entity)
- Fully public directory

**Recommendation:** Opt-in flag (`is_discoverable` boolean) for marketplaces and B2B discovery.

**Consequences:**
- `is_discoverable` is the single toggle — simpler UX, clearer mental model
- Public directory queries have NO tenant filter — intentionally cross-tenant
- A strict field whitelist must exist for what's visible in discovery
- Private tables (AI outputs, internal notes, financial data) are NEVER in discovery queries

---

## D-08 — How is the subscription scoped?

**Options:**
- Per-seat (price per user per month)
- Per-org (price per org per month, tiered by team size or feature set)

**Recommendation:** Per-org for any team-based product.

**Consequences of per-org pricing:**
- `subscriptions` table has `org_id`, not `user_id`
- Feature access is checked against the org's plan, not the individual user's
- Team size may determine tier, but is not a direct billing multiplier

---

## D-09 — How is the pre-signup / anonymous flow handled?

**Options:**
- Require signup before any product usage
- Allow anonymous usage with a `session_id`, promote to `org_id` at signup

**Recommendation:** Anonymous phase if conversion optimisation is a priority.

**Consequences of anonymous phase:**
- Domain table `org_id` is nullable during anonymous phase, NOT NULL after signup
- `session_id` from browser cookie holds anonymous work temporarily
- Signup transaction: `INSERT users + organizations + memberships + UPDATE domain_table SET org_id`
- Cleanup job needed: expire unclaimed `session_id` rows after N days (30 is standard)

---

## D-10 — How are migrations rolled out?

**Options:**
- Big-bang migration (one deployment, all tenants updated)
- Rolling migration (new schema columns added nullable, backfilled, then made NOT NULL)

**Recommendation:** Rolling migration for any production system with live tenants.

**Standard rolling migration sequence:**
```
Step 1: Add new column as nullable
  ALTER TABLE projects ADD COLUMN new_field TEXT;

Step 2: Backfill existing rows
  UPDATE projects SET new_field = compute_value(old_field) WHERE new_field IS NULL;

Step 3: Make NOT NULL once all rows are populated
  ALTER TABLE projects ALTER COLUMN new_field SET NOT NULL;

Step 4: Drop old column (in a later deployment, after confirming nothing reads it)
  ALTER TABLE projects DROP COLUMN old_field;
```

---

## Pre-launch security review

Run before first production deployment:

```
DATA MODEL
□ Every domain table has org_id NOT NULL
□ org_id is indexed on every domain table
□ No domain table uses session_id or any anonymous key in a way that persists post-signup

MIDDLEWARE
□ Tenant middleware applies to every authenticated route
□ No route handler reads org_id from request body or URL params
□ Role is read from memberships table — not from JWT or request

QUERIES
□ Every SELECT has WHERE org_id = request.tenant_id
□ Every "get by ID" query has both id AND org_id (IDOR prevention)
□ Public discovery queries use an explicit field whitelist and NEVER join private tables

CROSS-TENANT
□ Contact details are not stored in bridge tables
□ Accepted connections do not grant read access to private tables

TESTS
□ Cross-tenant read attempt returns 403
□ Unauthenticated request returns 401
□ Under-privileged role action returns 403
□ Public directory does not expose private fields
```

---

## Architecture decisions log template

Copy this template into your own project docs to capture decisions as you make them:

```markdown
## D-XX — [Short decision name]

**Decision:** [What you decided]

**Options considered:**
- Option A: [description]
- Option B: [description]

**Why [chosen option]:**
[1–3 sentence rationale]

**Consequences:**
- [What changes in the codebase]
- [What engineers must remember going forward]
- [What becomes harder / easier]
```
