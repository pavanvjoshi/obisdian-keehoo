# Persona 06 — Mentor

> The one genuine exception to the org-as-tenant rule.



## Who is this?

An experienced professional offering paid advisory sessions to founders. Could be a product manager, a former founder, a CFO, a marketing expert. Mentoring is personal — the mentor IS the product.

**Real example:** Deepak, Senior PM at Flipkart, mentoring EdTech founders on product strategy and GTM.



## Why user_id and not org_id

This is the most important design decision in the mentor persona. Every other persona gets an org. Mentors do not.

```mermaid
flowchart TD
    Q{Can you hire someone\nto share your mentoring data?}
    Q -->|Investor: Yes — hire an analyst| ORG[Create an org\nPipeline is shared]
    Q -->|Bank: Yes — multiple officers| ORG
    Q -->|Founder: Yes — co-founders| ORG
    Q -->|Mentor: No — you can't hire\nsomeone to mentor for you| USER[user_id is the tenant\nProfile is personal]

    style USER fill:#FBEAF0,stroke:#ED93B1
    style ORG fill:#EAF3DE,stroke:#C0DD97
```

Mentoring is inherently personal. The mentor's expertise, reputation, and sessions belong to them as an individual — not to an "organization". There is no scenario where a second person joins a mentor's account to share their sessions.



## Signup — the simplest of all personas

```mermaid
sequenceDiagram
    participant D as Deepak
    participant API as API
    participant DB as Database

    D->>API: POST /auth/signup {persona: mentor}
    API->>DB: INSERT users (uuid-deepak, active_persona: mentor)
    Note over DB: No INSERT into organizations\nNo INSERT into memberships
    API-->>D: Mentor dashboard
```

One table. One row. The simplest signup in the system.



