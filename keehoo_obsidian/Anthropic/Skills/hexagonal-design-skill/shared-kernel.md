# Shared Kernel — Multi-Module Rules

The shared kernel is code that multiple modules depend on.
It must be kept **minimal** — every addition affects all modules.
It must contain **no module-specific logic** — only universal primitives.

---

## When Do You Need a Shared Kernel?

You need it the moment you have **two or more domain modules** that need to:
- Share common value objects (Money, Email, PhoneNumber)
- Communicate via domain events without coupling to each other
- Use the same database session factory
- Use the same base exception hierarchy

---

## Shared Kernel Folder Structure

```
src/
└── shared_kernel/
    ├── domain/
    │   ├── __init__.py
    │   ├── events.py            # Base DomainEvent + EventBus port
    │   ├── value_objects.py     # Universal value objects (Money, Email, etc.)
    │   └── exceptions.py        # Base domain exception hierarchy
    │
    └── infrastructure/
        ├── __init__.py
        ├── database.py          # SQLAlchemy Base + session factory
        └── event_bus.py         # EventBus implementation + FastAPI dependency
```

---

## Shared Kernel Code

### `shared_kernel/domain/events.py`

```python
from dataclasses import dataclass, field
from uuid import UUID, uuid4
from datetime import datetime, timezone
from abc import ABC, abstractmethod


@dataclass
class DomainEvent:
    """Base class for all domain events across all modules.
    
    Fields use defaults so subclasses can define their required fields first.
    Subclasses MUST use @dataclass(kw_only=True) to avoid TypeError from
    Python's rule that fields with defaults cannot precede fields without defaults.
    """
    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class EventBus(ABC):
    """Port: any event bus implementation must satisfy this contract."""

    @abstractmethod
    def publish(self, event: DomainEvent) -> None: ...

    @abstractmethod
    def subscribe(self, event_type: type, handler: callable) -> None: ...
```

### `shared_kernel/domain/value_objects.py`

```python
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str  # ISO 4217 — e.g. "INR", "USD", "EUR"

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("Money cannot be negative")
        if len(self.currency) != 3:
            raise ValueError("Currency must be 3-letter ISO code")

    def add(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("Cannot add different currencies")
        return Money(amount=self.amount + other.amount, currency=self.currency)

    def multiply(self, factor: int | Decimal) -> "Money":
        return Money(amount=self.amount * Decimal(str(factor)), currency=self.currency)


@dataclass(frozen=True)
class Email:
    value: str

    def __post_init__(self):
        if "@" not in self.value or "." not in self.value.split("@")[-1]:
            raise ValueError(f"Invalid email address: {self.value}")

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class PhoneNumber:
    value: str  # E.164 format: +91XXXXXXXXXX

    def __post_init__(self):
        if not self.value.startswith("+"):
            raise ValueError("Phone number must be in E.164 format (+countrycode...)")
```

### `shared_kernel/domain/exceptions.py`

```python
class DomainException(Exception):
    """Base for all domain rule violations."""
    pass


class EntityNotFoundException(DomainException):
    """Raised when a required entity does not exist."""
    def __init__(self, entity_type: str, entity_id):
        super().__init__(f"{entity_type} with id {entity_id} not found")
        self.entity_type = entity_type
        self.entity_id = entity_id


class DomainValidationError(DomainException):
    """Raised when a domain rule is violated."""
    pass


class UnauthorizedDomainOperation(DomainException):
    """Raised when an operation is not permitted."""
    pass
```

### `shared_kernel/infrastructure/database.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from typing import Generator
import os


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/dbname")

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """All SQLAlchemy ORM models across all modules inherit from this."""
    pass


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency: provides a request-scoped database session."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

### `shared_kernel/infrastructure/event_bus.py`

```python
from collections import defaultdict

from src.shared_kernel.domain.events import DomainEvent, EventBus


class InMemoryEventBus(EventBus):
    """Simple synchronous in-memory event bus. Swap for Celery/RabbitMQ later."""

    def __init__(self):
        self._handlers: dict[type, list[callable]] = defaultdict(list)

    def publish(self, event: DomainEvent) -> None:
        for handler in self._handlers[type(event)]:
            handler(event)

    def subscribe(self, event_type: type, handler: callable) -> None:
        self._handlers[event_type].append(handler)


# Singleton for the application lifetime
_event_bus = InMemoryEventBus()


def get_event_bus() -> EventBus:
    """FastAPI dependency: returns the application event bus."""
    return _event_bus
```

