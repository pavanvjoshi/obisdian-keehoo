# Decision — Non-SaaS Agent Design

> Why and how the GTM, Financial Projections, and Unit Economics agents branch by business type.

← [[journey-index|Journey Index]]

---

## The Problem

The GTM Agent and Financial Projections Agent were designed with a SaaS mental model. They ask questions like:
- "What is your monthly recurring revenue?"
- "What is your monthly churn rate?"
- "What is your customer acquisition cost?"

These are **meaningless** for a kirana supply chain startup, a handicraft brand, or a physiotherapy clinic.

A food brand at Stage 3 is producing its first 100 units and negotiating with distributors. The platform's financial model has no field for "cost of goods sold" or "distribution margin." A clinic has no concept of "customer acquisition cost" — they have "patient referrals" and "OPD walk-ins."

When a founder from Surat building a handloom export business sees "What is your monthly recurring revenue?" — she knows the platform wasn't built for her. She leaves. That is a trust-breaking moment.

## The Fix

One new column on the `startups` table:

```sql
ALTER TABLE startups ADD COLUMN business_model_type VARCHAR(20);
-- Values: 'saas' | 'physical_product' | 'service' | 'marketplace' | 'deep_tech'
```

Every agent reads it before running. The agent **architecture** does not change. The agents do not multiply. One agent, five question sets — stored in `output_data` JSONB with a `business_type` key so history is always interpretable.

## The Question Asked Before Stage 3

> "What kind of business are you building?"

Shown as a five-option selector. Required before any Stage 3 agent runs. The answer is stored once and available to every agent forever.

## What Changes Per Agent

### GTM Agent

| Type | Old question (wrong) | New question (right) |
|---|---|---|
| Physical product | "What digital channels will you use?" | "Which distributors will stock you, at what margin?" |
| Service | "What is your CAC?" | "How do your first 10 clients find you?" |
| Marketplace | Single GTM plan | Two plans — supply side + demand side |
| Deep tech | "Who are your first customers?" | "Who is your first pilot partner?" |

### Financial Projections Agent

| Type | Old model (wrong) | New model (right) |
|---|---|---|
| Physical product | MRR and churn | Units × price − COGS = gross margin |
| Service | Monthly recurring revenue | Capacity × utilisation × ticket size |
| Marketplace | Direct revenue | GMV × take rate. Subsidy phase included |
| Deep tech | Revenue forecasts | Runway burn chart. Milestone timeline |

## What Stays the Same

These are universal — zero changes needed:
- Market Research Agent
- Conviction Scorer
- Market Sizing (TAM/SAM/SOM)
- Lean Canvas structure (9 sections)
- Stage sequence
- Milestone tracking
- Observatory visibility
- `is_discoverable` toggle

## Why This Matters for Stage 7

Once `business_model_type` exists on every startup, Stage 7 agents also branch correctly. The Unit Economics Monitor knows whether to ask about NRR (SaaS) or utilisation rate (service). The Hiring Plan Agent knows whether to suggest engineers (SaaS) or delivery staff (service).

This one column makes the entire platform genuinely universal.

*See also: [[stage-7-rationale]] · [[journey-index|Journey Index]]*
