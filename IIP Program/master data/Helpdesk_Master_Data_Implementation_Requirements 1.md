# Kruise Master Data – Helpdesk Integration Requirements
## Implementation Requirements for Helpdesk

**Version:** 1.0  
**Date:** 11-Sep-2026  
**Audience:** Kruise Master Data Team and Helpdesk Team

---

## 1. Purpose

Helpdesk is a separate application with its own Go backend and PostgreSQL schema (`helpdesk.*`).

Helpdesk must **not duplicate Master Data**. Master Data remains the owner of organisation, people, and site definitions. Helpdesk consumes those definitions through approved APIs/service contracts and stores only references and historical snapshots required for ticket transactions.

This document defines the minimum Master Data capabilities required for Helpdesk, with special focus on:

- Entities Helpdesk consumes from Master Data
- Required fields per entity, marked **P0 / P1 / P2**
- Relationships / hierarchy Helpdesk assumes
- Identifiers, APIs, and validation

Helpdesk consumes **organisation, people, and site** masters. It does **not** consume manufacturing or commerce masters such as Item, UOM, BOM, Routing, Customer, or Plant as a production site.

Priority key:

| Priority | Meaning |
|---|---|
| **P0** | Blocking. Ticket create, assign, mail match, org isolation, or V2 department transfer cannot work without this. |
| **P1** | Important. Requester context, multi-site display, or escalation fallback. |
| **P2** | Nice-to-have. Availability, richer picker UI, or future routing. |

---

## 2. Ownership Boundary

### Master Data owns

- Company / Organisation
- Branch
- Plant
- Department
- Designation
- Location
- Employee
- Employee Position
- Shift
- Skill
- HCM Team

IAM remains the owner of Tenant, User, authentication, and platform login RBAC.

### Helpdesk owns

- Ticket
- Ticket Assignment
- Ticket Comment
- Ticket Attachment
- Ticket Watcher
- Ticket Transfer
- SLA Clock / Breach / Escalation events
- Category
- Status Master
- Priority Master
- Group (Team)
- Team Member
- Helpdesk Role
- Agent (Helpdesk seat)
- Contact
- SLA Rule
- Business Hours
- Holiday Calendar
- Canned Response
- Ticket Settings

### Boundary

```text
Master Data
   │
   │ organisation / people / site definitions
   ▼
Helpdesk
   │
   │ tickets / routing / SLA execution
   ▼
Notifications / Email / Workflow / Reports
```

Helpdesk must not create duplicate master tables for Organisation, Employee, Department, Designation, Location, Shift, Skill, or User.

The current `helpdesk.organizations` copy is a **known divergence**. If Helpdesk onboarding continues to write a local org row, that row must be a projection of the Master Data Organisation, not a competing source of truth.

---

## 3. Helpdesk Master Data Dependencies

| Entity | Priority | Required by Helpdesk | Purpose |
|---|---|---|---|
| **Company / Organisation** | **P0** | Yes | Org scope for every Helpdesk row (`org_id`) |
| **Employee** | **P0** | Yes | Requester (`raised_for`), inbound mail match, person behind an Agent seat |
| **Department** | **P0** | Yes (V2) | Ticket ownership and transfer IT → HR → Finance |
| Location | P1 | Reference | Site / office on requester or ticket |
| Designation | P1 | Reference | Requester / agent display |
| Branch | P1 | If multi-site | Branch scope under Company |
| Plant | P2 | No | Optional context only. **Not required** for V1/V2 |
| Shift | P2 | Later | Agent availability |
| Skill | P2 | Later | Skill-based routing |
| HCM Team | P2 | If used | Must **not** replace Helpdesk Group |

IAM dependencies used with Master Data:

| Entity | Owner | Priority | Purpose |
|---|---|---|---|
| Tenant | IAM | P0 | `iam_tenant_id` → Organisation |
| User | IAM | P0 | Login actor (`iam_user_id`) |

---

# 4. Identifier and Code Requirements

Helpdesk must not assume UI values such as `ORG-F4766C13`, `EMP-001`, `IT`, or `Ravi Kumar` are database IDs.

For every Helpdesk dependency, Master Data should document:

1. Internal immutable identifier
2. Business code
3. Display name
4. Relationship identifiers
5. Tenant / organisation scope
6. Status

The following are currently **CONTRACT_PENDING** and need confirmation:

- Internal ID datatype
- Authoritative API identifier
- Business code format
- Whether code is immutable
- Whether IDs are tenant-scoped
- Tenant / organisation model

