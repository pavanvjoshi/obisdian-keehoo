## 1. Problem Statement

### **Overview**

The CRM application, backed by **Neon PostgreSQL**, was experiencing consistently high latency during CRUD/list operations and page initialization.

The original suspicion was that **PostgreSQL/Neon query execution itself was slow**. Detailed instrumentation and `EXPLAIN (ANALYZE, BUFFERS)` testing showed that this was not the primary issue.

The actual problem was a combination of application-level behavior:

- Redundant frontend API calls.
    
- Fat backend response composition.
    
- Multiple unnecessary database queries for list pages.
    
- Excessive concurrent database operations relative to the connection pool.
    
- Expensive physical Neon connection creation when the pool overflowed.
    
- Large application-to-Neon round-trip latency being paid repeatedly.
    
- Sequential database calls multiplying network latency.
    
- Global application routing being blocked by a dataset that most pages did not require.
    
- Home/dashboard widgets creating a large concurrent request fan-out.
    
- Account Relationships making one API call per contact.
    
- Deals Pipeline and Summary independently scanning the same `deals` table.
    
- React **StrictMode** duplicating many development-time mount effects.
    
- The application architecture using one overly broad “fat” lead composer for consumers with very different data requirements.
    

The investigation ultimately changed the diagnosis from:

```text
"Neon/PostgreSQL is slow"
```

to:

```text
"The CRM is performing too much database/API work,
and Neon network/connection overhead amplifies that inefficient behavior."
```

### **Initial Symptoms**

Observed symptoms included:

- `GET /api/leads/` taking approximately **3–4 seconds**.
    
- Some individual related lead queries taking **1.8–2.2 seconds**.
    
- `/dashboard/summary` taking approximately **3–4 seconds**.
    
- Contacts page first usable UI taking approximately **3 seconds** before optimization.
    
- Home interactive time reaching approximately **4.4 seconds** in high-contention runs.
    
- Accounts Relationships taking approximately **4.2 seconds** to become usable in the tested account.
    
- Deals SPA interactive time reaching approximately **5.5 seconds** during the original implementation.
    
- `pool_checked_out` reaching **8–10** against a configured `pool_size=5`.
    
- Physical Neon connections being created when the pool overflowed.
    
- Overflow connections being closed after use instead of retained.
    
- React StrictMode duplicating many initial-load API calls.
    
- Automation losing AI artifact data after the lead list was made lightweight.
    
- A stale backend process returning **HTTP 405 Method Not Allowed** for the newly added artifact endpoint until the correct backend process was restarted.
    
- Home had duplicate `/api/dashboard/summary` requests.
    
- Deals had duplicate Pipeline and Summary scans.
    
- Accounts Relationships had one `/api/leads/?referredBy=...` request per contact.
    

### **Impact**

Before remediation:

- Users waited unnecessarily for data unrelated to the page they were opening.
    
- Contacts and Leads list views loaded a large amount of unused lead-related data.
    
- Home critical widgets competed with non-critical widgets for database connections.
    
- Deals performed overlapping reads of the same dataset.
    
- Accounts Relationships multiplied API and DB operations by the number of contacts.
    
- Neon connection overhead was repeatedly incurred because of pool overflow.
    
- Development StrictMode doubled many mount requests, making the contention worse.
    
- Some pages experienced 3–5+ second interactive delays even when the underlying PostgreSQL execution plan was extremely fast.
    

The problem was primarily a **performance and architecture issue**, rather than a database correctness outage.

---

## 2. Tools & Stack Utilized

|Tool / Library / Service|Version|Role in Problem / Solution|
|---|---|---|
|Neon PostgreSQL|N/A|Managed PostgreSQL database; actual PostgreSQL execution was found to be fast for the examined queries, while application-to-Neon latency was significant|
|PostgreSQL|N/A|Database engine executing CRM queries|
|`asyncpg`|**0.30.0**|PostgreSQL driver used through SQLAlchemy|
|SQLAlchemy|**2.0.36**|Async ORM/DB engine layer|
|SQLAlchemy `AsyncEngine`|N/A|Shared database engine|
|`AsyncAdaptedQueuePool`|N/A|SQLAlchemy connection pool|
|`pool_size`|**5**|Number of reusable pooled connections|
|`max_overflow`|**5**|Allowed up to 5 temporary overflow connections|
|`pool_timeout`|**30s**|Connection acquisition timeout|
|`pool_pre_ping`|**True** initially|Pooled-connection health check; proven to add substantial latency|
|`pool_recycle`|**280s**|Connection recycling configuration|
|FastAPI|N/A|Backend API framework observed from route/service architecture and Uvicorn application startup|
|Uvicorn|N/A|Backend application server|
|React|N/A|Frontend framework|
|React StrictMode|Enabled in `main.jsx`|Duplicated many development-time mount effects and API calls|
|Vite|N/A|Frontend dev server/proxy; frontend commonly served on `:5173`|
|`asyncio`|N/A|Used for concurrent DB/API operations, including `asyncio.gather` and semaphores|
|SQLAlchemy `engine.connect()`|N/A|Per-query connection checkout path in `PgStore._find`|
|`PgStore`|Project component|Shared database abstraction used by list/detail reads|
|`PgStore._find`|Project method|Main SQL execution path instrumented during diagnosis|
|`_Cursor.to_list`|Project method|Result retrieval path|
|`LeadComposerPort`|Project architecture|Lead composition abstraction later split into list/detail methods|
|`LegacyLeadComposerAdapter`|Project component|Original fat lead composition implementation|
|`useLeadsStore`|Frontend module|Shared lead state and list fetch source|
|`Promise.all`|JavaScript API|Used for concurrent frontend requests, including both problematic and successful bounded-concurrency scenarios|
|`EXPLAIN (ANALYZE, BUFFERS)`|PostgreSQL|Used to distinguish DB execution time from application/network latency|
|`pg_indexes` catalog|PostgreSQL|Used to inspect live indexes|
|`curl`|CLI|Used for controlled API performance requests|
|Cursor|Development tool|Used for code inspection, instrumentation, A/B experiments, tests, and implementation prompts|
|Bruno|Mentioned in broader CRM workflow|API testing tool used elsewhere in the CRM project; not the primary tool in this latency investigation|

