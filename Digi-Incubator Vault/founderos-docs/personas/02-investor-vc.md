# Persona 02 — Investor (VC Firm)

> A multi-person investment firm. The firm owns the pipeline, not any individual analyst.

---

## Who is this?

A venture capital firm with multiple team members — partners, principals, analysts. The firm is the tenant. Every deal added by any team member belongs to the firm.

**Real example:** Peak Ventures. Vikram (Principal) and Sneha (Analyst) are both members. The deal pipeline belongs to Peak Ventures, not to either person.

---

## Signup

Same three-row transaction as a founder, with `org_type = 'vc_firm'`:

```mermaid
sequenceDiagram
    participant V as Vikram
    participant API as API
    participant DB as Database

    V->>API: POST /auth/signup {persona: investor, firm: "Peak Ventures"}
    API->>DB: INSERT users (uuid-vikram)
    API->>DB: INSERT organizations (uuid-org-pv, "Peak Ventures", vc_firm)
    API->>DB: INSERT memberships (vikram → org-pv, owner)
    API->>DB: INSERT subscriptions (org-pv, enterprise, active)
    API-->>V: Dashboard — Peak Ventures
```

---

## The deal pipeline

The pipeline belongs to the firm (`org_id = uuid-org-pv`). `assigned_to` tracks which analyst is currently working the deal — but this is not ownership, it is assignment.

```mermaid
stateDiagram-v2
    [*] --> watchlist : Sneha adds startup
    watchlist --> contacted : Sneha emails founder
    contacted --> dd : Vikram takes over
    dd --> term_sheet : Due diligence passes
    term_sheet --> closed : Deal done
    term_sheet --> passed : Decision: no
    contacted --> passed : Early pass
    dd --> passed : Failed diligence

    note right of watchlist : org_id = Peak Ventures\nassigned_to can change
    note right of closed : Deal complete\nstill in pipeline for records
```

### Key field distinction

| Field | Meaning | Can change? |
|---|---|---|
| `org_id` | Who owns this deal | Never |
| `assigned_to` | Who is working it now | Anytime |

If Sneha leaves Peak Ventures, Vikram reassigns her deals in one UPDATE per row. The org retains all pipeline history.

---

## Two-sided discovery

```mermaid
flowchart LR
    subgraph FounderSide["Founder side"]
        R[Riya's Startup]
        R -->|flips| F[is_discoverable = true]
    end

    subgraph Platform["FounderOS Platform"]
        OBS[Startup Observatory\nWHERE is_discoverable = true]
    end

    subgraph InvestorSide["Investor side"]
        S[Sneha · Analyst]
        S -->|browses| OBS
        OBS -->|Riya appears| S
        S -->|adds to pipeline| P[deal_pipeline row\norg_id = uuid-org-pv]
    end

    F --> OBS
```

### What investors can see vs cannot see

| Visible in Observatory | Hidden always |
|---|---|
| Startup name, sector, stage | Private market research (agent_runs) |
| Conviction score | Lean canvas notes |
| Public milestones | Financial projections |
| MRR (if public) | Private team notes |

---

## Shared pipeline — both Vikram and Sneha see the same data

```mermaid
sequenceDiagram
    participant S as Sneha
    participant V as Vikram
    participant DB as Database

    S->>DB: INSERT deal_pipeline (org_id: org-pv, startup: Riya, stage: watchlist)
    Note over DB: Row created — org_id = org-pv

    V->>DB: SELECT * FROM deal_pipeline WHERE org_id = 'org-pv'
    DB-->>V: Returns Riya's deal (added by Sneha)
    Note over V: Vikram sees it without Sneha telling him

    V->>DB: UPDATE deal_pipeline SET stage='dd', assigned_to=vikram, notes='...'
    S->>DB: SELECT * FROM deal_pipeline WHERE org_id = 'org-pv'
    DB-->>S: Returns updated deal (now showing Vikram's note)
```

Same `org_id` → same results for both. This is the firm-level pipeline working correctly.

---

## Investor Directory (reverse discovery)

Founders can also find and reach out to investors. Firms opt in via `investor_profiles`:

```mermaid
flowchart TD
    V[Vikram sets up\nPeak Ventures profile]
    V --> IP[investor_profiles row\norg_id: org-pv\nis_visible_to_founders: true\nthesis, sectors, cheque_size]
    IP --> DIR[Investor Directory\nvisible to all founders]
    DIR --> R[Riya finds Peak Ventures]
    R --> CR[connection_requests row\nfrom: org-001\nto: org-pv\nstatus: pending]
    CR --> INBOX[Peak Ventures inbox]
    INBOX --> ACCEPT{Vikram accepts?}
    ACCEPT -->|Yes| EMAIL[Both sides see\neach other's email]
    ACCEPT -->|No| CLOSE[Clean close\nno email shared]
```

---

*Back to [Index](../index.md) · Next: [Solo Investor](./03-investor-solo.md)*
