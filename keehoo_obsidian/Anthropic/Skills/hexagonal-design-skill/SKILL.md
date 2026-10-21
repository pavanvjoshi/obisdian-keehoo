---
name: hexagonal-architecture-fastapi
description: >
  Use this skill whenever the user is building a Python FastAPI application using
  Hexagonal (Ports & Adapters) Architecture with Pydantic for schema validation,
  SQLAlchemy for ORM, and Python dataclasses for domain entities. Triggers when
  the user asks to: create a new module, add an endpoint, add a repository, define
  a use case, add a domain entity, wire dependencies, or asks where something should
  live in the architecture. Also triggers for questions like "where does X go?",
  "how do I structure Y?", or "should this be in domain or application?". Always
  use this skill before writing any code for this stack — it defines the non-negotiable
  structural rules every module must follow.
---

# Hexagonal Architecture — FastAPI / Python Skill

## The Core Mental Model (Never Forget This)

Every module has three concentric zones. **Dependencies only point inward.** Nothing in the centre ever imports from the outside.

```
┌─────────────────────────────────────────────────┐
│  INFRASTRUCTURE (outermost)                     │
│   FastAPI Routers · SQLAlchemy Models           │
│   Repository Implementations · Pydantic Schemas │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │  APPLICATION                            │   │
│   │   Use Cases · Ports (interfaces)        │   │
│   │                                         │   │
│   │   ┌───────────────────────────────┐     │   │
│   │   │  DOMAIN (innermost)           │     │   │
│   │   │   Dataclass Entities          │     │   │
│   │   │   Value Objects               │     │   │
│   │   │   Domain Services             │     │   │
│   │   │   Domain Events               │     │   │
│   │   └───────────────────────────────┘     │   │
│   └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Dependency rule**: Infrastructure imports Application. Application imports Domain. Domain imports nothing from this project.

---

## Tool → Architecture Role Mapping

| Tool | Architecture Role | Layer |
|------|------------------|-------|
| Python `@dataclass` | Domain Entity / Value Object | Domain |
| Python `ABC` / `Protocol` | Port (interface contract) | Application |
| Plain Python class | Use Case / Application Service | Application |
| FastAPI `APIRouter` | Driving Adapter (Primary) | Infrastructure |
| Pydantic `BaseModel` | Request / Response Schema | Infrastructure |
| SQLAlchemy `DeclarativeBase` | ORM Model (NOT domain entity) | Infrastructure |
| SQLAlchemy `Session` | Persistence mechanism | Infrastructure |
| Python class implementing ABC | Repository / Service Adapter | Infrastructure |
| FastAPI `Depends()` | Dependency injection wiring | Infrastructure |

---

## Single Module Folder Structure

For every domain module (e.g., `orders`, `users`, `billing`):

```
src/
└── {module}/
    ├── domain/
    │   ├── __init__.py
    │   ├── entities.py          # Pure @dataclass domain objects
    │   ├── value_objects.py     # Immutable @dataclass(frozen=True)
    │   ├── domain_services.py   # Logic spanning multiple entities
    │   └── events.py            # Domain events (what just happened)
    │
    ├── application/
    │   ├── __init__.py
    │   ├── ports/
    │   │   ├── __init__.py
    │   │   ├── incoming.py      # Primary ports — use case interfaces
    │   │   └── outgoing.py      # Secondary ports — repo/service interfaces
    │   └── use_cases/
    │       ├── __init__.py
    │       └── {action}.py      # One file per use case
    │
    └── infrastructure/
        ├── __init__.py
        ├── adapters/
        │   ├── driving/
        │   │   └── http/
        │   │       ├── router.py    # FastAPI router (primary adapter)
        │   │       └── schemas.py   # Pydantic models (request/response)
        │   └── driven/
        │       └── persistence/
        │           ├── orm_models.py    # SQLAlchemy table models
        │           └── repository.py   # Repo implementation
        └── dependencies.py             # FastAPI DI wiring for this module
