# Code Patterns — Hexagonal Architecture FastAPI

This file contains the exact code template for each layer.
Use the module name `orders` as the example throughout.

---

## 1. Domain Entity (`domain/entities.py`)

```python
from dataclasses import dataclass, field
from uuid import UUID, uuid4
from decimal import Decimal
from enum import Enum
from datetime import datetime, timezone

# Shared value objects always come from shared_kernel — never redefine them per module
from src.shared_kernel.domain.value_objects import Money

# DO NOT import domain events here — entities never import events.
# Events are published BY use cases AFTER an entity operation succeeds.


class OrderStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


@dataclass
class OrderItem:
    product_id: UUID
    name: str
    quantity: int
    unit_price: Money

    @property
    def subtotal(self) -> Money:
        return Money(
            amount=self.unit_price.amount * self.quantity,
            currency=self.unit_price.currency
        )


@dataclass
class Order:
    id: UUID
    customer_id: UUID
    items: list[OrderItem]
    status: OrderStatus
    created_at: datetime

    # --- Factory method (preferred over __init__ for creation logic) ---
    @classmethod
    def create(cls, customer_id: UUID, items: list[OrderItem]) -> "Order":
        if not items:
            raise ValueError("Order must have at least one item")
        return cls(
            id=uuid4(),
            customer_id=customer_id,
            items=items,
            status=OrderStatus.PENDING,
            created_at=datetime.now(timezone.utc),  # utcnow() deprecated in Python 3.12+
        )

    # --- Business rules live here ---
    def total(self) -> Money:
        total = sum(item.subtotal.amount for item in self.items)
        return Money(amount=total, currency=self.items[0].unit_price.currency)

    def cancel(self) -> None:
        if self.status != OrderStatus.PENDING:
            raise ValueError(f"Cannot cancel order in status {self.status}")
        self.status = OrderStatus.CANCELLED

    def confirm(self) -> None:
        if self.status != OrderStatus.PENDING:
            raise ValueError(f"Cannot confirm order in status {self.status}")
        self.status = OrderStatus.CONFIRMED
```

**Rules for entities:**
- Use `@dataclass`, never inherit from SQLAlchemy Base or Pydantic BaseModel
- Business rules as methods on the entity (not in use cases)
- Use factory classmethods for creation with validation
- No imports from application or infrastructure layers

---

## 2. Value Object (`domain/value_objects.py`)

This file contains ONLY value objects that are specific to this module.
Universal value objects (Money, Email, PhoneNumber) live in shared_kernel and are imported from there.
Never redefine shared_kernel types here — it creates two diverging definitions.

```python
from dataclasses import dataclass
from uuid import UUID


# Example of a MODULE-SPECIFIC value object (not in shared kernel)
@dataclass(frozen=True)
class OrderNumber:
    """Human-readable order reference, e.g. ORD-2024-00042."""
    value: str

    def __post_init__(self):
        if not self.value.startswith("ORD-"):
            raise ValueError("OrderNumber must start with 'ORD-'")

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class DeliveryAddress:
    street: str
    city: str
    postal_code: str
    country_code: str  # ISO 3166-1 alpha-2, e.g. "IN", "US"

    def __post_init__(self):
        if len(self.country_code) != 2:
            raise ValueError("country_code must be ISO 3166-1 alpha-2 (2 letters)")
```

**When to add a value object here vs shared_kernel:**
- Specific to this module's language? → here (`OrderNumber`, `DeliveryAddress`)
- Universal across the whole business? → shared_kernel (`Money`, `Email`, `PhoneNumber`)

**Import shared value objects like this:**
```python
# In any file within the orders module that needs Money:
from src.shared_kernel.domain.value_objects import Money
```

---

## 3. Domain Events (`domain/events.py`)

```python
from dataclasses import dataclass
from uuid import UUID
from datetime import datetime, timezone

# Import base event from shared kernel
from src.shared_kernel.domain.events import DomainEvent


# kw_only=True is REQUIRED on all DomainEvent subclasses.
# Reason: DomainEvent has fields with defaults (event_id, occurred_at).
# Python raises TypeError if a subclass adds fields WITHOUT defaults after them.
# kw_only=True resolves this by making all subclass fields keyword-only.

@dataclass(kw_only=True)
class OrderPlaced(DomainEvent):
    order_id: UUID
    customer_id: UUID
    total_amount: str  # Use primitives in events for serialisability


@dataclass(kw_only=True)
class OrderCancelled(DomainEvent):
    order_id: UUID
    reason: str
```