Helpdesk will use application-level references. Helpdesk will not create PostgreSQL foreign keys into the Master Data database.

---

# 5. Company / Organisation

Organisation is a **P0** Helpdesk dependency. Every Helpdesk row is `org_id`-scoped.

## Required

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier (`organization_id`) |
| name | **P0** | Display name |
| status | **P0** | Lifecycle status. Only `ACTIVE` orgs may create / work tickets |
| iam_tenant_id | **P0** | IAM tenant mapping |
| code | P1 | Business code. Must not be treated as the ID |
| country | P1 | Locale / holiday context |
| timezone | P1 | SLA clock basis |
| legal_entity_name | P2 | Registration / header display |
| address / city / state / pincode | P2 | Org profile only |
| logo_url | P2 | Branding |

### Required relationship

```text
IAM Tenant
   ↓
Organisation
   ↓
Helpdesk masters + tickets
```

Helpdesk must be able to resolve:

```text
iam_tenant_id  →  organization_id
organization_id → status
```

---

# 6. Branch

A direct Branch column on tickets is **not required** to create a ticket.

If Master Data already models Company → Branch, Helpdesk can store `branch_id` later for multi-site queues.

## Required if Branch is in the approved org model

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| code | P1 | Business code |
| name | **P0** | Display name |
| company_id / org_id | **P0** | Company relationship |
| status | P1 | Lifecycle status |
| plant_id | P2 | Not required for Helpdesk |

Do not add a redundant Branch column only for Helpdesk if Department already sits under Branch.

The Master Data API should nevertheless be able to return or resolve Branch context when Helpdesk validates a Department.

---

# 7. Plant

Plant is a **P2** Helpdesk dependency and is **not required** for V1/V2.

Production requires Plant as a manufacturing site. Helpdesk does not.

A direct `plant_id` is **not required for Helpdesk** if Master Data already models:

```text
Department
    ↓
Branch / Location
    ↓
Plant
    ↓
Company
```

Do not add a Plant column on tickets only to mirror Production.

The Department API should be able to return or resolve Plant context when required.

| Field | Priority | Requirement |
|---|---|---|
| id | P2 | Optional context on Department read |
| code | P2 | Business code |
| name | P2 | Display name |
| status | P2 | Lifecycle status |

---

# 8. Department

## This is a P0 Helpdesk requirement for V2.

Helpdesk V2 tickets belong to a department and can transfer IT → HR → Finance inside the same organisation.

## Required

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| org_id | **P0** | Organisation relationship |
| name | **P0** | Display name |
| status | **P0** | Active / usable flag. Cannot transfer to an inactive department |
| code | P1 | Business code |
| parent_id | P1 | Parent department, if hierarchy exists |
| head_employee_id | P1 | Supervisor fallback for SLA escalation |
| description | P2 | Help text |

Example:

```text
Department: IT
Code: IT
Parent: null
Head: EMP-4412
Status: ACTIVE
```

Helpdesk may keep a thin local mapping only for Helpdesk-specific defaults:

```text
default_team_id
supervisor_agent_id
```

That mapping must reference this Master Data `department_id`. It is not a second department master.

A Helpdesk Group belongs to at most one Department. A Department may have one or more Helpdesk Groups.

---

# 9. Location

A location such as:

```text
Company
   ↓
Branch
   ↓
Location
```

is acceptable if the API clearly exposes stable identifiers and relationships.

Helpdesk does not require a duplicate Location master. Helpdesk does not require a WMS hierarchy (Warehouse → Zone → Rack → Bin).

## Required if Location is used

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| org_id | **P0** | Organisation relationship |
| name | **P0** | Display name |
| status | P1 | Lifecycle status |
| code | P1 | Business code |
| city / state / country | P1 | Requester context |
| is_headquarters | P2 | Display only |

---

# 10. Designation

Designation is a P1 display dependency. Helpdesk does not route tickets by designation in V1/V2.

## Required if returned on Employee

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| org_id | **P0** | Organisation relationship |
| name | **P0** | Job title display |
| code | P1 | Business code |
| department_id | P1 | Consistency with Employee.department |
| level | P2 | Not used by routing |

---

# 11. Employee — P0 REQUIRED

## This is the highest-priority Master Data requirement for Helpdesk.

Employee is the person master for:

- ticket requester (`raised_for`)
- inbound email matching
- the person behind a Helpdesk Agent seat

Helpdesk must **not** create a duplicate Employee master.

