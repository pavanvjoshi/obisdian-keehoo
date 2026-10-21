---
title: Phase 7 — Stage 7 Agents, Retention Loop & Production Hardening
tags: [phase, agents, retention, loop, rls, hardening, p7]
phase: 7
duration: Weeks 19–22
scope: AI agents + Database hardening · Retention engine · Loop mechanism
status: not-started
created: 2026-04-14
---

# Phase 7 — Stage 7 Agents, Retention Loop & Production Hardening

> [!important] Why this phase is the retention engine
> A founder who raises their Seed round via Digi Incubator could leave — their funding is done. The Stage 7 agents give them reason to stay: post-funding operations, investor reporting, and the loop mechanism that detects when they're ready for Series A and re-opens the funding journey with 12–18 months of real data. This is what makes churn structurally hard.

> [!note] Production hardening items accumulated across phases
> PostgreSQL RLS, `agent_version` management, owner transfer flow, founding member pricing, and the CAC tracking model were all deferred from earlier phases. They all land here — this is the final hardening sweep before scale.

---

## Prerequisites (from [[07-phase-6|Phase 6]])

- [ ] All six personas live (founder, investor, mentor, bank, govt, student)
- [ ] All six agents live with fire-and-poll async
- [ ] Audit log with 4+ weeks of real data
- [ ] Enterprise pilots active
- [ ] `planning_data` agent output columns fully deprecated from `startup_ideas`

---

## Step 1 — Unit economics monitor agent

> [!tip] Reads from `startups.mrr` + `planning_data` history. No new tables needed.

```python
# agents/unit_economics_monitor/graph.py

class UnitEconomicsState(TypedDict):
    org_id: str
    startup: dict
    prior_runs: list[dict]
    metrics: dict        # computed metrics
    alerts: list[str]    # triggered alerts

def compute_metrics(state: UnitEconomicsState) -> UnitEconomicsState:
    """Compute MRR growth, burn rate, LTV:CAC ratio from planning_data history."""
    financial_runs = [r for r in state['prior_runs'] if r['panel'] == 'financial_projections']
    latest = financial_runs[0] if financial_runs else None

    metrics = {
        "mrr": state['startup']['mrr'],
        "mrr_growth_pct": compute_mrr_growth(state['prior_runs']),
        "burn_rate": latest['output_data'].get('burn_rate') if latest else None,
        "runway_months": compute_runway(latest) if latest else None,
    }
    alerts = []
    if metrics['runway_months'] and metrics['runway_months'] < 6:
        alerts.append("RUNWAY_CRITICAL: Less than 6 months remaining")
    if metrics['mrr_growth_pct'] and metrics['mrr_growth_pct'] < 0:
        alerts.append("MRR_DECLINE: Revenue declining month-over-month")

    return {**state, "metrics": metrics, "alerts": alerts}

graph = StateGraph(UnitEconomicsState)
graph.add_node("compute", compute_metrics)
graph.add_node("generate_summary", generate_llm_summary)
graph.set_entry_point("compute")
graph.add_edge("compute", "generate_summary")
```

---

## Step 2 — Investor update agent

```python
# agents/investor_update/graph.py
# panel = 'investor_update' · llm task = 'generation'

"""
Reads:
- startup_milestones (last 30 days, is_public = false OK for founder's own use)
- startup.mrr
- planning_data runs (last financial + gtm)

Outputs structured monthly update with sections:
- Highlights (3 bullet points)
- Key metrics (MRR, growth, runway)
- Challenges
- Asks (what the founder needs from investors)
"""
```

---

## Step 3 — Hiring plan agent (business_model_type aware)

```python
# agents/hiring_plan/graph.py
# panel = 'hiring_plan' · reads business_model_type from AgentContext

HIRING_CONTEXT = {
    'saas':             "Prioritise: PM, senior backend engineer, growth marketer",
    'marketplace':      "Prioritise: ops manager, supply-side BD, data analyst",
    'physical_product': "Prioritise: supply chain lead, QA engineer, D2C marketer",
    'service':          "Prioritise: delivery lead, account manager, operations",
    'deep_tech':        "Prioritise: research engineer, IP/patent counsel, BD for grants",
}

def build_hiring_context(state):
    bmt = state['startup']['business_model_type']
    return {**state, "hiring_guidance": HIRING_CONTEXT.get(bmt, "")}
```

