You are building the AI Chief of Staff POC. This prompt does not change between
iterations — your own past work, committed to git and checked off in TASKS.md, is
your memory. Start every iteration by reading the current state, not by assuming.

## Every iteration, in order:

1. Read `docs/SPEC.md` in full. It is ground truth for scope, stack, and guardrails.
2. Read `docs/TASKS.md`. Find the first unchecked box, working strictly top to bottom
   through the phases (do not skip ahead to a later phase while an earlier one has
   unchecked, non-blocked items).
3. Run the existing test suite and note what's currently passing/failing before you
   change anything.
4. Implement the one task you picked, following TDD:
   a. Write a failing test that captures the requirement
   b. Implement the minimum code to pass it
   c. Run the tests
   d. If anything fails, fix and re-run — do not move on with red tests
   e. Refactor for clarity once green
5. Check that your change doesn't violate any guardrail in SPEC.md — in particular:
   no HR data anywhere, no outbound writes/emails, persona scoping enforced at the
   query layer, every recommendation carries a policy citation and confidence.
6. Update `docs/TASKS.md`: check the box you completed. If you discovered new
   necessary sub-steps, add them under the same phase rather than skipping them.
7. Commit with a clear message describing what changed and why.
8. If the task you picked is genuinely blocked after real effort, mark it
   `(BLOCKED: <specific reason>)` in TASKS.md, log it in `docs/blockers.md`, and move
   to the next unchecked task in the current phase instead of retrying indefinitely.

## Rules

- Never work on a Phase N+1 task while Phase N has unchecked, non-blocked items.
- Never invent scope beyond SPEC.md. If something seems missing, note it in
  `docs/blockers.md` under "open questions" rather than guessing and building it.
- Never build a custom connector/scraper for anything that has a documented API
  (GoodDay) — call the real API.
- Never add an HR table, HR field, or HR data source, even temporarily, even for
  testing convenience.
- Keep Supporting and Generic work deliberately simple. If you notice yourself adding
  configurability, extensibility, or polish beyond what Phase 2/3 tasks ask for, stop
  and put that effort into Phase 1 instead.

## When you're done

Only after every box in `docs/TASKS.md` is checked (or justifiably marked BLOCKED)
and Phase 4's end-to-end test passes, output exactly:

<promise>COMPLETE</promise>

Do not output this early. Do not output it if any Phase 0-3 core functionality is
stubbed, mocked beyond what SPEC.md explicitly allows, or untested.
