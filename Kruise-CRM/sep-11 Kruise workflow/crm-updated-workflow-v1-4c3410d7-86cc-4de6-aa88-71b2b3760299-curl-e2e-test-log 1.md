# crm-updated-workflow-v1 — CRM app integration + Curl E2E guide

Use this document to **integrate the CRM workflow into your application** (and to manually verify with curl / Postman).  
Target environment: **Dev (`kruiseflowdev`)** — same Mongo DB as local app configs.

| Field | Value |
|--------|--------|
| Workflow name | `crm-updated-workflow-v1` |
| Workflow ID | `4c3410d7-86cc-4de6-aa88-71b2b3760299` |
| Org ID | `ORG-51F73DE2` |
| Org name | Keehoo AI |
| Pending-tasks role | `admin` |
| Dev base URL | `https://kruiseflowdev.keehoo.ai` |
| API prefix | `/api/kruise` |
| Full API base | `https://kruiseflowdev.keehoo.ai/api/kruise` |
| UI (dev) | https://kruiseflowdev.keehoo.ai/workflows/4c3410d7-86cc-4de6-aa88-71b2b3760299 |
| Local UI (optional) | http://localhost:3000/workflows/4c3410d7-86cc-4de6-aa88-71b2b3760299 |
| MCP tools | Outlook `send_email`, `has_reply`, `reply_email`, `create_calendar_event`, `read_conversation`; Teams `resolve_meeting_from_event`, `list_meeting_transcripts`, `get_meeting_transcript_content` |
| Reply / transcript delays | **~60s** (reply checks), **~30s** (transcript retries) |

**What it does (one line):** collect research inputs → score fit → compose/send outreach → wait for replies (with follow-ups) → schedule Teams meeting → fetch transcript → read full email chain → agent stage recommendation → HITL move/reject → end.

**Process explainer (non-API):** [`CRM-Workflow-Process-Guide.md`](./CRM-Workflow-Process-Guide.md)

**Reference Postman collection (same service APIs):**  
`/home/keehoo/Documents/AI-KRUISE-WORKFLOW-APIS-DOCS/Erp-Stock-Procurement-workflow.dev.postman_collection.json`  
(That collection is for another workflow ID; **reuse the same endpoints / auth pattern**, but swap `workflow_id` to the CRM id below.)

---

## Credentials for CRM integration (Dev)

Keep the JWT **server-side only** (never ship it in a CRM frontend bundle).