**Rules for domain events:**
- Always `@dataclass(kw_only=True)` when inheriting from `DomainEvent` — required to avoid `TypeError`
- Fields must be primitives or UUIDs only — never domain entity types
- Events are immutable records of what happened — no methods, no logic

---

## 4. Outgoing Ports (`application/ports/outgoing.py`)

These are the contracts the application layer writes.
Infrastructure must implement them. Domain never sees them.

```python
from abc import ABC, abstractmethod
from uuid import UUID

from src.orders.domain.entities import Order


class OrderRepository(ABC):
    """Contract: whatever stores orders must satisfy this."""

    @abstractmethod
    def save(self, order: Order) -> None: ...

    @abstractmethod
    def find_by_id(self, order_id: UUID) -> Order | None: ...

    @abstractmethod
    def find_by_customer(self, customer_id: UUID) -> list[Order]: ...


class PaymentGateway(ABC):
    """Contract: whatever processes payments must satisfy this."""

    @abstractmethod
    def charge(self, customer_id: UUID, amount_cents: int, currency: str) -> str:
        """Returns a payment reference ID."""
        ...
```

**Rules for outgoing ports:**
- ABC with `@abstractmethod` — no implementation here
- Method signatures use domain entities and primitives only
- No SQLAlchemy types, no HTTP types, no external library types
- Named for what the application NEEDS (not how it will be implemented)

---

## 5. Incoming Ports (`application/ports/incoming.py`)

Use case interfaces. Each use case gets one.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from uuid import UUID
from decimal import Decimal

from src.orders.domain.entities import Order  # application layer CAN import domain


# --- Typed data carriers for commands (never use list[dict] — use typed dataclasses) ---

@dataclass
class OrderItemData:
    """Typed carrier for item data inside a command. Not a domain entity."""
    product_id: UUID
    name: str
    quantity: int
    unit_price: Decimal
    currency: str


# --- Commands (intent to change state) ---

@dataclass
class PlaceOrderCommand:
    customer_id: UUID
    items: list[OrderItemData]  # typed — no magic string keys, no dict


@dataclass
class CancelOrderCommand:
    order_id: UUID
    reason: str


# --- Queries (intent to read state) ---

@dataclass
class GetOrderQuery:
    order_id: UUID


# --- Use Case Interfaces ---

class PlaceOrderUseCase(ABC):
    @abstractmethod
    def execute(self, command: PlaceOrderCommand) -> UUID:
        """Returns the new order ID."""
        ...


class CancelOrderUseCase(ABC):
    @abstractmethod
    def execute(self, command: CancelOrderCommand) -> None: ...


class GetOrderUseCase(ABC):
    @abstractmethod
    def execute(self, query: GetOrderQuery) -> Order | None: ...  # real type, not string
```

**Rules for incoming ports:**
- Commands = intent to change something (returns ID or None)
- Queries = intent to read something (returns data)
- Commands/Queries are plain `@dataclass` — no Pydantic
- Command data fields must be typed dataclasses — never `list[dict]`
- One interface per use case

---

## 6. Use Case (`application/use_cases/place_order.py`)

```python
from uuid import UUID

from src.orders.application.ports.incoming import PlaceOrderUseCase, PlaceOrderCommand
from src.orders.application.ports.outgoing import OrderRepository, PaymentGateway
from src.orders.domain.entities import Order, OrderItem, OrderStatus
from src.orders.domain.events import OrderPlaced
from src.shared_kernel.domain.value_objects import Money     # shared — import from shared_kernel
from src.shared_kernel.domain.events import EventBus        # shared — import from shared_kernel


class PlaceOrderService(PlaceOrderUseCase):

    def __init__(
        self,
        order_repository: OrderRepository,
        payment_gateway: PaymentGateway,
        event_bus: EventBus,
    ):
        self._order_repo = order_repository
        self._payment_gateway = payment_gateway
        self._event_bus = event_bus

    def execute(self, command: PlaceOrderCommand) -> UUID:
        # 1. Build domain objects from typed command fields — no dict key access
        items = [
            OrderItem(
                product_id=item.product_id,      # typed attribute, not item["product_id"]
                name=item.name,
                quantity=item.quantity,
                unit_price=Money(amount=item.unit_price, currency=item.currency),
            )
            for item in command.items
        ]

        # 2. Use domain factory — entity validates its own creation rules
        order = Order.create(customer_id=command.customer_id, items=items)

        # 3. Call outgoing port for payment
        total = order.total()
        self._payment_gateway.charge(
            customer_id=command.customer_id,
            amount_cents=int(total.amount * 100),
            currency=total.currency,
        )

        # 4. Persist via outgoing port
        self._order_repo.save(order)

        # 5. Publish domain event AFTER successful persistence
        self._event_bus.publish(OrderPlaced(
            order_id=order.id,
            customer_id=order.customer_id,
            total_amount=str(total.amount),
        ))

        return order.id
