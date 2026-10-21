# AI Product Build Playbook

A reusable methodology for building any software product with an AI coding agent (Claude Code) — fast, consistent, and resilient across sessions and teammates. Product-agnostic: the structure below works for fintech, logistics, healthtech, SaaS, anything. The Keehoo ERP is used throughout as the worked example.

> **The one-line idea:** put the product's knowledge into a small set of files with clear roles, so the agent never re-derives context, never drifts, and any fresh session or person can continue the work. This is *context engineering* — and it is what separates a fast AI build from a slow one.

---

## 1. Why This Is Faster

A coding agent is only as good as the context it's given. Teams lose time three ways:
1. **Re-explaining** the product every session (context dies with the chat).
2. **Drift** — two files (or two sessions) describe the same rule differently, and the agent picks the wrong one.
3. **Re-deriving** conventions per task instead of reusing them.

This methodology removes all three: knowledge lives in files (not chat), each fact has exactly one home, and conventions are written once and referenced everywhere. The payoff compounds — the 14th module is faster than the 1st because everything it needs already exists.

---

## 2. The Four Document Classes

Every doc in the system belongs to exactly one class. This is the core mental model.

| Class            | Job                                                                                                                                                          | When loaded              | Changes    | ERP examples                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------- | ---------------------------------------------------------------------------------------- |
| **Constitution** | Non-negotiable rules + a map to everything else. Small.                                                                                                      | **Always** (auto-loaded) | Rarely     | `CLAUDE.md` (<200 lines)                                                                 |
| **Reference**    | Conventions & sources of truth — incl. the **cross-module contract registry**.                                                                               | On demand                | Rarely     | Backend/Frontend guides, `DDL.md`, overviews, cross-module contracts (`HCM_BUILD.md §5`) |
| **Meta**         | Teaches the agent *how to produce* Work docs.                                                                                                                | When producing           | Rarely     | `MODULE_SPEC_GUIDE.md`, process runbook of phase prompts                                 |
| **Work**         | The per-unit output that drives the build: **backend spec · UI spec · build prompts · mock · tests** (one spec file with two sides, or split — your choice). | Per task                 | Constantly | per-module specs, build prompts, mockups                                                 |

**Why it matters:** if you can't say which class a doc is, it's doing two jobs and will bloat or drift. One doc, one class, one job.

**Two levels of artifact.** *Intra-module* = the Work artifacts above, owned by one unit. *Inter-module* = **cross-module contracts** (events, shared entities, ordering) that span units and therefore **cannot live inside any single module's spec** — they get one home in a Reference-class registry, and each module spec *references* it. This is where integration bugs hide, so it is explicit, not implicit.

---

## 3. The Seven Principles

1. **Small always-on index.** The Constitution (`CLAUDE.md`) holds only rules that override the agent's defaults + a navigation map. Keep it tiny (<200 lines) so it's always affordable in context. Everything else is reached *through* it.

2. **Single source of truth per concern.** The data model lives in one file. The conventions live in one file. Anything else that needs them **references by name — never copies.** Duplication is how drift starts.

3. **Layered fidelity (vertical axis).** Knowledge flows downhill, gaining detail:
   `idea → conventions → spec → build prompt → artifact`. Each layer derives from the one above.