---

## How Modules Communicate Without Coupling

### The Rule First — Then The Pattern

**A module's public contract to the rest of the system is its `domain/events.py` only.**

Other modules may import from `another_module/domain/events.py`.
Other modules must NEVER import from:
- `another_module/domain/entities.py`
- `another_module/domain/value_objects.py`
- `another_module/application/`
- `another_module/infrastructure/`

```
What other modules CAN see:          What other modules CANNOT see:
────────────────────────────         ────────────────────────────────
orders/domain/events.py    ✅        orders/domain/entities.py      ✗
                                     orders/domain/value_objects.py ✗
                                     orders/application/            ✗
                                     orders/infrastructure/         ✗
```

---

### Pattern 1 — Event lives in shared_kernel (PREFERRED for cross-module events)

Use this when the event crosses module boundaries. Move it to shared_kernel so
neither module depends on the other.

**When you move an event to shared_kernel, remove it from the module's `domain/events.py`.**
Two definitions of the same event class will not match on the event bus — the bus
uses the class type as the key, and `orders.domain.events.OrderPlaced` is a different
type from `shared_kernel.domain.events.OrderPlaced` even if they look identical.

```
Orders Module                    shared_kernel              Notifications Module
─────────────                    ─────────────              ────────────────────
PlaceOrderService                domain/events.py           NotificationHandler
  publishes →                    OrderPlaced           ←      subscribes to
```

**`src/shared_kernel/domain/events.py`** — event defined here:
```python
@dataclass
class OrderPlaced(DomainEvent):
    order_id: UUID
    customer_id: UUID
    total_amount: str
```

**`src/orders/application/use_cases/place_order.py`** — publisher:
```python
from src.shared_kernel.domain.events import EventBus, OrderPlaced

# inside execute():
self._event_bus.publish(OrderPlaced(
    order_id=order.id,
    customer_id=order.customer_id,
    total_amount=str(order.total().amount),
))
```

**`src/notifications/infrastructure/event_handlers.py`** — subscriber:
```python
# Imports ONLY from shared_kernel — zero knowledge of orders module
from src.shared_kernel.domain.events import OrderPlaced, EventBus
from src.notifications.application.ports.incoming import SendOrderConfirmationUseCase


class OrderPlacedHandler:
    def __init__(self, use_case: SendOrderConfirmationUseCase):
        self._use_case = use_case

    def __call__(self, event: OrderPlaced) -> None:
        self._use_case.execute(event.customer_id, event.order_id)


def register_event_handlers(event_bus: EventBus, use_case: SendOrderConfirmationUseCase):
    event_bus.subscribe(OrderPlaced, OrderPlacedHandler(use_case))
```

**Result**: Orders and Notifications have zero knowledge of each other.

---

### Pattern 2 — Event lives in the publishing module (ACCEPTABLE, one-way only)

Use this only when the event is tightly coupled to Orders' concept and moving it
to shared_kernel would pollute it with module-specific language.

The subscriber (Notifications) imports from Orders' `domain/events.py` — **this one
file only**. This creates a deliberate, documented one-way dependency.

```
Orders Module                    Notifications Module
─────────────────                ─────────────────────
orders/domain/events.py   ←──── imports from here (ONLY this file)
```

**`src/notifications/infrastructure/event_handlers.py`**:
```python
# ONE acceptable cross-module import — domain events of the publishing module only
from src.orders.domain.events import OrderPlaced

from src.notifications.application.ports.incoming import SendOrderConfirmationUseCase


class OrderPlacedHandler:
    def __init__(self, use_case: SendOrderConfirmationUseCase):
        self._use_case = use_case

    def __call__(self, event: OrderPlaced) -> None:
        self._use_case.execute(event.customer_id, event.order_id)
```

**When to use Pattern 1 vs Pattern 2:**

