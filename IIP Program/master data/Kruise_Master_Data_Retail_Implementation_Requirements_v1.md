# Kruise Master Data – Retail Integration Requirements
## Implementation Requirements for Kruise Retail (Shop POS)

**Version:** 1.0  
**Date:** 22-Sep-2026  
**Audience:** Kruise Master Data Team and Kruise Retail Team  

---

## 1. Purpose

Kruise Retail is the **shop counter** application: till, sell, returns, POS customers, sales history, reports, and stock requests from the shop to the main warehouse.

Retail is hosted as a plugin module (`api/retail/`) inside the CRM backend. It is **not** the owner of product catalogue, organisation structure, or warehouse quantity. It orchestrates:

| Concern                                                                | Owner                                    |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| Till, sales bills, payments, returns, POS customers, shop POS settings | **Retail** (`retail_*` tables in CRM DB) |
| On-hand qty, stock requests, approve / dispatch / receive              | **Stock** service                        |
| Product catalogue / SKU / UOM / org & site definitions                 | **Master Data** service                  |

This document defines the minimum Master Data capabilities required for Retail, with special focus on Item/UOM lookups used on My Stock and Sell screens, organisation/shop scope, identifiers, APIs, and historical snapshots on sale lines.

Retail must **not duplicate Master Data**. Master Data remains the owner of catalogue and organisational definitions. Retail consumes those definitions through approved APIs/service contracts and stores only references and historical snapshots required for POS transactions.

Priority key:

| Priority | Meaning                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------- |
| **P0**   | Blocking. Sell, My Stock enrichment, org isolation, or stock-request item lines cannot work without this. |
| **P1**   | Important. Multi-shop display, GST pre-fill, richer picker UI, or employee/cashier resolution.            |
| **P2**   | Nice-to-have. Shared Customer identity with CRM/Finance, HSN/SAC, future B2B invoice alignment.           |


---

## 1.1 Application evidence (Kruise Retail codebase)

This requirements document is grounded in the current Retail workspace:

| Source | What it shows |
|---|---|
| `crm-backend/docs/retail-backend-handoff.md` | Ownership split: Retail = POS bills; Stock = qty/transfers; Master Data = catalogue |
| `frontend-retail/src/features/shop-app/posApi.ts` | Sale/Till/Customer/Return shapes; `itemId` + snapshot `itemName` / `unitText` on lines |
| `frontend-retail/src/features/shop-app/shopDemoData.ts` | Catalogue fields used in UI: `itemId`, `name`, `sku`, `category`, `unit`, `price`, qty |
| `frontend-retail/src/features/retailer/types.ts` | Shop = Stock warehouse place (`warehouseId`, `organizationId`, address, `gstin`) |
| `frontend-retail/src/features/retailer/transferTypes.ts` | Transfer lines carry `itemId` (+ name/unit snapshots); qty workflow is Stock-owned |
| `crm-backend/api/retail/` | Plugin module with `StockGateway` / planned `MasterDataGateway`; no duplicate Item tables |

### Entity classification from the app

| Concept | App fields / screens | Classification | Target owner |
|---|---|---|---|
| Organisation | `organizationId` on shops, customers, every retail row | Master / identity | **Master Data** |
| Item / SKU | `itemId`, `name`, `sku`, `category`, `unit`, `price` on stock/sell | Master / catalogue | **Master Data** |
| UOM / unit | `unit`, `unitText` on stock, sale lines, transfer lines | Master / reference | **Master Data** |
| Item Category | `category` on demo stock / sell picker | Master / reference | **Master Data** (P1) |
| Shop / warehouse | `warehouseId`, warehouse name/code/type, parent warehouse | Inventory place | **Stock** (not MD duplicate) |
| On-hand qty | `shopQty`, `warehouseQty`, `reorderLevel` | Inventory | **Stock** |
| Stock transfer / request | `ShopTransferRequest*` lifecycle | Inventory workflow | **Stock** |
| Till session | `PosTill` open/close cash | Transaction | **Retail** |
| Sale / line / payment | `PosSale`, `PosSaleLine`, `PosPayment` | Transaction | **Retail** |
| Return | `PosSaleReturn` + disposition | Transaction | **Retail** |
| POS Customer | `PosCustomer` by phone | Retail identity (V1) | **Retail** (shared Customer = P2) |
| Shop POS settings | GST default, receipt prefs (localStorage today) | Config | **Retail** |
| Cashier | `cashierName` / openedBy name (free text V1) | Actor | IAM User → **Employee** (P1) |
| IAM Tenant / User | Login / org isolation | Platform identity | **IAM** |