| Field | Value |
|--------|--------|
| Service token (JWT) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlX2FjY291bnQiLCJhY2NvdW50X2lkIjoiNDYxOTE1N2ItZDVlZi00M2JhLTk3OTEtODZiZDViMGYwYTlmIiwib3JnX2lkIjoiT1JHLTUxRjczREUyIiwic2NvcGVzIjpbIndvcmtmbG93OnN0YXJ0Iiwid29ya2Zsb3c6cmVhZCIsInRhc2tzOnJlYWQiLCJ0YXNrczpjb21wbGV0ZSIsIndvcmtmbG93OnJlc3VtZSIsIndvcmtmbG93OmNvbnRleHRfdXBkYXRlIiwiZXZlbnRzOnN0cmVhbSIsImZvcm1zOnJlYWQiLCJmb3JtczpzdWJtaXQiXSwianRpIjoiMDljNmU4ZTQtODU2Yy00YTY0LWI0MGItZjgyNWJmOWY1MWU1IiwiZXhwIjoxODE5Nzg0MTQ0fQ.mRFJaWLshZhKOoyiU4wAJ8DT49evl9h8YBjJi9U_uSY` |
| Account ID | `4619157b-d5ef-43ba-9791-86bd5b0f0a9f` |
| Org ID (in token) | `ORG-51F73DE2` |
| Role for pending tasks | `admin` |

**Scopes on this token:**  
`workflow:start`, `workflow:read`, `tasks:read`, `tasks:complete`, `workflow:resume`, `workflow:context_update`, `events:stream`, `forms:read`, `forms:submit`

Every request:

```http
Authorization: Bearer <service token>
Content-Type: application/json
```

---

## Env vars for the CRM application

```env
AIKRUISE_BASE=https://kruiseflowdev.keehoo.ai
AIKRUISE_API_PREFIX=/api/kruise
AIKRUISE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlX2FjY291bnQiLCJhY2NvdW50X2lkIjoiNDYxOTE1N2ItZDVlZi00M2JhLTk3OTEtODZiZDViMGYwYTlmIiwib3JnX2lkIjoiT1JHLTUxRjczREUyIiwic2NvcGVzIjpbIndvcmtmbG93OnN0YXJ0Iiwid29ya2Zsb3c6cmVhZCIsInRhc2tzOnJlYWQiLCJ0YXNrczpjb21wbGV0ZSIsIndvcmtmbG93OnJlc3VtZSIsIndvcmtmbG93OmNvbnRleHRfdXBkYXRlIiwiZXZlbnRzOnN0cmVhbSIsImZvcm1zOnJlYWQiLCJmb3JtczpzdWJtaXQiXSwianRpIjoiMDljNmU4ZTQtODU2Yy00YTY0LWI0MGItZjgyNWJmOWY1MWU1IiwiZXhwIjoxODE5Nzg0MTQ0fQ.mRFJaWLshZhKOoyiU4wAJ8DT49evl9h8YBjJi9U_uSY
AIKRUISE_ORG_ID=ORG-51F73DE2
AIKRUISE_TASK_ROLE=admin
CRM_UPDATED_WORKFLOW_V1_ID=4c3410d7-86cc-4de6-aa88-71b2b3760299
```

Optional local backend (same org/workflow/Mongo): set `AIKRUISE_BASE=http://localhost:8000` — token must still be valid for that backend’s JWT secret / service account.

---

## Curl env bootstrap

```bash
export BASE=https://kruiseflowdev.keehoo.ai
export TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlX2FjY291bnQiLCJhY2NvdW50X2lkIjoiNDYxOTE1N2ItZDVlZi00M2JhLTk3OTEtODZiZDViMGYwYTlmIiwib3JnX2lkIjoiT1JHLTUxRjczREUyIiwic2NvcGVzIjpbIndvcmtmbG93OnN0YXJ0Iiwid29ya2Zsb3c6cmVhZCIsInRhc2tzOnJlYWQiLCJ0YXNrczpjb21wbGV0ZSIsIndvcmtmbG93OnJlc3VtZSIsIndvcmtmbG93OmNvbnRleHRfdXBkYXRlIiwiZXZlbnRzOnN0cmVhbSIsImZvcm1zOnJlYWQiLCJmb3JtczpzdWJtaXQiXSwianRpIjoiMDljNmU4ZTQtODU2Yy00YTY0LWI0MGItZjgyNWJmOWY1MWU1IiwiZXhwIjoxODE5Nzg0MTQ0fQ.mRFJaWLshZhKOoyiU4wAJ8DT49evl9h8YBjJi9U_uSY'
export WF=4c3410d7-86cc-4de6-aa88-71b2b3760299
export ORG=ORG-51F73DE2
export ROLE=admin
```

After start:

```bash
export INST=<instance_id from start response>
```

---

## How CRM should integrate (loop)

```text
1. POST start-service          → save instance_id
2. GET  status                 → until paused / completed / failed
3. GET  pending?role=admin     → save task_id (+ node_id / title)
4. GET  task/{id}/service      → (optional) form schema + message
5. POST complete-service       → decision + data for that HITL
6. Repeat 2–5 until status = completed | failed
7. Optional: GET events/service, GET graph?view=business, GET workflow_instances/{id}
```

**Rules**

