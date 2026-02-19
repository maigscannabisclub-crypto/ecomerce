# Event Flow Documentation

## Order Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant OrderService
    participant RabbitMQ
    participant InventoryService
    participant ReportingService
    participant NotificationService

    Client->>OrderService: POST /orders (create order)
    OrderService->>OrderService: Validate & save order
    OrderService->>RabbitMQ: Publish OrderCreated event
    RabbitMQ->>InventoryService: Route to inventory-service.order-created
    RabbitMQ->>NotificationService: Route to notification-service.order-created
    
    InventoryService->>InventoryService: Reserve stock
    alt Stock Reserved
        InventoryService->>RabbitMQ: Publish StockReserved event
        RabbitMQ->>OrderService: Route to order-service.stock-reserved
        OrderService->>OrderService: Confirm order
        OrderService->>RabbitMQ: Publish OrderCompleted event
        RabbitMQ->>ReportingService: Route to reporting-service.order-completed
        RabbitMQ->>NotificationService: Route to notification-service.order-completed
        OrderService->>Client: Order confirmed
    else Stock Reservation Failed
        InventoryService->>RabbitMQ: Publish StockReservationFailed event
        RabbitMQ->>OrderService: Route to order-service.stock-reservation-failed
        OrderService->>OrderService: Fail order
        OrderService->>RabbitMQ: Publish OrderFailed event
        OrderService->>Client: Order failed (insufficient stock)
    end
```

## Order Cancellation Flow

```mermaid
sequenceDiagram
    participant Client
    participant OrderService
    participant RabbitMQ
    participant InventoryService
    participant ReportingService
    participant NotificationService

    Client->>OrderService: POST /orders/:id/cancel
    OrderService->>OrderService: Update order status
    OrderService->>RabbitMQ: Publish OrderCancelled event
    RabbitMQ->>InventoryService: Route to inventory-service.order-failed
    RabbitMQ->>ReportingService: Route to reporting-service.order-cancelled
    RabbitMQ->>NotificationService: Route to notification-service.order-cancelled
    
    InventoryService->>InventoryService: Release reserved stock
    ReportingService->>ReportingService: Update cancellation metrics
    NotificationService->>NotificationService: Send cancellation email
    OrderService->>Client: Order cancelled
```

## Product Management Flow

```mermaid
sequenceDiagram
    participant Admin
    participant ProductService
    participant RabbitMQ
    participant InventoryService
    participant ReportingService

    Admin->>ProductService: POST /products (create product)
    ProductService->>ProductService: Save product
    ProductService->>RabbitMQ: Publish ProductCreated event
    RabbitMQ->>InventoryService: Route to inventory-service.product-created
    RabbitMQ->>ReportingService: Route to reporting-service.product-created
    
    InventoryService->>InventoryService: Initialize inventory
    ReportingService->>ReportingService: Initialize product metrics
    ProductService->>Admin: Product created

    Admin->>ProductService: PUT /products/:id (update product)
    ProductService->>ProductService: Update product
    ProductService->>RabbitMQ: Publish ProductUpdated event
    RabbitMQ->>InventoryService: Route to inventory-service.product-updated
    RabbitMQ->>ReportingService: Route to reporting-service.product-updated
    
    InventoryService->>InventoryService: Update inventory if needed
    ReportingService->>ReportingService: Update product metrics
    ProductService->>Admin: Product updated
```

## Low Stock Alert Flow

```mermaid
sequenceDiagram
    participant InventoryService
    participant RabbitMQ
    participant NotificationService

    InventoryService->>InventoryService: Check stock levels
    alt Stock Below Threshold
        InventoryService->>RabbitMQ: Publish LowStockAlert event
        RabbitMQ->>NotificationService: Route to notification-service.low-stock-alert
        NotificationService->>NotificationService: Send alert to admin
        NotificationService->>NotificationService: Log alert for reporting
    end
```

## Retry and Dead Letter Flow

```mermaid
sequenceDiagram
    participant Consumer
    participant Queue
    participant RetryExchange
    participant DelayQueue
    participant DLX
    participant DLQ

    Queue->>Consumer: Deliver message
    Consumer->>Consumer: Process message
    alt Processing Success
        Consumer->>Queue: ACK message
    else Processing Failure (Retry < 3)
        Consumer->>Queue: ACK message
        Consumer->>RetryExchange: Publish to retry exchange
        RetryExchange->>DelayQueue: Route to delay queue
        Note over DelayQueue: Wait for TTL (5s/30s/5m)
        DelayQueue->>Queue: Message expires, routed back
    else Processing Failure (Retry >= 3)
        Consumer->>Queue: NACK (requeue=false)
        Queue->>DLX: Route to dead letter exchange
        DLX->>DLQ: Route to dead letter queue
    end