---

## 3. Root Cause & Impact Analysis

### **Root Cause (Where & Why)**

The root cause was distributed across several architectural layers.

#### **A. Lead list endpoint over-composed data**

The original `/api/leads` path used:

```text
ListLeadsService
→ LegacyLeadComposerAdapter.compose
→ compose_leads
→ 8 related queries
```

The related queries were:

```text
lead_tags
lead_social_profiles
lead_notes
lead_activities
lead_emails
lead_icp_analysis
lead_deal_intelligence
lead_news_insights
```

For the Contacts list, only:

```text
core lead data
tags
score / ICP fallback
```

were required.

This was proven by tracing `ContactRow`, `ContactsPage`, `mapLead`, and the frontend data flow.

#### **B. Connection pool pressure magnified the lead problem**

Configured pool:

```text
pool_size=5
max_overflow=5
```

The original lead composer launched:

```text
8 concurrent related DB operations
```

using `asyncio.gather`.

That exceeded the reusable pool capacity:

```text
8 concurrent operations
↓
5 reusable connections
↓
additional overflow connections
↓
physical asyncpg connection creation
↓
~0.73–1.12s new connection creation
↓
overflow connections closed afterward
```

#### **C. `pool_pre_ping=True` added a large warm-checkout cost**

Measured:

```text
pool_pre_ping=True
warm checkout ≈ 350–500 ms
```

versus:

```text
pool_pre_ping=False
warm checkout ≈ 0.2 ms
```

The complete lead request improved by approximately **31.6%** in the matched experiment.

#### **D. PostgreSQL execution itself was not the bottleneck**

For `lead_notes`, the measured PostgreSQL execution plan was:

```text
Seq Scan on lead_notes
Rows Removed by Filter: 20

Planning Time: 0.079 ms
Execution Time: 0.045 ms
```

The database table contained only a small number of rows, so the lack of a `lead_id` index was not responsible for the observed multi-second application latency.

The application instrumentation showed:

```text
application DB operation ≈ 1.8–2.2 seconds
PostgreSQL execution ≈ 0.045 ms
```

The difference came from connection/driver/network overhead rather than SQL execution.

#### **E. Home had excessive fan-out**

Home initially created a large request burst:

```text
~36 HTTP requests
```

with many requests started at the same time.

Non-critical widgets such as:

- ClosingSoon
    
- TodaySchedule
    
- TeamPulse
    
- RecentActivity
    

were competing for the same DB pool while the critical Home widgets needed:

- DailySummary
    
- FocusQueue
    

#### **F. Dashboard Summary paid repeated Neon round trips sequentially**

`/dashboard/summary` executed approximately **7–8 SQL operations** sequentially.

The individual SQL statements were each relatively small, but every operation paid an application-to-Neon round-trip cost of several hundred milliseconds.

Therefore:

```text
multiple small DB operations
×
high network round-trip cost
=
large total API latency
```

#### **G. Accounts Relationships had an N× HTTP pattern**

The Relationships tab did:

```text
contacts.map(...)
→ GET /api/leads/?referredBy={contactId}
→ Promise.all(...)
```

For 4 contacts:

```text
4 API requests
```

and with StrictMode:

```text
8 API requests
```

The Relationships UI only needed a few fields such as:

```text
lead id
name
company
relationship type
via/contact names
```

It did not need the full lead document.

#### **H. Deals Pipeline and Summary redundantly scanned the same table**

Both:

```text
PipelineSummaryService.execute
DealSummaryService.execute
```

called:

```text
repo.find_many(limit=5000, org_id, workspace_id)
```

independently.

Deals list also read the same underlying data.

