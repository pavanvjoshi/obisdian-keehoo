# Reference 03 — Security Patterns

> Detailed middleware implementations, query patterns, and audit checklist.
> Read this when implementing tenant enforcement in your framework of choice.

---

## The fundamental guarantee

> **No query should ever return data from a different tenant.**
> This is enforced by middleware — not by individual developers remembering to add WHERE clauses.

The middleware is the single most critical piece of infrastructure in a multi-tenant SaaS.
A missing `WHERE org_id = ?` is not a logic bug — it is a security breach.

---

## Middleware implementations by framework

### Node.js / Express

```javascript
// middleware/tenant.js
async function tenantMiddleware(req, res, next) {
  const user = await getUserFromSession(req);
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });

  if (isOrgBasedPersona(user.activePersona)) {
    const orgId = getActiveOrgId(req, user);
    const membership = await db.query(
      'SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2',
      [user.id, orgId]
    );
    if (!membership.rows.length) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    req.tenantId   = orgId;
    req.tenantType = 'org';
    req.role       = membership.rows[0].role;
  } else {
    // User-scoped personas (individual/personal roles)
    req.tenantId   = user.id;
    req.tenantType = 'user';
    req.role       = 'owner';
  }

  next();
}

// In routes — always use req.tenantId
app.get('/projects', tenantMiddleware, async (req, res) => {
  const projects = await db.query(
    'SELECT * FROM projects WHERE org_id = $1',
    [req.tenantId]  // ← never req.params.orgId or req.body.orgId
  );
  res.json(projects.rows);
});
```

### Python / FastAPI

```python
# dependencies/tenant.py
from fastapi import Depends, HTTPException, Request

async def get_tenant(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_session(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthenticated")

    if user.active_persona in ORG_BASED_PERSONAS:
        org_id = get_active_org_id(request, user)
        membership = db.query(Membership).filter_by(
            user_id=user.id, org_id=org_id
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this organization")
        return TenantContext(
            tenant_id=org_id,
            tenant_type="org",
            role=membership.role
        )
    else:
        return TenantContext(
            tenant_id=user.id,
            tenant_type="user",
            role="owner"
        )

# In route handlers
@router.get("/projects")
async def list_projects(tenant: TenantContext = Depends(get_tenant), db=Depends(get_db)):
    return db.query(Project).filter(Project.org_id == tenant.tenant_id).all()
```

### Ruby on Rails

```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::Base
  before_action :set_tenant

  private

  def set_tenant
    return head :unauthorized unless current_user

    if org_based_persona?(current_user.active_persona)
      org = Organization.find(session[:active_org_id])
      membership = current_user.memberships.find_by(org: org)
      return head :forbidden unless membership

      Current.tenant_id   = org.id
      Current.tenant_type = :org
      Current.role        = membership.role
    else
      Current.tenant_id   = current_user.id
      Current.tenant_type = :user
      Current.role        = :owner
    end
  end
end

# In every model scope
class Project < ApplicationRecord
  scope :for_tenant, -> { where(org_id: Current.tenant_id) }
end

# In controllers — always scope to tenant
def index
  @projects = Project.for_tenant  # never Project.all
end
```

---

## Query patterns — right vs wrong

```sql
-- WRONG: trusts the client to supply the correct org_id
SELECT * FROM projects
WHERE id = $1 AND org_id = $2  -- $2 comes from request body → exploitable

-- RIGHT: uses tenant_id injected by middleware
SELECT * FROM projects
WHERE id = $1 AND org_id = $2  -- $2 is request.tenantId from middleware → safe

-- WRONG: no tenant filter at all
SELECT * FROM projects WHERE id = $1  -- returns data regardless of who is asking

-- WRONG: filtering by user_id instead of org_id for org-scoped data
SELECT * FROM projects WHERE created_by = $1  -- shows only creator's data, not org's

-- RIGHT: org data filtered by org, with optional user filter as secondary
SELECT * FROM projects
WHERE org_id = $1          -- primary: tenant isolation
  AND created_by = $2      -- secondary: "my items" view within the org
```

---

## Role-based permission checks

After confirming tenancy, check whether the user's *role* allows the action:

