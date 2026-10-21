# 07 — Decisions Log

> Every significant architecture decision, the options considered, and why we chose what we chose.
> Use this when someone asks "why does it work this way?"

---

## D-01 — The organization is the tenant, not the person

**Decision:** `org_id` is the primary tenant key. Personal data is scoped to the org, not the user who created it.

**Options considered:**
- User-as-tenant: simple, but breaks the moment a second person joins
- Org-as-tenant: slightly more complex upfront, scales naturally

**Why org-as-tenant:**
If Riya runs market research and then invites Arjun as co-founder, Arjun must see that research. It belongs to the startup, not to Riya personally. If Riya leaves, the startup keeps its history. User-as-tenant cannot support any of this without a major migration.

**Consequences:**
- Every INSERT into a domain table must include `org_id`
- All queries must filter by `org_id` from the session (never from the request body)
- When a user leaves an org, their data stays — only the membership row is deleted

---

## D-02 — Row-level isolation over schema-per-tenant

**Decision:** Single shared database, `org_id` column on every domain table.

**Options considered:**
- Row-level isolation (chosen): simple, cheap, one DB to manage
- Schema-per-tenant: clean isolation but complex migrations, harder to query across tenants
- DB-per-tenant: maximum isolation, but expensive and operationally heavy

**Why row-level:**
At seed stage, FounderOS does not need the complexity of per-schema or per-DB isolation. Row-level with strict middleware enforcement gives sufficient isolation. Enterprise bank and govt clients (which may demand stronger isolation later) can be moved to schema isolation as a paid tier upgrade — the application code does not need to change, just the connection routing.

**Consequences:**
- Every developer must understand the `tenant_id` injection pattern
- Missing a `WHERE org_id = ...` clause on a query is a data leak — code reviews must catch this
- The security middleware is the single most critical piece of infrastructure

---

## D-03 — Sequential persona switching, not simultaneous multi-role

**Decision:** One `active_persona` column on `users`. One active mode at a time.

**Options considered:**
- Simultaneous multi-role: a single session could act as both founder and mentor
- Sequential switching (chosen): one mode at a time, switchable from the nav

**Why sequential:**
Simultaneous roles create ambiguous query context. If Riya is "both founder and mentor" simultaneously, which `tenant_id` do we inject? Which dashboard do we show? The UI becomes confusing. Sequential switching makes the active context always unambiguous.

**Consequences:**
- `active_persona` must be updated on switch (one UPDATE to `users`)
- The session must store the active `org_id` for org-based personas
- Switching back to a previous persona restores all previous data — nothing is deleted on switch

---

## D-04 — The silent org rule for solo investors

**Decision:** Every persona that could ever have a team member gets an org — even solo investors.

**Options considered:**
- No org for solo investors: use `user_id` as tenant for simplicity
- Silent org (chosen): create org automatically, hide it from the UI

**Why silent org:**
Solo investors often grow. Karan today is solo. In 6 months he hires Priya. If his deal pipeline was scoped to `user_id`, adding Priya requires migrating every pipeline row to a new org. With a silent org from day one, adding Priya is one `INSERT` into `memberships`.

**Consequences:**
- All investor pipeline data uses `org_id` even when there is one member
- `org_type = individual_investor` distinguishes solo angels from VC firms in the UI
- The org exists in the DB but is never mentioned in the solo investor's UI

---

## D-05 — Mentors use user_id as tenant (the one exception)

**Decision:** `mentor_profiles` and `mentor_sessions` use `user_id`, not `org_id`.

**Why this is correct:**
The test: "can you hire someone to share your mentoring data with?" The answer is no. Mentoring is personal expertise. A mentor cannot have an analyst doing mentoring on their behalf. There is no team scenario for the mentor persona.

**Consequences:**
- `mentor_profiles` is the only domain table keyed on `user_id`
- `mentor_sessions` bridges both models: `mentor_user_id` (user-scoped) + `founder_org_id` (org-scoped)
- The security middleware has two code paths: org-check and user-check. Mentor persona triggers the user-check path

---

## D-06 — Never overwrite agent_runs

**Decision:** Every AI agent execution creates a new row. Previous runs are never deleted or overwritten.

**Why:**
If Arjun re-runs market research, the startup needs to see both runs — Riya's original and Arjun's fresh one. The dashboard shows all runs in reverse chronological order, labelled by who triggered them. Overwriting would destroy the audit trail and make it impossible to compare analyses over time.

