# Flujo de Datos entre Servicios

## Índice
1. [Visión General](#visión-general)
2. [Flujos Principales](#flujos-principales)
3. [Flujo de Autenticación](#flujo-de-autenticación)
4. [Flujo de Compra](#flujo-de-compra)
5. [Flujo de Inventario](#flujo-de-inventario)
6. [Flujo de Reportes](#flujo-de-reportes)
7. [Data Consistency](#data-consistency)

---

## Visión General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW OVERVIEW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│   │ Client  │────►│ Gateway │────►│ Service │────►│   DB    │              │
│   │         │◄────│         │◄────│         │◄────│         │              │
│   └─────────┘     └────┬────┘     └────┬────┘     └─────────┘              │
│                        │               │                                     │
│                        │    Events     │                                     │
│                        └───────────────┘                                     │
│                               │                                              │
│                               ▼                                              │
│                        ┌─────────────┐                                       │
│                        │ Message Bus │                                       │
│                        │  (RabbitMQ) │                                       │
│                        └─────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tipos de Flujo de Datos

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| **Síncrono** | Request/Response HTTP | GET /products, POST /orders |
| **Asíncrono** | Event-driven via message broker | OrderCreated, PaymentProcessed |
| **Híbrido** | Sync + Async combinados | Checkout flow |

---

## Flujos Principales

### Diagrama de Flujos de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MAIN DATA FLOWS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER REGISTRATION & AUTHENTICATION                                       │
│  ═══════════════════════════════════════                                    │
│                                                                              │
│  Client ──► Gateway ──► Auth Service ──► PostgreSQL                          │
│                              │                                              │
│                              └──► Event: UserRegistered ──► Notification     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  2. PRODUCT BROWSING & SEARCH                                               │
│  ═══════════════════════════════════                                        │
│                                                                              │
│  Client ──► Gateway ──► Product Service ──► PostgreSQL                       │
│                              │                                              │
│                              └──► Cache (Redis)                              │
│                              │                                              │
│                              └──► Search (Elasticsearch)                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  3. SHOPPING CART OPERATIONS                                                │
│  ════════════════════════════                                               │
│                                                                              │
│  Client ──► Gateway ──► Cart Service ──► Redis (Session)                     │
│                              │                                              │
│                              ├──► Validate: Product Service (HTTP)           │
│                              │                                              │
│                              └──► Persist: PostgreSQL (on checkout)          │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  4. ORDER CREATION (SAGA)                                                   │
│  ════════════════════════                                                   │
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐       │
│  │ Client  │──►│ Gateway │──►│  Order  │──►│Inventory│──►│ Payment │       │
│  │         │   │         │   │ Service │   │ Service │   │ Service │       │
│  └─────────┘   └─────────┘   └────┬────┘   └────┬────┘   └────┬────┘       │
│                                   │             │             │             │
│                                   │             │             │             │
│                              ┌────┴─────────────┴─────────────┴────┐       │
│                              │         EVENT BUS (RabbitMQ)         │       │
│                              │                                      │       │
│                              │  • OrderCreated                      │       │
│                              │  • InventoryReserved                 │       │
│                              │  • PaymentProcessed                  │       │
│                              │  • OrderConfirmed                    │       │
│                              └──────────────────────────────────────┘       │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  5. INVENTORY MANAGEMENT                                                    │
│  ═══════════════════════                                                    │
│                                                                              │
│  Order Service ──► Event: OrderCreated ──► Inventory Service                │
│                                                      │                       │
│                                                      ▼                       │
│                                              ┌─────────────┐                │
│                                              │ PostgreSQL  │                │
│                                              │ (Stock)     │                │
│                                              └──────┬──────┘                │
│                                                     │                        │
│                              ┌──────────────────────┘                        │
│                              │                                               │
│                              ▼                                               │
│                       Event: StockUpdated ──► Product Service                 │
│                                        ──► Reporting Service                 │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  6. NOTIFICATIONS                                                           │
│  ══════════════════                                                         │
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │   Order     │   │   Auth      │   │  Inventory  │   │  Payment    │     │
│  │   Service   │   │   Service   │   │   Service   │   │   Service   │     │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘     │
│         │                 │                 │                 │             │
│         └─────────────────┴─────────────────┴─────────────────┘             │
│                                   │                                         │
│                                   ▼                                         │
│                         ┌─────────────────┐                                 │
│                         │  Notification   │                                 │
│                         │    Service      │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│                    ┌─────────────┼─────────────┐                           │
│                    ▼             ▼             ▼                           │
│               ┌────────┐   ┌────────┐   ┌────────┐                        │
│               │ Email  │   │  SMS   │   │  Push  │                        │
│               └────────┘   └────────┘   └────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Autenticación

### Sequence Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │     │ Gateway │     │  Auth   │     │   DB    │     │  Redis  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │  1. POST /auth/register       │               │               │
     │──────────────────────────────►│               │               │
     │               │               │               │               │
     │               │  2. Forward   │               │               │
     │               │──────────────►│               │               │
     │               │               │               │               │
     │               │               │  3. Validate  │               │
     │               │               │  4. Hash pwd  │               │
     │               │               │  5. Save user │               │
     │               │               │──────────────►│               │
     │               │               │               │               │
     │               │               │  6. User saved│               │
     │               │               │◄──────────────│               │
     │               │               │               │               │
     │               │               │  7. Cache session              │
     │               │               │──────────────────────────────►│
     │               │               │               │               │
     │               │               │  8. Publish UserRegistered     │
     │               │               │─────┐         │               │
     │               │               │     │         │               │
     │               │               │◄────┘         │               │
     │               │               │               │               │
     │               │  9. Response (tokens)          │               │
     │               │◄──────────────│               │               │
     │               │               │               │               │
     │  10. Return tokens            │               │               │
     │◄──────────────────────────────│               │               │
     │               │               │               │               │
     │  11. POST /auth/login         │               │               │
     │──────────────────────────────►│               │               │
     │               │               │               │               │
     │               │  12. Forward  │               │               │
     │               │──────────────►│               │               │
     │               │               │               │               │
     │               │               │  13. Verify credentials        │
     │               │               │──────────────►│               │
     │               │               │               │               │
     │               │               │  14. User data│               │
     │               │               │◄──────────────│               │
     │               │               │               │               │
     │               │               │  15. Generate JWT + Refresh    │
     │               │               │               │               │
     │               │               │  16. Store refresh token       │
     │               │               │──────────────►│               │
     │               │               │               │               │
     │               │  17. Response (tokens)         │               │
     │               │◄──────────────│               │               │
     │               │               │               │               │
     │  18. Return tokens            │               │               │
     │◄──────────────────────────────│               │               │
     │               │               │               │               │
```

### Data Flow Details

| Paso | Descripción | Datos |
|------|-------------|-------|
| 1 | Cliente envía credenciales | `{ email, password, name }` |
| 3-5 | Validación y persistencia | User entity created |
| 7 | Cache de sesión | Session ID, user data |
| 8 | Evento de dominio | `UserRegistered` event |
| 15 | Generación de tokens | JWT (access), Refresh token |

---

## Flujo de Compra

### Checkout Flow (Saga Pattern)

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Client  │  │ Gateway │  │  Order  │  │Inventory│  │ Payment │  │ Notify  │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │            │            │
     │ 1. POST /orders/checkout              │            │            │
     │──────────────────────────────────────►│            │            │
     │            │            │            │            │            │
     │            │            │ 2. Validate cart items                 │
     │            │            │─────┐      │            │            │
     │            │            │     │      │            │            │
     │            │            │◄────┘      │            │            │
     │            │            │            │            │            │
     │            │            │ 3. Create Order (PENDING)              │
     │            │            │────────────┼────────────┼────────────►│
     │            │            │            │            │            │
     │            │            │ 4. Publish OrderCreated                │
     │            │            │────────────►│            │            │
     │            │            │            │            │            │
     │            │            │            │ 5. Reserve Inventory      │
     │            │            │            │            │            │
     │            │            │            │ 6. Publish InventoryReserved
     │            │            │            │────────────►│            │
     │            │            │            │            │            │
     │            │            │            │            │ 7. Process Payment
     │            │            │            │            │            │
     │            │            │            │            │ 8. Publish PaymentProcessed
     │            │            │            │            │────────────►│
     │            │            │            │            │            │
     │            │            │ 9. Update Order (CONFIRMED)            │
     │            │            │◄───────────┴────────────┘            │
     │            │            │            │            │            │
     │            │            │ 10. Publish OrderConfirmed             │
     │            │            │──────────────────────────────────────►│
     │            │            │            │            │            │
     │            │            │            │            │            │ 11. Send confirmation
     │            │            │            │            │            │
     │            │ 12. Response (order details)         │            │
     │            │◄───────────┘            │            │            │
     │            │            │            │            │            │
     │ 13. Order confirmation              │            │            │
     │◄───────────┘            │            │            │            │
     │            │            │            │            │            │
```

### Compensation Flow (Error Handling)

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  Order  │  │Inventory│  │ Payment │  │ Notify  │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │
     │            │            │ Payment FAILED
     │            │            │            │
     │            │            │◄───────────┘
     │            │            │            │
     │            │◄───────────┤ Compensate │
     │            │            │            │
     │            │ Release Reservation     │
     │            │            │            │
     │◄───────────┤ InventoryReleased       │
     │            │            │            │
     │ Cancel Order              │            │
     │            │            │            │
     │────────────┴────────────┴────────────► OrderCancelled notification
     │            │            │            │
```

### Data Transformations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA TRANSFORMATIONS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CART ──► ORDER                                                              │
│  ════════════════                                                            │
│                                                                              │
│  Cart {                              Order {                                │
│    userId,                             userId,                               │
│    items: [{                          items: [{                              │
│      productId,                          productId,                          │
│      quantity,      ───────────►         quantity,                           │
│      price                               price,                              │
│    }],                                   subtotal                            │
│    total                               }],                                   │
│  }                                     total,                                │
│                                        status: 'PENDING',                    │
│                                        createdAt                             │
│                                      }                                       │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ORDER ──► INVENTORY RESERVATION                                            │
│  ═════════════════════════════════                                          │
│                                                                              │
│  Order {                             Reservation {                          │
│    orderId,                            orderId,                              │
│    items: [{                          items: [{                              │
│      productId,      ───────────►        productId,                          │
│      quantity                            quantity,                           │
│    }]                                    reservedAt,                         │
│  }                                     expiresAt                             │
│                                      }                                       │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ORDER ──► PAYMENT                                                          │
│  ══════════════════                                                          │
│                                                                              │
│  Order {                             PaymentRequest {                        │
│    orderId,                            orderId,                              │
│    userId,                             userId,                               │
│    total,          ───────────►        amount,                               │
│    currency                            currency,                             │
│  }                                     paymentMethod                         │
│                                      }                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Inventario

### Stock Management Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INVENTORY DATA FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOURCES OF STOCK CHANGES                                                    │
│  ════════════════════════════                                                │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Order     │  │   Admin     │  │  Supplier   │  │   Returns   │        │
│  │   Service   │  │   Panel     │  │  Integration│  │   Process   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                                   ▼                                          │
│                         ┌─────────────────┐                                  │
│                         │ Inventory Service │                                │
│                         └────────┬────────┘                                  │
│                                  │                                           │
│                    ┌─────────────┼─────────────┐                            │
│                    ▼             ▼             ▼                            │
│              ┌────────┐   ┌────────┐   ┌────────┐                          │
│              │ Stock  │   │Movement│   │ Alerts │                          │
│              │  DB    │   │  Log   │   │  Queue │                          │
│              └────────┘   └────────┘   └────────┘                          │
│                    │           │               │                            │
│                    │           │               ▼                            │
│                    │           │        ┌─────────────┐                     │
│                    │           │        │ Low Stock   │                     │
│                    │           │        │ Alert Event │                     │
│                    │           │        └──────┬──────┘                     │
│                    │           │               │                            │
│                    │           │               ▼                            │
│                    │           │        ┌─────────────┐                     │
│                    │           └───────►│  Reporting  │                     │
│                    │                    │   Service   │                     │
│                    │                    └─────────────┘                     │
│                    │                                                        │
│                    ▼                                                        │
│             ┌─────────────┐                                                 │
│             │   Product   │                                                 │
│             │   Service   │                                                 │
│             │ (Stock sync)│                                                 │
│             └─────────────┘                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stock Reservation Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STOCK RESERVATION LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│   │ AVAILABLE│──►│RESERVED │──►│COMMITTED│──►│SHIPPED  │──►│DELIVERED│  │
│   │         │    │         │    │         │    │         │    │         │  │
│   │ Stock:  │    │ Stock:  │    │ Stock:  │    │ Stock:  │    │ Stock:  │  │
│   │ 100     │    │ 95      │    │ 95      │    │ 90      │    │ 90      │  │
│   │ Reserved│    │ Reserved│    │ Reserved│    │ Reserved│    │ Reserved│  │
│   │ 0       │    │ 5       │    │ 0       │    │ 0       │    │ 0       │  │
│   └─────────┘    └────┬────┘    └─────────┘    └─────────┘    └─────────┘  │
│                       │                                                     │
│                       │ (Timeout or Cancel)                                 │
│                       ▼                                                     │
│                  ┌─────────┐                                                │
│                  │RELEASED │                                                │
│                  │         │                                                │
│                  │ Stock:  │                                                │
│                  │ 100     │                                                │
│                  │ Reserved│                                                │
│                  │ 0       │                                                │
│                  └─────────┘                                                │
│                                                                              │
│   Transitions:                                                               │
│   • AVAILABLE → RESERVED: Order created, stock reserved                     │
│   • RESERVED → COMMITTED: Payment confirmed, reservation committed          │
│   • RESERVED → RELEASED: Order cancelled or timeout                         │
│   • COMMITTED → SHIPPED: Order shipped                                      │
│   • SHIPPED → DELIVERED: Order delivered                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Reportes

### Analytics Data Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REPORTING DATA PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DATA SOURCES                                                                │
│  ════════════                                                                │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Order     │  │   Product   │  │    User     │  │  Inventory  │        │
│  │   Events    │  │   Events    │  │   Events    │  │   Events    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                                   ▼                                          │
│                         ┌─────────────────┐                                  │
│                         │  Event Router   │                                  │
│                         │   (RabbitMQ)    │                                  │
│                         └────────┬────────┘                                  │
│                                  │                                           │
│                    ┌─────────────┼─────────────┐                            │
│                    ▼             ▼             ▼                            │
│              ┌────────┐   ┌────────┐   ┌────────┐                          │
│              │Real-time│   │ Batch  │   │  ML    │                          │
│              │Pipeline │   │Pipeline│   │Pipeline│                          │
│              └────┬───┘   └───┬────┘   └───┬────┘                          │
│                   │           │            │                                │
│                   ▼           ▼            ▼                                │
│              ┌─────────────────────────────────┐                            │
│              │      DATA WAREHOUSE             │                            │
│              │  ┌─────────┐  ┌─────────────┐  │                            │
│              │  │ ClickHouse│  │  PostgreSQL │  │                            │
│              │  │ (Analytics)│  │  (Reports)  │  │                            │
│              │  └─────────┘  └─────────────┘  │                            │
│              └─────────────────────────────────┘                            │
│                              │                                              │
│                              ▼                                              │
│              ┌─────────────────────────────────┐                            │
│              │      REPORTING SERVICE          │                            │
│              │  ┌─────────┐  ┌─────────────┐  │                            │
│              │  │Dashboards│  │   Exports   │  │                            │
│              │  │  (Grafana)│  │  (CSV/PDF)  │  │                            │
│              │  └─────────┘  └─────────────┘  │                            │
│              └─────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Consistency

### Consistency Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA CONSISTENCY PATTERNS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. EVENTUAL CONSISTENCY                                                     │
│  ═══════════════════════                                                     │
│                                                                              │
│  Service A ──► Event Bus ──► Service B                                      │
│       │                          │                                           │
│       │                          │ (Eventual)                                │
│       ▼                          ▼                                           │
│    State A                    State A'                                       │
│                                                                              │
│  Use cases:                                                                  │
│  • Inventory updates                                                         │
│  • Search index updates                                                      │
│  • Analytics data                                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  2. STRONG CONSISTENCY (Saga)                                                │
│  ════════════════════════════                                                │
│                                                                              │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                                  │
│  │  Step 1 │───►│  Step 2 │───►│  Step 3 │                                  │
│  │ Success │    │ Success │    │ Success │                                  │
│  └─────────┘    └─────────┘    └─────────┘                                  │
│       │              │              │                                        │
│       ▼              ▼              ▼                                        │
│    Commit        Commit        Commit                                        │
│                                                                              │
│  If Step 3 fails:                                                            │
│       │              │              │                                        │
│       ▼              ▼              ▼                                        │
│  Compensate  ◄──Compensate  ◄──Rollback                                     │
│                                                                              │
│  Use cases:                                                                  │
│  • Order processing                                                          │
│  • Payment workflows                                                         │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  3. READ-YOUR-WRITES CONSISTENCY                                             │
│  ═════════════════════════════════                                           │
│                                                                              │
│  Client ──► Write ──► Primary DB                                            │
│     │                                              │                         │
│     │                                              │ (Replication)           │
│     │                                              ▼                         │
│     │───────────────────────► Read ──► Replica DB (stale?)                  │
│                                                                              │
│  Solutions:                                                                  │
│  • Read from primary after write                                             │
│  • Session stickiness                                                        │
│  • Version tracking                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Consistency Matrix

| Operación | Consistencia | Mecanismo | Latencia Aceptable |
|-----------|--------------|-----------|-------------------|
| User login | Strong | DB transaction | < 100ms |
| Product search | Eventual | Cache + Search index | < 50ms |
| Add to cart | Strong | Redis transaction | < 20ms |
| Place order | Strong | Saga pattern | < 500ms |
| Inventory update | Eventual | Event-driven | < 1s |
| Report generation | Eventual | Async processing | < 5s |

---

## Referencias

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Event Catalog](EVENT_CATALOG.md)
- [API Specification](API_SPECIFICATION.md)