---

## 2. Ownership Boundary

### Master Data owns

- Organisation / Company
- Branch (if multi-site model is approved)
- Location / Plant-as-site context (where used for shops)
- Item
- Item Category
- UOM
- Department *(not required for Retail V1 POS — shared platform entity)*
- Employee *(cashier resolution later; HCM/Master Data exposes read contract)*
- Vendor / Customer **identity** *(future — only if Retail unifies with Finance/CRM party masters)*

### Retail owns

- Till Session
- Sale / Sale Line / Payment
- Sale Return / Return Line
- POS Customer (walk-in / phone-based shop customer — V1)
- Shop Settings (GST default, receipt prefs, till defaults)
- Retail-only shop metadata **if** Stock does not own those fields

### Stock owns (not Master Data, not Retail)

- Warehouse / stock place / shop warehouse registry
- On-hand quantity
- Stock transfer / shop request workflow
- Qty adjustment on sell / return

### IAM owns

- Tenant, User, authentication, platform login RBAC

### Boundary

```text
Master Data
   │
   │ catalogue / organisation definitions
   ▼
Kruise Retail (CRM api/retail)
   │
   ├── POS transactions (till / sale / return / POS customer)
   └── orchestration
          ├──▶ Stock  (qty / transfers)
          └──▶ Master Data (item names / UOM / org)
```

Retail must not create duplicate master tables for Item, UOM, Organisation/Company, Branch, Location, Employee, or (once platform-unified) shared Customer identity.

---

## 3. Retail Master Data Dependencies

| Entity | Priority | Required by Retail | Purpose |
|---|---|---|---|
| **Organisation / Company** | **P0** | Yes | Org scope for every retail row (`org_id` / `organizationId`) |
| **Item** | **P0** | Yes | Sell lines, My Stock enrichment, stock-request lines |
| **UOM** | **P0** | Yes | Unit display on stock/sell; quantity meaning |
| Item Category | P1 | Reference | Product grouping / filters on sell picker |
| Branch | P1 | If multi-site | Branch scope under Company |
| Location | P1 | If used for shops | Site / office context (not WMS bin hierarchy) |
| Plant | P2 | No | Manufacturing site — **not required** for shop POS |
| Employee | P1 | Later | Cashier / opener person behind IAM user |
| Department | P2 | No | Not used by POS engine in V1 |
| Customer (shared identity) | P2 | Future | Unify POS customer with CRM/Finance Customer |
| Vendor | P2 | No | Procurement/Finance concern |
| HSN/SAC | P1 (future) | When GST filing needs validated codes | Tax classification on sale lines |
| BOM / Routing / Operation / Work Center / Machine | — | **No** | Production-only |

IAM dependencies used with Master Data:

| Entity | Owner | Priority | Purpose |
|---|---|---|---|
| Tenant | IAM | P0 | `iam_tenant_id` → Organisation |
| User | IAM | P0 | Login actor (`iam_user_id`) for cashier |

---

## 4. Identifier and Code Requirements

Retail must not assume UI values such as `ITEM-001`, `ORG-CAE2B65C`, or `PCS` are database IDs.

For every Retail dependency, Master Data should document:

1. Internal immutable identifier
2. Business code
3. Display name
4. Relationship identifiers
5. Tenant / organisation scope
6. Status

The following are currently **CONTRACT_PENDING** (same open questions as Production / Finance / Helpdesk — answer once for the platform):