4. **Per-unit replication (horizontal axis).** Each unit of work (a "module", "feature", "screen-set" — whatever your product's natural unit is) repeats the same `spec → prompt → build` cycle. **Meta docs keep every repetition consistent.**

5. **Meta-docs make it scale.** A doc that teaches the agent *how to write a spec* is why your 14 modules come out uniform — and why a teammate's output matches yours. Invest here; it pays back per unit.

6. **Session-independence.** Knowledge is in files, not chat. A cold session or a new teammate resumes by reading files + running the runbook prompts. Never let critical knowledge live only in a conversation.

7. **Convention over re-derivation.** Shared components, patterns, and business rules are defined once and inherited. The agent imports them; it does not reinvent them per unit.

---

## 4. The End-to-End Workflow (with gates)

Map your product to standard SDLC, with **cheap approval gates before expensive artifacts** so rejections are caught in text, not in finished screens.

```
Idea & Strategy   → product/domain overview            [PO sign-off]
Conventions       → dev guides + data-model truth        (stable, set once)
Cross-module      → contract registry (events/contracts) [frozen before dependents]
Meta              → spec-guide + process runbook         (set once)
Per unit:
  Requirements    → requirements + acceptance criteria       [PO gate — cheap]
  Spec            → one spec, two sides: UI + backend
                    + cross-module touchpoints (emit/consume) [PO gate — cheap]
  Build (backend) → implemented from the spec's backend side
  Build (frontend)→ spec UI side → build prompts → mock
  Review          → mock + endpoints + touchpoints vs spec    [PO conformance gate]
  Development     → wire frontend to real APIs                → QA / UAT
```

**Two anti-rework rules:**
- Gate the cheap stages first — never let the first thing a stakeholder sees be a finished mock set.
- Approve the **pattern once** (an anchor unit), then later units inherit it and need only a quick conformance check.

**Requirements are usually on you to derive, not invent** — pull them from: (1) the system of record / existing product, (2) competitor table-stakes, (3) user stories, (4) locked decisions. Every screen element must trace to a requirement; no orphans.

---

## 5. Bootstrap Order — Setting Up a New Product

Create the docs in this order. Each is cheap and unblocks the next.

1. **Product overview** (Reference) — what it is, who it's for, the domains, architecture at altitude. *Why first: every other doc inherits this framing.*
2. **Constitution** (`CLAUDE.md`) — the rules + the map. Point it at everything you'll create.
3. **Convention guides** (Reference) — backend build guide, frontend build guide: stack, folder structure, patterns, the "never/always" rules.
4. **Data-model truth** (Reference) — the canonical schema/DDL. One file, referenced by all.
5. **Cross-module contract registry** (Reference) — every inter-module event/contract: name, emitter, consumers, payload, ordering/idempotency rule. Freeze the contracts a dependent module needs *before* that module's spec.
6. **Spec guide** (Meta) — the instruction manual for writing a unit's spec (the skeleton + the quality bar).
7. **Process runbook** (Meta) — the copy-paste phase prompts that drive each step, session-independently.
8. **Per-unit Work docs** — then, unit by unit, in dependency order: requirements → spec → prompts → build → review.

Do an **anchor unit first** (the one that exercises the most shared patterns) and lock the visual/architectural language on it before mass-producing the rest.

---

## 6. Rules That Keep It Healthy

- **Constitution stays small.** If it grows past ~200 lines, push detail into a Reference doc and link it.
- **Never duplicate a rule.** Define once; reference by name. If you must restate, say "see X" — don't copy.
- **A new schema/concern justifies a new Reference doc — a new screen does not.** Don't spawn docs per artifact.
- **Cross-module contracts live in one registry, not in module specs.** A module *references* the contracts it emits/consumes; it never defines a shared event/payload inside its own spec. Define the contract before the dependent module is specced.
- **Deltas, not copies.** When extending an existing system (e.g. a companion app), write only what's *different* and inherit the rest. (ERP example: the Pulse mobile app's guide extends — not replaces — the desktop frontend guide.)
- **Meta docs are the agent's onboarding.** Keep them runnable: a teammate should produce a correct spec by following the spec-guide alone.
- **Knowledge in files, decisions in files.** Locked product decisions get written down (with the *why*), so no session re-litigates them.

---

## 7. Anti-Patterns (and the fix)

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Bloated `CLAUDE.md` | Burns context every turn; rules get skimmed | Keep it an index; push detail to Reference |
| Same rule in two docs | Agent follows the stale one → drift | Single source of truth + reference by name |
| Knowledge only in chat | Dies on session end; teammates can't resume | Put it in files; use a runbook |
| Spec invents requirements | Builds the wrong thing confidently | Derive requirements from sources; trace every element |
| Jump straight to finished mocks | Expensive rework when rejected | Cheap gates first (requirements, spec) |
| One giant doc per unit | Unmaintainable, agent loses the thread | Split by class; spec ≠ prompt ≠ mock |
| Re-deriving conventions per unit | Inconsistent output across units | Define shared patterns once; inherit |