1. Poll status until `paused` / `completed` / `failed`
2. If paused on HITL → list pending (`role=admin`) → complete with `complete-service`
3. If paused on delay → wait ~60s (reply) or ~30s (transcript) → poll again (auto-resume)
4. During reply-wait windows, a real Outlook reply from the prospect mailbox is required for `outlook.has_reply` to succeed
5. Do **not** complete the same task in both UI and your app (causes `Task is not actionable`)
6. Use a **new** `correlation_id` **and** `run_id` for every fresh start (idempotent pair)

> **Fresh run IDs (required):** Same `(correlation_id, run_id)` returns the **existing** instance. CRM should generate unique values per opportunity/deal (e.g. `dealId + timestamp`).

> **API prefix:** All routes are under **`/api/kruise`**.

---

## API index (same pattern as Postman ERP collection)

| # | Action | Method | Endpoint |
|---|--------|--------|----------|
| 1 | Start workflow | `POST` | `/api/kruise/workflows/{workflow_id}/start-service` |
| 2 | List pending HITL | `GET` | `/api/kruise/tasks/service/pending?workflow_id=…&instance_id=…&role=admin&page=1&page_size=20` |
| 3 | Task detail | `GET` | `/api/kruise/tasks/{task_id}/service` |
| 4 | Complete HITL | `POST` | `/api/kruise/tasks/{task_id}/complete-service` |
| 5 | Instance status | `GET` | `/api/kruise/workflows/executions/instance/{instance_id}/status` |
| 6 | Instance events | `GET` | `/api/kruise/workflows/executions/instance/{instance_id}/events/service?limit=200` |
| 7 | Instance graph | `GET` | `/api/kruise/workflows/executions/instance/{instance_id}/graph?view=business` |
| 8 | Full instance | `GET` | `/api/kruise/workflows/executions/workflow_instances/{instance_id}` |
| 9 | Hold status (optional) | `GET` | `/api/kruise/workflows/instances/{instance_id}/hold-status` |
| 10 | Context update (optional, on-hold only) | `PUT` | `/api/kruise/workflows/instances/{instance_id}/context-update` |

---

## Step 1 — Start workflow

This workflow takes **no start inputs**. Outreach / research fields are collected in the first HITL.

```bash
export CORR="crm_v1_$(date +%s)"
export RUN="$CORR"

curl -sS -X POST "$BASE/api/kruise/workflows/$WF/start-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"correlation_id\": \"$CORR\",
    \"run_id\": \"$RUN\",
    \"inputs\": {},
    \"context\": {
      \"source\": \"crm_app_integration\",
      \"org_id\": \"$ORG\"
    }
  }"
```

Static example (change ids before each new test):

```bash
curl -sS -X POST "$BASE/api/kruise/workflows/$WF/start-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "correlation_id": "crm_v1_001",
    "run_id": "crm_v1_001",
    "inputs": {},
    "context": {
      "source": "crm_app_integration"
    }
  }'
```

**Expected response shape:**

```json
{
  "instance_id": "<uuid>",
  "workflow_id": "4c3410d7-86cc-4de6-aa88-71b2b3760299",
  "org_id": "ORG-51F73DE2",
  "status": "pending",
  "current_node": "",
  "context": {
    "source": "start_service",
    "inputs": {},
    "correlation_id": "crm_v1_001",
    "run_id": "crm_v1_001"
  }
}
```

```bash
export INST=<paste instance_id>
```

---

## Step 2 — Poll status → paused at Collect CRM Inputs

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/status" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**

```json
{
  "instance_id": "<uuid>",
  "status": "paused",
  "current_node": "hitl_collect_crm_inputs",
  "current_node_label": "Collect CRM Inputs"
}
```

---

## Step 3 — List pending task (`role=admin`)