Thus the page created:

```text
list read
+
pipeline scan
+
summary scan
```

and StrictMode duplicated those requests in development.

---

### **Effect (System Impact)**

The architectural problems compounded each other.

The general latency amplification chain was:

```text
Redundant / oversized application work
        ↓
More HTTP requests
        ↓
More SQL operations
        ↓
More Neon network round-trips
        ↓
Higher concurrent DB demand
        ↓
Connection-pool pressure
        ↓
Physical Neon connection creation
        ↓
More latency
```

Home had an additional interaction:

```text
Non-critical widget fan-out
        +
Background GET /api/leads
        +
Critical summary/attention APIs
        ↓
Pool contention
        ↓
Critical APIs become slower
        ↓
Home interactive delayed
```

---

## 4. Troubleshooting & Solution Approach

### **Initial Hypotheses**

The investigation started with several possibilities:

- Missing PostgreSQL indexes.
    
- Slow Neon PostgreSQL execution plans.
    
- N+1 database queries.
    
- Connection pool exhaustion.
    
- Expensive connection creation.
    
- `pool_pre_ping` overhead.
    
- Excessive frontend API calls.
    
- Duplicate StrictMode requests.
    
- Global loading gates.
    
- Fat backend responses.
    
- Sequential versus concurrent DB work.
    

The investigation deliberately avoided making speculative changes until measurements proved the bottleneck.

### **Diagnostic Steps**

#### **Step 1 — Instrument `/api/leads`**

Temporary `[PERF]` instrumentation was added to measure:

- auth
    
- repository
    
- `PgStore._find`
    
- main query
    
- composer
    
- every related query
    
- total SQL count
    
- query overlap
    
- wall-clock versus summed query time
    

Representative output:

```text
[PERF] leads_request = 3685 ms
[PERF SUMMARY]
total_sql_queries=10
main_query_time_ms=774
related_query_time_ms=9963
composition_time_ms=2221
```

The instrumentation proved related queries were concurrent rather than per-lead.

#### **Step 2 — Investigate `lead_notes` SQL and indexes**

The live index query was:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'lead_notes';
```

Result:

```text
lead_notes_pkey
CREATE UNIQUE INDEX lead_notes_pkey
ON public.lead_notes USING btree (id)
```

No index existed on `lead_id`.

The exact query was reconstructed as:

```sql
SELECT id,
       lead_id,
       note,
       created_by,
       created_at,
       updated_at
FROM lead_notes
WHERE lead_id IN (
  '6a9f949eb53c5d2af4c5a239',
  '6a7bfc1b5585be26c4a0e415'
)
ORDER BY created_at DESC
LIMIT 1000;
```

The execution plan was:

```text
Limit
  -> Sort
       -> Seq Scan on lead_notes

Rows Removed by Filter: 20
Planning Time: 0.079 ms
Execution Time: 0.045 ms
```

This pivoted the investigation away from indexes.

#### **Step 3 — Separate connection acquisition, execution, fetch and release**

Instrumentation established:

```text
Driver: asyncpg 0.30.0
SQLAlchemy: 2.0.36
Pool: AsyncAdaptedQueuePool
pool_size: 5
max_overflow: 5
pool_timeout: 30
pool_pre_ping: True
pool_recycle: 280
```

Key measurement:

```text
Existing pooled checkout:
~350–500 ms with pre_ping=True

Physical asyncpg connection:
~0.73–1.12 seconds
average ~0.85 seconds
```

#### **Step 4 — Test `pool_pre_ping`**

Controlled A/B:

```text
pre_ping=True
→ warm checkout ≈ 386 ms

pre_ping=False
→ warm checkout ≈ 0.17 ms
```

Full request:

```text
4346 ms → 2972 ms
```

approximately:

```text
-31.6%
```

The setting was restored after the test because stale-connection reliability had not yet been fully validated.

#### **Step 5 — Test compose concurrency**

Controlled A/B:

```text
Concurrency 8
→ 3051 ms
→ 3 new physical connections
```

versus:

```text
Concurrency 5
→ 1522 ms
→ 0 new physical connections
```

This proved that exceeding the reusable pool capacity was harmful.

#### **Step 6 — Trace actual Contacts data requirements**

Frontend trace:

```text
ContactsPage
→ ContactList
→ ContactRow
→ mapContact / mapLead
→ useLeadsStore
```

Only `lead_tags` was clearly required from the 8 related datasets, with `lead_icp_analysis` only needed as an ICP-score fallback.

This became the basis for the lightweight lead list.

#### **Step 7 — Identify the frontend duplicate lead fetch**

Before remediation:

```text
App/useLeadsStore
→ GET /api/leads

