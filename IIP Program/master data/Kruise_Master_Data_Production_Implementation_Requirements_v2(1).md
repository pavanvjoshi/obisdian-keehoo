# Kruise Master Data – Production Integration Requirements
## Implementation Requirements for Kruise Production

**Version:** 2.0  
**Date:** 10-Sep-2026  
**Audience:** Kruise Master Data Team (Prajwala / Suraj) and Kruise Production Team

---

## 1. Purpose

Kruise Production is being developed as a separate application with its own Go backend and PostgreSQL database.

Production must **not duplicate Master Data**. Master Data remains the owner of manufacturing definitions and reference data. Production consumes those definitions through approved APIs/service contracts and stores only references and historical snapshots required for manufacturing transactions.

This document defines the minimum Master Data capabilities required for Kruise Production, with special focus on manufacturing relationships, Routing Steps, BOM structure, versioning, identifiers, APIs, and validation.

---

## 2. Ownership Boundary

### Master Data owns

- Company
- Branch
- Plant
- Department
- Item
- Item Category
- UOM
- Location
- Production Line
- Work Center
- Machine
- Operation
- Routing
- Routing Step
- BOM
- BOM Item
- BOM Alternative
- Scrap Rule

### Production owns

- Production Order
- Work Order
- Operation Execution
- Material Requirement
- Material Consumption
- Production Output
- Production Order Status History
- Production Workflow Instance

### Boundary

```text
Master Data
   │
   │ definitions / configuration
   ▼
Kruise Production
   │
   │ transactions / execution
   ▼
Stock / WMS / other modules
```

Production must not create duplicate master tables for Item, BOM, Routing, Operation, Plant, Production Line, Work Center, Machine, UOM, Employee, or Shift.

---

## 3. Production Master Data Dependencies

| Entity | Priority | Required by Production | Purpose |
|---|---|---|---|
| Company | P0 | Yes | Company scope |
| Branch | P0 | Yes | Branch scope |
| Plant | P0 | Yes | Manufacturing site |
| Department | P1 | As required | Organizational ownership |
| Item | P0 | Yes | Finished goods, raw materials and components |
| Item Category | P1 | Reference | Product classification |
| UOM | P0 | Yes | Quantity measurement |
| Location | P1 | Reference | Material / production location |
| Production Line | P0 | Yes | Manufacturing line |
| Work Center | P0 | Yes | Manufacturing work area |
| Machine | P0 | Yes | Equipment used for operations |
| Operation | P0 | Yes | Reusable operation definition |
| Routing | P0 | Yes | Ordered manufacturing process |
| **Routing Step** | **P0** | **Yes** | **Connects sequence, operation and manufacturing resources** |
| BOM | P0 | Yes | Manufacturing structure |
| BOM Item | P0 | Yes | BOM component definition |
| BOM Alternative | P1 | If supported | Alternative component |
| Scrap Rule | P1 | If applicable | Scrap definition |
| Employee | P0/P1 | Execution | Operator reference |
| Team | P1 | If used | Team reference |
| Shift | P0/P1 | Scheduling/execution | Shift reference |
| Skill | P1 | If used | Operator qualification |

---

# 4. Identifier and Code Requirements

Production must not assume UI values such as `ITEM-001`, `PLT-001`, or `LINE-001` are database IDs.

For every Production dependency, Master Data should document:

1. Internal immutable identifier
2. Business code
3. Display name
4. Relationship identifiers
5. Tenant/organization scope
6. Status

The following are currently **CONTRACT_PENDING** and need confirmation:

- Internal ID datatype
- Authoritative API identifier
- Business code format
- Whether code is immutable
- Whether IDs are tenant-scoped
- Tenant/organization model

Production will use application-level references. Production will not create PostgreSQL foreign keys into the Master Data database.

---

# 5. Production Line

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| plant_id | Plant relationship |
| status | Lifecycle status |
| capacity | Manufacturing capacity |

### Capacity

Recommended:

```text
capacity_value
capacity_uom_id
capacity_basis
```

Example:

```text
capacity_value = 4000
capacity_uom = PCS
capacity_basis = PER_SHIFT
```

`capacity_uom` and `capacity_basis` are a **recommended P2 enhancement**, not a blocker for the initial Production Order implementation.

---

# 6. Work Center

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| production_line_id | Production Line relationship |
| status | Lifecycle status |

## Plant relationship

A direct `plant_id` is **not required for Production** if Master Data already models:

```text
Work Center
    ↓
Production Line
    ↓
Plant
```

Do not add a redundant Plant column only for Production.

The Master Data API should nevertheless be able to return or resolve the Plant context when Production validates a Work Center.

