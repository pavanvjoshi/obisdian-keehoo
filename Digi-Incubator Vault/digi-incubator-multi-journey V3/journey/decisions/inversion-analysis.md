# Inversion Analysis — The 6-Stage Journey

> Inversion doesn't ask "is this right?" It asks: "what assumption has to be true for this to work — and what happens if that assumption is wrong?"

← [[journey-index|Journey Index]]

---

## Scorecard

| Status                                     | Count |
| ------------------------------------------ | ----- |
| ✅ Solid — holds under inversion            | 3     |
| ⚠️ Risk — correct concept, needs hardening | 4     |
| ❌ Gap — not addressed, needs a decision    | 2     |

---

## Solid — Holds

### 1. The 6-stage structure maps to how startups actually work
The sequence Spark → Blueprint → Build → First Yes → Proof → Fuel is universal. A food brand, a clinic, a hardware product, a service business — all of them must validate before building, build before selling, sell before scaling. The names differ. The stages are the same.

### 2. Validation before building saves founders from wasted effort
90% of startups fail within 5 years. The leading cause is building something nobody wanted. Stage 1 exists to interrupt this failure mode at the earliest possible moment.

### 3. Making the startup discoverable is the right trigger for ecosystem engagement
The opt-in model is correct. The single-toggle architecture is elegant. Founders who are not ready to be seen should not be seen.

---

## Risks — Needs Hardening

### 4. The Lean Canvas is enough of a plan before building
**The risk:** A founder with a high conviction score and a completed canvas feels like they have done the work — but may have spoken to zero real customers. The platform gives a sense of readiness that may not be earned.

**The fix:** Customer discovery checkpoint between Stage 2 and Stage 3. The platform asks: "Have you spoken to 5 people who have this problem?" — visible and encouraged, not a hard gate.

### 5. The platform supports non-tech, non-SaaS startups equally
**The risk:** The GTM and Financial Projections agents ask SaaS questions to every startup type. A kirana supply chain founder or a physiotherapy clinic founder will get outputs that feel wrong for their business.

**The fix:** `business_model_type` column on `startups`. Five question sets per agent. One decision — see [[non-saas-agent-design]].

### 6. First revenue is the right milestone for Stage 4
**The risk:** One sale could be a favour from a friend. The platform records "first revenue" but doesn't ask whether the customer was representative of the target segment.

**The fix:** The platform prompts founders to note whether each customer was a personal contact or a cold acquisition. 10 unrelated strangers paying is a signal. 1 paying friend is a data point.

### 7. Traction at Stage 5 is enough to attract serious capital at Stage 6
**The risk:** Investors in India still rely heavily on warm introductions. A cold connection request through the Observatory from a startup with score 81 may still get ignored.

**The fix:** Stage 5 explicitly names mentors as warm introduction pathways — not just coaches. The platform prompts: "Consider connecting with a mentor who knows investors in your space before going discoverable."

---

## Gaps — Decisions Required

### 8. There is a clear signal for when a founder moves from Build to First Yes
**The gap:** Many founders stay in "build mode" far too long — adding features, perfecting the product — because the platform never tells them they're done building.

**The fix:** Stage transition nudges. If a founder has been in Stage 3 for more than 8 weeks without recording a milestone or customer interaction, the platform surfaces: *"You've been building for 8 weeks. Have you shown this to anyone yet?"*

### 9. Stage 6 is the end of the journey
**The gap:** Funding is not the end. A funded founder has no reason to stay subscribed under the 6-stage model. The platform loses its best customers at the moment they need the most help.

**The fix:** [[stage-7-rationale|Stage 7 — Operate & Grow]]. The journey becomes a spiral, not a line.

---

*See also: [[non-saas-agent-design]] · [[stage-7-rationale]] · [[journey-index|Journey Index]]*