```

Read `references/code-patterns.md` for the exact code template for each file.
Read `references/shared-kernel.md` for multi-module shared code rules.

---

## The Iron Rules (Never Violate These)

### Rule 1 — Domain imports only Python stdlib and shared_kernel.domain.
Domain entities and value objects may import from:
- Python standard library (`uuid`, `decimal`, `datetime`, `dataclasses`, `enum`)
- `src.shared_kernel.domain` (base events, shared value objects, base exceptions)

Domain must NEVER import from:
- SQLAlchemy, Pydantic, FastAPI, requests, or any other external library
- `src.shared_kernel.infrastructure`
- Any module's `application` or `infrastructure` layer

### Rule 2 — ORM models are NOT domain entities. They are separate classes.
SQLAlchemy `OrderModel` and domain `Order` are two different classes.
The repository's job is to convert between them. This is intentional.

### Rule 3 — Pydantic schemas live only in the infrastructure adapter layer.
`schemas.py` lives in `infrastructure/adapters/driving/http/`.
Use cases never receive or return Pydantic models. They receive commands/queries
(plain dataclasses) and return domain entities or primitive values.

### Rule 4 — Ports (interfaces) are owned by the Application layer.
`outgoing.py` defines what the domain needs from the outside world.
Infrastructure implements it. Domain never depends on the implementation.

### Rule 5 — Use cases depend only on port interfaces, never on concrete adapters.
`PlaceOrderService` receives `OrderRepository` (the ABC), never `SQLAlchemyOrderRepository`.
Dependency injection wires the concrete class at startup.

### Rule 6 — FastAPI routers only translate. They contain zero business logic.
Routers: parse request → build command → call use case → serialize response.
If there is an `if` statement in a router that is not about HTTP concerns, it is wrong.

### Rule 7 — Modules never import each other's entities, use cases, or infrastructure.
The ONLY acceptable cross-module import is `another_module/domain/events.py`.
Never import entities, value objects, ports, use cases, or adapters from another module.
If you need data from another module, put it in the event payload or move the event to shared_kernel.
Read `references/shared-kernel.md` for the two valid cross-module patterns.

### Rule 8 — Repositories NEVER call commit(). Ever.
`session.commit()` belongs exclusively to `get_db_session()` in `shared_kernel/infrastructure/database.py`.
The repository calls `session.add()`, `session.merge()`, `session.delete()`, `session.flush()` — never `session.commit()`.

Why this matters: if a use case saves two things (e.g. create a user AND send a welcome record),
a commit inside the first repository makes that write permanent before the second write succeeds.
If the second fails, your database is in a broken half-written state with no way to roll back.
The session manager commits once at the end of the entire request — all or nothing.

```python
# WRONG — repository controls the transaction
self._session.add(model)
self._session.commit()  # ← NEVER

# RIGHT — repository only stages the change
self._session.add(model)
self._session.flush()   # optional: makes ID available without committing
# session manager commits when the request succeeds
```

### Rule 9 — Business logic belongs on domain entities, not in use cases.
Use cases coordinate steps. Entities own rules.

If a use case contains an `if` about the state of a domain object, that logic belongs on the entity instead.

```python
# WRONG — use case decides business rule
def execute(self, command):
    todo = self._repo.find_by_id(command.todo_id)
    if todo.completed:           # ← business rule in use case
        todo.completed = False
    else:
        todo.completed = True
    return self._repo.save(todo)

# RIGHT — entity owns the rule, use case only coordinates
def execute(self, command):
    todo = self._repo.find_by_id(command.todo_id)
    todo.toggle()                # ← entity decides what toggle means
    return self._repo.save(todo)
```

Entities must expose named methods (`complete()`, `cancel()`, `toggle()`, `approve()`) that
encode the rules and raise `ValueError` when rules are violated.

### Rule 10 — Domain entity creation goes through a factory classmethod.
Never construct an entity directly in a use case. Use a `@classmethod` factory on the entity.
The factory is where `TodoTitle`, `Money`, and other value object validations are called —
not in the use case. The use case hands raw data to the factory; the factory validates and builds.

```python
# WRONG — use case does validation and construction
def execute(self, command):
    TodoTitle(command.title)     # ← validation in use case
    todo = Todo(title=command.title.strip(), ...)