```

## Event Routing Diagram

```mermaid
graph TB
    subgraph "Exchanges"
        E1[ecommerce.events<br/>topic]
        E2[ecommerce.events.retry<br/>topic]
        E3[ecommerce.dlx<br/>topic]
        E4[ecommerce.delayed<br/>x-delayed-message]
    end

    subgraph "Order Events"
        O1[order.created]
        O2[order.completed]
        O3[order.cancelled]
        O4[order.failed]
    end

    subgraph "Stock Events"
        S1[stock.reserved]
        S2[stock.reservation-failed]
    end

    subgraph "Product Events"
        P1[product.created]
        P2[product.updated]
    end

    subgraph "Inventory Events"
        I1[inventory.low-stock]
    end

    subgraph "Service Queues"
        Q1[inventory-service.*]
        Q2[order-service.*]
        Q3[reporting-service.*]
        Q4[notification-service.*]
    end

    subgraph "Retry Queues"
        R1[ecommerce.retry.delay.5s]
        R2[ecommerce.retry.delay.30s]
        R3[ecommerce.retry.delay.5m]
    end

    subgraph "Dead Letter"
        DLQ[ecommerce.dlq]
    end

    E1 --> O1
    E1 --> O2
    E1 --> O3
    E1 --> O4
    E1 --> S1
    E1 --> S2
    E1 --> P1
    E1 --> P2
    E1 --> I1

    O1 --> Q1
    O1 --> Q4
    O2 --> Q2
    O2 --> Q3
    O2 --> Q4
    O3 --> Q2
    O3 --> Q3
    O3 --> Q4
    O4 --> Q1
    S1 --> Q2
    S2 --> Q2
    P1 --> Q1
    P1 --> Q3
    P2 --> Q1
    P2 --> Q3
    I1 --> Q1
    I1 --> Q4

    E2 --> R1
    E2 --> R2
    E2 --> R3
    R1 --> E1
    R2 --> E1
    R3 --> E1

    Q1 -.->|DLX| E3
    Q2 -.->|DLX| E3
    Q3 -.->|DLX| E3
    Q4 -.->|DLX| E3
    E3 --> DLQ
```

## Service Communication Matrix

| Event | Publisher | Subscribers |
|-------|-----------|-------------|
| OrderCreated | order-service | inventory-service, notification-service |
| OrderCompleted | order-service | reporting-service, notification-service |
| OrderCancelled | order-service | reporting-service, notification-service, inventory-service |
| OrderFailed | order-service, inventory-service | inventory-service |
| StockReserved | inventory-service | order-service |
| StockReservationFailed | inventory-service | order-service |
| ProductCreated | product-service | inventory-service, reporting-service |
| ProductUpdated | product-service | inventory-service, reporting-service |
| LowStockAlert | inventory-service | notification-service |

## Message Priority Levels

| Priority | Event Types | Description |
|----------|-------------|-------------|
| 10 (Highest) | OrderCreated, StockReserved | Critical order processing |
| 8 | OrderCompleted, OrderCancelled | Order status updates |
| 6 | StockReservationFailed, OrderFailed | Error handling |
| 4 | ProductCreated, ProductUpdated | Product management |
| 2 (Lowest) | LowStockAlert | Notifications and alerts |

## Queue Configuration Summary

| Queue | TTL | Max Priority | DLX | Description |
|-------|-----|--------------|-----|-------------|
| inventory-service.* | 24h | 10 | ecommerce.dlx | Inventory operations |
| order-service.* | 24h | 10 | ecommerce.dlx | Order processing |
| reporting-service.* | 24h | 10 | ecommerce.dlx | Reporting and analytics |
| notification-service.* | 24h | 10 | ecommerce.dlx | Notifications |
| ecommerce.dlq | 7d | - | - | Dead letter storage |
| ecommerce.retry.delay.* | - | 10 | ecommerce.events | Retry delays |
