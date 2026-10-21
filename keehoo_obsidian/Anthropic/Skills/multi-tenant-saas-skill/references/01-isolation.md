# Reference 01 — Isolation Patterns

> Read this when choosing between row-level, schema, or database-per-tenant isolation.

---

## Pattern A — Row-Level Isolation (recommended default)

**One database. One schema. `org_id` column on every domain table.**

Every tenant's data sits in the same tables, separated only by the value in `org_id`.
The middleware injects this value as a query filter on every request.

### Pros
- Operationally simple — one DB to back up, monitor, and scale
- Schema migrations apply to all tenants at once
- Cross-tenant queries (aggregate analytics, marketplace discovery) are trivial
- Zero per-tenant provisioning overhead at signup
- Cheapest option by a wide margin at any scale below 10,000 tenants

### Cons
- A bug in the tenant middleware causes a data leak (mitigated by code reviews + testing)
- Noisy neighbour risk: one tenant's heavy query can slow others (mitigated by query timeouts + indexing)
- May not satisfy compliance requirements for regulated industries (HIPAA, PCI, some banking regulators)

### When to use
- Seed through Series A (and often beyond)
- B2B SaaS where enterprise clients haven't demanded stronger isolation
- Marketplaces and multi-sided platforms where cross-tenant queries are a product feature

### Implementation checklist
```
□ org_id (NOT NULL) on every domain table
□ Index on org_id on every domain table
□ Tenant middleware injects org_id before handler runs
□ No handler reads org_id from request body/URL directly
□ Code review rule: every SELECT must include WHERE org_id = ?
□ Integration test: log in as Tenant A, attempt to read Tenant B's resource → expect 403
```

---

## Pattern B — Schema-Per-Tenant

**One database. Separate Postgres schema per tenant.**

Each tenant gets their own schema (e.g., `org_abc.projects`, `org_xyz.projects`).
The connection is routed to the correct schema using `SET search_path = org_{id}` at the
start of each request.

### Pros
- Stronger logical isolation — a SQL bug cannot accidentally join across schemas
- Native Postgres support, no middleware injection needed for isolation
- Easy to move one tenant to a dedicated DB later (pg_dump a single schema)
- Satisfies many enterprise compliance teams who want "separate data store"

### Cons
- Schema migrations must be run per-tenant (tooling required — Flyway, Liquibase, custom scripts)
- Cross-tenant queries (discovery, analytics) require explicit cross-schema joins or a separate aggregation layer
- Provisioning a new tenant is a DDL operation, not just a row insert
- Connection pool management is more complex (can't pool across schemas as freely)
- Expensive if you have thousands of small tenants

### When to use
- When a significant enterprise client explicitly demands it
- When your compliance framework requires logical data separation
- As a premium tier (e.g., "Enterprise" plan includes schema isolation)
- Never as the default starting point

### Implementation pattern

```python
def get_db_connection(org_id: str):
    conn = pool.get_connection()
    conn.execute(f"SET search_path = tenant_{org_id}, public")
    return conn
```

Migration tooling (runs per-tenant):
```bash
# Example: Flyway per-schema migration
for schema in $(list_all_tenant_schemas); do
  flyway -schemas=$schema migrate
done
```

---

## Pattern C — Database-Per-Tenant

**Separate database instance per tenant.**

Each tenant gets a fully independent database. Connection string is resolved per-tenant at
request time from a central tenant registry.

### Pros
- Maximum isolation — a breach of one tenant's DB does not affect others
- Full customisation possible per tenant (different DB version, extensions, settings)
- Meets the most demanding compliance requirements (some healthcare, financial regulators)
- Noisy neighbour problem is completely eliminated

### Cons
- Extremely high operational overhead — thousands of databases to manage
- Schema migrations become a distributed systems problem
- Cost: each database has minimum overhead (CPU, memory, storage IOPS)
- Cross-tenant analytics require a separate data warehouse layer
- Impractical for self-serve SaaS at any volume above ~200 tenants

### When to use
- Regulated industries where data residency laws mandate physical separation
- Very large enterprise tenants willing to pay for dedicated infrastructure
- Government or financial institution clients with contractual isolation requirements
- Never as a default; only as a specific SKU/tier

### Central tenant registry

```sql
-- Tenant registry table (lives in a separate "control plane" DB)
CREATE TABLE tenant_connections (
  org_id          UUID PRIMARY KEY,
  db_host         TEXT NOT NULL,
  db_name         TEXT NOT NULL,
  db_user         TEXT NOT NULL,
  db_password_ref TEXT NOT NULL,  -- reference to secrets manager, not the secret itself
  region          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Choosing between patterns — decision matrix

| Factor | Row-level | Schema | DB-per-tenant |
|---|---|---|---|
| Operational complexity | Low | Medium | Very high |
| Cost per tenant | ~$0 marginal | Low | High |
| Isolation strength | Good | Strong | Maximum |
| Cross-tenant queries | Easy | Requires cross-schema | Requires data warehouse |
| Migration complexity | Simple | Moderate | Complex |
| Compliance flexibility | Most regulators OK | Enterprise OK | All regulators |
| Time to implement | 1–2 days | 1–2 weeks | 4–8 weeks |

**Recommendation:** Start with row-level. Add schema isolation as a paid upgrade tier when
a real enterprise client demands it. Add DB-per-tenant only when a signed contract justifies
the operational investment.

---

## Postgres Row-Level Security (RLS) — alternative to middleware injection

If you prefer to enforce isolation at the database level rather than in middleware:

```sql
-- Enable RLS on a table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see rows where org_id matches their session variable
CREATE POLICY tenant_isolation ON projects
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- In middleware, set the variable after authentication:
-- SET LOCAL app.current_org_id = '<org_id>';
```

**RLS pros:** isolation is enforced even if application code has a bug.
**RLS cons:** requires careful management of session variables; harder to debug;
performance overhead on complex policies; middleware injection is simpler and more explicit.

RLS is a defence-in-depth layer, not a replacement for middleware. Use both if you want belt-and-suspenders security.
