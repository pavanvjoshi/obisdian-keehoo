---
title: Phase 3 — Billing & Subscriptions
tags: [phase, billing, razorpay, subscriptions, payments, p3]
phase: 3
duration: Weeks 8–9
scope: Backend + Razorpay · Payment integration only
status: not-started
created: 2026-04-14
---

# Phase 3 — Billing & Subscriptions

> [!important] What changed after inversion
> The original plan had Phase 3 creating the `subscriptions` table. The inversion analysis moved the table to [[01-phase-0|Phase 0]] — it was needed by Phase 1's freemium gates. **Phase 3 is now payment integration only.** The table structure doesn't change — `plan_tier` gets upgraded from `free` to `builder`/`scale` by Razorpay webhook, not by table creation.

> [!note] Why billing must come before investor persona
> Investors pay ₹3,999–49,999/mo. Without a working payment flow, Phase 4 ships a free-forever investor product. The dependency is real and correctly sequenced.

---

## Prerequisites (from [[03-phase-2|Phase 2]])

- [ ] `subscriptions` table live, seeded `free` for all orgs
- [ ] Freemium gates enforced in Phase 1 checking this table
- [ ] Multi-user invite flow working
- [ ] Member limit enforcement checking subscription plan

---

## Step 1 — Razorpay integration setup

```python
# core/payments.py
import razorpay
from app.core.config import settings

client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)

def create_subscription_order(amount_paise: int, org_id: str, plan: str) -> dict:
    """Amount in paise (₹1,999 = 199900 paise)"""
    return client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"sub_{org_id}_{plan}",
        "notes": {"org_id": org_id, "plan": plan}
    })
```

### Founder plan pricing

| Plan    | Monthly                  | Annual                     |
| ------- | ------------------------ | -------------------------- |
| Builder | ₹1,999/mo → 199900 paise | ₹19,999/yr → 1999900 paise |
| Scale   | ₹4,999/mo → 499900 paise | ₹49,999/yr → 4999900 paise |

---

## Step 2 — Checkout endpoint

```python
# api/authenticated/billing.py

@router.post("/billing/checkout")
async def create_checkout(
    plan: Literal['builder', 'scale'],
    cycle: Literal['monthly', 'annual'],
    ctx: TenantContext = Depends(get_tenant_context)
):
    amount = PLAN_PRICES[plan][cycle]  # in paise
    order = create_subscription_order(amount, str(ctx.tenant_id), plan)

    return {
        "order_id": order['id'],
        "amount": order['amount'],
        "currency": "INR",
        "razorpay_key": settings.RAZORPAY_KEY_ID,
        "org_id": str(ctx.tenant_id)
    }
```

---

## Step 3 — Webhook handler (upgrades `plan_tier`)

> [!warning] Verify Razorpay webhook signature before processing — never trust the payload without verification

```python
# api/public/webhooks.py  ← public route, no tenant_middleware

@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")

    # Verify signature
    if not verify_webhook_signature(body, signature, settings.RAZORPAY_WEBHOOK_SECRET):
        raise HTTPException(400, "Invalid signature")

    payload = await request.json()
    event = payload.get("event")

    if event == "payment.captured":
        await handle_payment_captured(payload)
    elif event == "subscription.charged":
        await handle_subscription_renewed(payload)
    elif event == "payment.failed":
        await handle_payment_failed(payload)

    return {"status": "ok"}


async def handle_payment_captured(payload: dict):
    order_notes = payload['payload']['payment']['entity']['notes']
    org_id = order_notes['org_id']
    plan = order_notes['plan']
    cycle = order_notes.get('cycle', 'monthly')

    expires_at = (
        datetime.utcnow() + timedelta(days=365)
        if cycle == 'annual'
        else datetime.utcnow() + timedelta(days=30)
    )

    await db.execute(
        """UPDATE subscriptions
           SET plan_tier=$1, billing_cycle=$2, status='active', expires_at=$3
           WHERE org_id=$4""",
        plan, cycle, expires_at, org_id
    )
```

---

## Step 4 — Investor plan pricing (for Phase 4 readiness)

> [!tip] Wire investor plan prices now so Phase 4 has nothing to add to billing
> Investor plans use the same `subscriptions` table and the same webhook handler — only the amounts differ.

```python
PLAN_PRICES = {
    # Founder plans (paise)
    'builder':             {'monthly': 199900,  'annual': 1999900},
    'scale':               {'monthly': 499900,  'annual': 4999900},
    # Investor plans (paise) — org_type = individual_investor or vc_firm
    'solo_angel':          {'monthly': 399900,  'annual': 3999900},
    'vc_firm':             {'monthly': 2499900, 'annual': 24999900},
    'vc_firm_large':       {'monthly': 4999900, 'annual': 49999900},
    # Enterprise (bank + govt) — no self-serve, set via admin
    'enterprise':          {'monthly': None,    'annual': None},
}
```

---

## Step 5 — Annual billing proration

```python
async def prorate_upgrade(ctx: TenantContext, new_plan: str) -> int:
    """Calculate prorated amount when upgrading mid-cycle."""
    sub = await subscription_repo.get(ctx.tenant_id)
    if not sub.expires_at:
        return PLAN_PRICES[new_plan]['monthly']

    days_remaining = (sub.expires_at - datetime.utcnow()).days
    days_in_cycle = 30 if sub.billing_cycle == 'monthly' else 365

    # Credit for unused days on current plan
    current_daily = PLAN_PRICES[sub.plan_tier][sub.billing_cycle] / days_in_cycle
    credit = current_daily * days_remaining

    # Charge for remaining days on new plan
    new_daily = PLAN_PRICES[new_plan][sub.billing_cycle] / days_in_cycle
    new_charge = new_daily * days_remaining

    return max(0, int(new_charge - credit))
```

