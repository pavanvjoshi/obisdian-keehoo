# Flow 04 — Two-Way Discovery

> Investors find founders. Founders find investors. Both sides stay in control.


## The two discovery directions

```mermaid
flowchart LR
    subgraph FD["Founder → Investor (founder-initiated)"]
        F1[Founder\nbrowses Investor Directory]
        F1 -->|finds| IP[investor_profiles\nis_visible_to_founders: true]
        IP -->|sends| CR1[connection_requests\ntype: investor_interest]
        CR1 -->|lands in| INV_INBOX[Investor Inbox]
    end

    subgraph ID["Investor → Founder (investor-initiated)"]
        I1[Investor\nbrowses Observatory]
        I1 -->|finds| ST[startups\nis_discoverable: true]
        ST -->|adds to| DP[deal_pipeline]
        I1 -->|or reaches out| CR2[connection_requests]
    end
```


## The connection_requests handshake

```mermaid
stateDiagram-v2
    [*] --> pending : Founder sends request
    pending --> accepted : Investor accepts
    pending --> declined : Investor declines
    accepted --> [*] : Emails unlocked on both sides\nInvestor adds to pipeline
    declined --> [*] : Clean close\nNo emails shared ever

    note right of pending : No contact details shared yet
    note right of accepted : Both orgs can now communicate directly
```



## What is visible before and after acceptance

| Data | Before acceptance | After acceptance |
|---|---|---|
| Startup name, sector, score | ✓ Visible | ✓ Visible |
| Public milestones | ✓ Visible | ✓ Visible |
| Founder's email | ✗ Hidden | ✓ Visible |
| Investor's email | ✗ Hidden | ✓ Visible |
| Investor's deal pipeline | ✗ Hidden | ✗ Still hidden |
| Startup's private agent_runs | ✗ Hidden | ✗ Still hidden |

Acceptance unlocks contact. It does not unlock private data. Private data is never accessible across tenants under any circumstance.



## Multiple investors tracking the same startup

```mermaid
flowchart TD
    ST[Riya's Startup\nuuid-startup-riya\nis_discoverable: true]

    ST --> DP1
    ST --> DP2
    ST --> DP3

    subgraph PV["Peak Ventures — org-pv"]
        DP1[deal_pipeline\nstage: due diligence\nassigned: Sneha]
    end

    subgraph KM["Karan Mehta — org-karan"]
        DP2[deal_pipeline\nstage: watchlist\nassigned: Karan]
    end

    subgraph CB["Canara Bank — org-bank"]
        DP3[loan_applications\nstage: under_review\nassigned: Prashant]
    end

    PV -.->|cannot see| KM
    KM -.->|cannot see| CB
    CB -.->|cannot see| PV
```

Three separate institutions. Three separate pipeline rows. All pointing at the same `startup_id`. Complete isolation between them.


*Back to [[index|Index]] · Next: [[05-mentor-marketplace|Mentor Marketplace]]*
