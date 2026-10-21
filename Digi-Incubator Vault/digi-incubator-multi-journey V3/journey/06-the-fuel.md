# Stage 06 — The Fuel

> **Funding & Scale** · Bring in the resources to grow 10x — capital, partners, and reach.

← [[05-the-proof|Stage 05]] · [[index|Journey Index]] · [[07-operate-and-grow|Stage 07]] →

---

## The Story

You've built something real. Now it's time to pour fuel on it. The data you built since Stage 1 does the work. An investor who sends a connection request already knows your conviction score, your MRR, your public milestones, your market size. You're not explaining your startup from scratch. You're talking about terms.

---

## Three Capital Paths — All Through the Platform

```mermaid
flowchart LR
    F["Your startup\n(discoverable)"]

    subgraph Investor["Investor path"]
        I1["Angel or VC finds you\nvia Observatory"]
        I2["Sends connection request"]
        I3["You accept → contact unlocks"]
        I4["Conversation → term sheet"]
        I1 --> I2 --> I3 --> I4
    end

    subgraph Bank["Bank path"]
        B1["Loan officer filters\nMRR · GSTIN · DPIIT"]
        B2["Sends loan application request"]
        B3["CGTMSE eligibility confirmed"]
        B4["Loan processed"]
        B1 --> B2 --> B3 --> B4
    end

    subgraph Govt["Government path"]
        G1["Scheme officer searches\nby sector · stage"]
        G2["Shortlists your startup"]
        G3["You apply through platform"]
        G4["Applied → shortlisted → approved → disbursed"]
        G1 --> G2 --> G3 --> G4
    end

    F --> Investor
    F --> Bank
    F --> Govt
```

---

## How Connection Requests Work

The `connection_requests` table is the **only** controlled surface where two organisations can interact. No investor or bank ever has direct access to your private data.

```mermaid
stateDiagram-v2
    [*] --> pending : Investor sends request
    pending --> accepted : Founder reviews and accepts
    pending --> declined : Founder declines
    accepted --> [*] : Contact details unlock\nConversation begins
    declined --> [*] : Clean close\nNo data shared
```

Once accepted: both sides see each other's contact details. Nothing else is automatically shared. The founder controls what they choose to share next.

---

## What Investors, Banks & Govt Each Bring

| Persona | What they offer | What they need from you |
|---|---|---|
| **Angel investor** | ₹10L–₹1Cr, mentorship, network | Early traction, strong founder-market fit |
| **VC firm** | ₹1Cr–₹20Cr, portfolio support | Scalable model, conviction score ≥ 70 |
| **Bank (CGTMSE)** | Collateral-free loan | MRR ≥ ₹1L, GSTIN, DPIIT number |
| **Government scheme** | Grant ₹5L–₹50L, non-dilutive | DPIIT registration, sector match, deadline |

---

## Agents Active at Stage 6

| Agent | What it does |
|---|---|
| **Pitch Generator** | White-label investor deck from your canvas + milestones + research |
| **Financial Projections** | Updated model for investor due diligence |
| **All previous agents** | Unlimited re-runs — every number in your pitch should be fresh |

---

## The Moment Stage 6 Ends

Stage 6 closes when capital arrives — a signed term sheet, a disbursed loan, or an approved grant. The platform immediately opens [[07-operate-and-grow|Stage 7]].

This is not an ending. It is the beginning of the hardest part.

---

*Next: [[07-operate-and-grow|Stage 07 — Operate & Grow]]* · *Back to [[index|Journey Index]]*