## Mentor profile — keyed on user_id

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email
        enum active_persona
    }

    MENTOR_PROFILES {
        uuid id PK
        uuid user_id FK
        boolean is_visible_to_founders
        text[] domains
        integer experience_years
        integer session_rate
        text[] availability
        text bio
    }

    MENTOR_SESSIONS {
        uuid id PK
        uuid mentor_user_id FK
        uuid founder_org_id FK
        uuid startup_id FK
        integer gross_amount
        integer platform_fee
        integer mentor_payout
        enum status
        enum payout_status
    }

    MENTOR_REVIEWS {
        uuid id PK
        uuid session_id FK
        uuid reviewer_org_id FK
        uuid reviewed_user_id FK
        integer rating
        text comment
    }

    USERS ||--o| MENTOR_PROFILES : "has"
    USERS ||--o{ MENTOR_SESSIONS : "conducts"
    MENTOR_SESSIONS ||--o| MENTOR_REVIEWS : "has"
```

`mentor_profiles.user_id` is the only foreign key in the domain tables that points to `users` directly instead of `organizations`.



## The booking flow — where two tenancy models meet

`mentor_sessions` is the only table in the entire system that bridges both tenancy models:

```mermaid
sequenceDiagram
    participant R as Riya (Startup · org-001)
    participant FOS as Digi Incubator
    participant D as Deepak (Mentor · user-040)
    participant DB as Database

    R->>FOS: Browses Mentor Directory\nFilters: GTM · EdTech
    FOS->>DB: SELECT * FROM mentor_profiles\nWHERE is_visible_to_founders=true\nAND 'gtm' = ANY(domains)
    DB-->>R: Deepak's card appears

    R->>FOS: Clicks Book — picks Saturday 10am
    FOS->>DB: INSERT mentor_sessions\n(mentor_user_id: uuid-deepak\nfounder_org_id: uuid-org-001\nscheduled_at: Sat 10am\ngross: 2500\nplatform_fee: 375\npayout: 2125\nstatus: confirmed)

    Note over DB: Two tenancy models meet here:\nmentor_user_id → user-scoped\nfounder_org_id → org-scoped

    D->>FOS: Session happens
    FOS->>DB: UPDATE mentor_sessions SET status=completed
    FOS->>DB: UPDATE mentor_sessions SET payout_status=paid
    R->>FOS: Leaves review
    FOS->>DB: INSERT mentor_reviews\n(reviewer_org_id: org-001\nreviewed_user_id: uuid-deepak\nrating: 5)
```


## Commission model

|                                 | Amount |
| ------------------------------- | ------ |
| Riya pays                       | ₹2,500 |
| Digi Incubator commission (15%) | − ₹375 |
| Deepak receives                 | ₹2,125 |

`platform_fee` is calculated and locked at booking time. Refund and payout logic reads from this fixed value — no recalculation needed later.



## Sequential persona switch — Riya becomes a mentor

A founder can switch to mentor mode. This is sequential — one active persona at a time.

```mermaid
flowchart LR
    subgraph Before["Founder mode"]
        U1[Riya · user-001\nactive_persona: founder]
        U1 --> Q1[Queries use\norg_id = uuid-org-001]
    end

    subgraph Switch["Persona switch"]
        SW[UPDATE users\nSET active_persona = mentor\nINSERT mentor_profiles\nuser_id = uuid-riya-001]
    end

    subgraph After["Mentor mode"]
        U2[Riya · user-001\nactive_persona: mentor]
        U2 --> Q2[Queries use\nuser_id = uuid-riya-001]
    end

    subgraph Preserved["Untouched"]
        ORG[org-001 startup data\nAll agent_runs\nAll milestones\nConviction score]
    end

    Before --> Switch --> After
    Switch -.->|does not touch| Preserved
```

One UPDATE + one INSERT. All startup data is completely preserved. She switches back to founder mode by updating `active_persona` — her mentor profile goes dormant but is not deleted.



## Business model

Mentors are on the **commission model**. There is no subscription, no monthly fee, no barrier to join. Digi Incubator earns only when the mentor earns — 15% of every session booked through the platform.

### Commission structure

| | Amount (₹2,500 session example) |
|---|---|
| Founder pays | ₹2,500 |
| Digi Incubator commission (15%) | ₹375 |
| Mentor receives | ₹2,125 |

### Why zero subscription — always

| Approach | What happens |
|---|---|
| Monthly subscription | Mentors hesitate before earning anything — low join rate, high churn |
| Commission only | Zero barrier to join — Digi Incubator earns only when mentors earn |

The commission model perfectly aligns incentives. If Digi Incubator drives no bookings, it earns nothing from that mentor. This creates a direct product incentive to build features that drive session volume.

### Mentor session rate ranges

| Mentor type | Typical rate |
|---|---|
| Domain expert (early career) | ₹500–₹1,500/hr |
| Senior professional | ₹1,500–₹3,500/hr |
| Serial founder / ex-CXO | ₹3,500–₹10,000/hr |

### How the commission is stored and locked

```
mentor_sessions {
  mentor_user_id = uuid-deepak-040
  founder_org_id = uuid-org-001
  gross_amount   = 2500    ← session rate × hours
  platform_fee   = 375     ← locked at 15% at booking time
  mentor_payout  = 2125    ← locked at booking time
  payout_status  = 'pending'  → 'paid' after session completes
}
```

`platform_fee` and `mentor_payout` are calculated **once at booking** and stored as fixed integers. Refund and dispute logic always reads from these stored values — no recalculation, no ambiguity about what the mentor is owed.

### The marketplace flywheel

```mermaid
flowchart LR
    A[More mentors join\nzero cost to join] -->|"deeper expertise supply"| B[Founders find\nbetter matches]
    B -->|"more sessions booked"| C[More reviews\nbuild mentor reputation]
    C -->|"higher session volume"| D[More GTV\n15% commission revenue]
    D -->|"platform reinvests"| A
```

### Future lever — optional premium listing

At scale, once mentors have consistent bookings, introduce an **optional** premium listing at ₹499/mo. This pushes the mentor's profile to the top of search results. It is never mandatory — existing mentors can decline without losing access. Introduce this only when mentors are already earning consistently and have a reason to invest in visibility.

### No subscriptions row for mentors

Unlike every other persona, mentors do not get a `subscriptions` row. They are individual users, not orgs. Their revenue relationship with Digi Incubator is entirely through `mentor_sessions.platform_fee`. If you need to report mentor-related revenue, query:

```sql
SELECT SUM(platform_fee)
FROM mentor_sessions
WHERE status = 'completed'
AND created_at BETWEEN :start AND :end;
```



*Back to [[index|Index]] · Next: [[01-onboarding-ideation|Flows →]]*