**Consequences:**
- `agent_runs` grows indefinitely — storage and query performance must be considered at scale
- The dashboard always queries `ORDER BY created_at DESC` and shows the most recent first
- Old runs can be archived but should never be deleted (they are the startup's intellectual history)

---

## D-07 — connection_requests as the only cross-tenant bridge

**Decision:** Two orgs can only interact through the `connection_requests` table. No direct cross-tenant data access.

**Why:**
Without a controlled bridge, the alternative is an investor directly querying the founder's private tables. This is a security hole. The bridge pattern means: (1) the founder explicitly opts in (is_discoverable), (2) the investor expresses interest (connection_request), (3) the founder controls acceptance. At no point does the investor get direct access to private data.

**Consequences:**
- Contact emails are never stored in `connection_requests` — they are pulled from `users` only after `status = accepted`
- The `request_type` column (`investor_interest`, `loan_application`, `scheme_application`) allows one table to serve all cross-tenant interaction types
- Private data (agent_runs, lean canvas, deal notes) is NEVER accessible via this bridge

---

## D-08 — is_discoverable is one flag for all audiences

**Decision:** One boolean on the `startups` table controls visibility to investors, banks, and government simultaneously.

**Options considered:**
- Separate opt-in per audience type (e.g., `is_discoverable_to_investors`, `is_discoverable_to_banks`)
- Single flag (chosen): one flip, all audiences

**Why single flag:**
The pitch deck's core promise is transparency as a moat. A startup that goes discoverable is making a deliberate statement about openness. Granular per-audience toggles add complexity without meaningful benefit — the Observatory filters (sector, stage, MRR, GST) already handle audience relevance. A bank won't look at an idea-stage startup with no MRR regardless of the flag.

**Consequences:**
- Simpler UI for founders — one toggle, clear meaning
- Milestone-level control (`is_public` on `startup_milestones`) provides the granularity founders actually need
- Observatory queries for different personas simply add different WHERE clauses on top of `is_discoverable = true`

---

## D-09 — planning_data replaces agent_runs columns (POC → production)

**Decision:** Agent outputs live as rows in `planning_data`, not as columns on `startup_ideas`.

**Context from POC:**
The working POC stores every agent output as a column on `startup_ideas` — `research_report`, `lean_canvas_output`, `market_sizing_output`, `gtm_output`, `financial_projection_output`. This works for a single user with a single idea. It fails the moment a second team member re-runs any agent, because there is no way to store both runs.

**Options considered:**
- Keep outputs as columns: simple, but single-run-per-type forever. Arjun's re-run overwrites Riya's.
- Move outputs to rows in `planning_data` (chosen): one row per run, full history, `user_id` tracks who triggered it.

**Why rows win:**
The POC's `planning_data` table already exists and already has the right shape — `(idea_id, panel, output_data, user_selections)`. The only changes needed are: add `org_id`, add `user_id`, and drop the unique constraint on `(idea_id, panel)`. The output columns on `startup_ideas` become deprecated and are dropped after data migration.

**Consequences:**
- `planning_data` is the canonical name going forward — `agent_runs` in earlier design docs maps to this table
- The unique constraint `uq_planning_idea_panel` is dropped — multiple runs per panel are allowed and expected
- The dashboard always queries `ORDER BY created_at DESC` — newest run shown first, older runs accessible in history
- `minio_key` on `planning_data` handles large outputs — keep this pattern, it's production-grade

---

## D-10 — session_id is the anonymous tenant, org_id is the authenticated tenant

**Decision:** `session_id` on `startup_ideas` is kept for the pre-signup flow. `org_id` takes over as the tenant key after account creation.

**Context from POC:**
The POC captures the founder's idea before they log in — using `session_id` to tie the idea to a browser session. This is intentional and the right UX pattern (capture the idea first, then ask for signup). The problem: `session_id` is a session-level identifier, not a tenant identifier. Once the founder signs up, the idea must be re-stamped with a proper `org_id`.

**Options considered:**
- Replace session_id entirely with org_id: requires signup before idea capture — kills top-of-funnel
- Keep both (chosen): `session_id` for the anonymous phase, `org_id` after signup. The promotion happens in the signup transaction.

**Why keep both:**
The pre-signup capture flow is a meaningful conversion optimization. Founders describe their idea first, then see a preview that motivates them to create an account. `session_id` holds the idea during this anonymous phase. The moment signup completes, the three-row transaction (users + organizations + memberships) fires and the `startup_ideas` row is updated: `org_id` is stamped, `session_id` is retained as an audit trail of the original session.

**Migration rule:**
```sql
-- At signup completion, promote the idea from session to org
UPDATE startup_ideas
SET org_id = :new_org_id
WHERE session_id = :browser_session_id
AND org_id IS NULL;
```

**Consequences:**
- `startup_ideas.org_id` is nullable during the anonymous phase, NOT NULL after signup
- Any query that runs before signup uses `WHERE session_id = ?`
- Any query that runs after signup uses `WHERE org_id = ?` — never session_id again
- A cleanup job should archive or expire unclaimed session_id rows after 30 days

---

*Back to [Index](../index.md)*
