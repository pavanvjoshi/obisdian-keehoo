# Worked Example — One Module, End to End

A companion to `AI_Product_Build_Playbook.md`. It traces a **single module** through every document layer so the method becomes concrete. We use **Leave (apply → manager approves)** because an approval workflow is the most universal pattern in business software — map it to whatever your product's equivalent is.

## How to read this

Each layer below shows a **short excerpt** of the real artifact, tagged:

- 🟦 **METHODOLOGY** — copy this *shape* into your product.
- 🟧 **PRODUCT-SPECIFIC** — this is ERP content shown only to illustrate; **yours will differ**. Do not copy verbatim.

> The excerpts are deliberately trimmed. The point is to see how the layers connect, not to read full files.

---

## The unit: "Leave"

An employee applies for leave on their phone; their manager approves it. One module, two roles, one approval. Every layer below is *this same module* at increasing fidelity.

🟦 **METHODOLOGY:** pick your product's simplest end-to-end unit as your *anchor* and trace it first. It locks the pattern the rest inherit.

---

## Layer 0 — Where it sits (the four classes)

Before writing anything for Leave, these already exist (created once for the whole product):

| Class        | Doc                           | What Leave inherits from it                   |
| ------------ | ----------------------------- | --------------------------------------------- |
| Constitution | `CLAUDE.md`                   | the rules + the map                           |
| Reference    | conventions guide, data-model | how to build, the leave tables                |
| Meta         | spec-guide, runbook           | how to write Leave's spec + the phase prompts |


🟦 **METHODOLOGY:** a unit never starts from a blank page — it *inherits*. If yours does start blank, your Reference/Meta layer is missing.

---

## Layer 1 — Requirements + Acceptance Criteria  (PO gate, cheap)

Derived, not invented — from the existing system + competitor table-stakes + user stories.

```
## REQUIREMENTS (Leave)
R1. As an employee, I can apply for leave: type, date range, reason.   [src: desktop Leave module]
R2. As an employee, I see my balance per type before I confirm.        [src: competitor table-stakes]
R3. As a manager, I approve/reject a request with a reason.            [src: desktop approval flow]
R4. Balance is deducted on APPROVAL, not on application.               [src: locked business rule]

## ACCEPTANCE CRITERIA
AC1. Given 8 EL balance, when I apply for 3 days, then I see "3 days · 5 remaining" before confirm.
AC2. Given a pending request, when the manager approves, then balance reduces and status = Approved.
```

🟦 **METHODOLOGY:** every requirement cites a **source** (no invented features); acceptance criteria are Given/When/Then so they become your UAT tests later. **This is the first gate — sign off before any screen.**
🟧 **PRODUCT-SPECIFIC:** "EL balance", "deduct on approval" — your domain's rules replace these.

---

## Layer 2 — Spec (PO gate, cheap)  *excerpt*

The design intent. **One spec file, two sides** — a *UI Build* section (frontend) and a *Backend Build* section (API + data + rules) — exactly as the spec-guide (Meta) prescribes. Each side cites shared components/rules by name; never redefines them. *(In the ERP these are items 4 + the UI half of the module spec.)*

```
## UI BUILD (frontend)
- Leave Home: balance cards (StatTile) + history list (ListRow + StatusBadge).
- Apply: FAB → BottomSheet form (type, dates, reason) → balance preview → Submit.
- States: empty / loading / error per screen.

## BACKEND BUILD (API + data + rules)
POST /api/me/leave            scope: SELF   → creates PENDING request (balance.pending += days)
GET  /api/me/leave/balances   scope: SELF   → per-type entitled/used/pending/remaining
Tables: leave_applications, leave_balances, leave_types     (see DDL)
Rules: day count server-side; approval = status + balance + event in ONE transaction.

## CROSS-MODULE TOUCHPOINTS   (reference the registry — never redefine here)
Emits:    LeaveApproved  → Attendance marks each leave date ON_LEAVE   (see HCM_BUILD §5)
Consumes: (none)
```

