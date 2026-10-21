# Backend Architecture Migration
**keehoo AI-Kruise — Backend**
**Date:** June 2026
**Audience:** Engineering Team

---

## Table of Contents

1. [Previous Architecture (Intended)](#1-previous-architecture-intended)
2. [Current State (Reality)](#2-current-state-reality)
3. [Proposed Architecture — Hexagonal](#3-proposed-architecture--hexagonal)
4. [Building & Testing One Domain (Forms POC)](#4-building--testing-one-domain-forms-poc)
5. [Version Controlling Plan](#5-version-controlling-plan)

---

## 1. Previous Architecture (Intended)

The backend was structured as a classic **N-Tier / Layered Architecture**:

```
Request
  │
  ▼
┌─────────────────────────────┐
│   API Layer  (app/api/v1/)  │  FastAPI routers — HTTP in, HTTP out
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  Service Layer (app/services/)│  Business logic
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│ Repository Layer (app/repos/)│  Data access abstraction
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  Database  (MongoDB)        │
└─────────────────────────────┘
```

### Folder Structure (as designed)

```
app/
├── api/v1/          ← HTTP routers (thin, delegates to services)
├── services/        ← Business logic
├── repositories/    ← Data access layer (one file per entity)
├── models/          ← DB models
├── schemas/         ← Pydantic request/response types
├── nodes/handlers/  ← Workflow node execution logic
├── agent/           ← LLM/LangGraph agent
├── db/              ← DB session/connection
└── core/            ← Shared utilities (exceptions, security)
```

### Design Intention

| Layer | Responsibility |
|---|---|
| `api/v1/` | Parse request, call service, return response |
| `services/` | Business rules, orchestration |
| `repositories/` | MongoDB queries, no business logic |
| `models/` | SQLAlchemy/document models |
| `schemas/` | Pydantic I/O contracts |

---

## 2. Current State (Reality)

The intended N-tier structure **collapsed in practice** into what can be called a **Fat Service** pattern. The layers exist as folders but the boundaries are not enforced.

### What went wrong

#### 2.1 Repository layer is vestigial

Most `repositories/` files are empty or near-empty (e.g., `repositories/workflow.py` = 1 line). Services bypass the repository layer entirely and call `get_database()` directly.

```python
# Actual pattern inside app/services/workflow.py
from app.db.session import get_database

async def get_workflow(workflow_id, org_id):
    db = await get_database()           # ← Service IS the repository
    return await db.workflows.find_one(...)
```

#### 2.2 Services are tangled

Services import other services freely with no enforced dependency direction. Example from `workflow_executor.py`:

```python
from app.services.assignee_resolution import resolve_assignee_user_id
from app.services.notification import create_notification
from app.services.notification_service import send_email
from app.services.smtp_outbound import send_simple_email_async
from app.services.wait_token import create_wait_token_for_pause
from app.services.workflow_hitl_tasks import create_tasks_for_pause
```

Example from `forms/service.py`:

```python
from app.db.session import get_database
from app.agent.llm import get_chat_model, get_structured_model
from app.services.workflow import start_workflow
from app.services.tool_executor import execute_tool
from app.services.secrets import resolve_secret
```

#### 2.3 No seam for testing

Because services reach directly into MongoDB, any unit test must either:
- Spin up a real MongoDB instance, or
- Mock the entire `get_database()` call and every collection method

This makes small, fast, isolated tests practically impossible.

### Impact on development

| Pain Point | Root Cause |
|---|---|
| Adding a feature touches 5+ files | No clear ownership boundary per feature |
| Hard to know what a service does without tracing all imports | No port/interface contracts |
| Tests require a live DB or complex mocks | Services coupled directly to Motor/MongoDB |
| Regression risk is high | Any service change can ripple unpredictably |

### Dependency diagram (actual)

```
API Router
    │
    ▼
Service A ──────────────► DB (get_database)
    │
    ├──► Service B ──────► DB
    │        │
    │        └──► Service C ──► DB
    │
    └──► Service D ──────► DB
              │
              └──► Agent / LLM
```

Everything reaches everything. There is no enforced wall.

---

## 3. Proposed Architecture — Hexagonal

**Hexagonal Architecture** (also called Ports & Adapters) inverts the dependency rule:
> Business logic defines *what it needs* via interfaces (ports). Infrastructure implements those interfaces (adapters). Business logic never imports infrastructure.

```
          ┌──────────────────────────────────────────┐
          │               DOMAIN                      │
          │  (pure Python — no FastAPI, no Motor)     │
          │                                           │
          │   models.py  ←  ports.py  →  service.py  │
          └────────────────┬────────────┬─────────────┘
                           │            │
              implements   │            │  implements
                           │            │
          ┌────────────────▼──┐    ┌────▼──────────────────┐
          │  Inbound Adapters │    │  Outbound Adapters     │
          │  (FastAPI routers)│    │  (MongoDB, SMTP, LLM)  │
          └───────────────────┘    └────────────────────────┘
```

### Target Folder Structure

```
app/
│
├── domain/                          ← Pure business logic. Zero framework imports.
│   ├── workflow/
│   │   ├── models.py                ← Domain entities (plain dataclasses / Pydantic)
│   │   ├── ports.py                 ← Outbound port interfaces (Protocol / ABC)
│   │   └── service.py               ← Business logic — depends ONLY on ports
│   │
│   ├── execution/
│   │   ├── models.py
│   │   ├── ports.py
│   │   └── service.py               ← DAG walker, HITL logic
│   │
│   ├── forms/
│   │   ├── models.py
│   │   ├── ports.py
│   │   └── service.py
│   │
│   ├── auth/
│   │   └── ...
│   │
│   └── shared/
│       ├── exceptions.py            ← Domain exceptions (no HTTP status codes)
│       └── value_objects.py         ← OrgId, WorkflowId, UserId typed wrappers
│
├── adapters/
│   ├── inbound/                     ← PRIMARY adapters — outside world calls us
│   │   └── api/
│   │       └── v1/
│   │           ├── workflows.py     ← Thin: parse HTTP → call service → serialize
│   │           ├── forms.py
│   │           ├── auth.py
│   │           └── ...
│   │
│   └── outbound/                    ← SECONDARY adapters — we call the outside world
│       ├── mongodb/
│       │   ├── workflow_repo.py     ← Implements WorkflowRepository port
│       │   ├── execution_repo.py
│       │   └── forms_repo.py
│       ├── smtp/
│       │   └── email_adapter.py     ← Implements NotifierPort
│       ├── llm/
│       │   └── anthropic_adapter.py ← Implements LLMPort
│       └── mcp/
│           └── mcp_client.py        ← Implements ToolExecutorPort
│
├── infrastructure/                  ← Wiring only. No business logic.
│   ├── db/
│   │   └── session.py               ← Motor client, connection factory
│   ├── config.py                    ← Settings (env vars)
│   └── dependencies.py              ← FastAPI Depends() — binds ports to adapters
│
├── agent/                           ← LangGraph agent (self-contained subsystem)
│   ├── graph.py
│   ├── nodes/
│   ├── prompts/
│   └── state.py
│
└── main.py
```

### Import Rules (enforced, not optional)

| Layer | May import | Must NOT import |
|---|---|---|
| `domain/` | only `domain/shared/` | adapters, infrastructure, FastAPI, Motor |
| `adapters/inbound/` | `domain/`, `infrastructure/` | other adapters |
| `adapters/outbound/` | `domain/` ports, `infrastructure/` | `adapters/inbound/` |
| `infrastructure/` | adapters, domain | — |

### What this unlocks

| Before | After |
|---|---|
| Test requires live MongoDB | Test uses `FakeRepository` in memory |
| Adding a feature = trace 5+ files | Add a method to the port + service + one adapter |
| Services know about SMTP, LLM, HTTP | Services know only their domain port |
| Swapping MongoDB for Postgres = rewrite | Swap one adapter file |

---

## 4. Building & Testing One Domain (Forms POC)

We prove the pattern on the **`forms`** domain — it is self-contained and already has a partial `repository.py` stub.

### Step-by-step build order

#### Step 1 — Create folder skeleton

```
app/domain/forms/__init__.py
app/domain/forms/models.py
app/domain/forms/ports.py
app/domain/forms/service.py
app/adapters/outbound/mongodb/forms_repo.py
app/infrastructure/dependencies.py  (update)
```

#### Step 2 — Domain model (`domain/forms/models.py`)

Pure Pydantic, no Motor, no FastAPI:

```python
from pydantic import BaseModel
from typing import Any

class Form(BaseModel):
    form_id: str
    org_id: str
    name: str
    fields: list[dict[str, Any]]
    status: str = "draft"
```

#### Step 3 — Port interface (`domain/forms/ports.py`)

```python
from typing import Protocol
from app.domain.forms.models import Form

class FormRepository(Protocol):
    async def get_by_id(self, form_id: str, org_id: str) -> Form | None: ...
    async def list_for_org(self, org_id: str) -> list[Form]: ...
    async def save(self, form: Form) -> Form: ...
    async def delete(self, form_id: str, org_id: str) -> None: ...
```

#### Step 4 — Domain service (`domain/forms/service.py`)

Pure business logic. No `get_database()`, no imports from `adapters/`:

```python
from app.domain.forms.models import Form
from app.domain.forms.ports import FormRepository
from app.domain.shared.exceptions import NotFound, Forbidden

class FormsService:
    def __init__(self, repo: FormRepository):
        self._repo = repo

    async def get_form(self, form_id: str, org_id: str) -> Form:
        form = await self._repo.get_by_id(form_id, org_id)
        if form is None:
            raise NotFound(f"Form {form_id} not found")
        return form

    async def publish_form(self, form_id: str, org_id: str) -> Form:
        form = await self.get_form(form_id, org_id)
        if form.status == "published":
            return form
        form.status = "published"
        return await self._repo.save(form)
```

#### Step 5 — MongoDB adapter (`adapters/outbound/mongodb/forms_repo.py`)

All Motor/MongoDB code lives here and nowhere else:

```python
from app.domain.forms.models import Form
from app.infrastructure.db.session import get_database

class MongoFormsRepository:
    async def get_by_id(self, form_id: str, org_id: str) -> Form | None:
        db = await get_database()
        doc = await db.forms.find_one({"form_id": form_id, "org_id": org_id})
        return Form(**doc) if doc else None

    async def list_for_org(self, org_id: str) -> list[Form]:
        db = await get_database()
        docs = await db.forms.find({"org_id": org_id}).to_list(None)
        return [Form(**d) for d in docs]

    async def save(self, form: Form) -> Form:
        db = await get_database()
        await db.forms.replace_one(
            {"form_id": form.form_id},
            form.model_dump(),
            upsert=True,
        )
        return form

    async def delete(self, form_id: str, org_id: str) -> None:
        db = await get_database()
        await db.forms.delete_one({"form_id": form_id, "org_id": org_id})
```

#### Step 6 — Wire via Depends (`infrastructure/dependencies.py`)

```python
from fastapi import Depends
from app.adapters.outbound.mongodb.forms_repo import MongoFormsRepository
from app.domain.forms.service import FormsService

def get_forms_repo() -> MongoFormsRepository:
    return MongoFormsRepository()

def get_forms_service(
    repo: MongoFormsRepository = Depends(get_forms_repo),
) -> FormsService:
    return FormsService(repo)
```

#### Step 7 — Thin API router (`adapters/inbound/api/v1/forms.py`)

```python
from fastapi import APIRouter, Depends
from app.domain.forms.service import FormsService
from app.infrastructure.dependencies import get_forms_service

router = APIRouter(prefix="/forms", tags=["forms"])

@router.get("/{form_id}")
async def get_form(
    form_id: str,
    svc: FormsService = Depends(get_forms_service),
    current_user: dict = Depends(get_current_user),
):
    form = await svc.get_form(form_id, current_user["org_id"])
    return form.model_dump()
```

#### Step 8 — Unit test with no database

```python
# tests/domain/forms/test_forms_service.py

import pytest
from app.domain.forms.models import Form
from app.domain.forms.service import FormsService
from app.domain.shared.exceptions import NotFound

class FakeFormsRepository:
    def __init__(self):
        self._store: dict[str, Form] = {}

    async def get_by_id(self, form_id, org_id):
        return self._store.get(form_id)

    async def list_for_org(self, org_id):
        return [f for f in self._store.values() if f.org_id == org_id]

    async def save(self, form):
        self._store[form.form_id] = form
        return form

    async def delete(self, form_id, org_id):
        self._store.pop(form_id, None)


@pytest.fixture
def repo():
    return FakeFormsRepository()

@pytest.fixture
def service(repo):
    return FormsService(repo)


async def test_get_form_raises_not_found_when_missing(service):
    with pytest.raises(NotFound):
        await service.get_form("nonexistent", "org1")


async def test_publish_form_sets_status(service, repo):
    repo._store["f1"] = Form(
        form_id="f1", org_id="org1", name="Test", fields=[], status="draft"
    )
    result = await service.publish_form("f1", "org1")
    assert result.status == "published"


async def test_publish_already_published_is_idempotent(service, repo):
    repo._store["f1"] = Form(
        form_id="f1", org_id="org1", name="Test", fields=[], status="published"
    )
    result = await service.publish_form("f1", "org1")
    assert result.status == "published"
```

These tests run in milliseconds — no MongoDB, no network, no environment setup.

---

## 5. Version Controlling Plan

### Repository

**Remote:** `https://repo.corp.infokalash.com/keehoo-products/planner/keehoo_ai_kruise_backend.git`

### Branch strategy

```
main
  │
  ├── review-p1              (current active work — untouched)
  ├── team-AI/staging        (integration branch — untouched)
  │
  └── poc/hexagonal-architecture    ← NEW branch for this migration
        │
        ├── commit 1: add domain/forms/ skeleton
        ├── commit 2: domain model + port interface
        ├── commit 3: FormsService (pure logic)
        ├── commit 4: MongoFormsRepository adapter
        ├── commit 5: wire Depends() in infrastructure
        ├── commit 6: thin API router
        └── commit 7: unit tests — FakeFormsRepository
```

### Commands to set up

```bash
cd "keehoo_ai_kruise_backend"

# Sync main first
git fetch origin
git checkout main
git pull origin main

# Create POC branch
git checkout -b poc/hexagonal-architecture

# Push when ready for team review
git push -u origin poc/hexagonal-architecture
```

### Migration policy (after POC is approved)

| Phase | What happens | Branch |
|---|---|---|
| POC | Migrate `forms` domain only | `poc/hexagonal-architecture` |
| Review | Team reviews MR, agrees on pattern | MR → `main` |
| Phase 1 | Migrate `workflow` domain | `feat/hex-workflow` |
| Phase 2 | Migrate `execution` domain | `feat/hex-execution` |
| Phase 3 | Migrate `auth`, `notifications` | `feat/hex-auth-notifications` |
| Done | Delete old `app/services/` flat files | — |

### Rules during migration

1. **Never migrate and add features in the same branch.** Structural moves only.
2. **Old code stays working** until the new domain is wired and tested end-to-end.
3. **Every migrated domain must have unit tests** using a `Fake*Repository` before the MR is opened.
4. **No circular imports.** If a domain service needs another domain, it goes through a port — not a direct import.
5. **`main` is always deployable.** POC branches do not break existing tests.

---

*Prepared by: Engineering — keehoo AI-Kruise Backend Team*
