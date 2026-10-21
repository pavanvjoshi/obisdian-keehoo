---
title: Phase 1 — Founder Persona (Solo Mode)
tags: [phase, founder, ai-agents, frontend, freemium, p1]
phase: 1
duration: Weeks 3–5
scope: Full stack · Founder flow · All 6 AI agents
status: not-started
created: 2026-04-14
---

# Phase 1 — Founder Persona (Solo Mode)

> [!important] Why this phase comes first
> This is the core product. Every other persona (investors, banks, mentors) depends on founders generating data. Nail this before adding any other persona. The freemium gate is the most important product decision in the pricing architecture.

> [!danger] Three inversion findings apply directly to this phase
> 1. All agent runs must be fire-and-poll async from day one — not synchronous
> 2. The UI must be built with 4 multi-user constraints baked in — even though team invites come in Phase 2
> 3. The `workers/` module and LangGraph checkpointing must be set up before the first agent runs
> 
> None of these were in the original Phase 1 scope. All three are here now.

---

## Prerequisites (from [[01-phase-0|Phase 0]])

- [ ] `users`, `organizations`, `memberships`, `subscriptions` tables live
- [ ] `startup_ideas` has `org_id`, `business_model_type`, `deleted_at`
- [ ] `planning_data` has `org_id`, `user_id`, `agent_version` — UNIQUE constraint dropped
- [ ] `TenantContext` dataclass and `tenant_middleware` implemented
- [ ] Route folders split: `public/` `anonymous/` `authenticated/`
- [ ] Session → org promotion transaction working

---

## Step 1 — Set up `workers/` module and job queue

> [!danger] Inversion fix — FastAPI BackgroundTasks will lose in-flight agent runs on deployment
> Azure OpenAI + LangGraph runs take 15–45 seconds. FastAPI BackgroundTasks run in the web process. A deployment, crash, or Azure Container App restart during a run loses it silently — the founder sees a spinner that never resolves. Celery with Redis (or Azure Service Bus) must be in place before the first agent runs.

### `core/queue.py`

```python
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "digi_incubator",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    result_expires=86400,  # 24 hours
    task_acks_late=True,   # Re-queue on worker crash
    worker_prefetch_multiplier=1,
)
```

### `workers/agent_worker.py`

```python
from app.core.queue import celery_app
from app.agents.base_agent import run_agent_graph
from app.repositories.planning_repo import update_run_status

@celery_app.task(bind=True, max_retries=3)
def execute_agent_run(self, run_id: str, agent_type: str, input_payload: dict, org_id: str, user_id: str):
    try:
        update_run_status(run_id, status='running')
        output = run_agent_graph(agent_type, input_payload)
        update_run_status(run_id, status='completed', output=output)
    except Exception as exc:
        update_run_status(run_id, status='failed', error=str(exc))
        raise self.retry(exc=exc, countdown=30)
```

---

## Step 2 — Set up LangGraph checkpointing

**This section is not implemented as we did not use many agent that requires multiple steps.** 

> [!danger] Inversion fix — LangGraph in-memory checkpointing loses mid-graph state on restart
> LangGraph checkpoints between graph nodes. In-memory means a process restart loses a 30-second market research run at node 5 of 8. PostgreSQL checkpointing stores state in the DB — the graph resumes from the last checkpoint after restart.

### `core/graph_store.py`

```python
from langgraph.checkpoint.postgres import PostgresSaver
from app.core.config import settings

def get_checkpointer() -> PostgresSaver:
    """
    LangGraph PostgreSQL checkpointer.
    Tables are created in a 'langgraph' schema — isolated from application tables.
    Run PostgresSaver.setup() once on app startup to create the schema.
    """
    return PostgresSaver.from_conn_string(
        settings.DATABASE_URL,
        schema_name="langgraph"
    )

# Call once at startup
async def setup_checkpointer():
    checkpointer = get_checkpointer()
    await checkpointer.setup()
```

---

## Step 3 — Set up `core/llm.py` as a factory

> [!warning] Inversion fix — single LLM client uses the most expensive model everywhere
> Market research needs GPT-4o with 128K context. Conviction scoring needs fast, cheap GPT-4o-mini. One client with one deployment wastes cost on every scoring call and hardcodes deployment names across agents.

### `core/llm.py`