```

**Rules for use cases:**
- Only depends on port interfaces (ABCs) — never on concrete implementations
- Coordinates steps — does NOT contain business rule logic (that lives in entities)
- Receives Commands/Queries — never receives Pydantic models or HTTP request objects
- Returns domain entities, primitives, or None — never Pydantic models

---

## 7. Pydantic Schemas (`infrastructure/adapters/driving/http/schemas.py`)

These only exist at the HTTP adapter boundary.

```python
from pydantic import BaseModel, Field
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from enum import Enum


# --- Request schemas (what comes IN from HTTP) ---

class OrderItemRequest(BaseModel):
    product_id: UUID
    name: str
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)


class PlaceOrderRequest(BaseModel):
    customer_id: UUID
    items: list[OrderItemRequest] = Field(min_length=1)


# --- Response schemas (what goes OUT to HTTP) ---

class MoneyResponse(BaseModel):
    amount: Decimal
    currency: str


class OrderItemResponse(BaseModel):
    product_id: UUID
    name: str
    quantity: int
    unit_price: MoneyResponse


class OrderResponse(BaseModel):
    id: UUID
    customer_id: UUID
    status: str
    items: list[OrderItemResponse]
    total: MoneyResponse
    created_at: datetime

    model_config = {"from_attributes": True}
```

**Rules for schemas:**
- Live ONLY in `infrastructure/adapters/driving/http/`
- Validation happens here using Pydantic — not in use cases, not in domain
- Never import domain entities into schemas
- Never import schemas into domain or application layers

---

## 8. SQLAlchemy ORM Models (`infrastructure/adapters/driven/persistence/orm_models.py`)

```python
from sqlalchemy import String, Numeric, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from uuid import UUID
from datetime import datetime

from src.shared_kernel.infrastructure.database import Base  # shared declarative base


class OrderItemModel(Base):
    __tablename__ = "order_items"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    order_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("orders.id"))
    product_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))


class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    customer_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    status: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    items: Mapped[list[OrderItemModel]] = relationship(
        "OrderItemModel", cascade="all, delete-orphan", lazy="joined"
    )
```

**Rules for ORM models:**
- These are NOT domain entities — they are table mappings only
- No business logic here — no methods, no validation
- They inherit from the shared `Base` declarative base
- The repository converts between ORM model and domain entity

---

## 9. Repository Implementation (`infrastructure/adapters/driven/persistence/repository.py`)

```python
from uuid import UUID, uuid4
from decimal import Decimal

from sqlalchemy.orm import Session

from src.orders.application.ports.outgoing import OrderRepository
from src.orders.domain.entities import Order, OrderItem, OrderStatus
from src.shared_kernel.domain.value_objects import Money     # shared — import from shared_kernel
from src.orders.infrastructure.adapters.driven.persistence.orm_models import (
    OrderModel, OrderItemModel
)


class SQLAlchemyOrderRepository(OrderRepository):
    """Implements the OrderRepository port using SQLAlchemy."""

    def __init__(self, session: Session):
        self._session = session

    def save(self, order: Order) -> None:
        model = self._to_orm(order)
        self._session.merge(model)

    def find_by_id(self, order_id: UUID) -> Order | None:
        model = self._session.get(OrderModel, order_id)
        return self._to_entity(model) if model else None

    def find_by_customer(self, customer_id: UUID) -> list[Order]:
        models = (
            self._session.query(OrderModel)
            .filter(OrderModel.customer_id == customer_id)
            .all()
        )
        return [self._to_entity(m) for m in models]

    # --- Mapping methods (the adapter's core job) ---

    def _to_orm(self, order: Order) -> OrderModel:
        return OrderModel(
            id=order.id,
            customer_id=order.customer_id,
            status=order.status.value,
            created_at=order.created_at,
            items=[
                OrderItemModel(
                    id=uuid4(),             # always generate a fresh PK — never reuse product_id
                    order_id=order.id,
                    product_id=item.product_id,
                    name=item.name,
                    quantity=item.quantity,
                    unit_price=float(item.unit_price.amount),
                    currency=item.unit_price.currency,
                )
                for item in order.items
            ],
        )

    def _to_entity(self, model: OrderModel) -> Order:
        return Order(
            id=model.id,
            customer_id=model.customer_id,
            status=OrderStatus(model.status),
            created_at=model.created_at,
            items=[
                OrderItem(
                    product_id=item.product_id,
                    name=item.name,
                    quantity=item.quantity,
                    unit_price=Money(
                        amount=Decimal(str(item.unit_price)),
                        currency=item.currency,
                    ),
                )
                for item in model.items
            ],
        )
