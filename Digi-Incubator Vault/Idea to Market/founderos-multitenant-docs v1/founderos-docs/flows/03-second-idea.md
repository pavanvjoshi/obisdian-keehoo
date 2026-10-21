# Flow 03 — Second Idea (Multiple Workspaces)

> One founder, two startups, zero data contamination.

---

## Creating a second startup

```mermaid
sequenceDiagram
    participant R as Riya
    participant API as API
    participant DB as Database

    R->>API: POST /organizations {name: "UPSC AI", org_type: startup}
    API->>DB: INSERT organizations (uuid-org-002, "UPSC AI", startup)
    API->>DB: INSERT memberships (riya → org-002, owner)
    API->>DB: INSERT startups (org_id: org-002, stage: idea)
    API-->>R: Workspace created — redirect to org-002 dashboard

    Note over DB: org-001 (Rural EdTech) untouched\norg-002 (UPSC AI) starts fresh
```

---

## Workspace isolation

```mermaid
flowchart LR
    U[Riya · user-001]

    U -->|membership 1\nrole: owner| O1
    U -->|membership 2\nrole: owner| O2

    subgraph O1["org-001 — Rural EdTech"]
        S1[conviction_score: 72\nstage: mvp\nis_discoverable: true]
        A1[agent_runs × 4]
        M1[milestones × 3]
    end

    subgraph O2["org-002 — UPSC AI"]
        S2[conviction_score: null\nstage: idea\nis_discoverable: false]
        A2[agent_runs × 0]
        M2[milestones × 0]
    end
```

Switching workspaces changes the active `org_id` in the session. Every subsequent query uses the new `org_id`. The two startups never share data.

---

## Arjun and the second startup

Arjun is a co-founder of Rural EdTech (org-001). He has zero access to UPSC AI (org-002).

```
-- Arjun tries to access UPSC AI
SELECT role FROM memberships
WHERE user_id = 'uuid-arjun'
AND org_id = 'uuid-org-002';

-- Result: 0 rows
-- API response: 403 Forbidden
```

Arjun does not know UPSC AI exists. The API never reveals it to him.

---

*Back to [Index](../index.md) · Next: [Two-Way Discovery](./04-two-way-discovery.md)*
