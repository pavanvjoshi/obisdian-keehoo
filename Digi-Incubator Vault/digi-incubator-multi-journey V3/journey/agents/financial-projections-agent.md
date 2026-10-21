# Financial Projections Agent

> Runs at [[../03-the-build|Stage 3]] and updates at [[../04-the-first-yes|Stage 4]]. Models the economics of your business — in the right shape for your business type.

← [[journey-index|Journey Index]]

---

## The Model Shape Changes by Business Type

### SaaS
Models MRR growth, churn rate, CAC, LTV, and net revenue retention.
Key question: *At what MRR does this business become cash-flow positive?*

### Physical product
Models units × price − COGS = gross margin. Tracks inventory cost, production batch size, distributor margin, and cash conversion cycle.
Key question: *At what monthly unit volume does this become cash-flow positive?*

### Service
Models capacity × utilisation rate × average ticket. Staff cost is the primary variable — not server cost.
Key question: *At what utilisation rate do we cover all costs?*

### Marketplace
Models GMV × take rate = platform revenue. Includes a subsidy phase — most marketplaces lose money per transaction early to build liquidity.
Key question: *At what GMV does the platform become self-sustaining?*

### Deep tech / R&D
Does **not** model revenue — it is too far away to be useful. Instead models a runway burn chart: cash in (grants + founder capital) vs. monthly burn vs. milestone timeline.
Key question: *Are we on track to hit the milestones the next grant requires before the money runs out?*

---

See [[../decisions/non-saas-agent-design]] · *Used at: [[../03-the-build|Stage 3]] · [[../04-the-first-yes|Stage 4]]* · *Back to [[journey-index|Journey Index]]*