ContactsPage
→ GET /api/leads
```

These ran in parallel, and StrictMode duplicated them.

The fix was to make `useLeadsStore` the shared source and deduplicate the in-flight request.

#### **Step 8 — Identify the global route gate**

The blocking App code was:

```jsx
{leadsLoading ? (
  <div ...>Loading…</div>
) : (
  <ModuleRouteGuard authUser={authUser}>
    <AppRoutes ctx={pageCtx} />
  </ModuleRouteGuard>
)}
```

This made unrelated pages wait for the lead dataset.

An A/B test proved that removing this gate let unrelated routes become usable in approximately:

```text
0.8–0.9 seconds
```

instead of waiting:

```text
~3–4 seconds
```

#### **Step 9 — Trace Stage and Automation regressions**

Making the list lightweight initially removed:

```text
icp_txt
news_txt
email_draft_txt
```

from shared lead list data.

Stage and Automation still depended on those values, producing a functional regression.

This was corrected by designing a targeted artifact hydration path rather than re-fatting the main lead list.

#### **Step 10 — Home summary investigation**

The Home path was measured at roughly:

```text
~3.38 seconds
```

for isolated `GET /api/dashboard/summary`.

The 7–8 SQL operations were primarily sequential Neon round-trips.

Combining task counts removed one SQL operation and approximately one round-trip.

An isolated concurrency test reduced:

```text
~3.5 sec → ~1.8 sec
```

but the same strategy failed under full Home load because Home itself already consumed the pool.

This became a major pivot point:

```text
More concurrency is not automatically better.
```

#### **Step 11 — Home critical path investigation**

`home_interactive` was found to depend on:

```text
DailySummary
+
FocusQueue
```

not on completion of every widget.

The critical Home path was therefore separated from:

```text
ClosingSoon
TodaySchedule
TeamPulse
RecentActivity
```

Deferring those non-critical requests was tested successfully.

#### **Step 12 — Accounts Relationships investigation**

Confirmed pattern:

```text
N concurrent GET /api/leads/?referredBy={contactId}
```

StrictMode doubled the wave.

A dedicated batched endpoint was then tested against a real account:

```text
GET /api/accounts/{account_id}/referral-relationships
```

#### **Step 13 — Deals dual-scan investigation**

Confirmed:

```text
GET /api/deals/pipeline
→ find_many(limit=5000)

GET /api/deals/summary
→ find_many(limit=5000)
```

plus the main Deals list read.

This was proven to create overlapping duplicate work.

### **Pivot Points**

The major directional pivots were:

1. **PostgreSQL EXPLAIN was extremely fast**, so indexes were not the first fix.
    
2. **Application DB lifecycle timing showed connection/round-trip overhead**, not PostgreSQL plan time.
    
3. **`pool_pre_ping` A/B proved warm checkout overhead.**
    
4. **Concurrency 8 vs 5 proved pool overflow was harmful.**
    
5. **Frontend tracing proved that list endpoints were over-fetching.**
    
6. **App routing analysis proved that `leadsLoading` was too broad a gate.**
    
7. **Home full-load testing proved isolated concurrency results could be misleading under real pool contention.**
    
8. **Accounts and Deals showed the same general anti-pattern in other modules: duplicated or multiplied reads of data already available elsewhere.**
    

---

## 5. How It Was Operating (Before vs. After)

### **Legacy / Broken State (Before)**

#### **Contacts / Leads**

```text
ContactsPage
 └── GET /api/leads
          +
App/useLeadsStore
 └── GET /api/leads
          +
StrictMode duplicates mount requests
          ↓
multiple fat lead requests
          ↓
each request executes 8 related queries
          ↓
8-way DB concurrency
          ↓
pool overflow
          ↓
new Neon physical connections
```

The list composer loaded:

```text
lead_tags
lead_social_profiles
lead_notes
lead_activities
lead_emails
lead_icp_analysis
lead_deal_intelligence
lead_news_insights
```

even when Contacts only needed a subset.

#### **Application Startup**

```text
App
 ↓
fetch full /api/leads
 ↓
wait for leadsLoading
 ↓
mount AppRoutes
```

A page such as `/tasks` could therefore wait several seconds for lead data it did not require.

#### **Home**

```text
Home mount
 ↓
DailySummary
FocusQueue
ClosingSoon
TodaySchedule
TeamPulse
other widgets
 ↓
large concurrent API fan-out
 ↓
shared DB pool contention
```

#### **Accounts Relationships**

```text
4 contacts
 ↓
4 referredBy API calls
 ↓
StrictMode
 ↓
8 referredBy requests
```

#### **Deals**

```text
Deals list
+
Pipeline scan
+
Summary scan
+
Accounts
```

with StrictMode doubling the request wave.

---

### **Optimized State (After)**

#### **Contacts / Leads**

```text
useLeadsStore
 ↓
one shared GET /api/leads
 ↓
lightweight list composition
 ↓
core + tags + score / ICP fallback
```

The list composer no longer loads:

```text
social profiles
notes
activities
emails
deal intelligence
news
```

for the list path.

Lead detail retains the full composition.

#### **Stage / Automation**

```text
lightweight GET /api/leads
       ↓
render list/screen
       ↓