## Required Employee fields

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier (`employee_id`) |
| org_id | **P0** | Organisation relationship. Reject cross-org employees |
| name | **P0** | Display name. May be snapshotted on ticket responses |
| email | **P0** | Inbound mail match, Contact sync, raised-for lookup |
| status | **P0** | Usable / active status for requester and agent person |
| department_id | **P0** | Department relationship. Used to infer ticket department in V2 |
| iam_user_id | **P0** | Login user link. Used to resolve Agent seat |
| code | P1 | Business employee code |
| mobile | P1 | Requester contact |
| location_id | P1 | Site relationship |
| designation_id | P1 | Current designation, direct or via Employee Position |
| reporting_manager_id | P2 | Future escalation fallback |
| shift_id | P2 | Future availability |
| date of joining / employment type / address | P2 | Not used by the ticket engine |

## Do not permanently bind Employee to Helpdesk Category / Group

The correct model is:

```text
Employee
   │
   │ reusable person definition
   ▼
Helpdesk Agent seat
   ├── Helpdesk Role
   ├── ticket_scope
   └── Group membership
```

The same employee can therefore be referenced as a requester on one ticket and as an agent on another, without Master Data owning Helpdesk routing.

## Required Employee lookups

```text
GET employee by id
GET employee by email
GET employee by iam_user_id
```

Email and IAM-user lookups are **P0**. Inbound mail cannot match a requester without email. Agent login cannot resolve a person without `iam_user_id`.

Helpdesk assumes **one active Employee per `iam_user_id` inside an organisation**. If Master Data allows more than one, the API must say which record is authoritative.

---

# 12. Shift

Shift is a P2 dependency. Helpdesk SLA clocks use Helpdesk Business Hours and Holidays today, not HCM Shift.

| Field | Priority | Requirement |
|---|---|---|
| id | P2 | Internal identifier |
| org_id | P2 | Organisation relationship |
| name | P2 | Display name |
| start_time / end_time | P2 | Working window |
| status | P2 | Lifecycle status |

---

# 13. Skill

Skill is a P2 dependency. It is not used by V1/V2 assignment rules.

| Field | Priority | Requirement |
|---|---|---|
| id | P2 | Internal identifier |
| code | P2 | Business code |
| name | P2 | Display name |
| status | P2 | Lifecycle status |

---

# 14. HCM Team

If Master Data / HCM has Team:

- Helpdesk may store an external reference later.
- Helpdesk Group (`helpdesk.teams`) remains the assignment pool.
- Do not replace Helpdesk Group with HCM Team.

| Field | Priority | Requirement |
|---|---|---|
| id | P2 | Internal identifier |
| name | P2 | Display name |
| status | P2 | Lifecycle status |

---

# 15. Status and Lifecycle

Master Data entities must expose clear lifecycle / status information.

For people and organisation definitions such as:

- Organisation
- Employee
- Department
- Location
- Branch

the API must allow Helpdesk to determine whether a definition is usable / active.

The exact Master Data status vocabulary should be documented by the Master Data team.

Helpdesk needs at least:

```text
Employee usable as requester
Employee usable as an Agent person
Department usable as a transfer target
Organisation usable for ticket create
```

---

# 16. API Contract Required

Helpdesk cannot safely integrate using UI data or display values.

At minimum, Master Data needs logical lookup capabilities for:

```text
Organisation
Employee
Department
Location
Designation
Branch   (if in the org model)
```

The exact endpoint paths may follow the Kruise API standard.

For example, conceptually:

```text
GET /organizations/{id}
GET /employees/{id}
GET /employees?email={email}
GET /employees?iam_user_id={iam_user_id}
GET /departments/{id}
GET /locations/{id}
GET /designations/{id}
GET /branches/{id}
```

These are **capability requirements**, not a demand to use these exact URL paths.

---

# 17. Complete Employee Read API

Helpdesk needs to retrieve a complete Employee definition logically in one operation.

The response should provide:

```text
Employee
  ├── id
  ├── code
  ├── name
  ├── email
  ├── mobile
  ├── status
  ├── iam_user_id
  ├── organisation
  ├── department
  ├── location
  ├── designation
  └── reporting manager
```

This is required for ticket create, inbound mail match, and Agent seat linking.

---

# 18. Complete Department Read API

Helpdesk needs to retrieve a Department including enough parent / site context to validate transfer.

The logical response should provide:

```text
Department
  ├── id
  ├── code
  ├── name
  ├── status
  ├── organisation
  ├── parent department
  ├── head employee
  ├── branch / plant context where applicable
  └── location where applicable
```

