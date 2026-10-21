# SPEC — AI Chief of Staff POC

This file is ground truth. Read it fully before writing any code, every iteration.
If anything in TASKS.md conflicts with this file, this file wins.

## What we're building

A system that reads what's happening across departments (starting with Product) and
daily surfaces the ONE thing that most needs leadership attention — ranked by how much
it threatens the company's stated vision or revenue — with a plain-English recommendation.
The system never acts on its own. Every recommendation requires explicit human approval
before anything is sent, changed, or actioned.

## Stack (fixed — do not substitute)

- **Frontend:** React 18 + Vite + TypeScript
- **Backend:** Python 3.11 + FastAPI
- **Database:** PostgreSQL 15+
- **Blob storage:** S3-compatible interface. Use MinIO for local/dev (docker-compose),
  behind an abstraction that can swap to AWS S3 / Azure Blob later without code changes
  outside the storage adapter.
- **Repo layout:**
  ```
  /frontend    — Vite + React + TS app
  /backend     — FastAPI app (src layout: app/api, app/domain, app/infra, app/models)
  /infra       — docker-compose.yml (postgres, minio, backend, frontend)
  /docs        — this spec, architecture notes
  ```

## POC scope (do not expand beyond this without being told)

- **One department fully integrated:** Product, via the GoodDay REST API (goodday.work)
  and a mocked/seeded Outlook email feed (do not build real Outlook OAuth for the POC —
  seed realistic-looking email data instead).
- **Two departments mocked only:** Finance and Operations — seed plausible signal data
  directly into Postgres, no real connector, just enough for the ranking engine to have
  something real to compare Product against.
- **HR is entirely excluded.** No HR data, no HR tables, no HR connector. This is
  deliberate and permanent for this phase — do not add HR "just in case."
- **Two personas only:** CEO (sees everything, cross-department) and Product Owner
  (sees only Product's own data). No PMO, no Board persona in this phase.
- **No autonomous actions.** The system drafts recommendations. Nothing is ever sent,
  written back to GoodDay, or emailed without a human clicking approve.

## Build priority (Core → Supporting → Generic — from the domain map)

Build and polish in this order. Do not gold-plate Supporting/Generic while Core is thin.

1. **CORE — build this well, this is the whole point:**
   - Cross-department signal ranking: compare dissimilar signals (a Product delay vs.
     a Finance shortfall) and produce a ranked "what needs attention most today" list.
   - Policy/vision-grounded reasoning: every recommendation must cite which stated
     company policy/vision statement it's weighing against, in plain English.
2. **SUPPORTING — build simply, keep it thin:**
   - Persona-based visibility scoping (CEO vs Product Owner query scoping)
   - Approval workflow (recommendation → pending → approved/rejected, with a required
     reason field when rejected/disagreed)
   - Persona-tailored briefing formatting (same underlying data, different tone/detail)
3. **GENERIC — do not hand-build, wire up what exists:**
   - GoodDay connector: use their documented REST API v2 directly. Do not build a
     custom scraping/parsing layer.
   - Audit logging: a simple middleware/table that records every recommendation
     shown and every approval decision. Do not design a new logging framework.

## Non-negotiable guardrails (enforce in code, not just docs)

1. No HR data enters the system in any form, at any layer.
2. Every recommendation stored must include: its source data references, a confidence
   indicator, and the specific policy/vision text it was checked against.
3. If a data source is missing/stale for a given day, the daily briefing must say so
   explicitly — never silently present a partial picture as complete.
4. No endpoint may send an email, write back to GoodDay, or take any external action.
   The only writes allowed are to our own Postgres DB (recommendations, approvals, audit log).
5. Every recommendation has an explicit approve/reject/disagree action recorded with
   a timestamp and, for reject/disagree, a required free-text reason.
6. Policy/vision text lives in an editable table (not hardcoded in code), so leadership
   can update it without a deploy.
7. Product Owner queries must be scoped so they can never retrieve Finance/Ops/HR data,
   enforced at the query layer, not just hidden in the UI.

## Core data model (minimum entities — expand only as needed)

- `department` (id, name)
- `signal` (id, department_id, source [goodday|outlook|mocked], raw_summary, occurred_at,
  ingested_at)
- `policy` (id, title, text, is_active)
- `recommendation` (id, generated_at, headline, rationale, ranked_score, policy_id,
  source_signal_ids[], confidence)
- `decision` (id, recommendation_id, actor_user_id, action [approved|rejected|disagreed],
  reason, decided_at)
- `user` (id, name, role [ceo|product_owner], department_id nullable)
- `audit_log` (id, actor_user_id, event_type, entity_type, entity_id, occurred_at)

## Definition of done for the whole POC

A CEO user can log in, see a daily briefing naming the single top-priority item ranked
across Product (real data) and Finance/Ops (mocked data), see the plain-English rationale
tied to a specific policy, approve or reject it, and see that decision recorded in the
audit log. A Product Owner user logging in sees only Product's own items. No step in this
flow sends an email or writes to any external system.