one POST /api/leads/artifacts
       ↓
3 batched artifact queries
       ↓
page-local AI text hydration
```

Required fields:

```text
icpText
newsText
emailDraftText
```

The endpoint is org/workspace scoped and avoids N+1 behavior.

#### **Lead Compose Concurrency**

Related fat-compose operations are bounded using:

```python
_related_concurrency_limit()
```

derived from:

```text
engine.pool.size()
```

which is currently:

```text
5
```

#### **Application Routing**

```text
Auth
 ↓
Workspace readiness
 ↓
AppRoutes immediately
```

Lead-dependent pages use local loading/error states.

Unrelated pages no longer wait for the shared lead dataset.

#### **Home**

Critical widgets:

```text
HomeGreeting
DailySummary
FocusQueue
```

start immediately.

Non-critical widgets:

```text
ClosingSoon
TodaySchedule
TeamPulse
RecentActivity
```

begin only after the critical Home condition has settled.

#### **Home Summary**

HomeGreeting and DailySummary share one:

```text
GET /api/dashboard/summary
```

through a module-level in-flight/short-lived shared loader.

#### **Dashboard Task Counts**

The two COUNT queries were combined into one conditional aggregation:

```sql
SELECT
  count(*) FILTER (WHERE due_date <= '<today>') AS due_count,
  count(*) FILTER (WHERE due_date < '<today>') AS overdue_count
FROM public.tasks
WHERE ...
```

The response remains:

```text
tasksDue: {
  count,
  overdueCount
}
```

#### **Accounts Relationships**

The N× request model was replaced by:

```text
GET /api/accounts/{account_id}/referral-relationships
```

with:

```text
1 HTTP request
3 bounded batched DB operations
```

and frontend inflight deduplication.

#### **Deals**

The initial Deals load now uses:

```text
GET /api/deals/
GET /api/deals/pipeline-summary
GET /api/accounts/
```

instead of separate:

```text
GET /api/deals/pipeline
GET /api/deals/summary
```

The combined endpoint performs one deals-table read and derives both pipeline and KPI results.

---

## 6. Resolution & Improvements Made

### **Code / Config Changes**

#### **A1 — Shared Leads Fetch**

Permanent behavior:

- `useLeadsStore` is the shared list source.
    
- `_leadsListInflight` deduplicates concurrent requests.
    
- Contacts no longer performs its own list fetch.
    
- Deep-link lead detail continues to use `LeadsApi.get(id)` when needed.
    

Observed improvement:

```text
Contacts list GET /api/leads:
duplicate requests → 1 shared request
```

#### **B1 — Lightweight List / Detail Composition**

Changed:

```text
LeadComposerPort
```

to expose:

```text
compose_list
compose_detail
compose
```

`compose` maps to detail behavior.

List path:

```text
ListLeadsService
→ compose_list
```

Detail/overview/mutations:

```text
→ compose_detail
```

Changed files included:

```text
crm-backend/api/leads/application/ports/outgoing.py
crm-backend/api/leads/infrastructure/adapters/driven/external/services.py
crm-backend/api/leads/infrastructure/adapters/driven/external/lead_composer.py
crm-backend/api/leads/application/use_cases/manage_leads.py
crm-backend/api/leads/application/use_cases/get_lead_overview.py
crm-backend/tests/test_leads_hexagonal.py
```

Measured result:

```text
Fat list:
~3346 ms
10 SQL queries
8 related queries
~3 new physical connections

Lightweight list:
~1059 ms
4 SQL queries
2 related queries
0 new physical connections
```

Typical validated implementation state:

```text
max pool_checked_out = 2
new physical connections = 0
```

#### **B2 — Bounded Fat Compose Concurrency**

The related compose concurrency limit became pool-derived:

```python
_related_concurrency_limit()
```

returning:

```text
engine.pool.size()
```

currently:

```text
5
```

and a semaphore is applied around related `gather`.

This preserves parallelism without allowing the compose path to exceed the reusable pool capacity.

#### **Stage / Automation Artifact Endpoint**

Implemented:

```http
POST /api/leads/artifacts
```

Request:

```json
{
  "leadIds": ["id1", "id2", "..."]
}
```

Response:

```json
[
  {
    "leadId": "id1",
    "icpText": "...",
    "newsText": "...",
    "emailDraftText": "..."
  }
]
```

Architecture:

```text
ports
→ GetLeadArtifactsService
→ PgStoreLeadArtifactsAdapter
```

The endpoint:

- validates org/workspace scope.
    
- omits foreign/unknown IDs.
    
- performs 3 batched queries.
    
- uses latest `generatedAt` for ICP.
    
- uses latest `generatedAt` for news.
    
- uses latest `updatedAt` draft email for email draft text.
    
- uses page-local frontend state.
    
- deduplicates StrictMode requests using workspace + sorted IDs.
    

Validation:

```text
Backend tests: 5 passed
Frontend tests: 9 passed
Live smoke: 200
```

The stale-process error was:

```text
405 Method Not Allowed
```

and was resolved by restarting the backend process used by the Vite proxy.

#### **A3 — Remove Global `leadsLoading` Route Gate**

Removed the global gate around `AppRoutes`.

Auth and workspace gates remain.

Lead-dependent routes retain local loading/error states:

```text
Contacts
Leads
Stage
Automation
```

Measured impact on unrelated routes:

```text
Before:
~3–4s waiting for leads