```bash
curl -sS "$BASE/api/kruise/tasks/service/pending?workflow_id=$WF&instance_id=$INST&role=$ROLE&page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected (truncated):**

```json
{
  "items": [
    {
      "task_id": "<task-uuid>",
      "instance_id": "<instance-uuid>",
      "node_id": "hitl_collect_crm_inputs",
      "status": "pending",
      "title": "CRM outreach inputs",
      "task_payload": {
        "allowed_decisions": ["submit"]
      }
    }
  ],
  "total": 1
}
```

```bash
export TASK=<task_id from response>
```

### Optional — task detail (form fields / message)

```bash
curl -sS "$BASE/api/kruise/tasks/$TASK/service" \
  -H "Authorization: Bearer $TOKEN"
```

Use this in the CRM UI to render the HITL form dynamically from `task_payload` / form schema instead of hardcoding fields.

---

## Step 4 — Complete HITL: Collect CRM Inputs

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "submit",
    "comment": "crm app - collect crm inputs",
    "data": {
      "authorization": "Bearer tvly-YOUR_TAVILY_KEY",
      "content_type": "application/json",
      "query": "Elon Musk SpaceX, Tesla",
      "topic": "general",
      "search_depth": "advanced",
      "max_results": "10",
      "include_answer": "true",
      "include_raw_content": "false",
      "approach_reason": "We want investment interest for Digidevalaya, our temple management product."
    },
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

**Expected:** `{ "instance_id": "<uuid>", "status": "running" }`

Then poll until paused on `hitl_decide_outreach` (after Tavily HTTP + fit-scorer agent).

---

## Step 5 — Complete HITL: Start conversation? → Email

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/status" \
  -H "Authorization: Bearer $TOKEN"

curl -sS "$BASE/api/kruise/tasks/service/pending?workflow_id=$WF&instance_id=$INST&role=$ROLE&page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"

curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Email — start outreach",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

- `approve` (UI: **Email**) → email brief  
- `reject` (UI: **Call**) → `end_1783918855872` (End — Declined outreach)

---

## Step 6 — Complete HITL: Email brief

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "submit",
    "comment": "crm app - email brief",
    "data": {
      "to": "prospect@example.com",
      "subject": "Great Meeting You at the Event",
      "mail_content": "Write a professional follow-up after a networking event. Sender: John, Marketing Lead at Keehoo AI. Thank the prospect, introduce Keehoo AI briefly, invite a call. ~150-200 words.",
      "cc": "",
      "bcc": ""
    },
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

Poll until `hitl_review_email`.

---

## Step 7 — Complete HITL: Review email → Send mail

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Send mail",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

- `approve` → Outlook `send_email`, then auto-map conversation tracking fields → reply checks  
- `regenerate` → back to email composer (include feedback in `comment` / data as your UI supports)

---

## Step 8 — Wait for Round-1 reply (~60s delays)

After send, workflow runs `outlook.has_reply` up to twice with a **~60s** delay between attempts.

**While waiting:** reply from the prospect mailbox in the **same Outlook conversation**.

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/status" \
  -H "Authorization: Bearer $TOKEN"
```

If no reply after both checks → pauses on `hitl_compose_followup`. For the happy path, get a Round-1 reply before that.

---

## Step 9 — Complete HITL: Review Sales Reply → Good

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Good reply",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

- `approve` (UI: **Good**) → compose reply  
- `reject` (UI: **Bad**) → `end_bad`

---

## Step 10 — Complete HITL: Compose Sales Reply

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "submit",
    "comment": "crm app - compose reply",
    "data": {
      "reply_body": "Thanks for your interest. Can we schedule a short meeting today at 12 PM IST to discuss Digidevalaya?",
      "reply_all": "true"
    },
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

Outlook `reply_email` sends, then Round-2 reply checks begin. **Reply again** from the prospect so Round-2 analysis can run.

---

## Step 11–12 — Round-2 review → Good

Poll until `hitl_review_analysis_r2`, then:

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Good Round2",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

`approve` → meeting details. `reject` → `end_bad_r2`.

---

## Step 13 — Complete HITL: Meeting Details

