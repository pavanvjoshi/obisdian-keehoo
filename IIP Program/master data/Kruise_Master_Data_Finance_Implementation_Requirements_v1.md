# Kruise Master Data – Finance Integration Requirements
## Implementation Requirements for Kruise Finance

**Version:** 1.0
**Date:** 11-Sep-2026
**Audience:** Kruise Master Data Team (Prajwala / Suraj) and Kruise Finance Team
**Companion document:** `Kruise_Master_Data_Production_Implementation_Requirements_v2.md` (same template, Production scope)

---

## 1. Purpose

Master Data is moving to a Hub-level service, owned centrally and consumed by every module — CRM, Stock, Procurement, HCM, Finance, Production, etc.

Finance's starting position is **different from Production's**. Production is a new application built from day one against an external Master Data contract, so its boundary is clean. Finance grew up first, inside a single shared database, and — in the absence of a Master Data hub — ended up **owning several things that are not really financial concepts**: Company, Branch, Business Unit, Profit Centre, Vendor, and Customer all live in `finance.*` tables today purely because nowhere else existed to put them.

This document therefore does two things the Production document didn't need to:

1. Defines what Finance needs to **consume** from the Master Data hub going forward (same as Production's ask).
2. Flags which of Finance's *own* tables are really master data in disguise, and proposes an ownership transfer / sync path so Finance becomes a consumer of these entities instead of the source of truth.

Finance must not duplicate Master Data going forward. Master Data becomes the owner of organizational structure and reference data; Finance consumes those definitions through approved APIs/service contracts and stores only financial attributes, transactional data, and — where required for audit — historical snapshots.

---

## 2. Ownership Boundary

### Master Data should own (target state)

- Company
- Branch
- Business Unit
- Profit Centre
- Cost Centre
- Department
- Location
- Employee *(HCM remains system-of-record; Master Data/HCM exposes the read contract)*
- Item
- Item Category
- UOM
- Vendor / Supplier *(identity attributes only — see §11)*
- Customer *(identity attributes only — see §12)*
- HSN/SAC Code *(ownership currently unresolved — see §14)*

### Finance owns

- GL Account / Chart of Accounts
- Tax Template (rate, components, GL mapping)
- Bank Account
- FX Rate
- Payment Terms *(currently free text — see §13)*
- Project (financial/accounting attributes: revenue recognition method, budget, billing)
- All transactional documents: Journal Entry, Sales/Purchase Invoice, Quotation, Sales/Purchase Order, Receipt, Payment, Fixed Asset, Budget, Recurring Journal, etc.
- Vendor/Customer **financial** attributes even after identity ownership moves out (credit limit, payment terms, control-account mapping, TDS section) — see §11–§12

### Boundary

```text
Master Data
   │
   │ organizational structure / reference data
   ▼
Kruise Finance
   │
   │ financial transactions / postings / statutory reports
   ▼
Consolidated Financial Statements
```

Finance must not create duplicate master tables for Cost Centre, Location, Department, Employee, Item, UOM, or (once migrated) Company/Branch/Vendor/Customer identity.

### Current-state caveat

Unlike Production, this boundary is **aspirational for six entities** (Company, Branch, Business Unit, Profit Centre, Vendor, Customer) that are fully Finance-owned in the schema today. Section 15 (Migration Considerations) covers how Finance proposes to get from here to there without breaking postings or historical reports.

---

## 3. Finance Master Data Dependencies

| Entity | Priority | Required by Finance | Purpose | Current State |
|---|---|---|---|---|
| Company | P0 | Yes | Legal entity / books-of-account scope | Finance-owned (`finance.company_settings`) — migration candidate |
| Branch | P1 | Yes | Sub-entity dimension on journal lines | Finance-owned — migration candidate |
| Business Unit | P1 | Yes | Reporting dimension | Finance-owned — migration candidate |
| Profit Centre | P1 | Yes | Reporting dimension | Finance-owned — migration candidate |
| Cost Centre | P0 | Yes | Mandatory dimension on Budgets; used on Journal Lines, Fixed Assets, Projects, Approval Rules | Already shared (`public.cost_centers`), CRUD via HCM endpoints |
| Department | P0 | Yes | Dimension on nearly every document header | **Unowned/unenforced** — no FK anywhere in Finance |
| Location | P1 | Yes | Fixed Asset location, asset transfers | Already shared (`public.locations`) |
| Employee | P0 | Yes | Custodian, project manager, resource, timesheet, approver references | Owned by HCM; Finance reads via same-DB query, no service contract |
| Item | P0 (future) | Not yet — required once Stock/manufacturing lines land | Sales/Purchase line item, default GL/tax/UOM resolution | **Does not exist in the platform today** |
| Item Category | P1 (future) | Not yet | Account-mapping routing key | Does not exist |
| UOM | P0 (future) | Not yet — currently free text | Quantity measurement on invoice/quotation lines | Free-text `varchar`, no master |
| Vendor (identity) | P0 | Yes | AP subledger, control account | Finance-owned — migration candidate (Procurement likely target owner) |
| Customer (identity) | P0 | Yes | AR subledger, control account | Finance-owned — migration candidate (CRM likely target owner) |
| HSN/SAC Code | P1 | Yes | GST classification, filing | Free-text field, no master; ownership open (Finance vs. Item) |
| Currency | P2 | Yes | Multi-entity functional currency, FX revaluation | Free-text field, no master |

---

## 4. Identifier and Code Requirements

Finance must not assume UI values such as `CC-01`, `DEPT-HR`, or `VEND-0042` are database IDs — the same rule Production has already agreed to.

For every Finance dependency, Master Data should document:

1. Internal immutable identifier
2. Business code
3. Display name
4. Relationship identifiers
5. Tenant/organization scope
6. Status

The following are **CONTRACT_PENDING** and need confirmation (identical open questions to the Production document — this should be answered once, not once per module):

- Internal ID datatype
- Authoritative API identifier
- Business code format
- Whether code is immutable
- Whether IDs are tenant-scoped
- Tenant/organization model

Finance will use application-level references. Finance will not create PostgreSQL foreign keys into the Master Data database — this matches how Finance already treats `hcm.employees` and `hcm.departments` today (soft references, no FK), so no behavior change is required there.

---

## 5. Company

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| org_id | Tenant/organization scope |
| functional_currency | Required — drives multi-entity consolidation |
| gstin_or_trn | Required for statutory filing |
| country | Required |
| fiscal_year_start_month | Required — determines period close boundaries |
| status | Lifecycle status |

One organization may legitimately own more than one Company (e.g. an India entity and a UAE entity under one tenant). Finance's report layer (`ResolveCompanyID`) already refuses to silently pool more than one company's books together and requires the caller to disambiguate — Master Data's model must preserve this org → company (1\:N) relationship.

---

## 6. Branch / Business Unit / Profit Centre

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| company_id (Branch only) | Company relationship |
| status | Lifecycle status |

These three are pure reporting/posting dimensions for Finance — no special behavior beyond stable ID + code + name + status. They are grouped here because they are structurally identical and lower priority than Company/Cost Centre.

---

## 7. Cost Centre — already the working template

Cost Centre is the one dimension Finance already resolves against a shared table with real existence validation, not a soft string reference. Master Data should treat this as the reference implementation for every other dimension in this document.

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code (unique per org) |
| name | Display name |
| org_id | Tenant scope |
| status / is_active | Lifecycle status |

Cost Centre is the **only mandatory dimension on Budgets** and appears on Journal Lines, Fixed Assets, Projects, Approval Rules, and Bank Reconciliation Rules. Finance already calls a real `ValidateCostCenter(orgID, costCenterID)` existence check before posting — Master Data's API must support an equivalent lookup/validate call.

---

## 8. Department — P0, highest-priority gap

## This is the highest-priority Finance requirement, in the same sense Routing Step was for Production.

Department is threaded through nearly every Finance document header (Journal Lines, Approval Rules, and every Procure-to-Pay / Order-to-Cash header) as a bare `varchar(36)` with **no foreign key anywhere**. A typo or a deleted department silently orphans the reference with no error at posting time.

## Required Department fields

| Field | Required | Description |
|---|---|---|
| id | Yes | Internal identifier |
| code | Yes | Business code |
| name | Yes | Display name |
| parent_id | Yes | Hierarchy — self-referencing |
| status | Yes | Lifecycle status |
| org_id | Yes | Tenant scope |

## Why this is P0

Finance cannot add referential integrity to `department_id` today because there is no confirmed, reachable, versioned source to validate against. Master Data taking ownership (or formally re-exposing `hcm.departments` through the hub with a stable contract) is what unblocks Finance from closing this gap. Until then, every department-tagged posting in Finance is unvalidated.

---

## 9. Location

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| status | Lifecycle status |

Already a shared table (`public.locations`) used correctly by Finance (Fixed Assets, Asset Transfers) and by HCM. No change requested beyond formal hub ownership and a stable API contract — this entity should require the least migration work of anything in this document.

---

## 10. Employee (HCM)

## Required

| Field | Requirement |
|---|---|
| id | Internal identifier |
| code | Business code |
| name | Display name |
| status | Active / Terminated / Probation |
| department_id | Relationship (see §8) |

## Important architectural note

Finance currently reads `hcm.employees` via a **direct cross-schema SQL query in the same Postgres instance** — this only works because Finance and HCM share one database today. The Finance/HCM integration plan already confirms HCM is expected to become a separate application, at which point this in-process read breaks entirely.

Finance needs Master Data (or HCM, if Master Data proxies rather than owns Employee) to expose this as a **real API** before that split happens — not to add fields, but to replace how Finance reaches the data it already depends on.

## Where Employee is referenced

Custodian (Fixed Assets), Project Manager and Resource (Projects), Timesheets, and Approver — currently all soft references with no FK, matching Department's pattern. Once a stable Employee API exists, Finance intends to validate these the same way Cost Centre is validated today.

---

## 11. Vendor — identity vs. financial attributes

Vendor currently lives entirely in `finance.vendors`. Finance's own architecture docs already anticipate this moving to a Procurement-owned (or Master Data hub-owned) golden record, with Finance retaining only the attributes it actually needs for posting and compliance.

## Fields Finance needs from Master Data (identity)

| Field | Priority | Purpose |
|---|---|---|
| id | P0 | Internal identifier |
| code | P0 | Business code |
| name | P0 | Display name |
| gstin | P0 | Statutory identification |
| is_msme | P1 | MSME-classification-driven compliance rules |
| bank_verified | P1 | Payment control |
| address (line1/2, city, state, pincode) | P1 | Invoice printing, place-of-supply determination |
| status | P0 | Lifecycle status |

## Fields Finance keeps as its own (financial attributes — not requested from Master Data)

- `payment_terms` — Finance-negotiated commercial term
- `credit_limit` — Finance risk control
- `rating` — Finance-internal vendor scorecard
- `tds_section` — Finance tax-withholding configuration
- `category` — used today for reporting; may migrate to Master Data if a shared vendor-category taxonomy emerges

## Relationship Finance assumes

```text
Vendor (Master Data identity)
   │
   └── Vendor Financial Profile (Finance-owned)
          ├── payment_terms
          ├── credit_limit
          ├── tds_section
          └── control_account (gl_accounts.control_type = VENDOR)
```

---

## 12. Customer — identity vs. financial attributes

Same pattern as Vendor. Currently `finance.customers`; CRM is the likely eventual identity owner.

## Fields Finance needs from Master Data (identity)

| Field | Priority | Purpose |
|---|---|---|
| id | P0 | Internal identifier |
| code | P0 | Business code |
| name | P0 | Display name |
| gstin | P0 | Statutory identification |
| place_of_supply_state_code | P0 | GST CGST/SGST vs IGST determination at posting time |
| contact_person_name / email / mobile | P1 | Invoice contact |
| pan_number | P1 | Statutory / TDS/TCS compliance |
| status | P0 | Lifecycle status |

## Fields Finance keeps as its own (financial attributes)

- `payment_terms`, `credit_limit` — Finance risk/commercial control
- `tcs_exempt` — Finance tax configuration
- `category` — reporting; migration candidate if a shared customer-segment taxonomy emerges

## Relationship Finance assumes

```text
Customer (Master Data identity)
   │
   └── Customer Financial Profile (Finance-owned)
          ├── payment_terms
          ├── credit_limit
          └── control_account (gl_accounts.control_type = CUSTOMER)
```

`place_of_supply_state_code` is P0 specifically because Finance's GST engine computes CGST/SGST vs. IGST split at invoice-posting time by comparing Company state vs. Customer state — an incorrect or missing value produces a wrong tax posting, not just a cosmetic gap.

---

## 13. Payment Terms

No dedicated Payment Terms master exists anywhere in the platform today — it is a free-text-like field on both Vendor and Customer. Finance is **not asking Master Data to own this today** (P2 / informational only) but flags it as a natural future master-data entity if more than free text is ever needed (e.g. `NET_30`, `NET_45` as structured terms with due-date calculation rules).

---

## 14. Item, Item Category, UOM, HSN/SAC — future consumption contract

**None of these exist in the platform yet.** This section is not describing today's dependency — it is the contract Finance needs *before* Stock/Item work reaches Sales or Purchase lines, so Finance is not asked to bolt this on retroactively the way Production had to formalize Routing Step after the fact.

## Minimum Item fields Finance will need

| Field | Priority | Purpose |
|---|---|---|
| id | P0 | Internal identifier |
| code | P0 | Business code |
| name | P0 | Display name |
| item_type | P0 | STOCK / SERVICE / NON_STOCK — drives whether Finance expects a GRN/stock posting at all |
| default_gl_account_id | P0 | Revenue/COGS account resolution without manual entry |
| default_uom | P0 | Quantity posting |
| default_hsn_or_sac | P1 | Tax template pre-fill |
| status | P0 | Lifecycle status |

## UOM

| Field | Priority | Purpose |
|---|---|---|
| id | P0 | Internal identifier |
| code | P0 | e.g. PCS, KG, LTR |
| name | P0 | Display name |
| conversion factor | P1 | Only if Finance ever posts in a different UOM than the transaction line |

## HSN/SAC

Ownership is genuinely open — it could sit under Item (goods classification) or under Finance/Tax (compliance classification), or Master Data could own the code list with both Item and Tax Template referencing it. Finance's position: **wherever it lives, Finance needs a validated lookup**, because HSN-wise GST filing (GSTR-1) requires this to not be a free-text field indefinitely.

## Relationship Finance assumes (once built)

```text
Item
  ├── Item Category
  ├── default GL Account
  ├── default UOM
  └── default HSN/SAC → Tax Template
```

This mirrors the `ItemSnapshot` lookup contract (`LookupItem(orgID, itemID) → {ItemType, DefaultGLAccount, DefaultHSNCode, DefaultUOM}`) already sketched in Finance's own Phase-2 manufacturing-readiness design — Master Data implementing Item is the prerequisite for that design becoming real code.

---

## 15. Migration Considerations — unique to Finance

Production never owned Routing/BOM/Item, so it had nothing to migrate. Finance does. Six entities (Company, Branch, Business Unit, Profit Centre, Vendor identity, Customer identity) are fully Finance-owned today and need a path to Hub ownership without breaking:

- Existing FKs from `journal_lines`, `budgets`, `fixed_assets`, `projects`, invoices, etc.
- Historical postings that must keep referencing the entity **as it was at posting time** (see §16).
- The AR/AP control-account mechanism, which resolves by `control_type` and must keep working during and after migration.

Proposed approach (for Master Data team's input, not yet agreed):

1. Master Data hub becomes source of truth for **identity fields only** (id, code, name, GSTIN, status, address).
2. Finance's existing tables are narrowed to **financial-attribute-only** tables (`payment_terms`, `credit_limit`, `control_type` mapping, etc.), keyed by the Master Data id.
3. A sync mechanism (event-driven, matching the `VENDOR_CREATED/UPDATED` and `CUSTOMER_CREATED/UPDATED` events already sketched in Finance's event-driven integration design) keeps Finance's local copy of identity fields current for read performance, without Finance being the writer of record.
4. Company/Branch/BU/Profit Centre follow the same pattern but are lower priority — no subledger or control-account complexity, just dimension tags.

This section is a proposal for discussion, not a finished design — flagged explicitly as such in Confirmation Required (§20).

---

## 16. Historical Traceability

Finance must be able to reproduce which master definition was in effect when a transaction was posted — this is a statutory/audit requirement, not a preference.

- Vendor/Customer identity at the time of invoice must be retained (name, GSTIN, address as printed on the invoice) even if Master Data later updates the record.
- Cost Centre/Department/Employee references on posted journal lines must not be silently rewritten if the master record is renamed or deactivated later.
- Tax rate and GL account mapping in effect at posting time must be snapshotted — Finance already does this by freezing tax computation onto the line at posting time and must continue to.

```text
2026-09-11
Sales Invoice INV-00042 posted
        │
        ├── Customer-018 (GSTIN, address as of posting date)
        ├── Cost Centre CC-04
        └── Tax Template GST-18 (rate frozen on line)
```

Master Data updates must not rewrite the financial meaning of an already-posted transaction.

---

## 17. Status and Lifecycle

Master Data entities must expose clear lifecycle/status information for:

- Company, Branch, Business Unit, Profit Centre, Cost Centre, Department, Location
- Employee
- Vendor, Customer
- Item, UOM (once built)

Finance needs this to determine whether a dimension is postable/active — e.g. Finance should not allow a new journal line against a deactivated Cost Centre or a terminated Employee, but must still display historical postings against them correctly.

---

## 18. API Contract Required

Finance cannot safely integrate using UI data or display values — same principle as Production.

At minimum, Master Data needs logical lookup capabilities for:

```text
Company
Branch
Business Unit
Profit Centre
Cost Centre
Department
Location
Employee
Vendor
Customer
Item          (future)
UOM           (future)
HSN/SAC       (future, ownership pending)
```

Conceptually:

```text
GET /companies/{id}
GET /branches/{id}
GET /cost-centers/{id}
GET /departments/{id}
GET /locations/{id}
GET /employees/{id}
GET /vendors/{id}
GET /customers/{id}
GET /items/{id}          (future)
GET /uoms/{id}           (future)
```

These are **capability requirements**, not a demand to use these exact URL paths.

---

## 19. Complete Vendor / Customer Read API

Finance needs to retrieve a complete Vendor or Customer identity record in one call, including address and statutory identifiers, so invoice/PO printing does not require multiple round trips.

```text
Vendor / Customer
  ├── id
  ├── code
  ├── name
  ├── gstin
  ├── pan (Customer)
  ├── address
  ├── place_of_supply_state_code (Customer)
  ├── status
```

This is required for invoice generation and GST place-of-supply determination at posting time.

---

## 20. Relationship Validation

Master Data should validate relationships within its own domain, the same way Finance's `ValidateCostCenter` already does for Cost Centre today:

```text
Department:
  parent_id chain resolves without cycles

Employee:
  department_id exists
  location_id exists

Branch:
  company_id relationship is valid

Vendor / Customer:
  GSTIN format is valid for stated state code
```

Finance should not have to reproduce Master Data's own relationship rules internally, and should be able to call a validate/lookup endpoint at posting time the same way it already does for Cost Centre.

---

## 21. Cross-Database Rule

There must be **no PostgreSQL foreign key from Finance into Master Data**, once these entities move out of `finance.*`/`public.*` into a genuinely separate Master Data service.

Correct:

```text
Finance DB
journal_lines.department_id
        │
        └── application-level reference
                  │
                  ▼
             Master Data API
```

Incorrect:

```text
Finance DB
      │
      └── PostgreSQL FK ──► Master Data DB
```

Finance-owned tables (GL Account, Tax Template, Bank Account, journals, invoices) may keep real PostgreSQL FKs between themselves.

---

## 22. Required vs Recommended

## P0 — Required

1. Stable internal IDs for every entity in §3
2. Cost Centre (already shared — formalize as hub API + keep existence-validation contract)
3. Department (currently unowned/unvalidated — highest-priority gap)
4. Employee — real API before HCM becomes a separate application
5. Company — identity fields
6. Vendor — identity fields (id, code, name, gstin, status)
7. Customer — identity fields, including `place_of_supply_state_code`
8. Active/usable status on every entity
9. Tenant/scope information
10. Identifier/code contract (same open questions as Production, answered once)
11. Lookup APIs for all P0 entities

## P1 — Important

- Branch, Business Unit, Profit Centre
- Location (mostly done — formalize hub ownership)
- Vendor MSME/bank-verified/address fields
- Customer contact/PAN fields
- Item, Item Category, UOM (future — needed before Stock/manufacturing lines reach Sales/Purchase)
- HSN/SAC lookup (ownership pending)
- Relationship validation capabilities
- Vendor/Customer identity-sync event contract (`VENDOR_CREATED/UPDATED`, `CUSTOMER_CREATED/UPDATED`)

## P2 — Recommended

- Payment Terms as a structured master (currently free text)
- Currency master (currently free text)
- Vendor/Customer category as a shared taxonomy

---

## 23. What Finance Does NOT Require

To avoid unnecessary work:

### GL Account / Chart of Accounts

Not a Master Data candidate. This is accounting-sensitive and stays entirely Finance-owned, including its hierarchy and control-account mapping.

### Tax Template

Stays Finance-owned. Only the underlying HSN/SAC code list is an open ownership question (§14) — the rate/component/GL-mapping logic itself is not.

### Payment Terms as a hard requirement right now

Free text is acceptable for now; flagged as P2, not blocking.

### Duplicate Vendor/Customer financial attributes

Master Data should **not** take on `payment_terms`, `credit_limit`, `tds_section`, or `control_type` mapping — these are Finance's own risk/compliance configuration, not identity data.

---

## 24. Confirmation Required from Master Data Team

Please confirm the following before the Finance integration contract is frozen.

## Identifier

1. What is the internal ID field for each entity in §3?
2. What is its datatype?
3. Which field is authoritative for API references?
4. Is business `code` immutable?
5. Are IDs tenant-scoped?

## Tenant

6. How is tenant/organization scope represented?
7. What request header/context is required?

## Ownership transfer (Finance-specific — no Production equivalent)

8. Is Master Data (vs. Procurement) the intended long-term owner of Vendor identity?
9. Is Master Data (vs. CRM) the intended long-term owner of Customer identity?
10. Will Company/Branch/Business Unit/Profit Centre be centralized, or remain Finance-owned indefinitely?
11. What is the proposed sync mechanism (event-driven vs. on-demand pull) for identity fields Finance still needs cached locally for reporting performance?
12. Who owns HSN/SAC — Master Data/Item, or Finance/Tax?

## Department (highest priority)

13. Will Master Data take ownership of Department, or formally re-expose `hcm.departments` with a stable, versioned contract?
14. What is the hierarchy model (`parent_id` self-reference — confirm this is preserved)?

## Employee

15. Will Employee be exposed via Master Data hub, or does HCM expose it directly with Master Data only handling org-structure entities?
16. What happens to Finance's current same-database query once HCM becomes a separate application — what is the replacement contract and timeline?

## APIs

17. What is the Master Data base URL?
18. What authentication/service token is required?
19. What are the final endpoint paths?
20. What are the request/response schemas?
21. Is batch lookup supported (Finance resolves dimensions per posting line, potentially high volume)?

---

## 25. Acceptance Criteria

Master Data is ready for Finance integration when:

## Identity

- [ ] Stable internal ID exists for every P0 entity.
- [ ] ID datatype is documented.
- [ ] Business code is documented.
- [ ] Immutable/unique rules are documented.

## Organizational Structure

- [ ] Company exists with org_id scope.
- [ ] Cost Centre exists with lookup/validate capability (matching Finance's current `ValidateCostCenter` pattern).
- [ ] Department exists as a real, ownable, hierarchical entity — no longer an unvalidated string.
- [ ] Location exists (already largely satisfied).
- [ ] Employee exists with a real service-level API, not a same-database query.

## Vendor / Customer

- [ ] Vendor identity fields available via API (id, code, name, gstin, status, address).
- [ ] Customer identity fields available via API, including place_of_supply_state_code.
- [ ] Identity-sync event contract documented (or on-demand pull confirmed as the model instead).
- [ ] Field-ownership split (identity vs. financial attributes) confirmed in writing.

## Item / UOM (future — not blocking Finance today, but required before Stock/manufacturing lines reach Finance documents)

- [ ] Item lookup capability with item_type, default_gl_account, default_uom, default_hsn.
- [ ] UOM lookup capability.
- [ ] HSN/SAC ownership resolved.

## API

- [ ] Authentication documented.
- [ ] Tenant context documented.
- [ ] Request/response schemas documented.
- [ ] Batch lookup supported.

---

## 26. Target Integration Flow

## Invoice posting (Sales or Purchase)

```text
Finance FE
     ↓
Finance API
     ↓
Validate references
     ↓
Master Data APIs
     │
     ├── Customer / Vendor (identity)
     ├── Cost Centre
     ├── Department
     ├── Item (future)
     └── UOM (future)
     ↓
Invoice posted / GL entries created
```

## Statutory reporting

```text
Trial Balance / P&L / Balance Sheet
       ↓
Master Data
       │
       ├── Company (scope resolution)
       ├── Branch / BU / Profit Centre (dimension breakdown)
       └── Cost Centre (dimension breakdown)
       ↓
Report rendered with correct entity scope
```

---

## 27. Master Data → Finance Relationship

```text
                         MASTER DATA
                              │
     ┌───────────┬───────────┼───────────┬───────────┐
     │           │           │           │           │
     ▼           ▼           ▼           ▼           ▼
  Company   Cost Centre  Department  Employee   Vendor/Customer
     │           │           │           │           │
     │           │           │           │      (identity only)
     │           │           │           │           │
     └─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┘
           │           │           │           │
           ▼           ▼           ▼           ▼
                    Journal Lines / Invoices
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                GL Postings  AR/AP   Statutory Reports
                            Subledgers
```

---

## 28. Recommended Implementation Sequence for Master Data

### Phase 1 — Already-shared entities (lowest risk, formalize what exists)

1. Cost Centre — hub API + validate capability
2. Location — hub API

### Phase 2 — Highest-priority gap

3. Department as a real, hierarchical, ownable entity
4. Employee — real service API (ahead of HCM's split into a separate application)

### Phase 3 — Company / organizational dimensions

5. Company
6. Branch
7. Business Unit
8. Profit Centre

### Phase 4 — Vendor / Customer identity migration

9. Vendor identity fields + sync/event contract
10. Customer identity fields + sync/event contract
11. Field-ownership split agreed and documented (identity vs. financial attributes)

### Phase 5 — Future: Item / UOM / HSN (coordinate with Stock/Production timeline)

12. Item, Item Category
13. UOM
14. HSN/SAC ownership decision

### Phase 6 — API hardening

15. Authentication
16. Tenant context
17. Batch lookup
18. API documentation

---

## 29. Important Modelling Principles

The Master Data team should maintain a clean master-data model rather than adding fields only because Finance currently has a column with the same name — same principle as the Production document.

Master Data defines:

```text
ID
Code
Name
Status
Relationships
```

Finance owns transaction-specific and financial-configuration values:

```text
credit_limit
payment_terms
tds_section
control_type mapping
account balances
posted amounts
tax computed at posting time
```

Master Data must not own Finance transactions, postings, or financial-risk configuration (credit limits, payment terms, control-account mapping) — these stay with Finance even after identity ownership migrates.

---

## 30. Final Request to Master Data Team

Please use this document as the discussion baseline for the Kruise Finance integration, alongside the Production document already frozen.

### Highest-priority requirement

> **Take ownership of Department as a real, hierarchical, validated entity.** It is currently the least-protected reference in the entire Finance schema — an unconstrained string with zero FK integrity — and it appears on nearly every financial document header.

### Second major requirement

> **Provide a real service-level Employee API.** Finance currently reads `hcm.employees` via a same-database query that only works because Finance and HCM share one Postgres instance today; this breaks the moment HCM becomes a separate application, which is already planned.

### Third — a decision request, not a build request

> **Decide, with Procurement and CRM at the table, whether Vendor and Customer identity move to the Master Data hub**, and if so, agree the field-ownership split (identity vs. Finance's financial attributes) and the sync mechanism, before Finance commits to a migration plan.

After the P0 structures are addressed, please share:

1. Final entity fields
2. Final ID/code strategy
3. Final relationship model
4. API endpoints
5. Request/response examples
6. Authentication requirements
7. Tenant/organization handling
8. Sample complete Vendor/Customer response
9. Decision on Vendor/Customer/HSN ownership

The Kruise Finance team will align its integration clients and posting/validation logic against the confirmed Master Data contract.

---

## 31. Status Summary

| Area | Status |
|---|---|
| Master Data ownership boundary | PROPOSED — needs Master Data + Procurement + CRM sign-off |
| Finance must not duplicate Master Data going forward | AGREED (principle) |
| Cost Centre as shared reference | ALREADY WORKING — formalize under hub |
| Location as shared reference | ALREADY WORKING — formalize under hub |
| **Department** | **P0 REQUIRED / HIGH PRIORITY — currently unowned/unvalidated** |
| **Employee service API** | **P0 REQUIRED — current same-DB query breaks on HCM split** |
| Company/Branch/BU/Profit Centre centralization | PROPOSED — Finance-owned today |
| Vendor identity ownership | OPEN DECISION — Finance-owned today, Procurement likely future owner |
| Customer identity ownership | OPEN DECISION — Finance-owned today, CRM likely future owner |
| HSN/SAC ownership | OPEN DECISION |
| Item / UOM | FUTURE — does not exist in platform yet |
| Master Data ID strategy | CONTRACT PENDING (shared with Production doc) |
| Master Data tenant strategy | CONTRACT PENDING (shared with Production doc) |

---

**Document owner:** Kruise Finance Team
**Implementation owner:** Kruise Master Data Team
**Integration principle:** Master Data defines organizational structure and reference data; Finance defines and owns financial meaning.
