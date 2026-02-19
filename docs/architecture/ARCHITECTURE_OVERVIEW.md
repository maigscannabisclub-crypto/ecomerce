# Visión General de la Arquitectura

## Índice
1. [Introducción](#introducción)
2. [Principios de Diseño](#principios-de-diseño)
3. [Arquitectura de Alto Nivel](#arquitectura-de-alto-nivel)
4. [Bounded Contexts](#bounded-contexts)
5. [Comunicación entre Servicios](#comunicación-entre-servicios)
6. [Patrones de Diseño](#patrones-de-diseño)
7. [Decisiones de Arquitectura](#decisiones-de-arquitectura)

---

## Introducción

La plataforma E-Commerce Enterprise está diseñada como un sistema distribuido basado en microservicios. Esta arquitectura permite:

- **Escalabilidad independiente**: Cada servicio escala según su carga
- **Despliegue independiente**: Deployments sin afectar otros servicios
- **Tecnología políglota**: Cada servicio usa la mejor tecnología para su caso
- **Resiliencia**: Fallos aislados no afectan todo el sistema
- **Mantenibilidad**: Código más fácil de entender y modificar

## Principios de Diseño

### 1. Domain-Driven Design (DDD)

Los microservicios están organizados alrededor de **bounded contexts** del dominio de negocio:

```
┌─────────────────────────────────────────────────────────────────┐
│                      E-COMMERCE DOMAIN                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Identity  │  │  Catalog    │  │   Shopping  │             │
│  │   Context   │  │   Context   │  │   Context   │             │
│  │             │  │             │  │             │             │
│  │ • Users     │  │ • Products  │  │ • Cart      │             │
│  │ • Roles     │  │ • Categories│  │ • Checkout  │             │
│  │ • Permissions│ │ • Reviews   │  │ • Wishlist  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Order     │  │  Inventory  │  │   Payment   │             │
│  │   Context   │  │   Context   │  │   Context   │             │
│  │             │  │             │  │             │             │
│  │ • Orders    │  │ • Stock     │  │ • Payments  │             │
│  │ • History   │  │ • Warehouses│  │ • Refunds   │             │
│  │ • Tracking  │  │ • Alerts    │  │ • Invoices  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Clean Architecture

Cada microservicio sigue los principios de Clean Architecture:

```
┌─────────────────────────────────────────┐
│           Presentation Layer            │
│    (Controllers, Middleware, DTOs)      │
├─────────────────────────────────────────┤
│           Application Layer             │
│    (Use Cases, Services, Commands)      │
├─────────────────────────────────────────┤
│            Domain Layer                 │
│  (Entities, Value Objects, Domain Events)│
├─────────────────────────────────────────┤
│         Infrastructure Layer            │
│  (Repositories, External Services, DB)   │
└─────────────────────────────────────────┘
```

**Regla de Dependencia**: Las dependencias apuntan siempre hacia adentro (Domain es el centro).

### 3. SOLID Principles

- **S**ingle Responsibility: Cada servicio tiene una responsabilidad única
- **O**pen/Closed: Extensible sin modificar código existente
- **L**iskov Substitution: Interfaces bien definidas
- **I**nterface Segregation: APIs específicas por cliente
- **D**ependency Inversion: Depender de abstracciones

## Arquitectura de Alto Nivel

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Web App   │  │  Mobile App │  │  Admin App  │  │  Third-party Apps   │ │
│  │   (React)   │  │  (React     │  │   (Vue.js)  │  │    (REST API)       │ │
│  │             │  │   Native)   │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (3000)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Routing   │  │ Rate Limit  │  │ Auth Filter │  │  Request Validation │ │
│  │             │  │             │  │             │  │                     │ │
│  │ • Path-based│  │ • Token     │  │ • JWT       │  │ • Schema            │ │
│  │ • Versioning│  │   Bucket    │  │ • OAuth2    │  │   Validation        │ │
│  │ • Load      │  │ • IP-based  │  │ • API Keys  │  │ • Sanitization      │ │
│  │   Balancing │  │             │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Caching   │  │   Circuit   │  │   Request   │  │     Response        │ │
│  │             │  │   Breaker   │  │   Logging   │  │     Transform       │ │
│  │ • Redis     │  │             │  │             │  │                     │ │
│  │ • Cache     │  │ • Failure   │  │ • Access    │  │ • Pagination        │ │
│  │   Headers   │  │   Detection │  │   Logs      │  │ • Filtering         │ │
│  │             │  │ • Fallback  │  │ • Audit     │  │ • Formatting        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  AUTH SERVICE   │         │ PRODUCT SERVICE │         │  CART SERVICE   │
│    (3001)       │         │    (3002)       │         │    (3003)       │
│                 │         │                 │         │                 │
│ • User Mgmt     │         │ • Catalog       │         │ • Cart CRUD     │
│ • Auth/AuthZ    │         │ • Search        │         │ • Session Mgmt  │
│ • JWT Tokens    │         │ • Categories    │         │ • Pricing       │
│ • OAuth2        │         │ • Reviews       │         │ • Validation    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
           │                           │                           │
           ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  ORDER SERVICE  │         │INVENTORY SERVICE│         │REPORTING SERVICE│
│    (3004)       │         │    (3005)       │         │    (3006)       │
│                 │         │                 │         │                 │
│ • Order Mgmt    │         │ • Stock Mgmt    │         │ • Analytics     │
│ • Order Flow    │         │ • Reservations  │         │ • Reports       │
│ • History       │         │ • Alerts        │         │ • Dashboards    │
│ • Tracking      │         │ • Warehouses    │         │ • Exports       │
└─────────────────┘         └─────────────────┘         └─────────────────┘
           │                           │                           │
           ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│PAYMENT SERVICE  │         │NOTIFICATION SVC │         │  (More services)│
│    (3008)       │         │    (3007)       │         │                 │
│                 │         │                 │         │                 │
│ • Payment Proc  │         │ • Email         │         │                 │
│ • Refunds       │         │ • SMS           │         │                 │
│ • Invoices      │         │ • Push          │         │                 │
│ • Fraud Detect  │         │ • Templates     │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### Capas de Infraestructura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATA STORES                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │ PostgreSQL  │  │    Redis    │  │ Elasticsearch│  │  MongoDB   │ │   │
│  │  │  (Primary)  │  │   (Cache)   │  │   (Search)   │  │  (Logs)    │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MESSAGE BROKER                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                      RabbitMQ                                │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │   │
│  │  │  │   Direct    │  │    Topic    │  │       Fanout        │ │   │   │
│  │  │  │   Exchanges │  │   Exchanges │  │      Exchanges      │ │   │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    OBSERVABILITY STACK                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │ Prometheus  │  │   Grafana   │  │    Loki     │  │   Jaeger   │ │   │
│  │  │  (Metrics)  │  │(Dashboards) │  │   (Logs)    │  │  (Tracing) │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Bounded Contexts

### 1. Identity Context (Auth Service)

**Responsabilidad**: Gestión de identidad, autenticación y autorización

**Entidades Principales**:
- User
- Role
- Permission
- Session
- RefreshToken

**Agregados**:
- UserAggregate (User + Profile + Preferences)

**Eventos de Dominio**:
- UserRegistered
- UserLoggedIn
- UserLoggedOut
- PasswordChanged
- RoleAssigned

### 2. Catalog Context (Product Service)

**Responsabilidad**: Gestión del catálogo de productos

**Entidades Principales**:
- Product
- Category
- Brand
- Review
- Attribute

**Agregados**:
- ProductAggregate (Product + Variants + Images + Attributes)
- CategoryAggregate (Category + Subcategories)

**Eventos de Dominio**:
- ProductCreated
- ProductUpdated
- ProductDeleted
- ReviewAdded
- StockLow

### 3. Shopping Context (Cart Service)

**Responsabilidad**: Gestión del carrito de compras

**Entidades Principales**:
- Cart
- CartItem
- Coupon
- Promotion

**Agregados**:
- CartAggregate (Cart + CartItems + AppliedCoupons)

**Eventos de Dominio**:
- ItemAddedToCart
- ItemRemovedFromCart
- CartCheckedOut
- CouponApplied

### 4. Order Context (Order Service)

**Responsabilidad**: Gestión de órdenes y su ciclo de vida

**Entidades Principales**:
- Order
- OrderItem
- OrderStatus
- Shipment
- Invoice

**Agregados**:
- OrderAggregate (Order + OrderItems + Shipments + Payments)

**Eventos de Dominio**:
- OrderCreated
- OrderConfirmed
- OrderShipped
- OrderDelivered
- OrderCancelled
- OrderRefunded

### 5. Inventory Context (Inventory Service)

**Responsabilidad**: Gestión de inventario y stock

**Entidades Principales**:
- InventoryItem
- Warehouse
- StockMovement
- Reservation
- Alert

**Agregados**:
- InventoryAggregate (InventoryItem + StockMovements + Reservations)

**Eventos de Dominio**:
- StockReserved
- StockReleased
- StockUpdated
- LowStockAlert
- OutOfStock

## Comunicación entre Servicios

### Patrones de Comunicación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     COMMUNICATION PATTERNS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────┐                 │
│  │    SYNCHRONOUS (HTTP)   │    │   ASYNCHRONOUS (Events) │                 │
│  │                         │    │                         │                 │
│  │  Request/Response       │    │  Event-Driven           │                 │
│  │  • GET /products        │    │  • ProductCreated       │                 │
│  │  • POST /orders         │    │  • OrderPlaced          │                 │
│  │  • Query data           │    │  • InventoryUpdated     │                 │
│  │                         │    │                         │                 │
│  │  Use cases:             │    │  Use cases:             │                 │
│  │  - Queries              │    │  - State changes        │                 │
│  │  - Real-time needs      │    │  - Cross-service        │                 │
│  │  - Simple operations    │    │    notifications        │                 │
│  └─────────────────────────┘    └─────────────────────────┘                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION vs CHOREOGRAPHY                     │   │
│  │                                                                      │   │
│  │  ORCHESTRATION (Order Service)        CHOREOGRAPHY (Event-driven)   │   │
│  │  ┌─────────┐                          ┌─────────┐                   │   │
│  │  │ Order   │──► Reserve Inventory     │ Order   │──► OrderCreated   │   │
│  │  │ Service │──► Process Payment       │ Service │                   │   │
│  │  │         │──► Send Notification     └─────────┘                   │   │
│  │  └─────────┘                               │                        │   │
│  │       │                                    ▼                        │   │
│  │       │                           ┌─────────────┐                   │   │
│  │       │                           │ Inventory   │──► Reserve        │   │
│  │       │                           │ Service     │                   │   │
│  │       │                           └─────────────┘                   │   │
│  │       │                                    │                        │   │
│  │       │                                    ▼                        │   │
│  │       │                           ┌─────────────┐                   │   │
│  │       │                           │ Payment     │──► Process        │   │
│  │       │                           │ Service     │                   │   │
│  │       │                           └─────────────┘                   │   │
│  │       │                                                             │   │
│  │  Pros: Centralized control          Pros: Loose coupling            │   │
│  │  Cons: Single point of failure      Cons: Harder to trace           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Matriz de Comunicación

| Servicio Origen | Servicio Destino | Patrón | Tecnología | Uso |
|-----------------|------------------|--------|------------|-----|
| Gateway | Todos | Sync | HTTP/REST | Routing |
| Auth | Todos | Async | Events | User changes |
| Product | Search | Async | Events | Index updates |
| Cart | Product | Sync | HTTP | Validation |
| Order | Inventory | Async | Events | Stock reservation |
| Order | Payment | Async | Events | Payment processing |
| Order | Notification | Async | Events | Order updates |
| Inventory | Product | Async | Events | Stock updates |

## Patrones de Diseño

### 1. CQRS (Command Query Responsibility Segregation)

```
┌─────────────────────────────────────────────────────────────┐
│                      CQRS PATTERN                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐              ┌──────────────┐            │
│   │   COMMAND    │              │    QUERY     │            │
│   │    SIDE      │              │    SIDE      │            │
│   │              │              │              │            │
│   │ • CreateOrder│              │ • GetOrders  │            │
│   │ • UpdateUser │              │ • SearchProd │            │
│   │ • DeleteItem │              │ • GetReport  │            │
│   └──────┬───────┘              └──────┬───────┘            │
│          │                              │                    │
│          ▼                              ▼                    │
│   ┌──────────────┐              ┌──────────────┐            │
│   │ Write Model  │              │  Read Model  │            │
│   │              │              │              │            │
│   │ PostgreSQL   │              │  Redis / ES  │            │
│   │ (Normalized) │              │ (Denormalized)│            │
│   └──────────────┘              └──────────────┘            │
│          │                              ▲                    │
│          │         ┌──────────┐         │                    │
│          └────────►│  Events  │─────────┘                    │
│                    │  Stream  │                              │
│                    └──────────┘                              │
│                                                              │
│   Benefits:                                                  │
│   • Optimized models for each use case                       │
│   • Independent scaling                                      │
│   • Better performance for reads                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2. Saga Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SAGA PATTERN                                      │
│                 (Distributed Transactions)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ORDER SAGA: Create Order → Reserve Inventory → Process Payment         │
│                                                                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐              │
│  │  Start  │───►│  Order  │───►│Inventory│───►│ Payment │              │
│  │  Saga   │    │Created  │    │Reserved │    │Processed│              │
│  └─────────┘    └────┬────┘    └────┬────┘    └────┬────┘              │
│                      │              │              │                     │
│                      ▼              ▼              ▼                     │
│              ┌─────────────────────────────────────────┐                 │
│              │           COMPENSATION                  │                 │
│              │  If Payment fails:                      │                 │
│              │  1. Release Inventory Reservation       │                 │
│              │  2. Cancel Order                        │                 │
│              └─────────────────────────────────────────┘                 │
│                                                                          │
│  Compensation Actions:                                                   │
│  • OrderCreated → CancelOrder                                            │
│  • InventoryReserved → ReleaseReservation                                │
│  • PaymentProcessed → ProcessRefund                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Outbox Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       OUTBOX PATTERN                                     │
│              (Reliable Event Publishing)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Problem: DB transaction commits, but event publish fails               │
│                                                                          │
│  Solution: Write events to Outbox table in same transaction             │
│                                                                          │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐        │
│  │  Service    │         │  Database   │         │   Message   │        │
│  │             │         │             │         │   Broker    │        │
│  │ ┌─────────┐ │         │ ┌─────────┐ │         │             │        │
│  │ │Business │ │         │ │Business │ │         │ ┌─────────┐ │        │
│  │ │ Logic   │─┼────────►│ │ Tables  │ │         │ │ Events  │ │        │
│  │ └─────────┘ │         │ └─────────┘ │         │ │ Queue   │ │        │
│  │      │      │         │      ▲      │         │ └────▲────┘ │        │
│  │      ▼      │         │ ┌────┴────┐ │         │      │      │        │
│  │ ┌─────────┐ │         │ │  Outbox │ │         │ ┌────┴────┐ │        │
│  │ │  Write  │─┼────────►│ │  Table  │─┼────────►│ │Publisher│ │        │
│  │ │  Event  │ │         │ │         │ │         │ │ (Poller)│ │        │
│  │ └─────────┘ │         │ └─────────┘ │         │ └─────────┘ │        │
│  └─────────────┘         └─────────────┘         └─────────────┘        │
│                                                                          │
│  Outbox Table Schema:                                                    │
│  • id, aggregate_type, aggregate_id, event_type, payload, created_at    │
│                                                                          │
│  Guarantees:                                                             │
│  • Events published iff DB transaction commits                          │
│  • At-least-once delivery (idempotent consumers)                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4. Circuit Breaker

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER PATTERN                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  States: CLOSED → OPEN → HALF-OPEN                                      │
│                                                                          │
│  ┌─────────┐    Failure threshold    ┌─────────┐    Timeout     ┌──────┐ │
│  │ CLOSED  │───────────────────────► │  OPEN   │───────────────►│HALF- │ │
│  │ (Normal)│       exceeded          │(Blocked)│    expired     │ OPEN │ │
│  │         │◄─────────────────────── │         │◄────────────── │      │ │
│  └─────────┘    Success threshold    └─────────┘   Success      └──────┘ │
│                    reached                                              │
│                                                                          │
│  Configuration:                                                          │
│  • failureThreshold: 5 consecutive failures                             │
│  • successThreshold: 3 consecutive successes                            │
│  • timeoutDuration: 30 seconds                                          │
│  • halfOpenMaxCalls: 3                                                  │
│                                                                          │
│  Fallback Strategies:                                                    │
│  • Return cached data                                                    │
│  • Return default response                                               │
│  • Return degraded functionality                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Decisiones de Arquitectura

### ADR-001: Microservicios sobre Monolito

**Contexto**: Necesitamos una arquitectura que soporte múltiples equipos y escalabilidad independiente.

**Decisión**: Implementar arquitectura de microservicios.

**Consecuencias**:
- ✅ Escalabilidad independiente
- ✅ Despliegue independiente
- ✅ Tecnología políglota
- ❌ Mayor complejidad operacional
- ❌ Overhead de comunicación

### ADR-002: Event-Driven sobre REST puro

**Contexto**: Necesitamos desacoplar servicios y manejar transacciones distribuidas.

**Decisión**: Usar arquitectura event-driven con RabbitMQ.

**Consecuencias**:
- ✅ Desacoplamiento de servicios
- ✅ Mejor resiliencia
- ✅ Escalabilidad de procesamiento
- ❌ Complejidad en trazabilidad
- ❌ Manejo de consistencia eventual

### ADR-003: PostgreSQL por servicio

**Contexto**: Cada servicio necesita su propia base de datos.

**Decisión**: Usar PostgreSQL como base de datos principal para todos los servicios.

**Consecuencias**:
- ✅ Consistencia ACID
- ✅ Familiaridad del equipo
- ✅ Buen soporte para JSON
- ❌ Overhead de múltiples instancias

### ADR-004: API Gateway

**Contexto**: Necesitamos un punto de entrada único con cross-cutting concerns.

**Decisión**: Implementar API Gateway con Express.js.

**Consecuencias**:
- ✅ Single entry point
- ✅ Centralized auth
- ✅ Rate limiting
- ❌ Single point of failure (mitigado con clustering)

---

## Referencias

- [Data Flow](DATA_FLOW.md)
- [Event Catalog](EVENT_CATALOG.md)
- [API Specification](API_SPECIFICATION.md)
- [Security Architecture](SECURITY_ARCHITECTURE.md)
- [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)