Use a start time a few minutes ahead so you can join the Teams meeting during the run.

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "submit",
    "comment": "crm app - meeting details",
    "data": {
      "meeting_subject": "KeeHoo AI solutions discussion",
      "meeting_start": "2026-09-11T15:00:00",
      "meeting_end": "2026-09-11T15:30:00",
      "meeting_timezone": "Asia/Kolkata",
      "meeting_location": "Microsoft Teams",
      "meeting_notes": "Discussion on KeeHoo AI solutions and next steps."
    },
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

Creates Outlook calendar event (`meeting_event_result` includes `eventId`, `onlineMeetingId` when resolved, and `joinUrl`), then agent drafts confirmation email.

---

## Step 14 — Complete HITL: Approve Meeting Email

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Approve meeting confirmation",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

`approve` → reply with meeting details in the same thread. `reject` → `end_meeting_email_rejected`.

---

## Step 15 — Complete HITL: Confirm Meeting Done (Fetch Transcript)

**Preferred:** submit with empty/optional join URL — workflow uses `meeting_event_result.onlineMeetingId` and `meeting_event_result.eventId` from create-meeting.

**Optional fallback:** paste the long canonical `meetup-join` URL only if those IDs are missing.

```bash
# optional: inspect IDs from instance context
curl -sS "$BASE/api/kruise/workflows/executions/workflow_instances/$INST" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{
      onlineMeetingId: .context.meeting_event_result.onlineMeetingId,
      eventId: (.context.meeting_event_result.eventId // .context.meeting_event_result.id),
      joinUrl: .context.meeting_event_result.joinUrl
    }'

curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "submit",
    "comment": "crm app - meeting done, fetch transcript",
    "data": {
      "meeting_join_url": ""
    },
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

**Before / during this step:** join the calendar-created Teams meeting, enable transcription, hold a short conversation, end the meeting, wait until Teams Recap shows transcript, then submit.

Node id: `hitl_online_meeting_id` (label: **Confirm Meeting Done (Fetch Transcript)**).

---

## Step 16 — Transcript resolve / list / content + email thread + agent

After confirm-done submit, the workflow:

1. Checks meeting reference exists (`onlineMeetingId` **or** `eventId` **or** optional `meeting_join_url`)  
2. Calls `msteams.resolve_meeting_from_event` → `meeting_resolved`  
3. Lists transcripts via `msteams.list_meeting_transcripts` (up to 3 tries, **~30s** between retries) using `meeting_resolved.onlineMeetingId`  
4. On list success → `msteams.get_meeting_transcript_content` → `meeting_transcript_result`  
5. On success → `outlook.read_conversation` (`email_thread`)  
6. Agent `CRM Post-Meeting Stage Eligibility Analyst` → `stage_eligibility_analysis`  
7. Pauses on `hitl_stage_decision`

```bash
# poll until paused on hitl_stage_decision
# (or end_online_meeting_id_missing / end_meeting_resolve_failed / end_no_transcript)
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/status" \
  -H "Authorization: Bearer $TOKEN"
```

**Agent output keys (`stage_eligibility_analysis`):**

| Key | Meaning |
|-----|---------|
| `overall_summary` | Email chain + meeting summary |
| `email_engagement_summary` | How email conversation went |
| `meeting_summary` | Meeting summary |
| `eligible_for_next_stage` | `yes` / `no` / `unsure` |
| `eligibility_reason` | Rationale |
| `suggested_next_action` | Recommended next action |
| `buying_signals` / `risks_or_objections` / `key_discussion_points` | Arrays |

---

## Step 17 — Complete HITL: Stage decision

Both buttons **end** the workflow for now (CRM stage write can be done in your app after this).

### Move to next stage

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "comment": "Move to next stage",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

→ `end_replied` (**End — Move to Next Stage**)

### Reject

```bash
curl -sS -X POST "$BASE/api/kruise/tasks/$TASK/complete-service" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "reject",
    "comment": "Reject stage advance",
    "data": {},
    "acted_by": {
      "user_id": "crm_user_001",
      "email": "crm.user@keehoo.ai",
      "display_name": "CRM User"
    },
    "cancel_other_pending": true
  }'
