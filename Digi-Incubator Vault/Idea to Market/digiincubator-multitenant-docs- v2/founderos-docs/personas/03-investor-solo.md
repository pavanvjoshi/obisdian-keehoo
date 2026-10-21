# Persona 03 — Solo Angel Investor

> One person investing their own money. The silent org rule in action.

---

## Who is this?

An individual investor — no firm, no team. Just their own capital and judgment.

**Real example:** Karan Mehta, serial entrepreneur turned angel investor.

---

## The silent org rule

The temptation is to skip creating an org for a solo investor and just use their `user_id` as the tenant. This is wrong.

```mermaid
flowchart TD
    Q{Should Karan get an org?}
    Q -->|Feeling: no, he's solo| A[Use user_id as tenant]
    Q -->|Reasoning: yes, always| B[Create silent org]

    A --> A1[Deal pipeline scoped to user_id]
    A1 --> A2[Karan hires analyst Priya]
    A2 --> A3[Priya cannot see any deals]
    A3 --> A4[Must migrate every deal row\nto a new org — painful]

    B --> B1[Deal pipeline scoped to org_id]
    B1 --> B2[Karan hires analyst Priya]
    B2 --> B3[INSERT memberships one row]
    B3 --> B4[Priya sees all 40 deals instantly\nzero migration]

    style A4 fill:#FCEBEB,stroke:#F09595
    style B4 fill:#EAF3DE,stroke:#C0DD97
```

**Rule:** Every persona that could ever have a team member gets an org — even if they start solo.

---

## Signup

```mermaid
sequenceDiagram
    participant K as Karan
    participant API as API
    participant DB as Database

    K->>API: POST /auth/signup {persona: investor, name: "Karan Mehta"}
    API->>DB: INSERT users (uuid-karan)
    API->>DB: INSERT organizations (uuid-org-karan, "Karan Mehta", individual_investor)
    API->>DB: INSERT memberships (karan → org-karan, owner)
    Note over DB: org_type = individual_investor\nUI shows "Solo Investor" — no org branding visible
    API-->>K: Personal investor dashboard
```

The org exists in the database. Karan's UI never shows the word "organization" — his dashboard just says his name. The org is silent.

---

## Same pipeline, different org_type

Two investors can track the same startup simultaneously. Their pipeline rows are completely isolated:

```mermaid
flowchart LR
    R[Riya's Startup\nuuid-startup-riya]

    R --> P1
    R --> P2

    subgraph PV["Peak Ventures — org-pv"]
        P1[deal_pipeline\nstage: due diligence\nassigned: Sneha]
    end

    subgraph KM["Karan Mehta — org-karan"]
        P2[deal_pipeline\nstage: watchlist\nassigned: Karan]
    end

    P1 -.->|cannot see| P2
    P2 -.->|cannot see| P1
```

Same `startup_id` in both rows. Completely different `org_id`. Neither investor knows the other is tracking Riya.

---

## When Karan grows

Adding an analyst is one INSERT — because the org already exists:

```
INSERT INTO memberships
  (user_id, org_id, role)
VALUES
  (uuid-priya, uuid-org-karan, 'member');
```

Priya immediately sees all 40 deals Karan has been tracking. Zero data migration. This is the entire payoff of the silent org rule.

---

*Back to [Index](../index.md) · Next: [Bank](./04-bank.md)*
