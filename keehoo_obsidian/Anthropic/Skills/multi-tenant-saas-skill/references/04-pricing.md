# Reference 04 — Pricing Architecture

> Read this when designing pricing tiers, billing models, and feature gates.
> Covers single-sided SaaS and multi-sided platforms.

---

## Core principle: price to value, not to features

The most common pricing mistake is gating features instead of gating value.

> **Gate by usage volume first. Gate by feature only when the feature itself has a clear
> value differential that justifies a separate tier.**

A user who has never used a feature cannot be convinced to pay for it. A user who has used
a feature and hit a natural limit is a motivated buyer — they have already seen the value.

---

## Single-Sided SaaS Pricing

**Use when:** One type of customer, one product, team-based usage.

### Standard three-tier model

```
Free / Trial
  → Limited usage (not limited features)
  → Goal: let users experience the best moments of your product
  → No credit card required

Paid / Pro
  → Removes usage limits
  → May add advanced features genuinely not relevant to free users
  → Monthly or annual billing

Enterprise
  → Custom limits, SLAs, SSO, audit logs, dedicated support
  → Annual contract only (no month-to-month)
  → Start with a paid pilot (3 months) before a 12-month contract
```

### Freemium gate design

```
BAD gate:  Lock the core feature entirely → user never sees value → no upgrade motivation
GOOD gate: Allow 3 uses of the core feature → user experiences value → hits natural limit

BAD gate:  Charge per seat → team restricts access internally → lower engagement
GOOD gate: Charge per org, tiered by team size → everyone in the team uses it → higher engagement
```

### Feature flag implementation tied to plan tier

```sql
-- Check plan tier before gating
SELECT s.plan_tier
FROM subscriptions s
WHERE s.org_id = $1 AND s.status = 'active';

-- In application code
def can_access_feature(org_id: str, feature: str) -> bool:
    plan = get_active_plan(org_id)
    return feature in PLAN_FEATURES[plan]

PLAN_FEATURES = {
    'free':       {'basic_feature', 'export_csv'},
    'pro':        {'basic_feature', 'export_csv', 'advanced_feature', 'api_access'},
    'enterprise': {'*'},  # all features
}
```

### Usage-based limits implementation

```sql
-- Count usage events in current billing period
SELECT COUNT(*) as usage
FROM usage_events
WHERE org_id = $1
  AND event_type = 'ai_run'
  AND created_at >= date_trunc('month', CURRENT_DATE);

-- Compare to plan limit
PLAN_LIMITS = {
    'free': {'ai_runs': 3, 'team_members': 1, 'storage_mb': 500},
    'pro':  {'ai_runs': -1, 'team_members': 10, 'storage_mb': 10240},  # -1 = unlimited
    'enterprise': {'ai_runs': -1, 'team_members': -1, 'storage_mb': -1},
}
```

---

## Multi-Sided Platform Pricing

**Use when:** Two or more distinct user types interact through your platform.

### The supply/demand pricing principle

```
Supply side (creates value for others)  → subsidise or free
Demand side (measurable ROI from value) → subscription or usage-based
```

The supply side is the product. Without supply-side participation, the platform has nothing
to offer the demand side. Charge the supply side too much and the platform starves.

| User type | Which side | Pricing approach |
|---|---|---|
| Content creators | Supply | Free or revenue share |
| Marketplace sellers | Supply | Free listing, commission on sale |
| Freelancers / service providers | Supply | Free profile, commission on booking |
| Startup founders | Supply | Freemium — low barrier to populate the ecosystem |
| Investors / buyers | Demand | Subscription — high ROI per use |
| Enterprise clients (banks, govt) | Demand | Annual contract — very high ROI |
| Students / browsers | Future supply | Free — long-term acquisition pipeline |

### Commission model (for marketplaces)

Use when: supply side earns through the platform.

```
Platform commission = gross_amount × rate
Provider payout     = gross_amount - platform_commission

# Lock these values at transaction time — never recalculate
# Rate guidance: 10–20% at launch; 20–30% once you have pricing power
# Start low: if providers can use Calendly/Stripe instead, they will
```

```sql
-- Stored at booking time, immutable
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,  -- buyer's org
  provider_user_id  UUID NOT NULL,  -- seller/provider
  gross_amount      INTEGER NOT NULL,        -- in smallest currency unit (paise, cents)
  platform_fee      INTEGER NOT NULL,        -- locked at time of transaction
  provider_payout   INTEGER NOT NULL,        -- gross - platform_fee
  platform_fee_rate NUMERIC(5,4) NOT NULL,   -- e.g. 0.1500 for 15%
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### Enterprise pilot-then-contract pattern

For enterprise clients (banks, government, large institutions), never ask for a 12-month
commitment without a pilot first.

```
Step 1 — Paid pilot (2–3 months)
  Purpose: remove procurement risk for the buyer
  Price: ~8–12% of annual contract value
  Success metric: defined upfront (e.g., 50% reduction in manual sourcing time)

Step 2 — Annual contract
  Triggered by: pilot success metric hit
  Target conversion: >70% of pilots → annual contracts
  If conversion is <70%: the product is not delivering value, not a pricing problem

Annual contract pricing:
  → 10–12× the monthly equivalent (2 months free effectively)
  → Minimum contract: define your floor (below which the deal cost exceeds value)
```

---

## Subscription billing tied to org

The org pays — not the individual. This has a direct impact on team engagement.

```
Per-seat pricing:
  → 5-person firm buys 3 seats to save money
  → 2 people excluded → lower engagement → lower retention
  → Churns because "we don't use it enough"

Per-org pricing (tiered by size):
  → Firm buys "up to 10 members" plan
  → Everyone uses it → high engagement → high retention
  → Expands to next tier when they grow
```

```sql
-- Subscription table (org-level, not user-level)
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID UNIQUE NOT NULL REFERENCES organizations(id),
  plan_tier       TEXT NOT NULL,
  max_members     INTEGER,  -- NULL = unlimited
  status          TEXT NOT NULL,
  billing_cycle   TEXT,
  current_period_ends_at TIMESTAMPTZ,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Enforce seat limit on member invite
def invite_member(org_id, email, inviter_tenant):
    plan = get_active_subscription(org_id)
    current_members = count_members(org_id)
    if plan.max_members and current_members >= plan.max_members:
        raise PaywallError("Member limit reached for your plan")
    # proceed with invite
```

---

## Revenue stream compounding (the flywheel)

Well-designed multi-sided platforms have revenue streams that reinforce each other.
Design your pricing to accelerate this, not break it.

```
More supply joins free
  → Platform becomes more valuable for demand side
  → Demand side pays more (or more demand joins)
  → More revenue funds product improvements
  → Product improvements attract more supply
  → Cycle repeats
```

**Pricing that breaks the flywheel:**
- Charging supply side so much that supply drops out
- Charging demand side so little that you can't fund the product
- Per-seat pricing that restricts team usage and lowers engagement

---

## Pricing decisions checklist

```
□ Is the free tier valuable enough that users actually experience the product?
□ Is the free tier limited enough that motivated users have a reason to upgrade?
□ Is the upgrade moment clear? (user hits a wall exactly when they want more)
□ Is pricing per-org rather than per-seat for team-based features?
□ For multi-sided: is the supply side subsidised?
□ For enterprise: is there a paid pilot before asking for an annual commitment?
□ Are usage limits stored and enforced in the database, not just in the UI?
□ Are transaction amounts locked at booking time (not recalculated later)?
□ Is there a webhook or event system to notify when limits are approaching?
```
