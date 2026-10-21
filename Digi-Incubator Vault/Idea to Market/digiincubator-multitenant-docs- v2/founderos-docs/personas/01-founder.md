# Persona 01 — Founder

> The primary persona. Everything else on the platform exists to serve or observe the founder's journey.

---

## Who is this?

An entrepreneur building a startup. Could be solo or have a team. The startup — not the individual — is the tenant.

**Real example used in this documentation:** Riya, a teacher from Pune building an offline-first EdTech app for rural Maharashtra.

---

## Signup creates three rows simultaneously

```mermaid
sequenceDiagram
    participant R as Riya (browser)
    participant API as FounderOS API
    participant DB as Database

    R->>API: POST /auth/signup {email, password, persona: "founder"}
    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT users (uuid-riya, email, active_persona: founder)
    API->>DB: INSERT organizations (uuid-org-001, "Riya's Startup", org_type: startup)
    API->>DB: INSERT memberships (riya → org-001, role: owner)
    API->>DB: COMMIT
    API-->>R: session token + org_id
```

All three inserts happen in one transaction. If any step fails, all three roll back. No ghost accounts, no orphaned orgs.

---

## The ideation journey

```mermaid
flowchart TD
    A[Founder lands on FounderOS] --> B[Answers idea questions\nbefore login]
    B --> C{First time?}
    C -->|Yes| D[Signup prompt\nIdea saved in session]
    C -->|No| E[Login\nIdea loaded from DB]
    D --> F[3-row transaction\nusers + orgs + memberships]
    E --> F
    F --> G[Startup dashboard created\norg_id = uuid-org-001]
    G --> H[Founder clicks Start Journey]
    H --> I[Ideation phase begins]
    I --> J[Agent runs market research\nAGENT_RUNS row created]
    J --> K[Report generated]
    K --> L[Conviction Score calculated\n0–100]
    L --> M{Score verdict}
    M -->|High| N[Go — continue to Lean Canvas]
    M -->|Medium| O[Pivot — refine the idea]
    M -->|Low| P[Kill — start fresh]
    N --> Q[Lean Canvas completed\n9 sections via AI]
    Q --> R[Startup dashboard fills up\nAll data under org_id]
```

---

## Key data decisions

### planning_data always has two IDs

```
org_id  = who OWNS the output  (the startup)
user_id = who TRIGGERED the run (the individual member)
```

This table is called `planning_data` in the codebase — it is the direct equivalent of the `agent_runs` concept. One row per agent execution, never overwritten.

If Riya runs market research and Arjun runs it again two weeks later — two rows, same `org_id`, different `user_id`. Neither is deleted. The startup sees a chronological history of all runs, labelled by who triggered them.

| Column | What it holds |
|---|---|
| `panel` | The agent type: `market_research`, `lean_canvas`, `conviction_scorer`, `gtm`, `financial_projections`, `market_sizing` |
| `output_data` | JSONB — the AI agent's full output |
| `user_selections` | JSONB — the founder's edits and choices on top of the AI output |
| `minio_key` | Object storage key for large outputs (PDFs, slide decks) |
| `org_id` | Tenant key — the startup org that owns this run |
| `user_id` | Who pressed the button — audit trail, not ownership |

### is_discoverable controls all external visibility

One boolean on the `startups` table. When `false` (default), the startup is invisible to investors, banks, and government. When `true`, it appears in the Observatory for all three audiences simultaneously. No separate opt-in per audience.

### conviction_score lives on the startup, not the user

If Riya leaves and Arjun continues, the score travels with the startup. It is an assessment of the idea, not the person.

---

## Multi-user flow

When a second founder joins:

```mermaid
sequenceDiagram
    participant R as Riya
    participant API as API
    participant DB as Database
    participant A as Arjun (email)

    R->>API: POST /invites {email: arjun@..., role: admin}
    API->>DB: INSERT invites (org-001, arjun@..., role: admin, token: abc123)
    API->>A: Send invite email with token link

    Note over A: Arjun clicks link

    A->>API: POST /invites/redeem {token: abc123}
    API->>DB: Check: does arjun@... have a users row?

    alt Arjun has an account
        API->>DB: INSERT memberships (arjun → org-001, admin)
        API->>DB: UPDATE invites status=accepted
    else Arjun is new
        API->>DB: BEGIN TRANSACTION
        API->>DB: INSERT users (arjun)
        API->>DB: INSERT memberships (arjun → org-001, admin)
        API->>DB: UPDATE invites status=accepted
        API->>DB: COMMIT
    end

    API-->>A: Redirect to org-001 dashboard
```

The invite redemption path is identical whether Arjun has an account or not. The only difference is whether a `users` row is created first.

---

## Role permissions

| Action | owner | admin | member |
|---|---|---|---|
| View all startup data | ✓ | ✓ | ✓ |
| Run AI agents | ✓ | ✓ | ✓ |
| Invite members | ✓ | ✓ | ✗ |
| Flip is_discoverable | ✓ | ✗ | ✗ |
| Delete the startup | ✓ | ✗ | ✗ |
| Remove members | ✓ | ✓ | ✗ |

---

## Multiple startups (second idea)

One user, multiple orgs:

```mermaid
flowchart LR
    U[Riya · user-001]
    O1[Rural EdTech · org-001\nowner]
    O2[UPSC AI · org-002\nowner]

    U -->|membership row 1| O1
    U -->|membership row 2| O2

    O1 --> D1[conviction_score: 72\nagent_runs: 4\nmilestones: 3]
    O2 --> D2[conviction_score: null\nagent_runs: 0\nmilestones: 0]
```

Switching workspaces changes the active `org_id` in the session. All queries instantly reflect the new org. Data never bleeds between orgs.

---

*Back to [Index](../index.md) · Next: [Investor — VC](./02-investor-vc.md)*
