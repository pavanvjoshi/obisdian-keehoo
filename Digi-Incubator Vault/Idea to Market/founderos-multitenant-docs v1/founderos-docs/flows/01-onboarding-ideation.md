# Flow 01 — Founder Onboarding & Ideation

> Riya's complete journey from landing page to conviction score.

---

## The full flow

```mermaid
sequenceDiagram
    actor R as Riya
    participant FE as Frontend
    participant API as API
    participant DB as Database
    participant AI as AI Agents

    Note over R,AI: Phase 1 — Before login
    R->>FE: Lands on homepage, selects Founder
    R->>FE: Answers idea questions (sector, problem, target)
    FE->>FE: Stores answers in browser session\n(not saved to DB yet)

    Note over R,AI: Phase 2 — Login prompt
    FE->>R: Shows idea preview + "Save your progress"
    R->>API: POST /auth/signup {email, password}
    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT users
    API->>DB: INSERT organizations (startup)
    API->>DB: INSERT memberships (owner)
    API->>DB: COMMIT
    API->>DB: INSERT startups\n(org_id, name, stage:idea\nis_discoverable:false)
    API-->>FE: Session token + org_id

    Note over R,AI: Phase 3 — Dashboard
    R->>FE: Sees startup dashboard (empty but structured)
    R->>API: POST /journey/start
    API-->>R: Ideation phase begins

    Note over R,AI: Phase 4 — Ideation & AI
    R->>API: POST /agent-runs\n{agent_type: market_research}
    API->>DB: INSERT agent_runs\n(org_id, user_id, status:running)
    API->>AI: Trigger market research agent
    AI-->>API: Research complete
    API->>DB: UPDATE agent_runs\n(status:completed, output_payload:{...})

    API->>AI: Trigger conviction scorer
    AI-->>API: Score: 72
    API->>DB: UPDATE startups SET conviction_score=72
    API->>DB: INSERT startup_milestones\n(title: Conviction Score 72, is_public:false)

    API-->>R: Report + score + verdict (Go / Pivot / Kill)

    Note over R,AI: Phase 5 — Lean Canvas
    R->>API: POST /agent-runs {agent_type: lean_canvas}
    API->>DB: INSERT agent_runs (org_id, user_id)
    API->>AI: Lean Canvas agent (pre-fills from earlier answers)
    AI-->>R: 9-section canvas, Riya refines each section

    Note over R,AI: Phase 6 — Observatory opt-in (weeks later)
    R->>API: PATCH /startups/{id} {is_discoverable: true}
    API->>DB: UPDATE startups SET is_discoverable=true
    Note over DB: Startup now appears in\nall Observatory queries
```

---

## Why capture the idea before login?

Forcing signup before idea capture loses ~60% of founders at the top of the funnel. By capturing the idea first, FounderOS gives Riya a reason to complete registration — her idea is already there waiting.

The idea data is held in browser session storage. The moment signup completes, it is flushed to the database under the new `org_id`.

---

## Data state at the end of ideation

```mermaid
flowchart TD
    ORG[organizations\nuuid-org-001\nRural EdTech]
    U[users\nuuid-riya-001\nactive_persona: founder]
    M[memberships\nriya → org-001\nrole: owner]
    S[startups\norg_id: org-001\nconviction_score: 72\nis_discoverable: false]
    AR1[agent_runs\nmarket_research\nstatus: completed]
    AR2[agent_runs\nlean_canvas\nstatus: completed]
    SM[startup_milestones\nConviction Score: 72\nis_public: false]

    ORG --> S
    ORG --> AR1
    ORG --> AR2
    ORG --> SM
    U --> M --> ORG
    U --> AR1
    U --> AR2
```

---

*Back to [Index](../index.md) · Next: [Multi-User Invite](./02-multi-user-invite.md)*