- Internal ID datatype
- Authoritative API identifier
- Business code format
- Whether code is immutable
- Whether IDs are tenant-scoped
- Tenant / organisation model

**Critical for Retail:** the same `item_id` must be canonical across Master Data, Stock, and POS sale lines. Stock returns quantity for an item id; Retail stores that id on the sale line; Master Data resolves name / SKU / UOM for display.

Retail will use application-level references. Retail will not create PostgreSQL foreign keys into the Master Data database.

---

## 5. Organisation / Company

Organisation is a **P0** Retail dependency. Every retail row is organisation-scoped.

## Required

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier (`organization_id`) |
| name | **P0** | Display name |
| status | **P0** | Lifecycle status. Only `ACTIVE` orgs may open till / sell |
| iam_tenant_id | **P0** | IAM tenant mapping |
| code | P1 | Business code. Must not be treated as the ID |
| country | P1 | Locale / tax context |
| timezone | P1 | Till session / report day boundaries |
| gstin_or_trn | P1 | Shop receipt / statutory header (may also live on shop/warehouse) |
| functional_currency | P2 | If multi-currency POS is ever needed |
| address / city / state / pincode | P2 | Org profile / receipt header |
| logo_url | P2 | Branding on receipt |

### Required relationship

```text
IAM Tenant
   ↓
Organisation
   ↓
Retail shops (warehouse places) + till / sales / POS customers
```

Retail must be able to resolve:

```text
iam_tenant_id  →  organization_id
organization_id → status
```

---

## 6. Branch / Location / Plant

### Branch — P1 if multi-site

A direct Branch column on every sale is **not required** for V1 if shop already sits under a Stock warehouse that implies site.

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| code | P1 | Business code |
| name | **P0** | Display name |
| company_id / org_id | **P0** | Company relationship |
| status | P1 | Lifecycle status |

### Location — P1 if used

Retail does **not** require a WMS hierarchy (Warehouse → Zone → Rack → Bin). That belongs to Stock / WMS.

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| org_id | **P0** | Organisation relationship |
| name | **P0** | Display name |
| status | P1 | Lifecycle status |
| code | P1 | Business code |
| city / state / country | P1 | Shop context |

### Plant — P2 / not required

Plant is a manufacturing site. Shop POS does not need `plant_id` on till or sales. Do not add Plant only to mirror Production.

---

## 7. Item — P0 REQUIRED

## This is the highest-priority Master Data requirement for Retail.

Item is the catalogue master for:

- Sell / POS cart lines (`itemId`)
- My Stock enrichment (name / SKU when Stock returns ids only)
- Stock-request lines from shop → warehouse

Retail must **not** create a duplicate Item master.

## Required Item fields

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier (`item_id`) — **canonical across MD / Stock / POS** |
| org_id | **P0** | Organisation relationship. Reject cross-org items |
| code | **P0** | Business / SKU code for display and search |
| name | **P0** | Display name. Snapshotted on sale lines |
| status | **P0** | Usable / active flag. Inactive items must not sell |
| base_uom_id | **P0** | Default unit of measure |
| item_type | P1 | STOCK / SERVICE / NON_STOCK — SERVICE may skip stock decrement |
| category_id | P1 | Item Category for filters |
| barcode / gtin | P1 | Scan-to-sell |
| default_sell_price | P1 | Optional list price; POS may override |
| default_tax_pct / tax_template hint | P1 | GST pre-fill on sell |
| default_hsn_or_sac | P1 (future) | GST classification |
| image_url | P2 | Sell picker UI |
| description | P2 | Help text |

## Do not permanently bind Item to Retail shop or till

The correct model is:

```text
Item                          ← Master Data
   │
   │ reusable catalogue definition
   ▼
Stock qty @ warehouse         ← Stock
   │
   ▼
Sale Line / Transfer Line     ← Retail / Stock transactions
   ├── item_id (reference)
   └── item_name / unit snapshot
```

