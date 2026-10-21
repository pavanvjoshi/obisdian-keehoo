# Stage 05 — The Proof

> **Traction & Growing** · Show the world this thing works — with real numbers.

← [[04-the-first-yes|Stage 04]] · [[index|Journey Index]] · [[06-the-fuel|Stage 06]] →

---

## The Story

You've sold to a few people. Now you need to show that you can do it again, and again, and again — more efficiently each time. Traction is proof that your startup is not just a good idea but a real, growing business.

This is when you flip the switch. One toggle on your dashboard — **"Make my startup discoverable"** — opens your profile to investors, banks, and government simultaneously. You didn't pitch anyone. You just showed your traction — and the right people came to you.

---

## The Observatory — How It Works

```mermaid
sequenceDiagram
    participant F as Founder (Riya)
    participant OBS as Observatory
    participant I as Investor (Sneha)
    participant B as Bank (Prashant)
    participant G as Govt (Meera · DPIIT)

    F->>OBS: Flips is_discoverable = true
    Note over OBS: One flag. All three audiences.

    I->>OBS: Searches EdTech · score ≥ 65
    OBS-->>I: Riya's startup appears

    B->>OBS: Filters MRR ≥ ₹1L · GSTIN present
    OBS-->>B: Riya's startup appears (if eligible)

    G->>OBS: Searches EdTech · DPIIT registered
    OBS-->>G: Riya's startup appears

    I->>F: Sends connection request
    F->>I: Accepts → contact details unlock
```

One boolean. Three audiences. Different filters, same data, same flag.

---

## What Each Audience Sees

| Field | Investors | Banks | Government |
|---|---|---|---|
| Startup name & sector | ✓ | ✓ | ✓ |
| Conviction score | ✓ | ✓ | ✓ |
| Public milestones | ✓ | ✓ | ✓ |
| MRR | ✓ | ✓ (filter) | ✓ |
| GSTIN present (yes/no) | — | ✓ (filter) | — |
| DPIIT number | — | ✓ | ✓ (filter) |
| Private agent runs | ✗ | ✗ | ✗ |
| Lean canvas notes | ✗ | ✗ | ✗ |
| Financial projections | ✗ | ✗ | ✗ |

Private data is **never** accessible via the Observatory. The `connection_requests` table is the only controlled bridge between two orgs — and contact details only unlock after the founder explicitly accepts.

---

## When to Flip the Toggle

The platform does not force this. But it gives guidance:

```mermaid
flowchart TD
    A{Conviction score ≥ 65?}
    B{At least 5 milestones recorded?}
    C{At least ₹50K revenue OR 10 customers?}
    D["Strong signal — consider going discoverable"]
    E["Not yet — keep building and recording"]

    A -->|Yes| B
    B -->|Yes| C
    C -->|Yes| D
    A -->|No| E
    B -->|No| E
    C -->|No| E
```

There is no perfect moment. But going discoverable too early (score of 42, no customers) means getting ignored. Going too late (score of 85, ₹5L MRR) means missing months of inbound interest.

---

## The Mentor Bridge — Before You Go Discoverable

> **Consider booking a mentor session before flipping the toggle.**

Mentors who are known in the ecosystem are warm introduction pathways, not just coaches. A mentor who knows investors in your space can make a single introduction that converts — something a cold connection request through the Observatory may not.

This is the explicit bridge between Stage 5 and Stage 6 that the platform makes visible.

---

## Agents Active at Stage 5

- All previous agents available for unlimited re-runs (Builder plan)
- **Pitch Generator** — investor-ready deck built from your canvas, milestones, and market research
- **Conviction Scorer re-run** — updated score with real customer data reflects much higher than Stage 1

---

*Next: [[06-the-fuel|Stage 06 — The Fuel]]* · *Back to [[index|Journey Index]]*