🟦 **METHODOLOGY:** one spec, **two sides** (UI + backend) **plus a cross-module touchpoints section**. The `LeaveApproved` contract is *referenced* from the registry, not defined here — Attendance (the consumer) reads the same one source. Both sides cite shared components/rules; every field traces to the data-model. **Second gate — sign off before building.**
🟧 **PRODUCT-SPECIFIC:** the endpoints, scopes, tables, the "deduct on approval" transaction, and the `LeaveApproved` event are ERP's.

---

## Layer 3 — Build (two paths from the one spec)

The two sides of the spec build along **two separate paths** — they are not one combined step.

**3a · Backend build plan** — implemented **directly from the Backend Build section + the backend conventions guide.** The spec *is* the backend build plan; there is no separate prompt. Handlers, queries, and the approval transaction are written and unit-tested against the acceptance criteria. *(ERP: the module build specification, item 4.)*

**3b · Frontend build prompts** — the UI Build section is turned into copy-paste prompts, one per screen, which produce the mock. *(ERP: the screen-build prompts, item 5.)*

```
Build the Leave Apply screen. Mobile-first 390px. Use shared components (Card,
BottomSheet, StatTile, FAB) — do not recreate them.
- Balance cards (StatTile) from sample data: EL 12, SL 6, CL 4.
- FAB opens BottomSheet "Apply Leave": Type, Date range, Reason.
- Live "3 days · 5 remaining" preview before Submit.
- Empty / loading / error states. UI only — no real API calls.
```

🟦 **METHODOLOGY:** one spec → **two build paths**. Backend builds from the spec directly; frontend goes spec → prompts → mock. Both reuse shared conventions/components. Frontend prompts build UI only; real API wiring happens in development.
🟧 **PRODUCT-SPECIFIC:** the React/mobile stack and the oapi-codegen backend pipeline are ERP's; your stack differs.

---

## Layer 4 — Build outputs (mock + tested endpoints)

- **Frontend:** running the prompts produces the actual screens — a lightweight **mock**, openable directly. The visual reference, not the final product. *(ERP: item 10.)*
- **Backend:** the artifact is **working, unit-tested endpoints** built from the backend spec — no mock; its "proof" is the passing tests against the acceptance criteria.

🟦 **METHODOLOGY:** frontend's artifact is a mock for sign-off; backend's artifact is tested endpoints. Both come from the same spec, so they stay in lock-step.

---

## Layer 5 — Review (PO conformance gate)

Both build outputs are checked **against the spec** — the mock for the frontend, the endpoints/tests for the backend. All three (requirements, spec, build) trace to the same source, so mismatches surface here, in design.

```
CONFORMANCE — Leave
Frontend (mock vs UI spec):
  R1 apply form ........... PASS    R2 balance preview ...... PASS
  AC1 "3 days · 5 remaining" PASS   shared components used .. PASS
Backend (endpoints vs spec):
  POST /api/me/leave creates PENDING ...... PASS
  AC2 approval deducts balance (1 txn) .... PASS
Cross-module (touchpoints vs registry):
  LeaveApproved emitted on approval ....... PASS (payload matches HCM_BUILD §5)
Decision: APPROVE (detail fixes only)
```

🟦 **METHODOLOGY:** a mismatch is caught in *design/build review*, not after development. After your anchor unit is approved, later units need only conformance checks — not direction changes. **This is what kills rework.**

---

## Now do it for your product

Map Leave's shape onto your first module:

| Leave (example) | Your module |
|---|---|
| Employee applies | <who initiates> |
| Manager approves | <who approves> |
| Balance deducted on approval | <your core business rule> |
| `/api/me/leave` (SELF scope) | <your endpoint + access rule> |
| StatTile, BottomSheet (shared) | <your shared components> |
| LeaveApproved → Attendance (cross-module) | <your unit's emit/consume — from your registry> |

Then run the **runbook**: P1 requirements → P2 spec → [gate] → P3 prompt → P4 build → P5 review → [gate] → development. Pick your simplest approval/list-detail feature as the anchor; lock the pattern there; inherit it everywhere after.

---

*Worked Example v1.0 — companion to AI_Product_Build_Playbook.md. The 🟦 shapes are the method (copy them); the 🟧 content is ERP illustration (replace with yours).*