---

## Step 4 — Next round readiness agent + the loop mechanism

> [!important] This agent triggers the platform's retention loop
> When the agent detects: runway < 9 months AND MRR growing AND conviction_score ≥ 65 — it re-opens Stage 5 (Observatory, traction signals) and Stage 6 (connections, funding) for the founder. The founder goes through them again with 12–18 months of real data and a re-scored conviction.

```python
# agents/next_round_readiness/graph.py

def check_loop_trigger(state: dict) -> str:
    """Decide whether to trigger the funding loop."""
    metrics = state['metrics']
    startup = state['startup']

    runway_ok   = metrics.get('runway_months', 99) < 9
    growth_ok   = metrics.get('mrr_growth_pct', 0) > 5
    score_ok    = (startup.get('conviction_score') or 0) >= 65

    if runway_ok and growth_ok and score_ok:
        return "trigger_loop"
    return "not_ready"

# api/authenticated/founder/readiness.py

@router.post("/agents/next-round/trigger")
async def trigger_loop(run_id: str, ctx: TenantContext = Depends(get_tenant_context)):
    """
    When next-round agent fires:
    1. Re-score conviction with latest data
    2. Unlock Stage 5 and Stage 6 journey sections
    3. Start a new data room assembly
    """
    await startup_repo.set_journey_stage(ctx, 'fundraising')
    await submit_agent_run(ctx, 'conviction_scorer', {"rerun": True, "trigger": "loop"})
    await submit_agent_run(ctx, 'series_a_data_room', {})
    return {"loop_triggered": True}
```

**Loop progression:**
```
First loop:  Seed round    (Stages 5+6 with 0–6mo data)
Second loop: Series A      (Stages 5+6 with 12–18mo data + re-scored conviction)
Third loop:  Series B      (Full data room, mature unit economics)
```

---

## Step 5 — Series A data room agent

```python
# agents/series_a_data_room/graph.py
# panel = 'series_a_data_room' · llm task = 'generation'
# Assembles from planning_data runs across all panels

"""
Assembles:
- Market research (most recent run)
- Conviction score with trend over time
- Lean canvas (most recent)
- Financial projections (most recent)
- GTM strategy (most recent)
- Public milestones (last 12 months)
- Unit economics summary
- Team information

Output: structured JSON data room
On Scale plan: white-label PDF export via Azure Blob
"""
```

---

## Step 6 — CAC model and cohort LTV (open pricing gap)

> [!danger] Inversion gap — CAC is mentioned nowhere in the docs. Revenue projections without CAC cannot confirm unit economics work.

```sql
-- New table: track acquisition by channel
CREATE TABLE user_acquisitions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) UNIQUE,
    channel     VARCHAR(50),  -- 'organic', 'referral', 'paid_search', 'event', 'content'
    campaign    VARCHAR(100),
    cost_inr    INTEGER,      -- CAC in rupees for this user
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- LTV tracking — monthly snapshot per org
CREATE TABLE ltv_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    snapshot_month DATE NOT NULL,
    cumulative_revenue_inr INTEGER NOT NULL,
    plan_tier   VARCHAR(20),
    UNIQUE (org_id, snapshot_month)
);
```

**LTV:CAC dashboard:**
```python
async def get_unit_economics_summary():
    return await db.fetchrow(
        """
        SELECT
            AVG(ua.cost_inr)               AS avg_cac,
            AVG(ltv.cumulative_revenue_inr) AS avg_ltv_12mo,
            AVG(ltv.cumulative_revenue_inr)
                / NULLIF(AVG(ua.cost_inr), 0) AS ltv_cac_ratio
        FROM user_acquisitions ua
        JOIN memberships m ON m.user_id = ua.user_id AND m.role='owner'
        JOIN ltv_snapshots ltv ON ltv.org_id = m.org_id
            AND ltv.snapshot_month = date_trunc('month', now() - interval '12 months')
        """
    )
```

**Target: LTV:CAC ≥ 5× by Month 18.**

---

## Step 7 — Founding member pricing tier (open pricing gap)

> [!danger] Inversion gap — no launch-phase pricing exists. Early founders need a reason to commit annually before the platform has full traction.