```

**Rules for repositories:**
- Implements the outgoing port ABC exactly
- Contains ONLY persistence logic — no business rules
- `_to_orm()` and `_to_entity()` are mandatory — never leak ORM models out
- Receives SQLAlchemy `Session` via constructor (injected, not created here)

---

## 10. FastAPI Router (`infrastructure/adapters/driving/http/router.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID

from src.orders.application.ports.incoming import (
    PlaceOrderUseCase,
    PlaceOrderCommand,
    OrderItemData,
    GetOrderUseCase,
    GetOrderQuery,
)
from src.orders.infrastructure.adapters.driving.http.schemas import (
    PlaceOrderRequest,
    OrderResponse,
    MoneyResponse,
    OrderItemResponse,
)
from src.orders.infrastructure.dependencies import get_place_order_use_case, get_order_use_case

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def place_order(
    request: PlaceOrderRequest,
    use_case: PlaceOrderUseCase = Depends(get_place_order_use_case),
):
    # 1. Translate HTTP request → Command using typed data carriers
    command = PlaceOrderCommand(
        customer_id=request.customer_id,
        items=[
            OrderItemData(
                product_id=item.product_id,
                name=item.name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                currency=item.currency,
            )
            for item in request.items
        ],
    )

    # 2. Call use case
    order_id = use_case.execute(command)

    # 3. Fetch and return (or return minimal response)
    return {"id": order_id}  # simplified — in practice fetch full order


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: UUID,
    use_case: GetOrderUseCase = Depends(get_order_use_case),
):
    query = GetOrderQuery(order_id=order_id)
    order = use_case.execute(query)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # 4. Translate domain entity → Response schema
    return OrderResponse(
        id=order.id,
        customer_id=order.customer_id,
        status=order.status.value,
        items=[
            OrderItemResponse(
                product_id=item.product_id,
                name=item.name,
                quantity=item.quantity,
                unit_price=MoneyResponse(
                    amount=item.unit_price.amount,
                    currency=item.unit_price.currency,
                ),
            )
            for item in order.items
        ],
        total=MoneyResponse(
            amount=order.total().amount,
            currency=order.total().currency,
        ),
        created_at=order.created_at,
    )
```

**Rules for routers:**
- Depends on use case interfaces (not concrete implementations)
- Job: parse → command → call use case → serialize
- Raise `HTTPException` for HTTP concerns only
- Never call repositories directly — always through use cases
- Never contain `if` statements about business rules

---

## 11. Dependency Wiring (`infrastructure/dependencies.py`)

```python
from fastapi import Depends
from sqlalchemy.orm import Session

from src.shared_kernel.infrastructure.database import get_db_session
from src.shared_kernel.infrastructure.event_bus import get_event_bus

from src.orders.application.ports.incoming import PlaceOrderUseCase, GetOrderUseCase
from src.orders.application.use_cases.place_order import PlaceOrderService
from src.orders.application.use_cases.get_order import GetOrderService
from src.orders.infrastructure.adapters.driven.persistence.repository import (
    SQLAlchemyOrderRepository,
)


def get_order_repository(session: Session = Depends(get_db_session)) -> SQLAlchemyOrderRepository:
    return SQLAlchemyOrderRepository(session=session)


def get_place_order_use_case(
    repo=Depends(get_order_repository),
    event_bus=Depends(get_event_bus),
) -> PlaceOrderUseCase:
    return PlaceOrderService(
        order_repository=repo,
        event_bus=event_bus,
    )


def get_order_use_case(
    repo=Depends(get_order_repository),
) -> GetOrderUseCase:
    return GetOrderService(order_repository=repo)
```

**Rules for dependency wiring:**
- This is the ONLY file that references concrete implementations
- Use case constructors always receive interfaces — wiring provides the concrete class
- Keep this file thin — no logic, only construction
- FastAPI's `Depends()` handles lifecycle (session scoping, etc.)