---

# 7. Machine

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| work_center_id | Work Center relationship |
| status | Lifecycle status |

Optional metadata such as model/manufacturer may exist.

A direct `plant_id` is **not required for Production** if:

```text
Machine
   ↓
Work Center
   ↓
Production Line
   ↓
Plant
```

is the approved Master Data relationship.

The Machine API should be able to return/resolve Plant context when required.

---

# 8. Operation

## Important modelling decision

Operation must remain a **generic reusable manufacturing operation definition**.

Examples:

```text
CUTTING
WELDING
PAINTING
ASSEMBLY
INSPECTION
```

### Required Operation fields

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Operation name |
| standard_time | Standard duration |
| status | Lifecycle status |

## Do not permanently bind Operation to Work Center/Machine

The correct model is:

```text
Operation
   │
   │ reusable definition
   ▼
Routing Step
   ├── Work Center
   └── Machine
```

The same operation can therefore be reused by multiple Routings with different resources.

---

# 9. Routing

Routing defines the ordered manufacturing process for an Item.

## Required Routing header

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| item_id | Item reference |
| version | Required |
| effective_from | Required |
| effective_to | Nullable |
| status | Required |

Example:

```text
Routing: RTG-001
Item: ITEM-001
Version: V2
Effective From: 2026-01-01
Effective To: null
Status: ACTIVE
```

Routing versions must be stable so Production can identify exactly which definition was used when a Production Order was released.

---

# 10. Routing Step / Routing Operation — P0 REQUIRED

## This is the highest-priority Production requirement.

A Routing header alone is not sufficient.

Master Data must provide a real child entity representing the ordered steps of a Routing.

Example:

```text
Routing RTG-001 / V2

Step 10
  Operation: CUTTING
  Work Center: WC-01
  Machine: MCH-01

Step 20
  Operation: WELDING
  Work Center: WC-02
  Machine: MCH-02

Step 30
  Operation: PAINTING
  Work Center: WC-03
  Machine: MCH-03
```

## Required Routing Step fields

| Field | Required | Description |
|---|---|---|
| id | Yes | Routing Step identifier |
| routing_id | Yes | Parent Routing |
| sequence | Yes | Execution sequence, e.g. 10, 20, 30 |
| operation_id | Yes | Master Data Operation |
| work_center_id | Yes | Work Center used for the step |
| machine_id | Conditional | Machine used for the step |
| cycle_time | Yes | Expected cycle time |
| setup_time | Yes | Setup/changeover time |
| labor | Yes | Expected labor/operator count |
| quality_checkpoint | Yes | Whether a quality checkpoint is required |
| status | Yes | Lifecycle status |

The exact ID datatypes and API field names must follow the final Master Data contract.

## Why Routing Step is required

Production uses Routing Steps to create transaction-level Operation Executions.

```text
Master Data Routing
        │
        └── Routing Steps
               │
               ├── Operation
               ├── Work Center
               ├── Machine
               ├── Sequence
               ├── Cycle Time
               ├── Setup Time
               ├── Labor
               └── Quality Checkpoint
                        │
                        ▼
                 Production Release
                        │
                        ▼
             Production Operation Executions
```

Production will snapshot required values at release so later Master Data changes do not rewrite historical production meaning.

---

# 11. BOM

BOM defines the material structure for an Item.

## Required BOM header

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| item_id | Parent/finished item |
| version | Required |
| effective_from | Required |
| effective_to | Nullable |
| status | Required |

## BOM Item

BOM Item must be a real child relationship.

| Field | Requirement |
|---|---|
| id | Internal identifier |
| bom_id | Parent BOM |
| component_item_id | Component Item |
| quantity_per_unit | Required |
| uom_id | Required |
| status | Required |

Example:

```text
BOM FG-001 / V3

Component RM-001 → 2 PCS
Component RM-002 → 5 KG
Component RM-003 → 1 PCS
```

## BOM Alternative

If alternatives are supported:

```text
BOM Item
   └── Alternative
```

Minimum concepts:

- BOM Item reference
- Alternative component reference
- Priority
- Status

## Scrap Rule

If supported:

- BOM reference
- scrap percentage
- reason
- status

---

# 12. BOM Versioning

BOM version must be explicit and stable.

At Production Order release:

```text
Master Data BOM Version
          ↓
Material Requirement generation
          ↓
Production-owned Material Requirements
```

Production must not continuously re-read a newer BOM and rewrite an already released Production Order.

---

# 13. Item

Item is a P0 Production dependency.

Master Data should provide:

- internal ID
- business code
- name
- category
- base UOM
- status
- tenant/scope where applicable