```python
# Launch pricing — time-limited, annual only
FOUNDING_MEMBER_PRICING = {
    'founding_builder': {
        'price_annual_inr': 12000,    # ₹12,000/yr vs ₹23,988 regular
        'available_until': '2026-12-31',
        'max_seats': 500,             # cap to create urgency
        'features': 'all builder features',
    }
}

# Webhook handler addition — founding_builder plan
async def handle_founding_payment(payload):
    # Same flow as builder, different plan_tier string
    await db.execute(
        "UPDATE subscriptions SET plan_tier='founding_builder', expires_at=$1 WHERE org_id=$2",
        datetime.utcnow() + timedelta(days=365), org_id
    )
```

---

## Step 8 — Owner transfer flow (orphan prevention)

> [!danger] Inversion gap — if the sole owner deletes their account, the org is permanently inaccessible
> No ownership transfer mechanism exists. An org with 0 members and no owner cannot be recovered without direct DB intervention.

```sql
CREATE TABLE ownership_transfers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    from_user   UUID NOT NULL REFERENCES users(id),
    to_user     UUID NOT NULL REFERENCES users(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','cancelled')),
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    expires_at  TIMESTAMP NOT NULL DEFAULT (now() + interval '7 days')
);
```

```python
async def initiate_owner_transfer(ctx: TenantContext, to_user_id: UUID):
    """Owner can transfer ownership to another member."""
    if ctx.role != 'owner':
        raise HTTPException(403, "Only owner can transfer ownership")

    # Verify target is a member
    membership = await db.fetchrow(
        "SELECT id FROM memberships WHERE user_id=$1 AND org_id=$2 AND deleted_at IS NULL",
        to_user_id, ctx.tenant_id
    )
    if not membership:
        raise HTTPException(400, "Transfer target must be a current member")

    return await db.insert(ownership_transfers,
        org_id=ctx.tenant_id,
        from_user=ctx.user_id,
        to_user=to_user_id
    )

async def complete_owner_transfer(transfer_id: UUID, accepting_user_id: UUID):
    async with db.transaction():
        transfer = await db.fetchrow(
            "SELECT * FROM ownership_transfers WHERE id=$1 AND to_user=$2 AND status='pending'",
            transfer_id, accepting_user_id
        )
        if not transfer:
            raise HTTPException(404)

        # Swap roles
        await db.execute(
            "UPDATE memberships SET role='admin' WHERE user_id=$1 AND org_id=$2",
            transfer['from_user'], transfer['org_id']
        )
        await db.execute(
            "UPDATE memberships SET role='owner' WHERE user_id=$1 AND org_id=$2",
            transfer['to_user'], transfer['org_id']
        )
        await db.execute(
            "UPDATE ownership_transfers SET status='accepted' WHERE id=$1",
            transfer_id
        )
```

**Guard before account deletion:**
```python
async def delete_user_account(ctx: TenantContext):
    # Check: is user the sole owner of any org?
    sole_owner_orgs = await db.fetch(
        """SELECT o.name FROM organizations o
           JOIN memberships m ON m.org_id = o.id
           WHERE m.user_id = $1 AND m.role = 'owner' AND m.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM memberships m2
               WHERE m2.org_id = o.id AND m2.role = 'owner'
               AND m2.user_id != $1 AND m2.deleted_at IS NULL
           )""",
        ctx.user_id
    )
    if sole_owner_orgs:
        raise HTTPException(400, {
            "error": "sole_owner",
            "orgs": [o['name'] for o in sole_owner_orgs],
            "message": "Transfer ownership before deleting account"
        })
```

---

## Step 9 — PostgreSQL Row Level Security (production hardening)

> [!danger] P0 gap from inversion analysis — the middleware is the first line of defence. RLS is the safety net under it. Without RLS, one missing WHERE clause leaks all tenants' data.

```sql
-- Enable RLS on every domain table
ALTER TABLE startup_ideas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_data      ENABLE ROW LEVEL SECURITY;
ALTER TABLE startup_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_pipeline      ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_sessions    ENABLE ROW LEVEL SECURITY;

-- Policy for org-scoped tables
CREATE POLICY tenant_isolation_org ON startup_ideas
    USING (org_id = current_setting('app.org_id', true)::uuid);

-- Policy for user-scoped tables
CREATE POLICY tenant_isolation_user ON mentor_profiles
    USING (user_id = current_setting('app.user_id', true)::uuid);

-- Set at request start in middleware
-- app/middleware/tenant_middleware.py
async def set_rls_context(ctx: TenantContext):
    if ctx.tenant_type == 'org':
        await db.execute("SET LOCAL app.org_id = $1", str(ctx.tenant_id))
    elif ctx.tenant_type == 'user':
        await db.execute("SET LOCAL app.user_id = $1", str(ctx.tenant_id))
```