## Required Item lookups

```text
GET item by id
GET items by ids (batch)          ← P0 for My Stock / cart enrichment
GET items?org_id=&q=              ← P1 search / picker
GET item by barcode               ← P1 scan-to-sell
```

Batch lookup by ids is **P0**. My Stock screens typically receive many item ids from Stock and must resolve names in one round trip.

---

## 8. UOM — P0 REQUIRED

UOM is a P0 dependency. Retail must not treat unit as free text indefinitely (Finance already flags free-text UOM as a gap).

| Field | Priority | Requirement |
|---|---|---|
| id | **P0** | Internal identifier |
| code | **P0** | e.g. PCS, KG, LTR |
| name | **P0** | Display name |
| status | **P0** | Lifecycle status |
| conversion factor | P2 | Only if POS ever sells in alternate UOM |

Retail sale lines should snapshot `unitText` / UOM code at sale time so later UOM renames do not rewrite receipts.

---

## 9. Item Category

| Field | Priority | Requirement |
|---|---|---|
| id | P1 | Internal identifier |
| org_id | P1 | Organisation relationship |
| code | P1 | Business code |
| name | P1 | Display name |
| status | P1 | Lifecycle status |
| parent_id | P2 | Hierarchy if needed |

Used for sell-picker filters and reports. Not required to open till or post a sale by id.

---

## 10. Employee — P1 (cashier resolution)

Retail V1 can store cashier as a free-text name on till open/close (current FE shape). Platform-aligned cashiers should resolve:

```text
IAM User → Employee → display name / code
```

| Field | Priority | Requirement |
|---|---|---|
| id | P1 | Internal identifier |
| org_id | P1 | Organisation relationship |
| name | P1 | Display name |
| status | P1 | Active / usable |
| iam_user_id | P1 | Login link |
| code | P2 | Employee code |
| email | P2 | Not needed for POS engine |

Retail must **not** create a duplicate Employee master. Same contract Helpdesk/Finance need for Employee lookup by `iam_user_id`.

---

## 11. Customer — Retail V1 vs shared identity

### V1 — Retail-owned POS Customer

Walk-in shop customers identified primarily by **phone** live in Retail (`PosCustomer` / `retail_*`). They are **not** CRM marketing leads/accounts in V1.

Retail-owned fields (not requested from Master Data today):

- phone, name, email, gstin, address, notes
- organisationId scope
- sales history linkage inside Retail

### P2 — Future shared Customer identity

If the platform unifies Customer identity (Finance §12 / CRM), Retail may later reference Master Data / CRM Customer id and keep only POS-specific prefs locally.

Until that decision is frozen (same open question as Finance), **do not block Retail V1** on a shared Customer master.

```text
V1:
  PosCustomer (Retail) ── phone ──▶ Sale

Future (optional):
  Customer identity (Master Data / CRM)
     │
     └── POS Customer profile (Retail)  optional link
```

---

## 12. HSN/SAC and tax hints

Ownership of HSN/SAC remains open (Finance §14). Retail position:

| Need | Priority | Notes |
|---|---|---|
| `default_tax_pct` or tax-template hint on Item | P1 | Pre-fill sell line GST |
| Validated HSN/SAC on Item | P1 (future) | Needed before statutory GST filing from POS |
| Tax Template rate engine | — | **Finance-owned** — Retail computes/stores line tax on the bill |

Retail already freezes tax on the sale line at sell time. Master Data updates must not rewrite historical bills.

---

## 13. Status and Lifecycle

Master Data entities must expose clear lifecycle / status for:

- Organisation
- Item
- UOM
- Item Category
- Branch / Location (if in model)
- Employee (when used)

Retail needs at least:

```text
Organisation usable for till open / sell
Item usable for sell and stock request
UOM usable on lines
```

Inactive items must still display correctly on **historical** sales (via snapshot), but must not be addable to a new cart.

---

## 14. API Contract Required

Retail cannot safely integrate using UI data or display values.