After:
~0.8–0.9s route usability
```

The following pages were verified as independent:

```text
Tasks
Deals
Analytics
Settings
```

as well as additional modules such as:

```text
Accounts
Calendar
Marketing
Admin
Profile
Playbooks
Approvals
Content
DigiDevalaya history
```

#### **A2 — Home Dashboard Summary Deduplication**

Created:

```text
crm-frontend/src/modules/Home/sharedDashboardSummary.js
```

with:

```text
loadSharedDashboardSummary
resetSharedDashboardSummary
```

HomeGreeting and DailySummary share one request.

A short-lived resolve is used so a fresh Home mount can obtain fresh data without permanent stale caching.

Measured:

```text
summary HTTP:
~4 → 1

total Home HTTP:
~39 → 36
```

Unit tests:

```text
4/4 passed
```

#### **B4 — Combine Dashboard Task Counts**

Implemented:

```text
summary.tasks_due_overdue_combined
```

using PostgreSQL conditional aggregation.

Measured:

```text
task-count SQL:
2 → 1

task_counts:
~820 ms → ~511 ms
```

Final isolated runs after permanentization:

```text
GET /api/dashboard/summary
2515 ms average

SQL count:
7
```

Tests:

```text
10 passed
```

#### **Home Non-Critical Widget Deferral**

Permanent Home behavior:

Critical:

```text
HomeGreeting
DailySummary
FocusQueue
```

Deferred:

```text
ClosingSoon
TodaySchedule
TeamPulse
RecentActivity
```

Measured:

```text
Home interactive:
4412 ms → 3059 ms
```

approximately:

```text
-31%
```

Pool impact:

```text
peak checked_out:
10 → 7
```

HTTP:

```text
36 → 27
```

No 5xx errors occurred.

#### **B3 — Dashboard Summary Parallelization**

Tested but explicitly **rejected** under full Home load.

Isolated test had suggested:

```text
~3507 ms → ~1804 ms
```

but under full Home load:

```text
Home interactive:
3041 ms → 3089 ms
```

while:

```text
pool_checked_out:
6 → 8

new physical connections:
0 → 3

connection acquire:
~0.2 ms → ~555 ms
```

B3 was therefore restored to the sequential implementation.

This is an important permanent decision:

> Do not optimize concurrency in isolation when the endpoint operates inside a larger application-wide connection burst.

#### **Accounts Relationships — Batched Endpoint**

Implemented:

```http
GET /api/accounts/{account_id}/referral-relationships
```

The old N× path:

```text
GET /api/leads/?referredBy={contactId}
```

was removed.

New frontend shared loader:

```text
crm-frontend/src/modules/Accounts/sharedReferralRelationships.js
```

with inflight deduplication.

Measured:

```text
HTTP:
8 → 1 under StrictMode

Referral DB operations:
8 list-lead operations → 3 bounded batched operations
```

Functional output remained identical.

Tests:

```text
FE 4/4
BE 9/9
```

Browser smoke:

```text
1 referral-relationships request
0 referredBy requests
```

#### **Deals — Combined Pipeline + Summary**

Implemented:

```http
GET /api/deals/pipeline-summary
```

The endpoint reads the deals table once and returns both:

```text
pipeline stage totals
+
summary KPI data
```

The Deals initial load now uses:

```text
list
+
pipelineSummary
+
accounts
```

Measured:

```text
Deals interactive:
3715 ms → 2668 ms
```

approximately:

```text
-28%
```

Deals SQL operations:

```text
6 → 4
```

Physical connection creation:

```text
0 → 0
```

Tests:

```text
6 passed
```

Browser smoke confirmed:

```text
0 × /api/deals/pipeline
0 × /api/deals/summary
2 × pipeline-summary under StrictMode
```

---

### **Code Snippets / Commands**

#### **Lead API performance request**

Controlled API request:

```bash
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Workspace-Id: YOUR_WORKSPACE_ID" \
  -H "Application-Name: revyn" \
  "http://localhost:8000/api/leads/?limit=100"
```

The actual token and workspace ID were intentionally not printed in the troubleshooting logs.

#### **Live index inspection**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'lead_notes';
```

Observed result:

```text
lead_notes_pkey
CREATE UNIQUE INDEX lead_notes_pkey
ON public.lead_notes USING btree (id)
```