Production must be able to identify finished goods, raw materials and components according to the approved Item model.

Production must not create a duplicate Item master.

---

# 14. UOM

UOM is a P0 dependency.

Master Data should provide:

- internal ID
- code
- name
- status
- conversion information where applicable

Production must not create its own duplicate UOM master.

---

# 15. Plant / Organization

Production requires Plant as a manufacturing scope.

Master Data should provide a clear organization relationship, for example:

```text
Company
   ↓
Branch
   ↓
Plant
```

The exact hierarchy and identifiers must be documented in the Master Data API.

Production should use stable identifiers rather than display names.

---

# 16. Location

A location hierarchy such as:

```text
Warehouse
   ↓
Zone
   ↓
Rack
   ↓
Bin
   ↓
Gate
```

is acceptable if the API clearly exposes stable identifiers and relationships.

Production does not require a duplicate Location master.

---

# 17. HCM Dependencies

Production may require:

- Employee
- Team
- Shift
- Skill

Production stores external HCM references only.

Example:

```text
Production Operation Execution
        │
        ├── employee_id
        ├── team_id
        └── shift_id
```

HCM remains the owner of employee and shift definitions.

---

# 18. Status and Lifecycle

Master Data entities must expose clear lifecycle/status information.

For manufacturing definitions such as:

- BOM
- Routing
- Operation
- Production Line
- Work Center
- Machine

the API must allow Production to determine whether a definition is usable/active/approved.

The exact Master Data status vocabulary should be documented by the Master Data team.

---

# 19. API Contract Required

Production cannot safely integrate using UI data or display values.

At minimum, Master Data needs logical lookup capabilities for:

```text
Item
UOM
Plant
Production Line
Work Center
Machine
Operation
Routing
Routing Steps
BOM
BOM Items
```

The exact endpoint paths may follow the Kruise API standard.

For example, conceptually:

```text
GET /items/{id}
GET /uoms/{id}
GET /plants/{id}
GET /production-lines/{id}
GET /work-centers/{id}
GET /machines/{id}
GET /operations/{id}
GET /routings/{id}
GET /routings/{id}/steps
GET /boms/{id}
GET /boms/{id}/items
```

These are **capability requirements**, not a demand to use these exact URL paths.

---

# 20. Complete Routing Read API

Production needs to retrieve a complete Routing definition logically in one operation.

The response should provide:

```text
Routing
  ├── id
  ├── code
  ├── item
  ├── version
  ├── effective dates
  ├── status
  │
  └── steps[]
       ├── sequence
       ├── operation
       ├── work center
       ├── machine
       ├── cycle time
       ├── setup time
       ├── labor
       └── quality checkpoint
```

This is required for release-time Routing explosion.

---

# 21. Complete BOM Read API

Production needs to retrieve a complete BOM version including component lines.

The logical response should provide:

```text
BOM
  ├── id
  ├── code
  ├── item
  ├── version
  ├── effective dates
  ├── status
  │
  └── items[]
       ├── component item
       ├── quantity
       ├── UOM
       ├── alternatives
       └── scrap rules where applicable
```

This is required for Production material requirement generation.

---

# 22. Relationship Validation

Master Data should validate relationships within its own domain.

Examples:

```text
Routing Step:
  Operation exists
  Work Center exists
  Machine exists where applicable
  Machine / Work Center relationship is valid

BOM Item:
  Component Item exists
  UOM exists
  Quantity is valid

Production Line:
  Plant relationship is valid
```

Production should not reproduce Master Data relationship rules internally.

---

# 23. Cross-Database Rule

There must be **NO PostgreSQL foreign key from Production to Master Data**.

Correct:

```text
Production DB
production_orders.item_id
        │
        └── application-level reference
                  │
                  ▼
             Master Data API
```

Incorrect:

```text
Production DB
      │
      └── PostgreSQL FK ──► Master Data DB
```

Production-owned tables may have PostgreSQL FKs between themselves.

---

# 24. Historical Traceability

Production must be able to reproduce which master definition was used when a Production Order was released.

Therefore:

- Item identity must be retained.
- BOM identity/version must be retained.
- Routing identity/version must be retained.
- Required codes/names may be snapshotted by Production.
- Master Data updates must not rewrite released Production transactions.

Example:

```text
2026-09-10
Production Order PO-001 released
        │
        ├── Item-001
        ├── BOM-001 / V3
        └── Routing-001 / V2
```

---

# 25. Required vs Recommended

## P0 — Required