```

→ `end_stage_rejected` (**End — Stage Rejected**)

---

## Step 18 — Final status

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/status" \
  -H "Authorization: Bearer $TOKEN"
```

**Happy path expected:**

```json
{
  "instance_id": "<uuid>",
  "status": "completed",
  "current_node": "end_replied"
}
```

### Other terminal nodes

| Node | When |
|------|------|
| `end_1783918855872` | Declined outreach |
| `end_send_failed` | Outlook send failed |
| `end_bad` / `end_bad_r2` | Reply marked Bad |
| `end_no_reply` / `end_no_reply_r2` | No reply after follow-up cycles |
| `end_meeting_failed` | Calendar meeting creation failed |
| `end_meeting_email_failed` | Meeting email draft failed |
| `end_meeting_email_rejected` | Meeting email rejected |
| `end_online_meeting_id_missing` | Meeting reference missing (no onlineMeetingId/eventId/joinUrl) |
| `end_meeting_resolve_failed` | Could not resolve Teams onlineMeetingId |
| `end_no_transcript` | Transcript not listed after retries |
| `end_followup_send_failed` / `end_followup_r2_send_failed` | Follow-up send failed |
| `end_replied` | Move to next stage |
| `end_stage_rejected` | Stage rejected |

---

## Observability APIs (recommended for CRM UI)

### Events (debug / timeline)

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/events/service?limit=200" \
  -H "Authorization: Bearer $TOKEN"
```

### Business graph

```bash
curl -sS "$BASE/api/kruise/workflows/executions/instance/$INST/graph?view=business" \
  -H "Authorization: Bearer $TOKEN"
```

### Full instance detail

```bash
curl -sS "$BASE/api/kruise/workflows/executions/workflow_instances/$INST" \
  -H "Authorization: Bearer $TOKEN"
```

Useful context keys:

| Key | Meaning |
|-----|---------|
| `outlook_send_email_result` / `conversationId` | First outreach send + thread id |
| `reply_check` / `reply_check_2` | Prospect replies |
| `meeting_event_result` | Calendar event + `eventId` / `onlineMeetingId` / `joinUrl` |
| `meeting_resolved` | Output of `resolve_meeting_from_event` |
| `meeting_transcript_list` | Output of `list_meeting_transcripts` |
| `meeting_transcript_result` | Output of `get_meeting_transcript_content` |
| `email_thread` | Full Outlook conversation |
| `stage_eligibility_analysis` | Agent recommendation for next stage |
| `crm_fit_score_result` | Fit score / recommendation / reasoning |
| `email_draft_result` | Composed outreach draft |

---

## HITL checklist (per run)

| Node | Decision | Fields |
|------|----------|--------|
| `hitl_collect_crm_inputs` | `submit` | `authorization`, `content_type`, `query`, `topic`, `search_depth`, `max_results`, `include_answer`, `include_raw_content`, `approach_reason` |
| `hitl_decide_outreach` | `approve` / `reject` | Email / Call |
| `hitl_email_brief` | `submit` | `to`, `subject`, `mail_content`, `cc`, `bcc` |
| `hitl_review_email` | `approve` / `regenerate` | Send mail / Regenerate |
| `hitl_review_analysis` | `approve` / `reject` | Good / Bad |
| `hitl_compose_reply` | `submit` | `reply_body`, `reply_all` |
| `hitl_compose_followup` | `submit` | `followup_body`, `followup_reply_all` *(only if no Round-1 reply)* |
| `hitl_review_analysis_r2` | `approve` / `reject` | Good / Bad |
| `hitl_compose_followup_r2` | `submit` | `followup_r2_body`, `followup_r2_reply_all` *(only if no Round-2 reply)* |
| `hitl_meeting_details` | `submit` | `meeting_subject`, `meeting_start`, `meeting_end`, `meeting_timezone`, `meeting_location`, `meeting_notes` |
| `hitl_approve_meeting_email` | `approve` / `reject` | Approve / Reject |
| `hitl_online_meeting_id` | `submit` | Confirm meeting done; optional `meeting_join_url` fallback only |
| `hitl_stage_decision` | `approve` / `reject` | Move to next stage / Reject |

`task_id` values change every run — always take them from `/tasks/service/pending` for the current `instance_id` with **`role=admin`**.

---

## Path taken (simplified — happy path)

```text
Start (empty inputs)
  → HITL: Collect CRM Inputs
  → HTTP: Tavily Research
  → Agent: CRM Approach Fit Scorer
  → HITL: Start conversation? (Email)
  → HITL: Email brief
  → Agent: CRM Email Composer
  → HITL: Review email (Send mail)
  → Outlook send_email
  → set_variable chain (conversationId, from, afterDateTime, …)
  → has_reply checks (+ ~60s delay / optional follow-up)
  → Agent: Analyze Sales Reply
  → HITL: Review Sales Reply (Good)
  → HITL: Compose Sales Reply → Outlook reply_email
  → Round2 has_reply checks
  → Agent: Analyze Round2 Reply
  → HITL: Review Round2 (Good)
  → HITL: Meeting Details
  → Outlook create_calendar_event
  → Agent: Compose Meeting Email
  → HITL: Approve Meeting Email → Outlook reply_email
  → HITL: Confirm Meeting Done (Fetch Transcript)
  → msteams.resolve_meeting_from_event → meeting_resolved
  → msteams.list_meeting_transcripts (×3, ~30s retries)
  → msteams.get_meeting_transcript_content → meeting_transcript_result
  → outlook.read_conversation  → email_thread
  → Agent: Post-Meeting Stage Eligibility Analyst
  → HITL: Decide Next Sales Stage
        Move to next stage → End — Move to Next Stage  ✅
        Reject             → End — Stage Rejected      ✅
