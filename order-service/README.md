# Order Service

Enterprise-grade Order Management microservice for e-commerce platform.

## Features

- **Order Management**: Create, read, update, and cancel orders
- **Saga Pattern**: Distributed transaction coordination for order processing
- **Outbox Pattern**: Eventual consistency for event publishing
- **Retry with Backoff**: Resilient operations with exponential backoff
- **Event-Driven Architecture**: RabbitMQ for async communication
- **Clean Architecture**: Domain-driven design with clear separation of concerns

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Order Service                            │
├─────────────────────────────────────────────────────────────────┤
│  Presentation Layer                                              │
│  ├── Controllers (OrderController)                              │
│  ├── Routes (order.routes.ts)                                   │
│  └── Middleware (auth, validation)                              │
├─────────────────────────────────────────────────────────────────┤
│  Application Layer                                               │
│  ├── Services (OrderService)                                    │
│  ├── Saga Orchestrator                                          │
│  └── DTOs                                                       │
├─────────────────────────────────────────────────────────────────┤
│  Domain Layer                                                    │
│  └── Entities (Order, OrderItem)                                │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                            │
│  ├── Database (Prisma)                                          │
│  ├── Messaging (RabbitMQ)                                       │
│  └── HTTP Client                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Order Status Flow

```
PENDING → RESERVED → CONFIRMED → PAID → SHIPPED → DELIVERED
   ↓         ↓           ↓         ↓        ↓
FAILED   CANCELLED   CANCELLED  CANCELLED CANCELLED
```

## Saga Pattern Flow

1. **Create Order** → Order in PENDING state
2. **Reserve Stock** → Publish OrderCreated event
3. **Wait for Response**:
   - StockReserved → Order RESERVED → Publish OrderConfirmed
   - StockReservationFailed → Order FAILED → Publish OrderFailed
4. **Payment Processing** (future)
5. **Order Completion** → Order DELIVERED → Publish OrderCompleted

## API Endpoints

### Public
- `GET /api/v1/health` - Health check

### Authenticated
- `POST /api/v1/orders` - Create order directly
- `POST /api/v1/orders/from-cart` - Create order from cart
- `GET /api/v1/orders` - List user's orders
- `GET /api/v1/orders/:id` - Get order by ID
- `GET /api/v1/orders/number/:orderNumber` - Get order by number
- `PUT /api/v1/orders/:id/cancel` - Cancel order

### Admin Only
- `GET /api/v1/admin/orders` - List all orders
- `PUT /api/v1/orders/:id/status` - Update order status
- `GET /api/v1/admin/statistics` - Order statistics
- `GET /api/v1/admin/outbox/statistics` - Outbox statistics
- `GET /api/v1/admin/outbox/failed` - Failed outbox events
- `POST /api/v1/admin/outbox/retry/:eventId` - Retry failed event
- `GET /api/v1/admin/sagas/active` - Active sagas

## Events

### Published Events
- `OrderCreated` - Order created, stock reservation requested
- `OrderConfirmed` - Stock reserved, order confirmed
- `OrderFailed` - Stock reservation failed
- `OrderCancelled` - Order cancelled
- `OrderCompleted` - Order delivered
- `OrderStatusChanged` - Order status updated

### Consumed Events
- `StockReserved` - Stock successfully reserved
- `StockReservationFailed` - Stock reservation failed
- `PaymentCompleted` - Payment processed successfully
- `PaymentFailed` - Payment processing failed

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- RabbitMQ 3.9+

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed database (optional)
npm run db:seed
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

### Docker

```bash
# Build image
docker build -t order-service .

# Run container
docker run -p 3004:3004 --env-file .env order-service
```

## Environment Variables

```env
# Server
PORT=3004
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/order_db?schema=public

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=orders.exchange
RABBITMQ_QUEUE=orders.queue

# Services
INVENTORY_SERVICE_URL=http://localhost:3002
CART_SERVICE_URL=http://localhost:3003
USER_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_URL=http://localhost:3005

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## Database Schema

### Order
- `id` - UUID primary key
- `orderNumber` - Unique order number
- `userId` - Customer ID
- `status` - Order status enum
- `total`, `tax`, `shipping`, `grandTotal` - Pricing
- `shippingAddress`, `billingAddress` - Addresses (JSON)
- `timestamps` - createdAt, updatedAt, etc.

### OrderItem
- `id` - UUID primary key
- `orderId` - Foreign key to Order
- `productId`, `productName`, `productSku` - Product info
- `quantity`, `unitPrice`, `subtotal` - Pricing

### OrderStatusHistory
- `id` - UUID primary key
- `orderId` - Foreign key to Order
- `status`, `previousStatus` - Status transition
- `notes`, `createdBy` - Audit info

### OutboxEvent
- `id` - UUID primary key
- `eventType`, `aggregateId` - Event info
- `payload` - Event data (JSON)
- `published`, `retryCount` - Publishing status

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

## License

MIT