1. Stable internal IDs
2. Item
3. UOM
4. Plant
5. Production Line
6. Work Center
7. Machine
8. Operation
9. Routing
10. Routing version
11. Routing effective dates
12. **Routing Step**
13. Routing Step sequence
14. Routing Step → Operation
15. Routing Step → Work Center
16. Routing Step → Machine where applicable
17. Routing Step cycle time
18. Routing Step setup time
19. Routing Step labor
20. Routing Step quality checkpoint
21. BOM
22. BOM version
23. BOM effective dates
24. BOM Item
25. BOM Item → Component Item
26. BOM Item quantity
27. BOM Item UOM
28. Production dependency lookup APIs
29. Complete Routing read capability
30. Complete BOM read capability
31. Active/usable status
32. Tenant/scope information
33. Identifier/code contract

## P1 — Important

- BOM Alternatives
- Scrap Rules
- Employee
- Shift
- Team
- Skill
- Location
- Department
- Batch validation APIs
- Effective-dated lookup support
- Relationship validation capabilities

## P2 — Recommended

- Production Line capacity UOM
- Production Line capacity basis
- Plant information in Work Center/Machine read responses
- Richer equipment metadata

---

# 26. What Production Does NOT Require

To avoid unnecessary work:

### Direct Work Center → Plant column

Not required if:

```text
Work Center → Production Line → Plant
```

is the approved relationship.

### Direct Machine → Plant column

Not required if:

```text
Machine → Work Center → Production Line → Plant
```

is the approved relationship.

### Operation → Work Center/Machine permanent binding

Not required and **not recommended**.

Work Center and Machine are selected at the Routing Step level.

### Production copies of Master Data

Do not create Production tables for:

- Item
- BOM
- Routing
- Operation
- Plant
- Production Line
- Work Center
- Machine
- UOM
- Employee
- Shift

---

# 27. Confirmation Required from Master Data Team

Please confirm the following before the Production integration contract is frozen.

## Identifier

1. What is the internal ID field for each entity?
2. What is its datatype?
3. Which field is authoritative for API references?
4. Is business `code` immutable?
5. Are IDs tenant-scoped?

## Tenant

6. How is tenant/organization scope represented?
7. What request header/context is required?

## Routing

8. Will Routing Step be implemented as a real child entity?
9. What is the final field name for sequence?
10. What are the final field names/types for cycle time and setup time?
11. Is Machine mandatory or optional for each Routing Step?
12. How is quality checkpoint represented?

## BOM

13. Is BOM Item a real child entity?
14. Is BOM version part of the BOM identity or a separate version entity?
15. How are alternatives represented?
16. How are scrap rules represented?

## APIs

17. What is the Master Data base URL?
18. What authentication/service token is required?
19. What are the final endpoint paths?
20. What are the request/response schemas?
21. Is batch validation supported?
22. Can Routing and BOM be retrieved with all child records?

---

# 28. Acceptance Criteria

Master Data is ready for Production integration when:

## Identity

- [ ] Stable internal ID exists for every P0 entity.
- [ ] ID datatype is documented.
- [ ] Business code is documented.
- [ ] Immutable/unique rules are documented.

## Manufacturing Structure

- [ ] Production Line exists with Plant relationship.
- [ ] Work Center exists with Production Line relationship.
- [ ] Machine exists with Work Center relationship.
- [ ] Operation exists as reusable definition.
- [ ] Routing exists with version/effective dates.
- [ ] Routing Step exists as a child of Routing.
- [ ] Routing Step contains sequence.
- [ ] Routing Step references Operation.
- [ ] Routing Step references Work Center.
- [ ] Routing Step references Machine where applicable.
- [ ] Routing Step contains cycle/setup/labor/quality checkpoint.

## BOM

- [ ] BOM exists with version/effective dates.
- [ ] BOM Item exists as a child.
- [ ] BOM Item references Component Item.
- [ ] BOM Item contains quantity and UOM.
- [ ] Alternative/Scrap structures are documented.

## API

- [ ] Item lookup capability
- [ ] UOM lookup capability
- [ ] Plant lookup capability
- [ ] Production Line lookup capability
- [ ] Work Center lookup capability
- [ ] Machine lookup capability
- [ ] Operation lookup capability
- [ ] Routing lookup capability
- [ ] Routing Steps available
- [ ] BOM lookup capability
- [ ] BOM Items available
- [ ] Authentication documented
- [ ] Tenant context documented
- [ ] Request/response schemas documented

---

# 29. Target Integration Flow

## Production Order creation

```text
Production FE
     ↓
Production API
     ↓
Validate references
     ↓
Master Data APIs
     │
     ├── Item
     ├── Plant
     ├── UOM
     ├── BOM
     └── Routing
     ↓
Production Order
```

## Production Order release