```python
from langchain_openai import AzureChatOpenAI
from app.core.config import settings
from typing import Literal

AgentTask = Literal["research", "scoring", "structured", "fast", "generation"]

_TASK_CONFIG: dict[AgentTask, dict] = {
    "research":    {"deployment": settings.AZURE_GPT4O_DEPLOYMENT,      "max_tokens": 4096},
    "scoring":     {"deployment": settings.AZURE_GPT4O_MINI_DEPLOYMENT,  "max_tokens": 1024},
    "structured":  {"deployment": settings.AZURE_GPT4O_DEPLOYMENT,      "max_tokens": 2048},
    "fast":        {"deployment": settings.AZURE_GPT4O_MINI_DEPLOYMENT,  "max_tokens": 512},
    "generation":  {"deployment": settings.AZURE_GPT4O_DEPLOYMENT,      "max_tokens": 8192},
}

def get_llm(task: AgentTask) -> AzureChatOpenAI:
    cfg = _TASK_CONFIG[task]
    return AzureChatOpenAI(
        azure_deployment=cfg["deployment"],
        azure_endpoint=settings.AZURE_OAI_ENDPOINT,
        api_key=settings.AZURE_OAI_KEY,
        api_version=settings.AZURE_OAI_API_VERSION,
        max_tokens=cfg["max_tokens"],
        temperature=0.3,
    )
```

---

## Step 4 — Fire-and-poll agent run pattern

> [!danger] Inversion fix — synchronous agent execution times out
> Azure OpenAI calls within LangGraph graphs take 15–45 seconds. Default HTTP proxy timeouts on Azure are 60 seconds. Mobile connections are less. All agents must return immediately with a `run_id` and let the client poll for results.

* For **research agent** hybrid model is used, websocket is for logguru and polling is for status. 
* 

### API route — `authenticated/founder/agents.py`

```python
from fastapi import APIRouter, Depends
from app.core.context import TenantContext
from app.services.agent_service import submit_agent_run
from app.repositories.planning_repo import get_run_status

router = APIRouter()

@router.post("/agents/{agent_type}/run")
async def start_agent_run(
    agent_type: str,
    payload: AgentRunRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    # Check freemium gate before submitting
    await check_agent_run_allowed(ctx)

    # Create planning_data row with status='pending' — returns immediately
    run_id = await submit_agent_run(
        ctx=ctx,
        agent_type=agent_type,
        input_payload=payload.dict()
    )
    return {"run_id": run_id, "status": "pending"}

@router.get("/agents/runs/{run_id}")
async def get_run_result(
    run_id: str,
    ctx: TenantContext = Depends(get_tenant_context)
):
    return await get_run_status(ctx, run_id)
```

### `services/agent_service.py`

```python
async def submit_agent_run(ctx: TenantContext, agent_type: str, input_payload: dict) -> str:
    # Write planning_data row immediately — status = 'pending'
    run = await planning_repo.create_run(
        ctx=ctx,
        panel=agent_type,
        input_payload=input_payload,
        status='pending',
        agent_version='v1'
    )
    # Dispatch to Celery — returns immediately
    execute_agent_run.delay(
        run_id=str(run.id),
        agent_type=agent_type,
        input_payload=input_payload,
        org_id=str(ctx.tenant_id),
        user_id=str(ctx.user_id)
    )
    return str(run.id)
```

---

## Step 5 — Startup profile CRUD

```python
# repositories/startup_repo.py — all functions require TenantContext

async def get_startup(ctx: TenantContext) -> Startup | None:
    return await db.fetchrow(
        "SELECT * FROM startup_ideas WHERE org_id=$1 AND deleted_at IS NULL",
        ctx.tenant_id
    )

async def update_startup(ctx: TenantContext, data: StartupUpdate) -> Startup:
    return await db.fetchrow(
        """UPDATE startup_ideas SET name=$2, tagline=$3, sector=$4, stage=$5,
           business_model_type=$6, dpiit_number=$7, gstin=$8, mrr=$9
           WHERE org_id=$1 AND deleted_at IS NULL RETURNING *""",
        ctx.tenant_id, data.name, data.tagline, data.sector, data.stage,
        data.business_model_type, data.dpiit_number, data.gstin, data.mrr
    )
```