---

## 8. How to Tell It's Working

- **Traceability:** pick any element in a finished artifact → it maps to a requirement → maps to a source. No orphans.
- **Cold-start test:** a brand-new chat (or teammate) produces a correct unit using only the files + runbook. If they need to ask you, a doc is missing something.
- **Rework curve:** after the anchor unit, later units need detail fixes only — not direction changes.
- **Onboarding speed:** a new PO/dev is productive after reading Constitution → overview → one guide.

---

## Appendix A — Constitution (`CLAUDE.md`) Skeleton

```markdown
# CLAUDE.md — <Product>

## Product
<one paragraph: what it is, who it's for, scale, key constraint>

## Authoritative Guides
| Guide | Who reads it | Covers |
| <backend guide> | backend devs | conventions, patterns |
| <frontend guide> | frontend devs | conventions, patterns |
| <overview> | all | domains, architecture |

## Repository Layout
<tree — where things live>

## Non-Negotiable Rules
- <rule that overrides the agent's default behaviour>
- <data isolation / security / money / dates / logging rules>
- Never: <the top mistakes for this product>

## Pitfalls
| Pitfall | Consequence |

## File Navigation
| What | Where |
```
Keep under ~200 lines. It's a map + a constitution, not a manual.

---

## Appendix B — Spec Guide (Meta) Skeleton

```markdown
# <Unit> Spec Guide — How to Write a Unit's Spec

## Files to read first (in order)
1. Constitution  2. Overview  3. Conventions guide  4. Data-model truth  5. Cross-module contract registry

## File 1 — <unit>.md (the spec — two sides)
- REQUIREMENTS (traced to source; no orphans)   ← PO gate
- ACCEPTANCE CRITERIA (Given/When/Then → UAT)     ← PO gate
- PURPOSE
- UI BUILD (frontend): screens/surfaces, reference shared components by name, states
- BACKEND BUILD: API / DATA CONTRACTS (every field → source; declare scope), business rules (cite shared; never duplicate)
- CROSS-MODULE TOUCHPOINTS: events/contracts this unit emits & consumes — **reference the registry, never redefine**

## File 2 — <unit>-prompts (frontend build instructions)
- header (stack, constraints), one screen/component per prompt, states included

## Quality Bar (before "done")
- [ ] every element traces to a requirement
- [ ] nothing redefined that's defined in a Reference/shared doc
- [ ] every field → a data-model source
- [ ] cross-module touchpoints declared and consistent with the registry
```

---

## Appendix C — Process Runbook (Meta) Skeleton

```markdown
# Process Runbook — Copy-Paste Phase Prompts

Phase order: P0 (once) → per unit: P1 → P2 → [gate] → P3 → P4 → P5 → [gate] → dev

## P1 — Requirements (per unit) — GATE
You are gathering requirements for <unit>.
Read first: <constitution>, <overview>, <rationale>, <conventions>, <system-of-record>.
Produce: the Requirements + Acceptance Criteria block.
Rules: derive don't invent; trace each to a source; STOP for sign-off.

## P2 — Spec ... ## P3 — Build prompts ... ## P4 — Build ... ## P5 — Review
(each: read-first list, single <unit> input, output file, the gate)

## Gate Log
| Unit | P1 | P2 | P3 | P4 | P5 | Notes |
```
The runbook is what makes the process **session-independent** — paste a phase prompt into any fresh chat, fill the `<unit>` blank, and it runs identically.

---

## Appendix D — New-Product Checklist

```
[ ] Product overview written (what/who/domains/architecture)
[ ] CLAUDE.md constitution (rules + map, <200 lines)
[ ] Backend conventions guide
[ ] Frontend conventions guide
[ ] Canonical data model (one file)
[ ] Spec guide (how to write a unit spec)
[ ] Process runbook (phase prompts P0–P5)
[ ] Anchor unit built end-to-end; pattern locked
[ ] Remaining units via the runbook, in dependency order
```

---

*AI Product Build Playbook v1.0. Adopt the structure; fill in your product's specifics. The methodology is transferable — the instantiation is yours.*