```

---

## Mermaid (for leads / design reviews)

```mermaid
flowchart TD
    Start([Start — empty inputs]) --> Collect[HITL: Collect CRM Inputs]
    Collect --> Tavily[HTTP: Tavily Research]
    Tavily --> Fit[Agent: Fit Scorer]
    Fit --> Decide[HITL: Start conversation?]
    Decide -->|Call| EndDecline([End — Declined outreach])
    Decide -->|Email| Brief[HITL: Email brief]
    Brief --> Compose[Agent: Email Composer]
    Compose --> ReviewMail[HITL: Review email]
    ReviewMail -->|Regenerate| Compose
    ReviewMail -->|Send| Send[Outlook send_email]
    Send --> Map[set_variable: conversationId/from/…]
    Map --> Reply1[has_reply Round1]
    Reply1 --> Analyze1[Agent: Analyze reply]
    Analyze1 --> Review1[HITL: Good / Bad]
    Review1 -->|Bad| EndBad1([End — Bad Reply])
    Review1 -->|Good| ComposeReply[HITL: Compose reply]
    ComposeReply --> ReplySend[Outlook reply_email]
    ReplySend --> Reply2[has_reply Round2]
    Reply2 --> Analyze2[Agent: Analyze Round2]
    Analyze2 --> Review2[HITL: Good / Bad]
    Review2 -->|Bad| EndBad2([End — Bad Reply Round2])
    Review2 -->|Good| MeetHITL[HITL: Meeting details]
    MeetHITL --> Cal[Outlook create_calendar_event]
    Cal --> MeetMail[Agent: Meeting email]
    MeetMail --> ApproveMeet[HITL: Approve meeting email]
    ApproveMeet -->|Reject| EndMeetRej([End — Meeting email rejected])
    ApproveMeet -->|Approve| ConfirmHITL[HITL: Confirm meeting done]
    ConfirmHITL --> Resolve[Teams resolve_meeting_from_event]
    Resolve -->|fail| EndResolveFail([End — Meeting ID resolve failed])
    Resolve -->|ok| ListTx[Teams list_meeting_transcripts]
    ListTx -->|fail x3| EndNoTx([End — Transcript not available])
    ListTx -->|ok| GetTx[Teams get_meeting_transcript_content]
    GetTx --> Thread[Outlook read_conversation]
    Thread --> StageAgent[Agent: Stage eligibility]
    StageAgent --> StageHITL[HITL: Move / Reject]
    StageHITL -->|Move| EndMove([End — Move to Next Stage])
    StageHITL -->|Reject| EndReject([End — Stage Rejected])