This is required for V2 department transfer.

---

# 19. Relationship Validation

Master Data should validate relationships within its own domain.

Examples:

```text
Employee:
  Organisation exists
  Department exists where set
  Location exists where set
  Designation exists where set
  IAM user exists where set
  Status is usable

Department:
  Organisation exists
  Parent department exists where set
  Head employee exists where set
```

Helpdesk should not reproduce Master Data relationship rules internally.

Helpdesk will validate Helpdesk-owned relationships itself:

```text
Category → Group is same org
Group member → Agent is same org
Ticket assignee is an active Helpdesk Agent
```

---

# 20. Cross-Database Rule

There must be **NO PostgreSQL foreign key from Helpdesk to Master Data**.

Correct:

```text
Helpdesk DB
tickets.raised_for
        │
        └── application-level reference
                  │
                  ▼
             Master Data API
```

Incorrect:

```text
Helpdesk DB
      │
      └── PostgreSQL FK ──► Master Data DB
```

Helpdesk-owned tables may have PostgreSQL FKs between themselves.

---

# 21. Historical Traceability

Helpdesk must be able to reproduce which master definition was used when a ticket was created or transferred.

Therefore:

- Organisation identity must be retained.
- Employee identity must be retained.
- Department identity must be retained after V2.
- Required codes / names may be snapshotted by Helpdesk.
- Master Data updates must not rewrite historical Helpdesk tickets.

Example:

```text
2026-09-11
Ticket HD-2026-00043 created
        │
        ├── Organisation ORG-F4766C13
        ├── Employee EMP-4412
        └── Department IT
```

---

# 22. Relationships / Hierarchy Helpdesk Assumes

## Shared Master Data hierarchy

```text
Company / Organisation
   ├── iam_tenant_id → IAM Tenant
   │
   ├── Branch                         [P1 if multi-site]
   │      └── Plant                   [P2 — not required by Helpdesk]
   │
   ├── Location                       [P1]
   │
   ├── Department                     [P0 for V2]
   │      ├── parent Department       [P1]
   │      ├── head Employee           [P1]
   │      └── Designation             [P1]
   │
   └── Employee                       [P0]
          ├── department_id → Department
          ├── location_id   → Location
          ├── designation   → Designation
          ├── iam_user_id   → IAM User
          ├── reporting_manager_id → Employee
          └── shift_id      → Shift   [P2]
```

A direct `plant_id` on Employee or Ticket is **not required** if Department already sits under the approved site chain.

The Master Data API should still be able to return Plant / Branch context when Helpdesk validates a Department.

## How Helpdesk references that hierarchy

```text
Organisation
   │
   ├── Employee
   │      ├── tickets.raised_for
   │      ├── contacts.employee_id     [P1 projection]
   │      └── agents.employee_id
   │
   ├── Department
   │      ├── tickets.department_id    [V2]
   │      └── groups.department_id     [V2]
   │
   └── IAM User
          └── agents.iam_user_id
```

## Helpdesk routing hierarchy (Helpdesk-owned)

This is the Helpdesk equivalent of Production `Routing → Routing Step → Operation / Work Center / Machine`.

Master Data must **not** flatten this into Category → Employee.

```text
Department                         ← Master Data
   │
   └── Group (Team)                ← Helpdesk
          └── Team Member
                 └── Agent         ← Helpdesk seat
                        ├── Employee     ← Master Data
                        ├── IAM User     ← IAM
                        └── Helpdesk Role

Category                           ← Helpdesk
   └── team_id → Group             ← P0 Helpdesk routing spine

Ticket                             ← Helpdesk transaction
   ├── org_id        → Organisation
   ├── raised_for    → Employee
   ├── department_id → Department
   ├── category_id   → Category → Group
   └── assigned_to   → Agent
```

## Ticket create — assumed resolution order

```text
1. Tenant / User              → Organisation
2. raised_for email or id     → Employee
3. Employee.department_id     → Department     (if ticket has no department)
4. Helpdesk Category          → Group → Agent pool
5. Write ticket with snapshots
```

If step 2 fails, ticket create may still succeed without `raised_for`.  
Do not fail V1 create because Master Data Department is missing.

## Transfer — assumed validation (V2)

```text
to_department_id
   ├── Department exists
   ├── Department.org_id == ticket.org_id
   └── Department is active
```

---

# 23. Required vs Recommended

## P0 — Required

