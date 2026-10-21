# TASKS — checked off by the Ralph loop, one phase at a time

Rules for whoever (whatever) is working through this file:
- Work top to bottom. Do not start a Phase N+1 task while any Phase N task is unchecked,
  unless it's explicitly marked "blocked" with a note explaining why, and you've moved on
  to unblock other work.
- Check a box only after its own tests pass and lint is clean.
- If a task is blocked after ~5 focused attempts, mark it `- [ ] (BLOCKED: <reason>)`,
  leave a note in `docs/blockers.md`, and move to the next task instead of looping forever.

## Phase 0 — Scaffolding

- [ ] Repo structure created per SPEC.md (`/frontend`, `/backend`, `/infra`, `/docs`)
- [ ] `infra/docker-compose.yml` runs: postgres, minio, backend, frontend
- [ ] Backend: FastAPI skeleton with a `/health` endpoint, returns 200
- [ ] Backend: Alembic migrations configured, initial migration creates tables from
      SPEC.md's data model
- [ ] Frontend: Vite + React + TS skeleton, loads a blank authenticated shell
- [ ] Backend: pytest configured, one passing smoke test
- [ ] Frontend: basic lint/typecheck configured and passing
- [ ] `docker-compose up` brings up the whole stack with no errors

## Phase 1 — Core (the whole point — build this well)

- [ ] Seed data: realistic Product signals (from mocked GoodDay-shaped data), Finance
      and Operations mocked signals, and 2-3 sample policy/vision entries
- [ ] Ranking engine: given signals across departments, produce a ranked list scored
      by likely impact to vision/revenue (start with an explainable scoring heuristic;
      note in docs where an LLM call should later replace/augment it)
- [ ] Policy-grounded reasoning: for the top-ranked signal, generate a rationale that
      explicitly references which policy/vision entry it's weighed against
- [ ] `POST /api/briefing/today` (or equivalent) returns: top item, rationale, cited
      policy, confidence, and a list of what data sources were and weren't available
- [ ] Tests: ranking engine has unit tests covering at least — Product-only signals,
      cross-department comparison, and a "stale/missing data" case
- [ ] Definition of done for Phase 1: hitting the briefing endpoint with seeded data
      returns a top-priority recommendation with a real policy citation, not a stub

## Phase 2 — Supporting (build simply, keep it thin)

- [ ] `user` table + minimal auth (can be a simple seeded-user login for the POC —
      do not build full OAuth/SSO for this phase)
- [ ] Persona scoping: Product Owner queries can only ever return Product department
      data, enforced in the query/repository layer with a test proving cross-department
      leakage is impossible, not just unlikely
- [ ] Approval workflow: `recommendation` → `decision` state machine (approve / reject /
      disagree), reject/disagree requires a reason string, all recorded with timestamps
- [ ] Briefing formatting: same underlying recommendation rendered two ways — CEO view
      (cross-department) and Product Owner view (their department only)
- [ ] Tests: approval workflow state transitions, persona scoping isolation

## Phase 3 — Generic (wire up, do not hand-build)

- [ ] GoodDay connector: authenticate against GoodDay REST API v2 with a token from
      env config, pull Product tasks/projects, map into `signal` rows. Use their
      documented endpoints directly — no custom scraping.
- [ ] Audit logging: middleware or decorator that writes an `audit_log` row whenever a
      recommendation is shown or a decision is recorded. Keep this generic/reusable,
      not bespoke per-endpoint logic.
- [ ] Confirm: no endpoint anywhere sends email, writes back to GoodDay, or calls any
      external write API. Add a test/lint rule that fails CI if an outbound write call
      is introduced outside the explicitly allowed storage layer.

## Phase 4 — Integration & demo readiness

- [ ] End-to-end seed script: one command builds a believable week of data across
      Product/Finance/Ops
- [ ] End-to-end test: seed → call briefing endpoint → approve the recommendation →
      confirm it shows up in the audit log → confirm Product Owner login cannot see
      Finance/Ops data
- [ ] Frontend: minimal CEO briefing screen + Product Owner screen wired to the real
      endpoints (polish is not required — clarity is)
- [ ] `docs/blockers.md` reviewed — no open blockers on Phases 0-3

## Completion

When every box above is checked (or explicitly and justifiably marked BLOCKED with
Phase 4 still reached), output:

<promise>COMPLETE</promise>