```

---

## Registry / dependency IDs (Dev Mongo)

| Kind | Name | ID |
|------|------|-----|
| Workflow | `crm-updated-workflow-v1` | `4c3410d7-86cc-4de6-aa88-71b2b3760299` |
| Org | Keehoo AI | `ORG-51F73DE2` |
| Service account | (JWT below) | `4619157b-d5ef-43ba-9791-86bd5b0f0a9f` |
| Agent | CRM Approach Fit Scorer | `baecba5e-dd3f-4ee7-b468-1146fefcba68` |
| Agent | CRM Email Composer | `c5ac6e6f-0391-4fd2-9d39-4a4c571008fe` |
| Agent | CRM Sales Reply Analyzer | `22bfd223-5d33-4ae6-a07a-a9bcabd911d7` |
| Agent | CRM Meeting Confirmation Email Composer | `dac0aa16-56ad-4471-b268-2cd38bc0434d` |
| Agent | CRM Post-Meeting Stage Eligibility Analyst | `bb07f637-c45a-4b94-8743-f360aee28372` |
| Tool | outlook.send_email | `247eac4a-4627-413c-8dc3-30e62e94b6c4` |
| Tool | outlook.has_reply | `af60ced8-cf0e-4cc8-bb1f-5ae266e16e75` |
| Tool | outlook.reply_email | `2ad46106-4f4d-444a-a159-c3fc8c5d1b3d` |
| Tool | outlook.create_calendar_event | `2ee4f5fd-8182-4902-8952-d36e426a3c36` |
| Tool | outlook.read_conversation | `84275904-f3fe-416d-88b3-b457cd76507f` |
| Tool | msteams.resolve_meeting_from_event | `702f6d48-b59a-4cb6-a53b-bd062d7a3707` |
| Tool | msteams.list_meeting_transcripts | `7bdce0c6-00bc-4a9c-973d-d893c9c8ade9` |
| Tool | msteams.get_meeting_transcript_content | `db7d2fa3-506f-4fcc-b118-708adce1f9dc` |

---

## Notes / pitfalls

1. **No start inputs** — outreach fields are collected in HITLs, not in `start-service` `inputs`.
2. **Always pass `role=admin`** on pending-task list for this workflow’s assignee role.
3. **Prospect must reply in Outlook** during reply-check windows (or use follow-up HITLs).
4. **Join the calendar-created meeting**, not a different Teams thread.
5. **Transcript path prefers IDs** — use `meeting_event_result.onlineMeetingId` / `eventId`; optional join URL is fallback only (long `meetup-join` URL, not short `teams.microsoft.com/meet/...`).
6. **Post-meeting path needs both** email thread and transcript before the stage agent.
7. **Stage HITL both buttons end the run** — your CRM app can update its own deal stage after reading the final decision.
8. **Task is not actionable** — task already completed (often via UI) or wrong `instance_id`; always use fresh `task_id` from pending.
9. **Do not mix instance IDs** across parallel runs.
10. **JWT rotation** invalidates older tokens for the same service account (`current_jti` check) — re-copy from Governance if `401`.
11. Keep `AIKRUISE_JWT` **server-side only**.
12. Related process doc: [`CRM-Workflow-Process-Guide.md`](./CRM-Workflow-Process-Guide.md).
13. API pattern source: Postman collection `Erp-Stock-Procurement-workflow.dev.postman_collection.json` (same Dev host + same service token; different `workflow_id`).