At minimum, Master Data needs logical lookup capabilities for:

```text
Organisation
Item
UOM
Item Category   (P1)
Branch          (if in org model)
Location        (if used)
Employee        (P1 — by iam_user_id)
```

Conceptually:

```text
GET /organizations/{id}
GET /items/{id}
GET /items?ids=...                 (batch)
GET /items?org_id=&q=
GET /items?barcode=
GET /uoms/{id}
GET /item-categories/{id}
GET /employees?iam_user_id=
```

These are **capability requirements**, not a demand to use these exact URL paths.

Exact base URL, auth, and tenant headers should match the single platform Master Data contract (shared with Production / Finance / Helpdesk).

---

## 15. Complete Item Read API

Retail needs to retrieve a complete Item definition for sell enrichment and receipt printing.

The response should provide:

```text
Item
  ├── id
  ├── code / sku
  ├── name
  ├── status
  ├── organisation
  ├── base UOM (id, code, name)
  ├── category (optional)
  ├── barcode (optional)
  ├── default sell price (optional)
  ├── default tax hint (optional)
  └── image_url (optional)
```

Required for: My Stock name enrichment, Sell picker, sale-line snapshot at checkout.

---

## 16. Relationship Validation

Master Data should validate relationships within its own domain.

Examples:

```text
Item:
  Organisation exists
  base_uom_id exists
  category_id exists where set
  Status is usable for sell when marked active

UOM:
  Organisation / global scope rules documented
```

Retail should not reproduce Master Data relationship rules internally.

Retail will validate Retail-owned relationships itself:

```text
Sale → TillSession is open / same shop
SaleLine → Sale same shop / org
Return → original Sale
POS Customer → same org
```

Stock validates qty / warehouse rules. Retail does not re-implement warehouse ledgers.

---

## 17. Cross-Database Rule

There must be **NO PostgreSQL foreign key from Retail (CRM DB) to Master Data**.

Correct:

```text
CRM DB (retail_*)
sale_lines.item_id
        │
        └── application-level reference
                  │
                  ▼
             Master Data API
```

Incorrect:

```text
CRM DB
      │
      └── PostgreSQL FK ──► Master Data DB
```

Retail-owned tables may have PostgreSQL FKs between themselves (`retail_sales` → `retail_sale_lines`, etc.).

The same rule applies to Stock: Retail ↔ Stock is HTTP / application-level, not cross-DB FK.

---

## 18. Historical Traceability

Retail must be able to reproduce which catalogue definition was used when a sale was completed.

Therefore:

- Organisation identity must be retained.
- Item identity must be retained on each sale line.
- Item name, unit text, unit price, and tax % may be **snapshotted** by Retail at sell time.
- Master Data updates (rename SKU, change default price) must not rewrite historical receipts.

Example:

```text
2026-09-21
Sale SALE-0042 completed
        │
        ├── Organisation ORG-CAE2B65C
        ├── Shop warehouse WH-SHOP-01
        ├── Item ITEM-8812  (snapshot name: "Widget Blue", unit: PCS)
        └── Tax 18% frozen on line
```

---

## 19. Relationships / Hierarchy Retail Assumes

## Shared Master Data hierarchy (Retail-relevant slice)

```text
Company / Organisation
   ├── iam_tenant_id → IAM Tenant
   │
   ├── Branch                         [P1 if multi-site]
   │
   ├── Location                       [P1 if used]
   │
   ├── Item Category                  [P1]
   │
   ├── UOM                            [P0]
   │
   ├── Item                           [P0]
   │      ├── category_id → Item Category
   │      ├── base_uom_id → UOM
   │      └── status
   │
   └── Employee                       [P1]
          └── iam_user_id → IAM User
```

Plant / Production Line / Routing / BOM are **out of Retail scope**.

## How Retail references that hierarchy