#### **`lead_notes` execution plan**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, lead_id, note, created_by, created_at, updated_at
FROM lead_notes
WHERE lead_id IN (
  '6a9f949eb53c5d2af4c5a239',
  '6a7bfc1b5585be26c4a0e415'
)
ORDER BY created_at DESC
LIMIT 1000;
```

Measured:

```text
Planning Time: 0.079 ms
Execution Time: 0.045 ms
```

#### **Dashboard task-count aggregation**

Final combined form:

```sql
SELECT
  count(*) FILTER (WHERE due_date <= '<today>') AS due_count,
  count(*) FILTER (WHERE due_date <  '<today>') AS overdue_count
FROM public.tasks
WHERE (assigned_to ~* ...)
  AND is_deleted IS DISTINCT FROM true
  AND status NOT IN ('done','cancelled')
  AND due_date IS NOT NULL
  AND due_date IS DISTINCT FROM NULL
  AND org_id = '...'
  AND workspace_id = '...';
```

Semantics preserved:

```text
Due      = due_date <= today
Overdue  = due_date < today
```

#### **Dashboard artifact endpoint**

```http
POST /api/leads/artifacts
```

Example shape:

```json
{
  "leadIds": [
    "id1",
    "id2"
  ]
}
```

#### **Deals combined endpoint**

```http
GET /api/deals/pipeline-summary
```

#### **Accounts batched relationship endpoint**

```http
GET /api/accounts/{account_id}/referral-relationships
```

#### **Observed server/application startup**

Representative Uvicorn output:

```text
Uvicorn running on http://0.0.0.0:8000
Neon Postgres connected
[db] indexes ensured on leads, lead_activities, lead_emails, lead_journey_runs
[db] indexes ensured on digidevalaya_contacts, digidevalaya_field_options, digidevalaya_contact_history
[db] indexes ensured on website_form_submissions, leads(workspaceId,email)
Leadflow Python API running on :8000
Application startup complete.
```

A frontend/background request also produced:

```text
GET /api/aikruise/salesflow/nodes → 404 Not Found
```

This was observed during the performance investigation and was **not identified as the root cause of the latency problem**.

---

### **Performance / System Enhancements**

The major performance improvements were:

|Area|Before|After|
|---|--:|--:|
|Contacts/Leads list API|~3346 ms|~1105–1460 ms|
|Lead list SQL queries|~10|4|
|Lead related queries|8|2|
|Lead list new physical connections|~3|0|
|Lead compose concurrency|8|5|
|Contacts duplicate list fetch|Multiple|Shared single fetch|
|Global leads route gate|Yes|Removed|
|Home summary HTTP requests|~4|1|
|Home HTTP requests|~39|27|
|Home interactive|~4412 ms|~3059 ms|
|Accounts Relationships requests|8 in StrictMode|1|
|Deals interactive|~3715 ms|~2668 ms|
|Deals SQL operations|6|4|

The architecture now favors:

```text
Shared data where appropriate
+
Page-specific data where appropriate
+
Batching instead of N× requests
+
Bounded concurrency
+
Non-critical work deferred
+
Minimal list payloads
+
Detailed data only when required
```

---

## 7. Key Learnings & Takeaways

### **Technical Insights**

#### **1. A fast PostgreSQL query can still produce a slow API**

The most important lesson was:

```text
PostgreSQL execution time
≠
application database-operation time
```

The `lead_notes` example was decisive:

```text
PostgreSQL:
0.045 ms

Application:
~2 seconds
```

Therefore, database troubleshooting must separate:

```text
connection acquisition
SQL execution/driver RTT
fetching
Python processing
connection release
```

#### **2. Neon network latency becomes expensive when multiplied**

One ~300–500 ms application-to-Neon round-trip may look acceptable.

Seven or eight sequential operations become:

```text
~400 ms
×
multiple database trips
=
multiple seconds
```

This is why reducing database operation count can outperform SQL micro-optimization.

#### **3. Connection pooling is a capacity constraint, not a reason to maximize concurrency**

The experiments established two opposite failure modes:

```text
Too much concurrency:
8 lead queries
→ pool overflow
→ physical Neon connections
→ slower
```

and:

```text
Too little concurrency:
dashboard operations serially
→ repeated RTT cost
→ slower
```

The correct design is:

```text
bounded concurrency
within realistic connection capacity
```

#### **4. `pool_pre_ping` has measurable cost**

`pool_pre_ping=True` added roughly:

```text
350–400 ms
```

to warm pooled checkouts in the tested environment.

However, removing it permanently requires a deliberate stale-connection strategy.

#### **5. A “universal” response shape is often too expensive**

The original lead composer attempted to support:

```text
Contacts
Leads
Stage
Automation
Detail
```

with one large response.

That caused every consumer to pay for data it did not necessarily use.

The better model is:

```text
List DTO
Detail DTO
Page-specific artifact data
```

#### **6. Frontend architecture can create backend/database problems**

Frontend decisions such as:

```text
Promise.all
useEffect on mount
StrictMode remount
global loading gates
duplicate hooks
```

can directly create:

```text
extra HTTP traffic
extra DB work
connection pressure
Neon latency
```

Performance therefore cannot be investigated only from the database side.

#### **7. StrictMode is a diagnostic signal, not something to disable**

StrictMode exposed unsafe or duplicated mount behavior.

The correct approach was:

```text
in-flight request deduplication
```

rather than:

```text
disable StrictMode
```

#### **8. Isolated performance tests can be misleading**

B3 is the strongest example.

In isolation:

```text
sequential summary:
~3.5 sec

