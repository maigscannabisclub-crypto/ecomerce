# Catálogo de Eventos

## Índice
1. [Visión General](#visión-general)
2. [Eventos de Dominio](#eventos-de-dominio)
3. [Eventos de Integración](#eventos-de-integración)
4. [Eventos de Infraestructura](#eventos-de-infraestructura)
5. [Esquemas de Eventos](#esquemas-de-eventos)
6. [Routing y Exchanges](#routing-y-exchanges)
7. [Versionado](#versionado)

---

## Visión General

Este documento describe todos los eventos utilizados en la plataforma e-commerce para comunicación asíncrona entre servicios.

### Taxonomía de Eventos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EVENT TAXONOMY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  events/                                                                     │
│  ├── domain/                    # Eventos de dominio                         │
│  │   ├── auth/                  #   - Auth Service                          │
│  │   ├── product/               #   - Product Service                       │
│  │   ├── cart/                  #   - Cart Service                          │
│  │   ├── order/                 #   - Order Service                         │
│  │   ├── inventory/             #   - Inventory Service                     │
│  │   └── payment/               #   - Payment Service                       │
│  │                                                                          │
│  ├── integration/               # Eventos de integración                     │
│  │   ├── sync/                  #   - Sincronización de datos               │
│  │   └── notification/          #   - Notificaciones                        │
│  │                                                                          │
│  └── infrastructure/            # Eventos de infraestructura                 │
│      ├── health/                #   - Health checks                         │
│      └── metrics/               #   - Métricas                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Características de los Eventos

| Característica | Descripción |
|----------------|-------------|
| **Idempotencia** | Los consumidores deben manejar eventos duplicados |
| **Ordenamiento** | Eventos del mismo aggregate mantienen orden |
| **Durabilidad** | Los eventos persisten hasta ser procesados |
| **Retry** | Reintentos automáticos con backoff exponencial |
| **DLQ** | Dead Letter Queue para eventos fallidos |

---

## Eventos de Dominio

### Auth Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `UserRegistered` | Nuevo usuario registrado | Auth | Notification, Reporting |
| `UserLoggedIn` | Usuario inició sesión | Auth | Reporting, Security |
| `UserLoggedOut` | Usuario cerró sesión | Auth | Reporting |
| `UserUpdated` | Datos de usuario actualizados | Auth | Notification, Product |
| `UserDeleted` | Usuario eliminado | Auth | Todos |
| `PasswordChanged` | Contraseña cambiada | Auth | Notification |
| `RoleAssigned` | Rol asignado a usuario | Auth | Todos |
| `PermissionGranted` | Permiso concedido | Auth | Gateway |

```json
{
  "eventType": "UserRegistered",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "user-123",
  "payload": {
    "userId": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "registeredAt": "2024-01-15T10:30:00Z"
  }
}
```

### Product Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `ProductCreated` | Nuevo producto creado | Product | Search, Inventory, Reporting |
| `ProductUpdated` | Producto actualizado | Product | Search, Inventory, Cart |
| `ProductDeleted` | Producto eliminado | Product | Search, Inventory, Cart |
| `ProductPriceChanged` | Precio de producto cambiado | Product | Cart, Notification |
| `ProductStockUpdated` | Stock de producto actualizado | Product | Cart, Notification |
| `CategoryCreated` | Nueva categoría creada | Product | Search |
| `CategoryUpdated` | Categoría actualizada | Product | Search |
| `ReviewAdded` | Nueva reseña agregada | Product | Reporting, Notification |
| `ReviewUpdated` | Reseña actualizada | Product | Reporting |

```json
{
  "eventType": "ProductCreated",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "prod-456",
  "payload": {
    "productId": "prod-456",
    "sku": "SKU-12345",
    "name": "Wireless Headphones",
    "description": "High-quality wireless headphones",
    "price": {
      "amount": 99.99,
      "currency": "USD"
    },
    "categoryId": "cat-789",
    "attributes": {
      "color": "black",
      "weight": "250g"
    },
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Cart Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `ItemAddedToCart` | Item agregado al carrito | Cart | Reporting |
| `ItemRemovedFromCart` | Item removido del carrito | Cart | Reporting |
| `CartUpdated` | Carrito actualizado | Cart | Reporting |
| `CartAbandoned` | Carrito abandonado | Cart | Notification |
| `CartCheckedOut` | Carrito convertido en orden | Cart | Order, Reporting |
| `CouponApplied` | Cupón aplicado al carrito | Cart | Reporting |

```json
{
  "eventType": "CartCheckedOut",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "cart-789",
  "payload": {
    "cartId": "cart-789",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-456",
        "quantity": 2,
        "unitPrice": 99.99,
        "totalPrice": 199.98
      }
    ],
    "subtotal": 199.98,
    "discount": 0,
    "total": 199.98,
    "currency": "USD",
    "checkedOutAt": "2024-01-15T10:30:00Z"
  }
}
```

### Order Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `OrderCreated` | Nueva orden creada | Order | Inventory, Payment, Notification, Reporting |
| `OrderConfirmed` | Orden confirmada | Order | Inventory, Notification, Shipping |
| `OrderPaid` | Orden pagada | Order | Inventory, Notification, Reporting |
| `OrderShipped` | Orden enviada | Order | Notification, Tracking |
| `OrderDelivered` | Orden entregada | Order | Notification, Reporting |
| `OrderCancelled` | Orden cancelada | Order | Inventory, Payment, Notification |
| `OrderRefunded` | Orden reembolsada | Order | Payment, Notification, Reporting |
| `OrderStatusChanged` | Estado de orden cambiado | Order | Notification, Reporting |

```json
{
  "eventType": "OrderCreated",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "order-abc",
  "payload": {
    "orderId": "order-abc",
    "orderNumber": "ORD-2024-0001",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-456",
        "sku": "SKU-12345",
        "name": "Wireless Headphones",
        "quantity": 2,
        "unitPrice": 99.99,
        "totalPrice": 199.98
      }
    ],
    "subtotal": 199.98,
    "tax": 16.00,
    "shipping": 10.00,
    "discount": 0,
    "total": 225.98,
    "currency": "USD",
    "status": "PENDING",
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "US"
    },
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Inventory Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `StockReserved` | Stock reservado para orden | Inventory | Order, Product |
| `StockReleased` | Reserva de stock liberada | Inventory | Order, Product |
| `StockUpdated` | Stock actualizado | Inventory | Product, Reporting |
| `StockCommitted` | Stock comprometido | Inventory | Product |
| `LowStockAlert` | Alerta de stock bajo | Inventory | Notification, Reporting |
| `OutOfStock` | Producto sin stock | Inventory | Product, Notification |
| `InventoryReceived` | Inventario recibido | Inventory | Product, Reporting |
| `ReservationExpired` | Reserva expirada | Inventory | Order |

```json
{
  "eventType": "StockReserved",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "inv-prod-456",
  "payload": {
    "productId": "prod-456",
    "sku": "SKU-12345",
    "orderId": "order-abc",
    "quantity": 2,
    "warehouseId": "wh-001",
    "reservedAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-15T10:45:00Z",
    "availableStock": 48,
    "reservedStock": 2
  }
}
```

### Payment Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `PaymentInitiated` | Pago iniciado | Payment | Order, Reporting |
| `PaymentProcessed` | Pago procesado exitosamente | Payment | Order, Notification, Reporting |
| `PaymentFailed` | Pago fallido | Payment | Order, Notification |
| `PaymentRefunded` | Pago reembolsado | Payment | Order, Notification, Reporting |
| `PaymentCancelled` | Pago cancelado | Payment | Order |
| `InvoiceGenerated` | Factura generada | Payment | Notification, Reporting |

```json
{
  "eventType": "PaymentProcessed",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "aggregateId": "pay-def",
  "payload": {
    "paymentId": "pay-def",
    "orderId": "order-abc",
    "userId": "user-123",
    "amount": 225.98,
    "currency": "USD",
    "paymentMethod": "credit_card",
    "paymentProvider": "stripe",
    "providerTransactionId": "pi_1234567890",
    "status": "COMPLETED",
    "processedAt": "2024-01-15T10:30:00Z",
    "metadata": {
      "cardLast4": "4242",
      "cardBrand": "visa"
    }
  }
}
```

### Notification Service Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `EmailSent` | Email enviado | Notification | Reporting |
| `EmailFailed` | Email fallido | Notification | Reporting |
| `SmsSent` | SMS enviado | Notification | Reporting |
| `PushNotificationSent` | Push notification enviada | Notification | Reporting |
| `NotificationTemplateUpdated` | Template actualizado | Notification | - |

---

## Eventos de Integración

### Synchronization Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `DataSyncRequested` | Solicitud de sincronización | Admin | Todos |
| `DataSyncCompleted` | Sincronización completada | Todos | Admin |
| `CacheInvalidated` | Cache invalidada | Todos | Cache |
| `SearchIndexUpdated` | Índice de búsqueda actualizado | Product | Search |

### External Integration Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `WebhookDelivered` | Webhook entregado | Gateway | External |
| `WebhookFailed` | Webhook fallido | Gateway | External |
| `ApiQuotaExceeded` | Cuota de API excedida | Gateway | Admin |

---

## Eventos de Infraestructura

### Health Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `ServiceStarted` | Servicio iniciado | Todos | Monitoring |
| `ServiceStopped` | Servicio detenido | Todos | Monitoring |
| `ServiceUnhealthy` | Servicio no saludable | Health Check | Monitoring, Alerting |
| `ServiceRecovered` | Servicio recuperado | Health Check | Monitoring |

### Metrics Events

| Evento | Descripción | Productores | Consumidores |
|--------|-------------|-------------|--------------|
| `RequestCompleted` | Request HTTP completado | Gateway | Monitoring |
| `DatabaseQueryCompleted` | Query de BD completada | Todos | Monitoring |
| `CacheHit` | Cache hit | Todos | Monitoring |
| `CacheMiss` | Cache miss | Todos | Monitoring |

---

## Esquemas de Eventos

### Estructura Base

```typescript
interface BaseEvent {
  // Identificación
  eventId: string;           // UUID único del evento
  eventType: string;         // Tipo de evento
  version: string;           // Versión del esquema
  
  // Temporal
  timestamp: string;         // ISO 8601 timestamp
  
  // Trazabilidad
  correlationId: string;     // ID de correlación (request)
  causationId?: string;      // ID del evento causante
  
  // Agregado
  aggregateId: string;       // ID del agregado
  aggregateType: string;     // Tipo de agregado
  aggregateVersion: number;  // Versión del agregado
  
  // Payload
  payload: Record<string, unknown>;
  
  // Metadata
  metadata: {
    source: string;          // Servicio origen
    userId?: string;         // Usuario que generó el evento
    clientInfo?: {           // Información del cliente
      ip?: string;
      userAgent?: string;
    };
  };
}
```

### Ejemplo Completo

```json
{
  "eventId": "evt-550e8400-e29b-41d4-a716-446655440000",
  "eventType": "OrderCreated",
  "version": "1.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "correlationId": "req-660e8400-e29b-41d4-a716-446655440001",
  "causationId": "evt-770e8400-e29b-41d4-a716-446655440002",
  "aggregateId": "order-abc",
  "aggregateType": "Order",
  "aggregateVersion": 1,
  "payload": {
    "orderId": "order-abc",
    "orderNumber": "ORD-2024-0001",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-456",
        "sku": "SKU-12345",
        "name": "Wireless Headphones",
        "quantity": 2,
        "unitPrice": 99.99,
        "totalPrice": 199.98
      }
    ],
    "subtotal": 199.98,
    "tax": 16.00,
    "shipping": 10.00,
    "discount": 0,
    "total": 225.98,
    "currency": "USD",
    "status": "PENDING",
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "US"
    },
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "metadata": {
    "source": "order-service",
    "userId": "user-123",
    "clientInfo": {
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  }
}
```

---

## Routing y Exchanges

### Exchange Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RABBITMQ EXCHANGE CONFIGURATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Exchanges:                                                                  │
│  ═════════                                                                   │
│                                                                              │
│  1. domain.events (topic)                                                    │
│     ├── routing key: domain.{service}.{event}                               │
│     └── ejemplo: domain.order.OrderCreated                                  │
│                                                                              │
│  2. integration.events (topic)                                               │
│     ├── routing key: integration.{type}.{action}                            │
│     └── ejemplo: integration.cache.invalidate                               │
│                                                                              │
│  3. infrastructure.events (fanout)                                           │
│     └── broadcast a todos los servicios de monitoring                       │
│                                                                              │
│  4. retry.events (direct)                                                    │
│     └── para reintentos de eventos fallidos                                 │
│                                                                              │
│  5. dlq.events (direct)                                                      │
│     └── Dead Letter Queue para eventos que fallaron                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Queue Bindings

| Servicio | Exchange | Routing Key | Queue |
|----------|----------|-------------|-------|
| Order | domain.events | `domain.order.*` | order.events |
| Order | domain.events | `domain.inventory.StockReserved` | order.inventory |
| Order | domain.events | `domain.payment.PaymentProcessed` | order.payment |
| Inventory | domain.events | `domain.order.OrderCreated` | inventory.orders |
| Inventory | domain.events | `domain.order.OrderCancelled` | inventory.cancellations |
| Payment | domain.events | `domain.order.OrderCreated` | payment.orders |
| Notification | domain.events | `domain.*.*` | notification.all |
| Reporting | domain.events | `domain.*.*` | reporting.all |

---

## Versionado

### Estrategia de Versionado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVENT VERSIONING STRATEGY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Semantic Versioning: MAJOR.MINOR.PATCH                                     │
│                                                                              │
│  MAJOR (X.0.0): Breaking changes                                            │
│  • Cambios en campos requeridos                                             │
│  • Eliminación de campos                                                    │
│  • Cambios en tipos de datos incompatibles                                  │
│                                                                              │
│  MINOR (x.X.0): New features, backward compatible                           │
│  • Nuevos campos opcionales                                                 │
│  • Nuevos tipos de eventos                                                  │
│                                                                              │
│  PATCH (x.x.X): Bug fixes                                                   │
│  • Corrección de valores por defecto                                        │
│  • Corrección de documentación                                              │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Backward Compatibility:                                                    │
│                                                                              │
│  1. Nunca eliminar campos existentes                                        │
│  2. Nuevos campos deben ser opcionales                                      │
│  3. Usar default values para nuevos campos                                  │
│  4. Mantener versiones antiguas por 6 meses                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ejemplo de Evolución

```json
// Versión 1.0
{
  "eventType": "OrderCreated",
  "version": "1.0",
  "payload": {
    "orderId": "order-123",
    "userId": "user-456",
    "total": 100.00
  }
}

// Versión 1.1 - Nuevo campo opcional (backward compatible)
{
  "eventType": "OrderCreated",
  "version": "1.1",
  "payload": {
    "orderId": "order-123",
    "userId": "user-456",
    "total": 100.00,
    "couponCode": "DISCOUNT10"  // Nuevo campo opcional
  }
}

// Versión 2.0 - Cambio breaking (requiere migración)
{
  "eventType": "OrderCreated",
  "version": "2.0",
  "payload": {
    "orderId": "order-123",
    "customerId": "user-456",    // Renombrado de userId
    "amounts": {                  // Estructura cambiada
      "subtotal": 90.00,
      "tax": 10.00,
      "total": 100.00
    }
  }
}
```

---

## Referencias

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Data Flow](DATA_FLOW.md)
- [API Specification](API_SPECIFICATION.md)