> [!warning] Observatory view must be queried with a superuser or bypass-RLS role
> The Observatory is intentionally cross-tenant. Use a separate DB connection with `BYPASSRLS` for the Observatory query, not the application connection. This makes the exception explicit in code, not invisible.

```python
# repositories/observatory_repo.py
async def query_observatory(filters: dict) -> list:
    """Uses bypass-RLS connection — intentional cross-tenant read."""
    async with bypass_rls_db.acquire() as conn:  # separate pool with BYPASSRLS role
        return await conn.fetch("SELECT * FROM observatory_view WHERE ...", ...)
```

---

## Step 10 — `agent_version` migration for existing runs

> [!danger] P0 gap — all Phase 1 runs were written with `agent_version='v1'`. Any future agent format change will silently fail on v1 rows without version-aware deserialization.

```python
# agents/base_agent.py — add version-aware output reading

AGENT_OUTPUT_SCHEMAS = {
    'market_research': {
        'v1': MarketResearchOutputV1,
        'v2': MarketResearchOutputV2,  # future
    },
    'conviction_scorer': {
        'v1': ConvictionOutputV1,
    },
}

def parse_agent_output(panel: str, version: str, output_data: dict):
    schema = AGENT_OUTPUT_SCHEMAS.get(panel, {}).get(version)
    if not schema:
        raise ValueError(f"Unknown agent output schema: {panel} {version}")
    return schema(**output_data)
```

---

## Verification checklist

- [ ] Unit economics monitor agent live (reads MRR + planning_data history)
- [ ] Investor update agent live (monthly generation)
- [ ] Hiring plan agent: output differs by business_model_type
- [ ] Next round readiness agent: detects loop trigger conditions
- [ ] Loop mechanism: re-opens Stage 5 + 6 when triggered
- [ ] Series A data room assembler: pulls from all planning_data panels
- [ ] `user_acquisitions` + `ltv_snapshots` tables for CAC tracking
- [ ] LTV:CAC dashboard in admin
- [ ] Founding member pricing tier: `founding_builder` plan with annual-only gate
- [ ] Owner transfer flow: initiate → accept → roles swapped
- [ ] Account deletion blocked if sole owner of any org
- [ ] PostgreSQL RLS enabled on all 10 domain tables
- [ ] RLS context set in tenant_middleware at request start
- [ ] Observatory queries use bypass-RLS connection (named, not hidden)
- [ ] `agent_version`-aware output parsing in `base_agent.py`
- [ ] Premium mentor listing (₹499/mo) growth lever available but not mandatory

---

## What Phase 7 does NOT do

> [!note] These are post-Phase-7 concerns — flagged for future roadmap
- Schema-per-tenant for specific enterprise bank/govt clients (application code unchanged — only connection routing changes)
- Mobile app (mentioned in pitch deck as part of ₹3–5Cr ask)
- API access tier (exists as a `scale` plan feature — actual API key management system is post-Phase 7)
- Third-party integrations (Zoho, Tally, etc.)

---

## Full production readiness checklist (post Phase 7)

- [ ] All 8 phase checklists complete
- [ ] PostgreSQL RLS active on all domain tables
- [ ] Audit log has data for all personas and actions
- [ ] LTV:CAC ratio tracked and above 3× (target: 5× by Month 18)
- [ ] Observatory 50-startup minimum maintained
- [ ] Enterprise pilot → contract conversion rate tracked (target: >70%)
- [ ] `agent_version` on all planning_data rows (backfill v1 if needed)
- [ ] Owner transfer flow tested end-to-end
- [ ] Founding member tier available for early cohort

---

## Links

- Previous: [[07-phase-6|Phase 6 — Bank & Government]]
- Back to: [[00-index|Index]]
- Journey: [[07-operate-and-grow]]
- Inversion gaps: [[10-inversion-tenancy]] · [[11-inversion-pricing]]
- Stage 7 rationale: [[stage-7-rationale]]
- Loop design: [[next-round-readiness-agent]] · [[series-a-data-room-agent]]