concurrent summary:
~1.8 sec
```

Under actual Home load:

```text
no meaningful interactive improvement
+
more pool pressure
+
new physical connections
```

Therefore performance tests must reflect the real workload context.

#### **9. “First usable UI” is more important than “all widgets complete”**

Home did not need every widget before it became useful.

The critical path was:

```text
DailySummary
+
FocusQueue
```

Deferring non-critical work produced a large improvement without removing functionality.

#### **10. Data dependency analysis should precede optimization**

Before changing an API, trace:

```text
Which fields does the frontend actually consume?
```

This prevented us from accidentally removing required AI artifacts from Stage and Automation.

---

### **Preventative Measures**

#### **1. Instrument before optimizing**

For every slow endpoint, measure:

```text
HTTP total
↓
route/service
↓
DB acquire
↓
SQL/driver execution
↓
fetch
↓
mapping
↓
release
```

Do not assume the slow layer.

#### **2. Audit every page for request multiplication**

Use this standard checklist:

```text
Page
→ number of HTTP requests
→ duplicates
→ overlapping requests
→ DB queries per request
→ sequential/concurrent DB work
→ pool usage
→ physical connections
→ user-visible critical path
```

#### **3. Do not use fat list responses by default**

A list API should return list data.

Detail-only information should be loaded:

```text
on detail
or
through a targeted page-specific endpoint
```

#### **4. Avoid N× API patterns**

Never use:

```text
contacts.map(...)
→ API call per contact
```

when the backend can provide:

```text
one batched request
```

The Accounts Relationships fix is the reference implementation.

#### **5. Keep concurrency bounded**

Use a semaphore or equivalent mechanism so concurrent DB work stays within realistic pool capacity.

Current tested pool:

```text
pool_size = 5
```

Avoid assuming that `max_overflow=5` means 10 connections are a performance target.

#### **6. Do not increase pool size as the first response to latency**

The investigation showed that more connections can simply produce:

```text
more physical Neon connections
more startup overhead
more contention
```

Pool tuning should follow evidence, not replace architectural fixes.

#### **7. Treat global loading gates carefully**

A shared loading flag should not block unrelated routes unless those routes truly depend on that dataset.

Prefer:

```text
app-level authentication/workspace gates
+
page-level data loading
```

#### **8. Use A/B testing with one variable at a time**

The successful investigation repeatedly used:

```text
A = current behavior
B = one change
```

and compared:

- wall time
    
- SQL count
    
- pool usage
    
- new physical connections
    
- functional output
    
- errors
    

This should remain the standard for future CRM performance work.

#### **9. Keep functional regression checks alongside performance tests**

The lightweight lead implementation initially removed data required by Automation.

That regression was caught because Stage/Automation were tested with real artifact-bearing leads.

Performance changes must always validate:

```text
performance
+
data correctness
+
UI correctness
+
authorization
+
workspace/org isolation
```

#### **10. Keep a record of rejected optimizations**

B3 is intentionally rejected:

```text
Do not parallelize Dashboard Summary top-level operations
under the current full Home workload
```

Likewise, the investigation established that the following should not be pursued without new evidence:

```text
blind index additions
blind SQL rewrites
raising pool size to chase concurrency
disabling React StrictMode
restoring one universal fat lead response
```

### **Final Technical Conclusion**

The CRM latency problem was not caused primarily by slow PostgreSQL execution.

The dominant issue was **application-level overwork interacting badly with Neon’s network and connection characteristics**.

The most important remediation pattern is:

```text
Reduce unnecessary work
        ↓
Reduce unnecessary API calls
        ↓
Reduce unnecessary DB queries
        ↓
Batch when possible
        ↓
Bound concurrency
        ↓
Keep unrelated work off the critical path
        ↓
Let pages load only the data they actually need
        ↓
Measure again
```

As of the final state documented in this investigation:

- Leads/Contacts P0 fixes were implemented.
    
- Stage/Automation artifact hydration was implemented and validated.
    
- Global `leadsLoading` gating was removed.
    
- Home summary duplication was removed.
    
- Home non-critical work was permanently deferred.
    
- Dashboard task counts were combined.
    
- Accounts Relationships N× fetching was replaced by a batched endpoint.
    
- Deals Pipeline + Summary were combined into one read.
    
- B3 was explicitly rejected after full-load testing.
    
- `pool_pre_ping=False` remained a **separate reliability decision** rather than an unverified permanent latency change.
    
- All changes described above were **not committed** at the end of the captured implementation log.