# RIGHT — factory on entity handles validation and construction
def execute(self, command):
    todo = Todo.create(title=command.title, ...)   # ← entity factory owns this

# On the entity:
@classmethod
def create(cls, title: str, user_id: UUID, ...) -> "Todo":
    validated = TodoTitle(title)    # validation lives here, inside domain
    return cls(title=validated.value, user_id=user_id, ...)
```

### Rule 11 — Routers type their Depends() with port interfaces, not concrete classes.
The router must depend on the ABC (incoming port), not the concrete service implementation.
This is what makes the port the contract — if the router knows the concrete class, the port is pointless.

```python
# WRONG — router imports and types to concrete class
from src.todos.application.use_cases.create_todo import CreateTodoService
service: CreateTodoService = Depends(get_create_todo_service)

# RIGHT — router imports and types to the interface
from src.todos.application.ports.incoming import CreateTodoUseCase
service: CreateTodoUseCase = Depends(get_create_todo_service)
```

### Rule 12 — `Base` and `get_db_session` live in shared_kernel. Always.
`shared_kernel/infrastructure/database.py` owns `Base`, `engine`, `SessionLocal`, and `get_db_session`.
Every module's ORM models import `Base` from there.
No module's ORM file owns `Base`. No module imports `Base` from another module.

```python
# WRONG — Base owned by one module, others depend on it silently
from src.todos.infrastructure.adapters.driven.persistence.orm_models import Base

# RIGHT — Base lives in shared_kernel, every module imports from there
from src.shared_kernel.infrastructure.database import Base
```

---

## New Module Checklist

When creating a new module, build in this order:

**Prerequisites (do once for the whole project):**
- [ ] 0a. `shared_kernel/domain/` exists with `events.py`, `value_objects.py`, `exceptions.py`
- [ ] 0b. `shared_kernel/infrastructure/database.py` exists with `Base`, `get_db_session`
- [ ] 0c. `main.py` has exception handlers for `ValueError` and `DomainValidationError`

**Per module:**
- [ ] 1. Define domain entities with `@classmethod create()` factory (`domain/entities.py`)
- [ ] 2. Define value objects — module-specific only (`domain/value_objects.py`)
- [ ] 3. Define domain events with `@dataclass(kw_only=True)` (`domain/events.py`)
- [ ] 4. Define outgoing ports — repo/service interfaces (`application/ports/outgoing.py`)
- [ ] 5. Define incoming ports — typed Commands/Queries + use case ABCs (`application/ports/incoming.py`)
- [ ] 6. Implement use cases — coordination only, no business logic (`application/use_cases/`)
- [ ] 7. Define Pydantic schemas (`infrastructure/adapters/driving/http/schemas.py`)
- [ ] 8. Implement ORM models — import `Base` from `shared_kernel` (`infrastructure/.../orm_models.py`)
- [ ] 9. Implement repository — has both `_to_orm()` AND `_to_entity()`, NO `commit()` (`infrastructure/.../repository.py`)
- [ ] 10. Implement FastAPI router — typed to port interfaces, not concrete classes (`infrastructure/.../router.py`)
- [ ] 11. Wire dependencies — only file that touches concrete implementations (`infrastructure/dependencies.py`)
- [ ] 12. Register router in `main.py`

**Verification pass before committing:**
- [ ] V1. No `commit()` anywhere in any repository file
- [ ] V2. No concrete service class imported in any router file
- [ ] V3. No `datetime.utcnow()` anywhere — use `datetime.now(timezone.utc)`
- [ ] V4. No `list[dict]` in any command or query dataclass
- [ ] V5. No business `if` statements in any use case (those belong on entities)
- [ ] V6. `Base` imported from `shared_kernel` in every ORM model file
- [ ] V7. Every entity has a `@classmethod create()` factory