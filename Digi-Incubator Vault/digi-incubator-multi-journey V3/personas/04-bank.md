# Persona 04 — Bank / Lending Institution

> Finds loan-ready startups using real financial signals. CGTMSE-native.



## Who is this?

An MSME lending desk at a bank or NBFC. Multiple loan officers sharing a loan pipeline. The institution is the tenant.

**Real example:** Prashant, Loan Officer at Canara Bank's MSME desk.



## What's the same as VC

Everything at the org level is identical — same signup flow, same invite flow, same membership model. `org_type = 'bank'` is the only difference in the core tables.

```mermaid
flowchart LR
    subgraph Core["Same core tables"]
        U[users] --> M[memberships] --> O[organizations\norg_type: bank]
        O --> S[subscriptions\nenterprise plan]
    end

    subgraph BankSpecific["Bank-specific tables"]
        BP[bank_profiles\nloan criteria · CGTMSE · MRR filter]
        LA[loan_applications\nloan pipeline per institution]
    end

    O --> BP
    O --> LA
```



## Bank profile — the lending criteria made discoverable

```mermaid
flowchart TD
    P[Prashant sets up\nCanara Bank lending profile]
    P --> BP[bank_profiles\norg_id: org-bank\nis_visible_to_founders: true\nmin_mrr: ₹1L\nrequires_gstin: true\ncgtmse_partner: true\ninterest_rate: 10.5–14%]
    BP --> DIR[Funding Sources Directory\nvisible to all founders]
```



## How banks discover startups

Banks use the same Observatory as investors, with different filters:

```
-- Investor filter
SELECT * FROM startups
WHERE is_discoverable = true
AND sector = 'edtech'
AND conviction_score >= 65

-- Bank filter
SELECT * FROM startups
WHERE is_discoverable = true
AND mrr >= 100000
AND gstin IS NOT NULL
AND dpiit_number IS NOT NULL
```

Same `is_discoverable` flag. Same `startups` table. Different WHERE clause. Riya flips one toggle and becomes visible to investors, banks, and government all at once.



## Loan application flow

```mermaid
sequenceDiagram
    participant R as Riya (Startup)
    participant FOS as Digi Incubator
    participant P as Prashant (Canara Bank)
    participant DB as Database

    R->>FOS: Finds Canara Bank in Funding Sources Directory
    R->>FOS: Clicks "Apply for Loan" — writes message + MRR details
    FOS->>DB: INSERT connection_requests\n(from: org-001, to: org-bank\ntype: loan_application, status: pending)

    P->>FOS: Opens Loan Inbox
    FOS->>DB: SELECT * FROM connection_requests\nWHERE to_org_id = org-bank AND status = pending
    DB-->>P: Riya's application appears

    P->>FOS: Reviews and accepts
    FOS->>DB: UPDATE connection_requests SET status = accepted
    FOS->>DB: INSERT loan_applications\n(org_id: org-bank, startup_id: riya\nloan_amount, stage: under_review)

    Note over R: Riya sees status update\nCannot see Prashant's internal notes
```



## Loan pipeline stages

```mermaid
stateDiagram-v2
    [*] --> under_review : Application accepted
    under_review --> approved : Credit check passes
    approved --> disbursed : Funds released
    under_review --> rejected : Does not qualify
    approved --> rejected : Final review fails
```



## Privacy wall

| Riya can see | Riya cannot see |
|---|---|
| Her application status | Prashant's credit scoring notes |
| Whether she was approved | Other startups' applications |
| Disbursement amount | Internal bank risk ratings |
| Bank's contact (after acceptance) | Loan officer's personal email before acceptance |



## Business model

Banks are on **annual enterprise contracts**. There is no self-serve pricing page for this persona. The price is determined through a sales conversation and signed as a formal contract with a purchase order.

### Pricing ranges

| Package | Annual price |
|---|---|
| Pilot — MSME desk (3 months, paid) | ₹50K–₹1L flat fee |
| Small bank — MSME lending access | ₹3L–₹5L/yr |
| Full MSME lending integration | ₹8L–₹15L/yr |
| API + data feed licence | ₹20L–₹50L/yr |

### The 3-phase sales model

```mermaid
flowchart LR
    P1["Phase 1 — Paid pilot\n₹50K–₹1L · 3 months\nBank evaluates ROI"]
    P2["Phase 2 — Annual contract\nFull pricing\nafter pilot validates value"]
    P3["Phase 3 — Expansion\nAPI licence · more users\nmore lending desks"]

    P1 -->|"target: >70% conversion"| P2
    P2 -->|"upsell"| P3
```

Never ask a bank to sign an annual contract before a paid pilot. The pilot removes procurement risk. If your pilot-to-contract conversion is below 70%, that is a product problem, not a pricing problem.

### How the subscription is stored

```
subscriptions {
  org_id        = uuid-org-bank
  plan_tier     = 'enterprise'
  billing_cycle = null          ← contract handled outside platform
  status        = 'active'      ← set manually by Digi Incubator team on contract signing
}
```

`billing_cycle` is null for enterprise contracts. The payment is handled via invoice and bank transfer, not through an in-app payment flow. The Digi Incubator team sets `status = 'active'` after the contract is signed and payment is confirmed.

### ROI anchor for bank sales conversations

One bad MSME loan written off costs ₹25L+. One year of Digi Incubator enterprise access costs ₹8L–₹15L. A single avoided bad loan pays for the entire year's subscription. Lead with this in every bank sales conversation.



*Back to [[index|Index]] · Next: [[05-government|Government]]*
