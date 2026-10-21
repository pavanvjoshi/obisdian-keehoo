# Decision — Why Stage 7 Exists

> The inversion analysis found that the journey ended at the wrong place. Here is the reasoning for adding a post-funding stage.

← [[journey-index|Journey Index]]

---

## The Problem — Stage 6 Was a Dead End

The inversion analysis asked: *"What assumption has to be true for the 6-stage journey to work — and what if that assumption is wrong?"*

One assumption failed immediately:

> "Raising capital and scaling is the natural conclusion of a startup's journey on the platform."

**What actually happens:** Funding is not the end. It is the beginning of a new, harder journey. A founder who raises ₹2 crore at Stage 6 now needs to:
- Decide who to hire first
- Track burn obsessively
- Report to an investor every month
- Build operations that didn't need to exist before
- Prepare for the next raise before anyone asks

The platform, as designed, had nothing for any of this. A funded founder had no reason to stay subscribed. The journey ended. The subscription lapsed.

This is both a product gap and a revenue gap. The platform was losing its best customers — the ones who just raised money and can now afford anything — right at the moment when they need the most help.

## The Fix — Stage 7

Stage 7 is the platform's **retention engine**.

A funded founder is the most active user on the platform:
- Runs agents weekly (not monthly)
- Records milestones constantly
- Sends an investor update every single month
- Tracks burn every day
- Prepares a data room 12 months later

That is peak subscription value at the Scale plan rate (₹4,999/month). Every month a funded founder stays on the platform is revenue that the old 6-stage design threw away.

## The Loop Design

Stage 7 does not end. It loops.

When the Next Round Readiness Agent detects that runway is dropping below 6 months and traction is trending positively, it re-opens Stage 5 and Stage 6. The founder goes through them again — but now with:
- 12+ months of real traction
- A re-scored conviction (higher, with real data)
- A data room that assembles itself
- Investor connections already in place from the first round

The second pass through Stage 6 is a Series A. The third is a Series B. The platform grows with the founder — and that is the only sustainable retention model.

## The Connection to Non-SaaS Agent Design

Stage 7 only works properly because of the `business_model_type` column introduced in [[non-saas-agent-design|the non-SaaS agent design decision]].

Without it, the Unit Economics Monitor would ask every funded founder about MRR — which is meaningless for a food brand or a clinic. With it, Stage 7 branches correctly and feels built for each specific business.

The two decisions are designed together. One enables the other.

*See also: [[non-saas-agent-design]] · [[journey-index|Journey Index]]*