```text
Organisation
   │
   ├── Item
   │      ├── sale_lines.item_id
   │      ├── stock view enrichment
   │      └── transfer request lines
   │
   ├── UOM
   │      └── snapshotted unit on sale / stock display
   │
   ├── IAM User
   │      └── till openedBy / closedBy / cashier (via Employee when ready)
   │
   └── POS Customer                   ← Retail-owned V1
          └── sales.customer refs
```

## Shop / warehouse — Stock-owned place

```text
Organisation
   │
   └── Warehouse / Stock place        ← Stock
          ├── shop POS till / sales   ← Retail (warehouseId reference)
          └── qty / transfers         ← Stock
```

Master Data should not duplicate Stock warehouse registry. If Master Data exposes Location/Branch, Stock places may reference those ids — that contract is between Stock and Master Data, not owned by Retail.

## Sell — assumed resolution order

```text
1. Tenant / User              → Organisation
2. Shop warehouseId           → Stock place (Stock)
3. Cart item ids              → Item (+ UOM) from Master Data
4. Optional customer phone    → POS Customer (Retail)
5. Persist sale + snapshots
6. Stock qty decrement
```

If Master Data Item lookup fails for an id, sell must fail closed (do not post a sale against an unknown catalogue id).

---

## 20. Required vs Recommended

## P0 — Required

1. Stable internal IDs
2. Organisation with tenant mapping and status
3. Item (id, code, name, status, org, base UOM)
4. UOM (id, code, name, status)
5. Canonical `item_id` shared with Stock
6. Item lookup by id
7. Item **batch** lookup by ids
8. Active / usable status on Organisation, Item, UOM
9. Tenant / scope information
10. Identifier / code contract (same platform answers as other modules)
11. Complete Item read capability

## P1 — Important

- Item Category
- Item barcode lookup
- Item search (`q`)
- Item default sell price / tax hint
- Branch / Location if multi-site shops need them
- Employee by `iam_user_id` for cashier resolution
- Organisation GSTIN / timezone
- Relationship validation capabilities

## P2 — Recommended

- Item image / description
- Shared Customer identity link
- HSN/SAC validated codes
- UOM conversion
- Plant context (not needed for POS)

---

## 21. What Retail Does NOT Require

To avoid unnecessary work:

### BOM / Routing / Routing Step / Operation / Work Center / Machine / Production Line

Not required. Retail sells finished goods (or stocked SKUs); it does not explode manufacturing definitions.

### Direct Sale → Plant column

Not required.

### Duplicate Item / UOM tables inside Retail or CRM

Not required. Sale lines reference `item_id` and snapshot display fields.

### Duplicate Organisation table as competing source of truth

Not required. Local projections, if any, must follow Master Data — same rule as Helpdesk.

### Vendor master

Not required for shop POS V1.

### Shared Customer master as a V1 blocker

Not required. POS Customer stays Retail-owned until platform identity ownership is decided with CRM/Finance.

### WMS bin / rack hierarchy

Not required from Master Data for Retail. Stock/WMS owns storage structure.

### GL Account / Tax Template engine

Not Master Data for Retail. Tax Template stays Finance-owned; Retail stores computed line tax on the bill.

### Category → Employee permanent binding

Not applicable. Cashiers are till actors, not catalogue routing.

---

## 22. Confirmation Required from Master Data Team

Please confirm the following before the Retail integration contract is frozen.

## Identifier

1. What is the internal ID field for Organisation, Item, UOM, Item Category?
2. What is its datatype?
3. Which field is authoritative for API references?
4. Is business `code` / SKU immutable?
5. Are IDs tenant-scoped?
6. **Is the same `item_id` guaranteed identical in Master Data and Stock?**

## Tenant

7. How is tenant / organisation scope represented?
8. What request header / context is required?
9. How does Retail (inside CRM) forward org/user tokens to Master Data?

## Item

10. Can Retail batch-get Items by ids?
11. Can Retail search Items by `q` and barcode?
12. What statuses mean “sellable”?
13. Does Item expose `item_type` (STOCK vs SERVICE)?
14. Are default sell price and tax hint in scope for Master Data, or priced only in Retail/Stock?