1. Stable internal IDs
2. Organisation
3. Organisation status
4. `iam_tenant_id` mapping
5. Employee
6. Employee name
7. Employee email
8. Employee status
9. Employee → Organisation
10. Employee → Department
11. Employee → IAM User
12. Employee lookup by id
13. Employee lookup by email
14. Employee lookup by `iam_user_id`
15. Department
16. Department name
17. Department status
18. Department → Organisation
19. Active / usable status
20. Tenant / scope information
21. Identifier / code contract
22. Complete Employee read capability
23. Complete Department read capability
24. Production-style dependency lookup APIs

## P1 — Important

- Employee code
- Employee mobile
- Employee → Location
- Employee → Designation
- Department code
- Department parent
- Department `head_employee_id`
- Location
- Designation
- Branch
- Batch validation APIs
- Relationship validation capabilities
- Timezone on Organisation

## P2 — Recommended

- Plant information in Department read responses
- Shift
- Skill
- HCM Team reference
- Employee reporting manager
- Richer employee metadata

---

# 24. What Helpdesk Does NOT Require

To avoid unnecessary work:

### Item / UOM / BOM / Routing

Not required. Helpdesk classifies work by Helpdesk Category, not by Item.

### Customer

Not required. The internal requester is **Employee**. An external requester is Helpdesk **Contact**.

### Direct Ticket → Plant column

Not required if Department already resolves to the approved site chain.

### Direct Ticket → Branch column

Not required for V1. Only needed later if multi-site queues are approved.

### Operation / Work Center / Machine / Production Line

Not required.

### Duplicate Employee table inside Helpdesk

Not required. `agents` and `contacts` are seats / profiles that **reference** Employee.

### Duplicate Department table without an HCM / Master Data link

Not required.

### Category → Employee permanent binding

Not required and **not recommended**.

People are selected at Helpdesk Group membership or assignment time.

### Helpdesk copies of Master Data

Do not create Helpdesk tables for:

- Employee
- Department (except optional mapping)
- Designation
- Location
- Shift
- Skill
- User
- Company (except optional local projection)

---

# 25. Confirmation Required from Master Data Team

Please confirm the following before the Helpdesk integration contract is frozen.

## Identifier

1. What is the internal ID field for Organisation, Employee, Department, Location, Designation, Branch?
2. What is its datatype?
3. Which field is authoritative for API references?
4. Is business `code` immutable?
5. Are IDs tenant-scoped?

## Tenant

6. How is tenant / organisation scope represented?
7. What request header / context is required?
8. Is `helpdesk.organizations` allowed as a local projection, or must Helpdesk use the Master Data Organisation id only?

## Employee

9. Can Helpdesk look up Employee by email?
10. Can Helpdesk resolve `iam_user_id → employee_id`?
11. What statuses mean “usable as requester”?
12. What statuses mean “usable as an Agent person”?
13. Is one active Employee per `iam_user_id` per organisation guaranteed?

## Department

14. Where does Department sit in Company / Branch / Plant / Location?
15. Is `head_employee_id` the supervisor Helpdesk should use for SLA escalation?
16. Can Department be retrieved with parent and site context in one read?

## APIs

17. What is the Master Data base URL?
18. What authentication / service token is required?
19. What are the final endpoint paths?
20. What are the request / response schemas?
21. Is batch validation supported?
22. Can Employee be retrieved with Department, Location, and Designation in one read?

---

# 26. Acceptance Criteria

Master Data is ready for Helpdesk integration when:

## Identity

- [ ] Stable internal ID exists for every P0 entity.
- [ ] ID datatype is documented.
- [ ] Business code is documented.
- [ ] Immutable / unique rules are documented.

## People and Organisation

- [ ] Organisation exists with tenant mapping and status.
- [ ] Employee exists with name, email, status, org, department, IAM user.
- [ ] Employee lookup by id.
- [ ] Employee lookup by email.
- [ ] Employee lookup by `iam_user_id`.
- [ ] Department exists with org relationship and active status.
- [ ] Location / Designation / Branch are documented if in the model.

## API

- [ ] Organisation lookup capability
- [ ] Employee lookup capability
- [ ] Department lookup capability
- [ ] Complete Employee read available
- [ ] Complete Department read available
- [ ] Authentication documented
- [ ] Tenant context documented
- [ ] Request / response schemas documented

---

# 27. Target Integration Flow

## Ticket creation

```text
Helpdesk FE
     ↓
Helpdesk API
     ↓
Validate references
     ↓
Master Data APIs
     │
     ├── Organisation
     ├── Employee
     └── Department
     ↓
Ticket
```

## Ticket create — Master Data explosion

