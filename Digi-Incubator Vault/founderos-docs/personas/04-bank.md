# Persona 04 — Bank / Lending Institution

> Finds loan-ready startups using real financial signals. CGTMSE-native.

---

## Who is this?

An MSME lending desk at a bank or NBFC. Multiple loan officers sharing a loan pipeline. The institution is the tenant.

**Real example:** Prashant, Loan Officer at Canara Bank's MSME desk.

---

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

---

## Bank profile — the lending criteria made discoverable

```mermaid
flowchart TD
    P[Prashant sets up\nCanara Bank lending profile]
    P --> BP[bank_profiles\norg_id: org-bank\nis_visible_to_founders: true\nmin_mrr: ₹1L\nrequires_gstin: true\ncgtmse_partner: true\ninterest_rate: 10.5–14%]
    BP --> DIR[Funding Sources Directory\nvisible to all founders]
```

---

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

---

## Loan application flow

```mermaid
sequenceDiagram
    participant R as Riya (Startup)
    participant FOS as FounderOS
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

---

## Loan pipeline stages

```mermaid
stateDiagram-v2
    [*] --> under_review : Application accepted
    under_review --> approved : Credit check passes
    approved --> disbursed : Funds released
    under_review --> rejected : Does not qualify
    approved --> rejected : Final review fails
```

---

## Privacy wall

| Riya can see | Riya cannot see |
|---|---|
| Her application status | Prashant's credit scoring notes |
| Whether she was approved | Other startups' applications |
| Disbursement amount | Internal bank risk ratings |
| Bank's contact (after acceptance) | Loan officer's personal email before acceptance |

---

*Back to [Index](../index.md) · Next: [Government](./05-government.md)*
