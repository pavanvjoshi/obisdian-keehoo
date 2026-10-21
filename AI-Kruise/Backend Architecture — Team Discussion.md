
## Why are we here?

Adding new features has become slow and risky.
A change in one place breaks something unrelated.
Writing tests is harder than writing the feature itself.

We need to agree on a better structure before the codebase grows further.

---

## 1. What we designed originally

A simple 3-layer structure:

```
HTTP Request
    ↓
Router      — receives the request, sends the response
    ↓
Service     — handles the business logic
    ↓
Repository  — talks to the database
```

Clean on paper. Each layer has one job.

---

## 2. What we actually have today

The layers exist as folders but the walls between them broke down over time.

**What happened:**

- Services talk to the database directly — the repository layer is mostly empty
- Services import other services, which import other services
- To test one thing, you need the whole system running

**What this feels like:**

- You change the workflow service → something breaks in forms
- You want to test a single rule → you need a live database
- You add a feature → you're not sure which files to touch

---

## 3. What we are proposing

**Hexagonal Architecture** — one idea, three words:

> Business logic should not know where its data comes from.

Instead of services reaching into the database directly, we define a contract:
*"I need something that can fetch a form and save a form."*

The database adapter fulfills that contract.
A fake in-memory adapter fulfills the same contract for tests.

**Three zones:**

```
┌─────────────────────────────────────────┐
│              DOMAIN                      │
│   Pure business rules. No database.     │
│   No email. No HTTP. Just logic.        │
└────────────┬──────────────┬─────────────┘
             │              │
     ┌───────▼──────┐  ┌────▼────────────────┐
     │  API Routers │  │  Database / Email /  │
     │  (entry in)  │  │  LLM  (exit out)     │
     └──────────────┘  └─────────────────────┘
```

**The one rule everyone must remember:**

> Domain code never imports from the database or HTTP layer. Ever.

---

## 4. How we build and test one domain (the proof)

We start with **Forms** — small, self-contained, already partially structured.

**Build order:**

1. Define what a Form looks like (the data shape)
2. Define what the service needs — *"give me a form by ID, save a form"* (the contract)
3. Write the business logic against that contract
4. Write the real database adapter that fulfills the contract
5. Write a fake adapter for tests — just a dictionary in memory
6. Thin down the API router — it just calls the service now

**What a test looks like after this:**

- Create a fake repository with some data in it
- Call the service method
- Check the result

No database. No network. Runs in under a second.

**What this proves to the team:**

- The pattern works for our stack
- Tests are simple to write and fast to run
- Adding a new feature means touching predictable, isolated files

---

## 5. Version control plan

**Where the code lives:**
`repo.corp.infokalash.com — keehoo_ai_kruise_backend`

**Branch strategy:**

```
main  (stable, always deployable)
  │
  └── poc/hexagonal-architecture   ← all POC work goes here
```

`main` and all active branches (`review-p1`, `team-AI/staging`) are untouched.

**How we work:**

| Step | Action |
|---|---|
| 1 | Branch off `main` |
| 2 | Build the Forms domain in the new structure |
| 3 | Write tests — all passing |
| 4 | Open a merge request for team review |
| 5 | If approved, agree on the migration order for remaining domains |

**Migration order after POC is approved:**

1. Forms ← POC (this branch)
2. Workflow
3. Execution engine
4. Auth, Notifications
5. Remove the old flat service files

**Ground rules during migration:**

- No mixing feature work and structural changes in the same branch
- Every migrated domain needs tests before the MR opens
- Old code stays working until the new version is fully wired
- `main` must remain deployable at all times

---

## What we need to decide today

1. Does the team agree with the direction?
2. Do we start the POC on Forms this sprint?
3. Who reviews the merge request before it goes to `main`?