```text
Ticket create
       ↓
Master Data
       │
       ├── Employee
       │      ↓
       │   raised_for snapshot
       │
       └── Employee.department
              ↓
       tickets.department_id
```

## Transfer (V2)

```text
Ticket
       ↓
Validate Department from Master Data
       ↓
Helpdesk Group / Agent assignment
       ↓
Transfer history (Helpdesk-owned)
```

## Execution

```text
Ticket lifecycle
       ↓
Employee / User from Master Data + IAM
       ↓
Comments / assignments / SLA clocks
       ↓
Notifications
```

---

# 28. Master Data → Helpdesk Relationship

```text
                         MASTER DATA
                              │
       ┌──────────────────────┼───────────────────────┐
       │                      │                       │
       ▼                      ▼                       ▼
 Organisation              Employee              Department
       │                      │                       │
       │                      ├── email               │
       │                      ├── iam_user_id         │
       │                      └── department_id ──────┘
       │
       └──────────────┬────────────────┬──────────────┘
                      │                │
                      ▼                ▼
                 Helpdesk Agent   Ticket.raised_for
                      │
                      └── Ticket
                             ├── Assignments
                             ├── Comments
                             └── SLA clocks
```

---

# 29. Recommended Implementation Sequence for Master Data

### Phase 1 — Core organisation and people

1. Organisation
2. Tenant mapping
3. Employee
4. Employee email
5. Employee status
6. Employee → IAM User
7. Department
8. Employee → Department

### Phase 2 — Site and display context

9. Location
10. Designation
11. Branch
12. Department parent
13. Department head employee

### Phase 3 — APIs

14. Lookup APIs
15. Complete Employee read API
16. Complete Department read API
17. Relationship validation
18. Authentication
19. Tenant context
20. API documentation

### Phase 4 — Helpdesk integration validation

21. Helpdesk → Master Data lookup
22. Employee retrieval by id / email / IAM user
23. Department retrieval
24. Invalid-reference handling
25. Inactive employee / department handling

---

# 30. Important Modelling Principles

The Master Data team should maintain a clean master-data model rather than adding fields only because Helpdesk currently has a column with the same name.

Master Data defines:

```text
ID
Code
Name
Status
Relationships
Effective Dates
```

where applicable.

Helpdesk owns transaction-specific values:

```text
ticket_no
subject
status / priority
assigned_to
response_due_at
resolve_due_at
channel
erp_module
```

Master Data must not own Helpdesk tickets.

Helpdesk must not own Employees, Departments, Locations, or Users.

---

# 31. Final Request to Master Data Team

Please use this document as the implementation baseline for the Helpdesk integration.

### Highest-priority requirement

> **Provide a stable Employee master that Helpdesk can resolve by id, email, and IAM user, including organisation, status, and department. Do not require Helpdesk to duplicate people.**

### Second major requirement

> **Provide a versioned, active Department master that Helpdesk can store on tickets and use for same-org transfer, without a second Helpdesk department source of truth.**

After the P0 structures are implemented, please share:

1. Final entity fields
2. Final ID / code strategy
3. Final relationship model
4. API endpoints
5. Request / response examples
6. Authentication requirements
7. Tenant / organisation handling
8. Sample complete Employee response
9. Sample complete Department response

The Helpdesk team will align its integration clients and ticket logic against the confirmed Master Data contract.

---

# 32. Status Summary

| Area | Status |
|---|---|
| Master Data ownership boundary | CONFIRMED |
| Helpdesk must not duplicate Master Data | CONFIRMED |
| Employee as reusable person definition | CONFIRMED |
| Requester is Employee, not Customer | CONFIRMED |
| Agent is a Helpdesk seat linked to Employee | CONFIRMED |
| Category → Group routing | Helpdesk-owned |
| Direct Ticket → Plant | NOT REQUIRED |
| Direct Ticket → Branch | NOT REQUIRED for V1 |
| Organisation / Employee / Department | **P0 REQUIRED** |
| Employee email and IAM-user lookup | **P0 REQUIRED / HIGH PRIORITY** |
| Department for V2 transfer | **P0 REQUIRED** |
| Location / Designation / Branch | P1 |
| Plant / Shift / Skill | P2 |
| Master Data API contract | REQUIRED |
| Master Data ID strategy | CONTRACT PENDING |
| Master Data tenant strategy | CONTRACT PENDING |

---

**Document owner:** Helpdesk Team  
**Implementation owner:** Kruise Master Data Team  
**Integration principle:** Master Data defines; Helpdesk executes.