> [!tip] `business_model_type` must be set before GTM and Financial Projections agents run
> Prompt the founder to select their business type during onboarding. All agents from GTM onwards read this field before generating output. Agents: `saas` | `physical_product` | `service` | `marketplace` | `deep_tech`

---

## Step 6 — All 6 AI agents with `agents/context/`

> [!warning] Inversion fix — agents need to read app data but cannot own DB connections
> Some agents are not stateless. The conviction scorer reads previous scores to show improvement. Financial projections reads prior runs to build on the last model. Agents get a read-only `AgentContext` — writes always go back through `agent_service.py`.

### `agents/context/agent_context.py`

```python
@dataclass
class AgentContext:
    """Read-only data snapshot passed to agent graphs. Agents never write directly."""
    org_id: UUID
    user_id: UUID
    startup: dict              # current startup record
    prior_runs: list[dict]     # previous planning_data rows for this panel
    business_model_type: str   # drives agent branching from GTM onwards
    conviction_score: int | None  # for scorer to show improvement
```

### Agent matrix

| Agent | `panel` value | LLM task | Reads from AgentContext |
|---|---|---|---|
| Market Research | `market_research` | `research` | startup sector, location |
| Conviction Scorer | `conviction_scorer` | `scoring` | startup record, prior score |
| Lean Canvas | `lean_canvas` | `structured` | startup + market_research output |
| Market Sizing | `market_sizing` | `research` | startup sector |
| Financial Projections | `financial_projections` | `structured` | business_model_type, prior runs |
| GTM | `gtm` | `generation` | business_model_type |

### Blob key convention — `core/storage.py`

```python
def make_blob_key(org_id: str, run_id: str, panel: str) -> str:
    """All large agent outputs use this key pattern. Auditable and org-listable."""
    return f"agent-outputs/{org_id}/{panel}/{run_id}.json"
```

---

## Step 7 — Freemium enforcement

The `subscriptions` table was created in [[01-phase-0|Phase 0]] and seeded as `free` at signup. Phase 1 adds the enforcement logic.

```python
# services/billing_service.py
PLAN_LIMITS = {
    'free':      {'total_runs': 3, 'members': 1,  'storage_mb': 500},
    'builder':   {'total_runs': None, 'members': 3,  'storage_mb': 10240},
    'scale':     {'total_runs': None, 'members': None, 'storage_mb': None},
    'enterprise':{'total_runs': None, 'members': None, 'storage_mb': None},
}

async def check_agent_run_allowed(ctx: TenantContext):
    sub = await subscription_repo.get(ctx.tenant_id)
    limit = PLAN_LIMITS[sub.plan_tier]['total_runs']
    if limit is None:
        return  # unlimited
    run_count = await planning_repo.count_runs(ctx)
    if run_count >= limit:
        raise HTTPException(402, detail={
            "code": "run_limit_reached",
            "used": run_count,
            "limit": limit,
            "upgrade_to": "builder"
        })
```

### Freemium rules — never break

