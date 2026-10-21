
Master Data is a shared hub. Other apps (Helpdesk, Finance, Production, and your Retail) consume definitions and own only their transactions.

Master Data → defines (who / what / where)

Module apps → execute (tickets / invoices / production orders / sales)

Same rules everywhere:

| Rule                 | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| No duplicate masters | Don’t create your own Item / Employee / Company tables                          |
| Soft references      | Store `item_id`, call Master Data API — no cross-DB FK                          |
| Snapshot on write    | Keep name/code as of sale/posting time so history doesn’t rewrite               |
| Identity vs config   | Hub owns identity; module owns its own config (e.g. credit limit stays Finance) |

---

## What’s in each doc (consumer asks)

### 1. Helpdesk — people & org

Needs: Organisation, Employee, Department (P0).  
Does not need Item/BOM/Routing/Customer.  
Helpdesk owns tickets, SLA, groups, agents (seats linked to Employee).

### 2. Finance — org dimensions + party identity

Needs: Company, Cost Centre, Department, Employee, later Vendor/Customer identity, Item/UOM.  
Owns: GL, tax templates, journals, invoices, credit limits, payment terms.  
Special: Company/Vendor/Customer live in `finance.*` today → migrate identity to hub later.

### 3. Production — manufacturing catalogue

Needs: Item, UOM, Plant, Line, Work Center, Machine, Operation, Routing + Routing Step, BOM.  
Owns: Production Order, Work Order, consumption, output.  
Does not own Item/BOM/Routing copies.

---

## Shared Master Data map (what the hub should own)

ORG STRUCTURE PEOPLE COMMERCE MANUFACTURING

───────────────── ────── ──────── ──────────────

Organisation/Company Employee Item Plant

Branch Designation Item Category Production Line

Plant (site) Department UOM Work Center

Location Shift/Skill Vendor identity* Machine

Cost Centre / BU / PC Customer identity* Operation

HSN/SAC (open) Routing + Steps

BOM + BOM Items

* identity only — Finance keeps credit/payment/tax config

IAM still owns Tenant / User / login RBAC. Master Data links `iam_tenant_id` ↔ Organisation and `iam_user_id` ↔ Employee.

---

## How this applies to your Retail app

Your retail handoff already matches this pattern:

| Data                                         | Owner                      | Retail role                                    |
| -------------------------------------------- | -------------------------- | ---------------------------------------------- |
| Product / SKU / UOM / names                  | Master Data                | Lookup + enrich stock/sell screens             |
| On-hand qty, transfers, warehouse            | Stock                      | HTTP gateway only                              |
| Till, sales, payments, returns, POS settings | Retail (`retail_*`)        | Source of truth                                |
| POS walk-in customers (phone)                | Retail for v1              | Not CRM leads; not Finance Customer master yet |
| Org / shop / warehouse identity              | Master Data + Stock places | Reference by id                                |

So Retail is a consumer, not a Master Data owner — same as Production/Helpdesk.

---

## How to segregate submodules (practical split)

Think in three layers, not “one big retail DB”:

### Layer A — Master Data hub (build once, all apps use)

Start with what Retail + Helpdesk + Finance all need:

1. Organisation / Company (+ tenant mapping)
2. Branch / Location / Plant (as needed)
3. Department (Finance + Helpdesk P0)
4. Employee (API by id / email / iam_user_id)
5. Item + UOM (Retail + Production + future Finance)
6. Later: Vendor/Customer identity (with CRM/Procurement/Finance)

### Layer B — Sibling services (not Retail)

| Module            | Owns                       | Retail touch                           |
| ----------------- | -------------------------- | -------------------------------------- |
| Stock             | Qty, transfers, warehouses | Required for My Stock / sell / returns |
| Finance           | GL, invoices, tax engines  | Optional later (GST invoice posting)   |
| Helpdesk          | Tickets                    | None for POS                           |
| Production        | Manufacturing execution    | None for shop POS                      |
| CRM (leads/deals) | Marketing pipeline         | Keep separate from POS customers       |

### Layer C — Retail-only submodules (your `api/retail/`)

Segregate inside Retail by use-case, matching your FE:

|Retail submodule|Owns|Calls Master Data?|Calls Stock?|
|---|---|---|---|
|`shops`|Retail shop metadata (if any)|Org/branch if needed|Warehouse registry|
|`stock_view`|Nothing (read facade)|Item names/SKU|Qty|
|`transfers`|Nothing (orchestrates)|Item refs|Full workflow|
|`till`|Till sessions|—|—|
|`sales`|Bills, lines, payments|Snapshot item name/UOM|Decrement qty|
|`returns`|Returns|—|Restock/scrap|
|`customers`|POS customers|— (v1)|—|
|`reports`|Aggregates|Optional|Optional low-stock|
|`settings`|POS prefs|—|—|

Rule of thumb for each field:  
Definition? → Master Data. Quantity/movement? → Stock. Bill/till/return? → Retail.

---

## What Retail should / should not put in Master Data

Put in / consume from Master Data

- Item id, code, name, base UOM, status, category
- Organisation / company / shop site ids
- (Later) shared Customer if you unify with Finance/CRM identity

Keep in Retail

- Till open/close, cash variance
- Sale number, line prices, discounts, payments, GST computed on bill
- Return disposition (restock vs scrap)
- POS customer by phone for walk-ins

Do not build in Retail

- Duplicate Item/UOM tables
- Your own warehouse qty ledger
- Plant / Routing / BOM (Production-only)
- Department transfer / SLA (Helpdesk-only)
- GL / control accounts (Finance-only)

---

## Suggested build order for you (Retail-first)

1. Master Data P0 for Retail: Item + UOM + Organisation (+ stable IDs)
2. Retail: till → sales → customers (CRM `retail_*` only)
3. Stock gateway: stock view + transfers + qty on sell/return
4. Master Data enrichment: names/SKU on stock & sell screens
5. Align with platform later: Department/Employee APIs (Helpdesk/Finance), then Vendor/Customer identity if you need B2B invoices

---

## Bottom line

Those three docs are consumer contracts for the same hub. They don’t ask you to build three Master Data systems — they ask for one hub with different slices.

For Retail submodule segregation: Master Data = catalogue & org, Stock = inventory, Retail package = POS transactions, and keep Retail under `api/retail/` so it stays removable and doesn’t absorb Finance/Production/Helpdesk masters.