```text
Production Order
       ↓
Master Data
       │
       ├── BOM Version
       │      ↓
       │   BOM Items
       │      ↓
       │   Material Requirements
       │
       └── Routing Version
              ↓
          Routing Steps
              ↓
       Operation Executions
```

## Execution

```text
Operation Execution
       ↓
Employee / Shift from HCM
       ↓
Material Consumption
       ↓
Production Output
       ↓
Stock / WMS integration
```

---

# 30. Master Data → Production Relationship

```text
                         MASTER DATA
                              │
       ┌──────────────────────┼───────────────────────┐
       │                      │                       │
       ▼                      ▼                       ▼
      Item                   BOM                   Routing
       │                      │                       │
       │                  BOM Items              Routing Steps
       │                      │                       │
       │                      │              ┌────────┼────────┐
       │                      │              │        │        │
       │                      │              ▼        ▼        ▼
       │                      │          Operation  WC      Machine
       │                      │
       └──────────────┬───────┴───────────────┬───────────────┘
                      │                       │
                      ▼                       ▼
               Production Order         Material Requirements
                      │
                      ├── Work Orders
                      ├── Operation Executions
                      ├── Material Consumption
                      └── Production Output
```

---

# 31. Recommended Implementation Sequence for Master Data

### Phase 1 — Core manufacturing masters

1. Item
2. UOM
3. Plant
4. Production Line
5. Work Center
6. Machine
7. Operation

### Phase 2 — Routing

8. Routing header
9. Routing version
10. Effective dates
11. **Routing Step child entity**
12. Sequence
13. Operation reference
14. Work Center reference
15. Machine reference
16. Cycle time
17. Setup time
18. Labor
19. Quality checkpoint

### Phase 3 — BOM

20. BOM header
21. BOM version
22. Effective dates
23. BOM Item
24. Component Item
25. Quantity
26. UOM
27. Alternatives
28. Scrap Rules

### Phase 4 — APIs

29. Lookup APIs
30. Complete Routing read API
31. Complete BOM read API
32. Relationship validation
33. Authentication
34. Tenant context
35. API documentation

### Phase 5 — Production Integration Validation

36. Production → Master Data lookup
37. Routing retrieval
38. BOM retrieval
39. Invalid-reference handling
40. Version/effective-date behavior

---

# 32. Important Modelling Principles

The Master Data team should maintain a clean master-data model rather than adding fields only because Production currently has a column with the same name.

Master Data defines:

```text
ID
Code
Name
Status
Relationships
Version
Effective Dates
```

where applicable.

Production owns transaction-specific values:

```text
planned_quantity
actual_quantity
actual_start
actual_end
actual_consumption
actual_output
execution_status
```

Master Data must not own Production transactions.

---

# 33. Final Request to Master Data Team

Please use this document as the implementation baseline for the Kruise Production integration.

### Highest-priority requirement

> **Implement a real Routing Step / Routing Operation child structure connecting Routing → Sequence → Operation → Work Center → Machine, with cycle time, setup time, labor and quality-checkpoint information.**

### Second major requirement

> **Provide a versioned BOM structure with BOM Items that Production can retrieve and use to generate Material Requirements.**

After the P0 structures are implemented, please share:

1. Final entity fields
2. Final ID/code strategy
3. Final relationship model
4. API endpoints
5. Request/response examples
6. Authentication requirements
7. Tenant/organization handling
8. Sample complete Routing response
9. Sample complete BOM response

The Kruise Production team will align its integration clients and transaction logic against the confirmed Master Data contract.

---

# 34. Status Summary

| Area | Status |
|---|---|
| Master Data ownership boundary | CONFIRMED |
| Production must not duplicate Master Data | CONFIRMED |
| Operation as reusable definition | CONFIRMED |
| Work Center/Machine binding | Routing Step level |
| Direct Work Center → Plant | NOT REQUIRED |
| Direct Machine → Plant | NOT REQUIRED |
| Production Line capacity UOM/basis | RECOMMENDED P2 |
| Routing version | P0 REQUIRED |
| Routing effective dates | P0 REQUIRED |
| **Routing Step** | **P0 REQUIRED / HIGH PRIORITY** |
| Routing Step resource mapping | **P0 REQUIRED** |
| BOM version | P0 REQUIRED |
| BOM Item child structure | P0 REQUIRED |
| Master Data API contract | REQUIRED |
| Master Data ID strategy | CONTRACT PENDING |
| Master Data tenant strategy | CONTRACT PENDING |

---

**Document owner:** Kruise Production Team  
**Implementation owner:** Kruise Master Data Team  
**Integration principle:** Master Data defines; Production executes.