- [ ] Conviction score: 1 free run always available (first run is the product's best demo)
- [ ] Observatory `is_discoverable` toggle: always free regardless of plan
- [ ] Mentor booking: always free for founders (commission revenue, not subscription gate)
- [ ] GTM + Financial Projections: locked on `free` tier

---

## Step 8 — Startup milestones

```sql
CREATE TABLE startup_milestones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    startup_id  UUID NOT NULL REFERENCES startup_ideas(id),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    is_public   BOOLEAN NOT NULL DEFAULT false,
    achieved_at TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMP NULL
);
CREATE INDEX idx_milestones_org ON startup_milestones(org_id) WHERE deleted_at IS NULL;
```

> [!tip] Observatory seeding starts here
> The `is_discoverable` toggle goes live in Phase 1. Every founder who completes their conviction score should be prompted: *"Your startup can now appear to investors — make it discoverable?"*
> 
> **The Phase 4 investor launch requires 50+ discoverable startups.** Active promotion in Phase 1 and 2 is the mechanism. This is a product responsibility, not a marketing one.

---

## Step 9 — Document storage

`idea_documents` already has `org_id` from [[01-phase-0|Phase 0]]. Wire to Azure Blob Storage.

```python
# services/document_service.py
async def upload_document(ctx: TenantContext, file: UploadFile) -> IdeaDocument:
    await check_storage_quota(ctx)  # 500MB on free, 10GB on builder
    blob_key = f"documents/{ctx.tenant_id}/{uuid4()}/{file.filename}"
    await storage.upload(blob_key, await file.read())
    return await document_repo.create(ctx, filename=file.filename, blob_key=blob_key)
```

---

## Step 10 — Multi-user-ready UI constraints (4 rules)

> [!danger] Inversion fix — Phase 1 UI built solo-first creates Phase 2 refactor debt
> A UI built for one user makes implicit single-user assumptions. When Phase 2 adds a second user, 40% of Phase 2 becomes Phase 1 refactor, not new features. These 4 constraints cost near-zero in Phase 1 and save significant work in Phase 2.

**Constraint 1 — Every agent run shows `triggered_by`**
```
Run history table must display: "Market Research · run by riya@example.com · 2 hours ago"
In solo mode: it's always the founder. The label is there from day one.
```

**Constraint 2 — Org name in the nav header**
```
The nav must show the startup org name, not the user's name.
Solo mode: it's the same thing. Multi-user mode: it's the workspace, not the person.
```

**Constraint 3 — All client state keyed to `org_id`, not `user_id`**
```
No localStorage or session keys tied to user_id.
Use org_id as the state key everywhere. Switching persona = switching org_id key.
```

**Constraint 4 — Invite slot reserved in the UI**
```
Settings > Team shows an "Invite a team member" section.
In Phase 1: button shows "Coming soon".
In Phase 2: button becomes functional.
The UI slot is reserved — Phase 2 wires it up, doesn't create it.
```

---

## Agent run history dashboard requirements

- Display all runs per `panel` type, `ORDER BY created_at DESC`
- Show `triggered_by` (user email) on every row — constraint 1 above
- Show `status`: pending (spinner) · running (progress) · completed · failed (retry button)
- Show `agent_version` — if viewing a v1 run after v2 exists, show version tag
- Poll `/agents/runs/{run_id}` every 3 seconds while status is `pending` or `running`
- On `failed`: show error message + retry button (submits new run, does not overwrite)

---

## Verification checklist

- [ ] `workers/` module live with Celery + Redis
- [ ] `core/graph_store.py` with PostgreSQL LangGraph checkpointer running
- [ ] `core/llm.py` is a factory function (not a singleton)
- [ ] All 6 agents: market_research, conviction_scorer, lean_canvas, market_sizing, financial_projections, gtm
- [ ] All agents use fire-and-poll: `POST /run` → `{run_id}`, `GET /runs/{run_id}` → status
- [ ] `planning_data` row created at job submission with `status='pending'`
- [ ] Freemium enforcement: 3 total runs on `free` plan
- [ ] GTM + financial projections locked on free plan
- [ ] Conviction score: 1 free run allowed
- [ ] Observatory `is_discoverable` toggle free on all plans
- [ ] `startup_milestones` table live with `is_public` flag
- [ ] Document upload with storage quota check
- [ ] 4 multi-user UI constraints implemented
- [ ] Observatory toggle actively promoted after conviction score completes
- [ ] Agent run history shows `triggered_by` user email

---

## What is explicitly NOT done in Phase 1

> [!warning] These belong to later phases — do not build them here
- Do not build team invite emails — Phase 2
- Do not add Razorpay checkout — Phase 3
- Do not build the Observatory page for investors — Phase 4
- Do not build mentor search — Phase 5
- Do not deprecate agent output columns on `startup_ideas` until all reads go through `planning_data` exclusively — verify in Phase 2 before dropping

---

## Links

- Previous: [[01-phase-0|Phase 0 — POC Stabilisation]]
- Next: [[03-phase-2|Phase 2 — Multi-User & Invites]]
- Agent docs: [[conviction-scorer]] · [[market-research-agent]] · [[lean-canvas-agent]]
- Pricing rules: [[09-pricing-architecture]]
- Founder journey: [[01-the-spark]] · [[02-the-blueprint]] · [[03-the-build]]



---

### Modifications:

1. **Step 2 is not being implemented.** TheThe Celery retry mechanism (already in place) is sufficient. Add LangGraph checkpointing only if you introduce human-in-the-loop flows or graphs that take several minutes per run. Celery retry mechanism (already in place) is sufficient. Add LangGraph checkpointing only if you introduce human-in-the-loop flows or graphs that take several minutes per run.