## UOM

15. Is UOM org-scoped or global?
16. What is the field name for base UOM on Item?

## Customer

17. Confirm V1 POS Customer may remain Retail-owned.
18. If/when shared Customer identity exists, what is the link field Retail should store?

## APIs

19. What is the Master Data base URL?
20. What authentication / service token is required?
21. What are the final endpoint paths?
22. What are the request / response schemas?
23. Is batch lookup supported at My Stock volumes?

---

## 23. Acceptance Criteria

Master Data is ready for Retail integration when:

## Identity

- [ ] Stable internal ID exists for every P0 entity.
- [ ] ID datatype is documented.
- [ ] Business code / SKU rules are documented.
- [ ] Immutable / unique rules are documented.
- [ ] Canonical item id contract with Stock is documented.

## Catalogue and Organisation

- [ ] Organisation exists with tenant mapping and status.
- [ ] Item exists with code, name, status, org, base UOM.
- [ ] UOM exists with code, name, status.
- [ ] Item lookup by id.
- [ ] Item batch lookup by ids.
- [ ] Item Category / barcode / search documented if in P1 scope.

## API

- [ ] Organisation lookup capability
- [ ] Item lookup capability (single + batch)
- [ ] UOM lookup capability
- [ ] Complete Item read available
- [ ] Authentication documented
- [ ] Tenant context documented
- [ ] Request / response schemas documented

---

## 24. Target Integration Flow

## My Stock (enrichment)

```text
Retail FE
     ↓
Retail API (stock_view)
     ↓
Stock API  →  item ids + qty
     ↓
Master Data API  →  Item + UOM names
     ↓
Enriched stock rows to FE
```

## Sell / POS

```text
Retail FE (cart)
     ↓
Retail API (sales)
     ↓
Validate Item ids via Master Data
     ↓
Persist Sale + line snapshots (Retail DB)
     ↓
Stock qty decrement
     ↓
Receipt / sales history
```

## Stock request

```text
Retail FE
     ↓
Retail API (transfers)
     ↓
Master Data (optional name check)
     ↓
Stock transfer request { itemId, qty }
```

## Execution principle

```text
Master Data defines catalogue
Stock moves quantity
Retail records the bill
```

---

## 25. Master Data → Retail Relationship

```text
                         MASTER DATA
                              │
       ┌──────────────────────┼───────────────────────┐
       │                      │                       │
       ▼                      ▼                       ▼
 Organisation               Item                     UOM
       │                      │                       │
       │                      ├── code / name         │
       │                      ├── status              │
       │                      └── base_uom_id ────────┘
       │
       └──────────────┬────────────────┬──────────────┘
                      │                │
                      ▼                ▼
                 Retail Sale      Stock qty @ shop
                      │
                      ├── Sale Lines (item_id + snapshots)
                      ├── Payments
                      ├── Till Sessions
                      └── POS Customers (Retail-owned V1)
```

---

## 26. Recommended Implementation Sequence for Master Data

### Phase 1 — Core catalogue (unblocks Retail sell + stock enrichment)

1. Organisation + tenant mapping
2. UOM
3. Item (id, code, name, status, org, base UOM)
4. Canonical item id agreement with Stock
5. Item get-by-id + batch get-by-ids

### Phase 2 — Sell UX

6. Item Category
7. Barcode lookup
8. Item search
9. Default sell price / tax hint (if owned by Master Data)
10. Complete Item read response

### Phase 3 — Org / people polish

11. Branch / Location if multi-site shops need them
12. Employee by `iam_user_id` for cashier
13. Organisation GSTIN / timezone

### Phase 4 — API hardening

14. Authentication
15. Tenant context
16. Relationship validation
17. API documentation
18. Invalid / inactive item handling contract

### Phase 5 — Future platform alignment

19. Shared Customer identity decision with CRM / Finance
20. HSN/SAC ownership decision
21. SERVICE vs STOCK item_type behaviour with Stock

---

## 27. Important Modelling Principles