| Situation | Pattern |
|-----------|---------|
| Multiple modules subscribe to the same event | 1 — shared_kernel |
| Event carries data meaningful across the whole system | 1 — shared_kernel |
| Event is tightly coupled to one module's language | 2 — publishing module |
| You want zero inter-module imports | 1 — always |

---

### What NEVER happens — direct entity access across modules

If Notifications ever needs data about an Order (e.g., full order details for the email),
it does NOT import `Order` from the orders module.

Instead, it either:
1. Reads what it needs from the event payload (preferred — put enough data in the event)
2. Queries Orders' read-only data via a dedicated query use case exposed through Orders' incoming port
3. Maintains its own local copy of the data it needs, kept in sync via events

```python
# WRONG — never do this in notifications
from src.orders.domain.entities import Order  # ✗ entity crossing module boundary

# RIGHT — the event carries what notifications needs
class OrderPlaced(DomainEvent):
    order_id: UUID
    customer_id: UUID
    customer_email: str    # include what downstream modules need
    total_amount: str
    line_items: list[dict] # primitives only — no domain entity types
```

---

## What Belongs in the Shared Kernel vs. a Module

| Belongs in Shared Kernel | Belongs in a Module |
|--------------------------|---------------------|
| `Money`, `Email`, `PhoneNumber` value objects | `Order`, `User`, `Invoice` entities |
| `DomainEvent` base class | `OrderPlaced`, `UserRegistered` events |
| `EventBus` port + implementation | `OrderRepository`, `PaymentGateway` ports |
| `Base` SQLAlchemy declarative | `OrderModel`, `UserModel` ORM tables |
| `get_db_session()` dependency | `get_order_repository()` dependency |
| `DomainException` base | `InvalidOrderStatus`, `InsufficientStock` |
| `EntityNotFoundException` | Module-specific not-found errors |

---

## What Must NEVER Enter the Shared Kernel

- Any domain entity (`Order`, `User`, `Product`) — these belong to their module
- Any use case logic — business processes belong to their module
- Any module-specific validation rules
- Anything that would require changing the shared kernel when a module changes

**The test**: if adding a feature to Module A forces a change in the shared kernel,
the shared kernel has too much in it. Refactor.

---

## Multi-Module Project Root Structure

```
src/
├── shared_kernel/           # Universal shared code
│   ├── domain/
│   └── infrastructure/
│
├── orders/                  # Domain module
│   ├── domain/
│   ├── application/
│   └── infrastructure/
│
├── users/                   # Domain module
│   ├── domain/
│   ├── application/
│   └── infrastructure/
│
├── notifications/           # Domain module
│   ├── domain/
│   ├── application/
│   └── infrastructure/
│
└── main.py                  # FastAPI app — only place that imports all modules
```

### `main.py` — The Only Place Everything Connects

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.shared_kernel.infrastructure.database import Base, engine
from src.shared_kernel.infrastructure.event_bus import get_event_bus
from src.shared_kernel.domain.exceptions import EntityNotFoundException, DomainValidationError

# Import only routers and event handler registrations — never module internals
from src.orders.infrastructure.adapters.driving.http.router import router as orders_router
from src.users.infrastructure.adapters.driving.http.router import router as users_router
from src.notifications.infrastructure.event_handlers import register_event_handlers


# --- Lifespan: replaces deprecated @app.on_event (FastAPI >= 0.93) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # WARNING: create_all is for development only.
    # Production MUST use Alembic migrations instead.
    Base.metadata.create_all(bind=engine)

    event_bus = get_event_bus()
    register_event_handlers(event_bus)
    yield
    # Shutdown (add cleanup here if needed)


app = FastAPI(title="My Application", lifespan=lifespan)


# --- Exception handlers: convert domain exceptions → HTTP responses ---
# Without these, any DomainException becomes an unhandled 500 error.

@app.exception_handler(EntityNotFoundException)
def entity_not_found_handler(request: Request, exc: EntityNotFoundException):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(DomainValidationError)
def domain_validation_handler(request: Request, exc: DomainValidationError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# --- Register routers ---
app.include_router(orders_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
```