---

## Step 6 — Feature gate middleware update

The freemium gates from Phase 1 check `plan_tier` correctly. Phase 3 adds plan-specific unlocks:

```python
# services/billing_service.py — extend PLAN_LIMITS
PLAN_LIMITS = {
    'free': {
        'total_runs': 3,
        'members': 1,
        'storage_mb': 500,
        'investor_requests_per_month': 2,
        'agents_locked': ['gtm', 'financial_projections'],
        'white_label_exports': False,
        'api_access': False,
    },
    'builder': {
        'total_runs': None,
        'members': 3,
        'storage_mb': 10240,
        'investor_requests_per_month': None,
        'agents_locked': [],
        'white_label_exports': False,
        'api_access': False,
    },
    'scale': {
        'total_runs': None,
        'members': None,
        'storage_mb': None,
        'investor_requests_per_month': None,
        'agents_locked': [],
        'white_label_exports': True,
        'api_access': True,
    },
    'enterprise': {
        'total_runs': None,
        'members': None,
        'storage_mb': None,
        'investor_requests_per_month': None,
        'agents_locked': [],
        'white_label_exports': True,
        'api_access': True,
    },
}
```

---

## Step 7 — Upgrade moment UI

> [!tip] The upgrade prompt must appear at the exact moment of value — not before
> Riya uses her third free agent run. The run completes. She sees the result. Immediately below the result: *"You've used 3/3 free runs. Upgrade to Builder for unlimited runs — ₹1,999/mo."* This is the correct upgrade moment.

**UI states to implement:**
- Usage meter on dashboard: `3 / 3 agent runs used`
- Inline upgrade prompt directly after a completed run that hits the limit
- Settings > Plan page with current usage and upgrade options
- Member limit prompt: shown when `Invite team member` is clicked and limit is reached
- Storage quota bar in document section

---

## Step 8 — Enterprise flag (manual admin)

Banks and government bodies use `plan_tier = 'enterprise'`. No self-serve — set via admin panel.

```python
# api/authenticated/admin.py — internal admin only, role-gated

@router.post("/admin/enterprise/grant")
async def grant_enterprise(org_id: UUID, notes: str):
    """Set by Digi Incubator team for bank/govt pilot customers."""
    await db.execute(
        """UPDATE subscriptions
           SET plan_tier='enterprise', status='active', expires_at=$1
           WHERE org_id=$2""",
        datetime.utcnow() + timedelta(days=90),  # 3-month pilot
        org_id
    )
    await audit_log.write(
        action='enterprise_granted',
        resource_id=org_id,
        metadata={"notes": notes}
    )
```

> [!note] PD-04 rule — no enterprise contract without a paid pilot first
> 3-month paid pilot at ₹1L/yr equivalent. If the pilot converts, extend to annual contract. Target conversion rate: >70%. If below 70%, it's a product problem, not a pricing problem.

---

## Step 9 — Start enterprise sales outreach

> [!danger] Inversion finding — enterprise sales cycle is 3–6 months
> If enterprise sales conversations start at Phase 6 (Week 15), you won't close a bank deal until Week 40+. Start outreach now (Phase 3, Week 8) so deals close by Phase 6 when the product is ready. The audit log (moving to Phase 4) must be available for security reviews.

**Sales readiness checklist for Phase 3:**
- [ ] Demo environment with realistic but anonymised startup data
- [ ] One-page compliance summary (data isolation model, no cross-tenant reads)
- [ ] Pilot pricing sheet: ₹1L for 3-month pilot → ₹12L annual

---

## Verification checklist

- [ ] Razorpay order creation endpoint working
- [ ] Checkout UI flow: plan selection → Razorpay modal → payment → success redirect
- [ ] Webhook handler upgrades `subscriptions.plan_tier` on `payment.captured`
- [ ] Webhook signature verification enforced
- [ ] `past_due` status set on failed recurring payment
- [ ] Annual billing: `expires_at` set correctly (365 days)
- [ ] Plan upgrade prorates correctly
- [ ] All Phase 1 freemium gates still enforced post-billing
- [ ] GTM + Financial Projections unlock on `builder` plan
- [ ] White-label exports locked to `scale` plan
- [ ] Enterprise flag grantable via admin endpoint
- [ ] Investor plan prices defined (ready for Phase 4)
- [ ] Enterprise sales outreach initiated

---

## What is explicitly NOT done in Phase 3

> [!warning] These belong to later phases
- Do not build Observatory or investor profile pages — Phase 4
- Do not add mentor payout flow — Phase 5 (different revenue stream)
- Do not add PostgreSQL RLS — Phase 7
- Do not build the founding member / launch pricing tier — Phase 7

---

## Links

- Previous: [[03-phase-2|Phase 2 — Multi-User & Invites]]
- Next: [[05-phase-4|Phase 4 — Investor & Observatory]]
- Pricing architecture: [[09-pricing-architecture]]
- Pricing inversion: [[11-inversion-pricing]]