The Master Data team should maintain a clean master-data model rather than adding fields only because Retail currently has a column with the same name.

Master Data defines:

```text
ID
Code
Name
Status
Relationships
```

Retail owns transaction-specific values:

```text
sale_number / clientTxnId
unit_price (as sold)
discount
tax_pct / tax amount frozen on line
payment method / amounts
till opening / closing cash
return disposition (restock | scrap)
POS customer phone graph
```

Master Data must not own Retail sales, till sessions, or POS receipts.

Retail must not own Items, UOMs, or Organisation as a competing source of truth.

Stock must not own Item identity — only quantity and movement against Master Data item ids.

---

## 28. Segregation of Retail Submodules (for implementers)

Use this ownership split when scaffolding `api/retail/`:

| Retail submodule | Owns data? | Master Data? | Stock? |
|---|---|---|---|
| `shops` | Retail-only shop fields if any | Org/Branch if needed | Warehouse registry |
| `stock_view` | No (read facade) | Item/UOM enrich | Qty |
| `transfers` | No (orchestrates) | Item refs optional | Full workflow |
| `till` | Yes | Employee P1 later | No |
| `sales` | Yes | Item/UOM snapshot | Decrement qty |
| `returns` | Yes | — | Restock / scrap |
| `customers` | Yes (POS V1) | Shared Customer P2 | No |
| `reports` | Aggregates | Optional names | Optional low stock |
| `settings` | Yes | — | No |

External adapters only under:

```text
api/retail/infrastructure/adapters/driven/external/
  ├── stock_client.py
  └── master_data_client.py
```

---

## 29. Final Request to Master Data Team

Please use this document as the implementation baseline for the Kruise Retail integration, alongside the Production, Finance, and Helpdesk documents.

### Highest-priority requirement

> **Provide a stable Item master (with UOM) that Retail and Stock share by the same internal id, including batch lookup by ids, so My Stock and Sell can resolve catalogue fields without Retail duplicating products.**

### Second major requirement

> **Provide Organisation with tenant mapping and active status so every retail row is correctly org-scoped, consistent with Helpdesk and Finance.**

### Third — a decision request, not a V1 blocker

> **Confirm POS walk-in Customer stays Retail-owned for V1**, and schedule the shared Customer identity discussion with CRM/Finance separately so it does not delay till/sell.

After the P0 structures are implemented, please share:

1. Final entity fields
2. Final ID / code strategy
3. Final relationship model
4. API endpoints
5. Request / response examples
6. Authentication requirements
7. Tenant / organisation handling
8. Sample complete Item response (single + batch)
9. Written agreement that Stock uses the same `item_id`

The Kruise Retail team will align `MasterDataGateway` and sale-line snapshot logic against the confirmed Master Data contract.

---

## 30. Status Summary

| Area | Status |
|---|---|
| Master Data ownership boundary | PROPOSED — aligns with Production/Helpdesk/Finance principles |
| Retail must not duplicate Master Data | CONFIRMED (principle in retail handoff) |
| Item + UOM as Retail P0 | **P0 REQUIRED / HIGH PRIORITY** |
| Canonical item id with Stock | **P0 REQUIRED — CONTRACT PENDING** |
| Organisation / tenant mapping | **P0 REQUIRED** |
| Item batch lookup | **P0 REQUIRED** |
| Item Category / barcode / search | P1 |
| Employee cashier resolution | P1 |
| Shared Customer identity | P2 / OPEN with CRM/Finance |
| HSN/SAC | P1 future / ownership OPEN |
| BOM / Routing / Plant for Retail | NOT REQUIRED |
| Master Data API contract | REQUIRED |
| Master Data ID strategy | CONTRACT PENDING (shared platform) |
| Master Data tenant strategy | CONTRACT PENDING (shared platform) |

---

**Document owner:** Kruise Retail Team  
**Implementation owner:** Kruise Master Data Team  
**Integration principle:** Master Data defines catalogue and organisation; Stock moves quantity; Retail records the bill.
