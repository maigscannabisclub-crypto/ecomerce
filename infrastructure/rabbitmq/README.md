# RabbitMQ Configuration for E-Commerce Platform

## Overview

This directory contains the complete RabbitMQ configuration for the e-commerce platform, including exchanges, queues, bindings, retry policies, and dead letter exchange (DLX) setup.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         E-COMMERCE MESSAGE BROKER                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXCHANGES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │ ecommerce.events │    │ecommerce.events. │    │  ecommerce.dlx   │      │
│  │     (topic)      │    │    retry (topic) │    │    (topic)       │      │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘      │
│           │                       │                       │                │
│           │                       │                       │                │
│           ▼                       ▼                       ▼                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                               QUEUES                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INVENTORY SERVICE          ORDER SERVICE           REPORTING SERVICE       │
│  ┌────────────────────┐    ┌────────────────────┐   ┌────────────────────┐  │
│  │ order-created      │    │ stock-reserved     │   │ order-completed    │  │
│  │ order-failed       │    │ stock-reservation- │   │ order-cancelled    │  │
│  │ product-created    │    │   failed           │   │ product-created    │  │
│  │ product-updated    │    │ order-cancelled    │   │ product-updated    │  │
│  │ low-stock-alert    │    │ order-completed    │   │                    │  │
│  └────────────────────┘    └────────────────────┘   └────────────────────┘  │
│                                                                             │
│  NOTIFICATION SERVICE       RETRY QUEUES            DEAD LETTER QUEUE       │
│  ┌────────────────────┐    ┌────────────────────┐   ┌────────────────────┐  │
│  │ order-created      │    │ retry.delay.5s     │   │ ecommerce.dlq      │  │
│  │ order-completed    │    │ retry.delay.30s    │   │                    │  │
│  │ order-cancelled    │    │ retry.delay.5m     │   │                    │  │
│  │ low-stock-alert    │    │                    │   │                    │  │
│  └────────────────────┘    └────────────────────┘   └────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
infrastructure/rabbitmq/
├── README.md              # This documentation file
├── rabbitmq.config.yml    # RabbitMQ server configuration
├── definitions.json       # Exchange, queue, binding, user definitions
├── policies.json          # Queue policies (TTL, HA, etc.)
└── init.sh               # Initialization script
```

## Configuration Files

### 1. rabbitmq.config.yml

Main RabbitMQ server configuration including:
- Network settings (ports, SSL)
- Memory and disk thresholds
- Authentication mechanisms
- Logging configuration
- Clustering settings
- Performance tuning

### 2. definitions.json

Complete definitions for:
- **Users**: guest, ecommerce_user, monitoring_user
- **Virtual Hosts**: /, ecommerce
- **Exchanges**:
  - `ecommerce.events` (topic) - Main events exchange
  - `ecommerce.events.retry` (topic) - Retry exchange
  - `ecommerce.dlx` (topic) - Dead letter exchange
  - `ecommerce.delayed` (x-delayed-message) - Delayed messages
- **Queues**: Service-specific queues with DLX configuration
- **Bindings**: Routing key mappings

### 3. policies.json

Queue policies:
- **ha-all**: High availability with automatic sync
- **ttl-messages**: 24-hour message TTL
- **max-length**: Queue length limit with DLX overflow
- **lazy-queues**: Lazy queue mode for memory efficiency
- **delivery-limit**: Maximum delivery attempts (3)

### 4. init.sh

Initialization script that:
- Enables required plugins
- Creates virtual hosts and users
- Sets up exchanges, queues, and bindings
- Applies policies
- Loads definitions from JSON files

## Event Types

### Order Events

| Event | Routing Key | Description | Publishers | Subscribers |
|-------|-------------|-------------|------------|-------------|
| OrderCreated | `order.created` | New order placed | order-service | inventory-service, notification-service |
| OrderCompleted | `order.completed` | Order fulfilled | order-service | reporting-service, notification-service |
| OrderCancelled | `order.cancelled` | Order cancelled | order-service | reporting-service, notification-service |
| OrderFailed | `order.failed` | Order processing failed | inventory-service | inventory-service |

### Inventory Events

| Event | Routing Key | Description | Publishers | Subscribers |
|-------|-------------|-------------|------------|-------------|
| StockReserved | `stock.reserved` | Stock successfully reserved | inventory-service | order-service |
| StockReservationFailed | `stock.reservation-failed` | Stock reservation failed | inventory-service | order-service |
| LowStockAlert | `inventory.low-stock` | Stock below threshold | inventory-service | notification-service |

### Product Events

| Event | Routing Key | Description | Publishers | Subscribers |
|-------|-------------|-------------|------------|-------------|
| ProductCreated | `product.created` | New product added | product-service | inventory-service, reporting-service |
| ProductUpdated | `product.updated` | Product modified | product-service | inventory-service, reporting-service |

## Queue Configuration

### Standard Queue Arguments

All service queues have the following configuration:

```json
{
  "x-dead-letter-exchange": "ecommerce.dlx",
  "x-dead-letter-routing-key": "<queue-name>.failed",
  "x-message-ttl": 86400000,
  "x-max-priority": 10
}
```

### Queue Properties

| Property | Value | Description |
|----------|-------|-------------|
| Durable | true | Survives broker restart |
| Auto-delete | false | Must be explicitly deleted |
| Message TTL | 24 hours | Messages expire after 24h |
| Max Priority | 10 | Priority queue support |
| DLX | ecommerce.dlx | Dead letter exchange |

## Dead Letter Exchange (DLX)

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DLX FLOW                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│   │   Service    │         │   Service    │         │   Service    │       │
│   │    Queue     │────────▶│     DLX      │────────▶│     DLQ      │       │
│   │              │  NACK   │              │  Route  │              │       │
│   └──────────────┘         └──────────────┘         └──────────────┘       │
│          │                        │                        │               │
│          │                        │                        │               │
│          │   Max retries: 3       │   TTL: 7 days          │               │
│          │   TTL: 24 hours        │   Pattern: #           │               │
│          │                        │                        │               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DLX Triggers

Messages are sent to DLX when:
1. Message is negatively acknowledged (NACK) with requeue=false
2. Message expires (TTL exceeded)
3. Queue length limit exceeded
4. Max delivery attempts exceeded

## Retry Policy

### Retry Mechanism

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RETRY FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Attempt 1          Attempt 2          Attempt 3          DLQ              │
│   ┌──────┐           ┌──────┐           ┌──────┐          ┌──────┐         │
│   │ 5s   │──────────▶│ 30s  │──────────▶│ 5m   │─────────▶│ DLQ  │         │
│   │delay │           │delay │           │delay │          │      │         │
│   └──────┘           └──────┘           └──────┘          └──────┘         │
│      │                  │                  │                                │
│      │                  │                  │                                │
│   Retry 1            Retry 2            Retry 3                             │
│   (immediate)        (+5s)             (+30s)                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Retry Configuration

| Retry Level | Delay | Exchange | Queue |
|-------------|-------|----------|-------|
| 1st | 5 seconds | ecommerce.events.retry | ecommerce.retry.delay.5s |
| 2nd | 30 seconds | ecommerce.events.retry | ecommerce.retry.delay.30s |
| 3rd | 5 minutes | ecommerce.events.retry | ecommerce.retry.delay.5m |

### Implementing Retry in Applications

```javascript
// Example retry implementation
async function consumeWithRetry(channel, queue, handler) {
  channel.consume(queue, async (msg) => {
    try {
      await handler(msg);
      channel.ack(msg);
    } catch (error) {
      const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
      
      if (retryCount <= 3) {
        // Publish to retry exchange with appropriate delay
        const delayExchange = getDelayExchange(retryCount);
        channel.publish(
          'ecommerce.events.retry',
          `retry.${delayExchange}.${msg.fields.routingKey}`,
          msg.content,
          {
            headers: { 'x-retry-count': retryCount },
            persistent: true
          }
        );
        channel.ack(msg);
      } else {
        // Max retries exceeded, send to DLX
        channel.nack(msg, false, false);
      }
    }
  });
}
```

## Docker Compose Integration

### Updated docker-compose.yml

```yaml
rabbitmq:
  image: rabbitmq:3.12-management-alpine
  container_name: ecommerce-rabbitmq
  hostname: rabbitmq
  ports:
    - "5672:5672"     # AMQP
    - "15672:15672"   # Management UI
    - "15692:15692"   # Prometheus metrics
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
    - ./infrastructure/rabbitmq/rabbitmq.config.yml:/etc/rabbitmq/rabbitmq.conf:ro
    - ./infrastructure/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro
    - ./infrastructure/rabbitmq/policies.json:/etc/rabbitmq/policies.json:ro
  environment:
    RABBITMQ_DEFAULT_USER: guest
    RABBITMQ_DEFAULT_PASS: guest
    RABBITMQ_CONFIG_FILE: /etc/rabbitmq/rabbitmq
    RABBITMQ_LOAD_DEFINITIONS: "true"
    RABBITMQ_DEFINITIONS_FILE: /etc/rabbitmq/definitions.json
  healthcheck:
    test: ["CMD", "rabbitmq-diagnostics", "ping"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 30s
  networks:
    - ecommerce-network
  restart: unless-stopped
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| RABBITMQ_HOST | localhost | RabbitMQ host |
| RABBITMQ_PORT | 15672 | Management API port |
| RABBITMQ_USER | guest | Admin username |
| RABBITMQ_PASS | guest | Admin password |
| RABBITMQ_VHOST | ecommerce | Virtual host name |
| DEFINITIONS_FILE | /etc/rabbitmq/definitions.json | Definitions file path |
| POLICIES_FILE | /etc/rabbitmq/policies.json | Policies file path |

## Usage

### Starting RabbitMQ

```bash
# Using Docker Compose
docker-compose up -d rabbitmq

# Wait for initialization
sleep 10

# Run initialization script
./infrastructure/rabbitmq/init.sh
```

### Accessing Management UI

```
URL: http://localhost:15672
Username: guest
Password: guest
```

### Publishing Events

```javascript
const amqp = require('amqplib');

async function publishOrderCreated(order) {
  const connection = await amqp.connect('amqp://guest:guest@localhost:5672/ecommerce');
  const channel = await connection.createChannel();
  
  const event = {
    eventType: 'OrderCreated',
    payload: order,
    timestamp: new Date().toISOString(),
    correlationId: order.id
  };
  
  channel.publish(
    'ecommerce.events',
    'order.created',
    Buffer.from(JSON.stringify(event)),
    {
      persistent: true,
      messageId: order.id,
      timestamp: Date.now(),
      headers: {
        'x-event-type': 'OrderCreated',
        'x-service': 'order-service'
      }
    }
  );
  
  await channel.close();
  await connection.close();
}
```

### Consuming Events

```javascript
const amqp = require('amqplib');

async function consumeOrderCreated() {
  const connection = await amqp.connect('amqp://guest:guest@localhost:5672/ecommerce');
  const channel = await connection.createChannel();
  
  // Set prefetch count
  channel.prefetch(10);
  
  const queue = 'inventory-service.order-created';
  
  channel.consume(queue, async (msg) => {
    try {
      const event = JSON.parse(msg.content.toString());
      
      // Process the event
      await processOrderCreated(event.payload);
      
      // Acknowledge success
      channel.ack(msg);
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Reject and send to DLX
      channel.nack(msg, false, false);
    }
  });
}
```

## Monitoring

### RabbitMQ Management API

```bash
# Get queue information
curl -u guest:guest http://localhost:15672/api/queues/ecommerce

# Get exchange information
curl -u guest:guest http://localhost:15672/api/exchanges/ecommerce

# Get connection information
curl -u guest:guest http://localhost:15672/api/connections
```

### Prometheus Metrics

RabbitMQ exposes Prometheus metrics on port 15692:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'rabbitmq'
    static_configs:
      - targets: ['rabbitmq:15692']
```

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| rabbitmq_queue_messages_ready | Ready messages | > 10000 |
| rabbitmq_queue_messages_unacked | Unacknowledged messages | > 1000 |
| rabbitmq_queue_consumers | Active consumers | < 1 |
| rabbitmq_connections | Active connections | > 1000 |
| rabbitmq_memory_used | Memory usage | > 80% |

## Troubleshooting

### Common Issues

#### 1. Connection Refused

```bash
# Check if RabbitMQ is running
docker ps | grep rabbitmq

# Check logs
docker logs ecommerce-rabbitmq

# Verify ports
netstat -tlnp | grep 5672
```

#### 2. Queue Not Receiving Messages

```bash
# Check bindings
curl -u guest:guest http://localhost:15672/api/bindings/ecommerce

# Verify exchange exists
curl -u guest:guest http://localhost:15672/api/exchanges/ecommerce/ecommerce.events

# Check queue status
curl -u guest:guest http://localhost:15672/api/queues/ecommerce/inventory-service.order-created
```

#### 3. High Memory Usage

```bash
# Check memory breakdown
curl -u guest:guest http://localhost:15672/api/nodes

# List connections consuming memory
curl -u guest:guest http://localhost:15672/api/connections

# Purge queues if needed
curl -u guest:guest -X DELETE \
  http://localhost:15672/api/queues/ecommerce/queue-name/contents
```

### Debug Commands

```bash
# List all queues
rabbitmqctl list_queues

# List all exchanges
rabbitmqctl list_exchanges

# List all bindings
rabbitmqctl list_bindings

# List connections
rabbitmqctl list_connections

# List consumers
rabbitmqctl list_consumers

# Get node status
rabbitmqctl status

# Enable tracing
rabbitmqctl trace_on -p ecommerce

# Disable tracing
rabbitmqctl trace_off -p ecommerce
```

## Security Best Practices

1. **Change Default Credentials**: Update guest password in production
2. **Use SSL/TLS**: Enable SSL for all connections
3. **Limit User Permissions**: Use specific users for each service
4. **Network Segmentation**: Isolate RabbitMQ in private network
5. **Enable Authentication**: Use strong passwords and rotate regularly
6. **Audit Logging**: Enable connection and channel logging

## Performance Tuning

### Connection Settings

```javascript
const connection = await amqp.connect({
  hostname: 'localhost',
  port: 5672,
  username: 'ecommerce_user',
  password: 'secure_password',
  vhost: 'ecommerce',
  heartbeat: 60,
  connectionTimeout: 10000
});
```

### Channel Settings

```javascript
// Set prefetch for fair dispatch
channel.prefetch(10);

// Enable publisher confirms
channel.confirmSelect();
```

### Queue Settings

```javascript
// Declare queue with optimal settings
await channel.assertQueue('my-queue', {
  durable: true,
  arguments: {
    'x-max-priority': 10,
    'x-queue-mode': 'lazy'
  }
});
```

## Maintenance

### Backup

```bash
# Export definitions
rabbitmqctl export_definitions /backup/definitions.json

# Backup data directory
tar -czf rabbitmq-backup.tar.gz /var/lib/rabbitmq
```

### Upgrade

```bash
# Stop RabbitMQ
docker-compose stop rabbitmq

# Backup data
cp -r rabbitmq_data rabbitmq_data_backup

# Update image version in docker-compose.yml

# Start RabbitMQ
docker-compose up -d rabbitmq
```

## References

- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ Management Plugin](https://www.rabbitmq.com/management.html)
- [Dead Letter Exchanges](https://www.rabbitmq.com/dlx.html)
- [TTL](https://www.rabbitmq.com/ttl.html)
- [Priority Queues](https://www.rabbitmq.com/priority.html)