```python
ROLE_PERMISSIONS = {
    'owner': {'read', 'write', 'delete', 'manage_members', 'billing'},
    'admin': {'read', 'write', 'delete', 'manage_members'},
    'member': {'read', 'write'},
    'viewer': {'read'},
}

def require_permission(permission: str):
    def decorator(handler):
        def wrapper(request, *args, **kwargs):
            if permission not in ROLE_PERMISSIONS.get(request.role, set()):
                raise HTTP403(f"Role '{request.role}' cannot perform '{permission}'")
            return handler(request, *args, **kwargs)
        return wrapper
    return decorator

# Usage
@require_permission('manage_members')
def invite_member(request):
    ...
```

---

## Cross-tenant interaction security

The bridge table (`connection_requests`) is the only place where two tenants interact.
It must enforce that:

1. **Opt-in required:** Tenant B must have set `is_discoverable = true` before Tenant A can send them a request.
2. **No data leakage:** Accepting a request does NOT give Tenant A read access to Tenant B's private tables.
3. **Contact details are gated:** Email/phone are fetched from `users` only after `status = 'accepted'`.

```python
def accept_connection(request_id: str, tenant: TenantContext):
    conn_request = db.query(ConnectionRequest).filter_by(
        id=request_id,
        to_org_id=tenant.tenant_id,  # ← only the receiving org can accept
        status='pending'
    ).first_or_404()

    conn_request.status       = 'accepted'
    conn_request.responded_at = now()
    db.commit()

    # ONLY NOW: unlock contact email for the sender
    sender_email = db.query(User.email).join(Membership).filter(
        Membership.org_id == conn_request.from_org_id,
        Membership.role == 'owner'
    ).scalar()

    # Return limited contact info — never the receiving org's private data
    return {'contact_email': sender_email}
```

---

## Public / discovery queries (intentional cross-tenant reads)

When you intentionally expose a subset of tenant data publicly (a marketplace directory,
a startup observatory, a talent board), guard it with a strict field whitelist:

```python
# Define once, enforce everywhere
PUBLIC_FIELDS_WHITELIST = [
    'organizations.name',
    'organizations.description',
    'vendor_profiles.specialities',
    'vendor_profiles.rating',
    # NEVER include: private notes, internal scores, contact details, financial data
]

def get_public_directory(filters):
    # NO tenant_id filter — this is intentionally cross-tenant
    # But is_discoverable MUST be checked, and only whitelisted fields returned
    return db.query(*PUBLIC_FIELDS_WHITELIST).join(...).filter(
        VendorProfile.is_discoverable == True,
        *build_filters(filters)
    ).all()
    # Private tables (audit_log, internal_notes, etc.) are NEVER joined here
```

---

## Security audit checklist

Run this checklist before shipping any new feature:

```
SCHEMA
□ Every new domain table has org_id NOT NULL
□ org_id has a database-level index
□ Foreign keys reference organizations(id) with appropriate ON DELETE behaviour

MIDDLEWARE
□ Tenant middleware runs before every authenticated handler
□ Handler cannot be called without middleware (test: remove middleware, expect 401/403)
□ tenant_id is read from session/JWT — never from request body or URL params

QUERIES
□ Every SELECT on a domain table has WHERE org_id = request.tenant_id
□ Every INSERT into a domain table includes org_id = request.tenant_id
□ No query reads org_id from the client request body
□ "Get by ID" queries include both id AND org_id (prevents IDOR attacks)

CROSS-TENANT
□ The only place from_org_id != to_org_id is the bridge table
□ Private contact details are not in the bridge table; fetched only post-acceptance
□ Public directory uses an explicit field whitelist
□ Private tables are never joined in public directory queries

ROLES
□ Role is read from memberships — never from a JWT claim or request param
□ Write/delete actions check role before executing
□ Owner-only actions (delete org, billing) are gated to role = 'owner'

TESTING
□ Integration test: Tenant A reads a resource owned by Tenant B → 403
□ Integration test: User with 'member' role performs owner-only action → 403
□ Integration test: Unauthenticated request → 401
□ Integration test: Invite accepted by wrong email → error
```

---

## IDOR (Insecure Direct Object Reference) prevention

IDOR is the most common multi-tenant security bug. It happens when you fetch by ID alone
without checking the tenant:

```sql
-- VULNERABLE to IDOR: an attacker can enumerate any project's data
SELECT * FROM projects WHERE id = $1

-- SAFE: ID + tenant check together
SELECT * FROM projects WHERE id = $1 AND org_id = $2
```

Always query with both the resource ID and the tenant_id. If the row doesn't exist for
that tenant, return 404 (not 403 — don't confirm existence of resources that aren't yours).
