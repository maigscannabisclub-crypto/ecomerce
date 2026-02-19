/**
 * Events Integration Tests
 * Pruebas de integración de eventos RabbitMQ
 */
import amqp from 'amqplib';

describe('Events Integration Tests', () => {
  let connection: amqp.Connection;
  let channel: amqp.Channel;

  const EXCHANGES = {
    orders: 'orders.exchange',
    inventory: 'inventory.exchange',
    payments: 'payments.exchange',
    notifications: 'notifications.exchange'
  };

  const QUEUES = {
    orderCreated: 'orders.created',
    orderUpdated: 'orders.updated',
    inventoryUpdated: 'inventory.updated',
    paymentProcessed: 'payments.processed',
    emailNotifications: 'notifications.email',
    smsNotifications: 'notifications.sms'
  };

  const ROUTING_KEYS = {
    orderCreated: 'order.created',
    orderConfirmed: 'order.confirmed',
    orderCancelled: 'order.cancelled',
    inventoryReserved: 'inventory.reserved',
    inventoryReleased: 'inventory.released',
    paymentSuccess: 'payment.success',
    paymentFailed: 'payment.failed'
  };

  beforeAll(async () => {
    connection = global.testConnections.rabbitmq!;
    channel = await connection.createChannel();
  });

  afterAll(async () => {
    if (channel) {
      await channel.close();
    }
  });

  beforeEach(async () => {
    // Clean up queues before each test
    try {
      await channel.deleteQueue(QUEUES.orderCreated);
      await channel.deleteQueue(QUEUES.orderUpdated);
      await channel.deleteQueue(QUEUES.inventoryUpdated);
      await channel.deleteQueue(QUEUES.paymentProcessed);
    } catch (e) {
      // Queue might not exist
    }
  });

  describe('Exchange Setup', () => {
    it('should create topic exchange for orders', async () => {
      const result = await channel.assertExchange(
        EXCHANGES.orders,
        'topic',
        { durable: true }
      );

      expect(result.exchange).toBe(EXCHANGES.orders);
    });

    it('should create topic exchange for inventory', async () => {
      const result = await channel.assertExchange(
        EXCHANGES.inventory,
        'topic',
        { durable: true }
      );

      expect(result.exchange).toBe(EXCHANGES.inventory);
    });

    it('should create topic exchange for payments', async () => {
      const result = await channel.assertExchange(
        EXCHANGES.payments,
        'topic',
        { durable: true }
      );

      expect(result.exchange).toBe(EXCHANGES.payments);
    });

    it('should create fanout exchange for notifications', async () => {
      const result = await channel.assertExchange(
        EXCHANGES.notifications,
        'fanout',
        { durable: true }
      );

      expect(result.exchange).toBe(EXCHANGES.notifications);
    });
  });

  describe('Queue Setup', () => {
    it('should create durable queue for order events', async () => {
      const result = await channel.assertQueue(QUEUES.orderCreated, {
        durable: true
      });

      expect(result.queue).toBe(QUEUES.orderCreated);
    });

    it('should create queue with dead letter exchange', async () => {
      const queueName = 'orders.created.with-dlx';
      
      await channel.assertExchange('orders.dlx', 'topic', { durable: true });
      
      const result = await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'orders.dlx',
          'x-dead-letter-routing-key': 'order.failed'
        }
      });

      expect(result.queue).toBe(queueName);
    });

    it('should create queue with TTL', async () => {
      const queueName = 'orders.temporary';
      
      const result = await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 60000 // 60 seconds
        }
      });

      expect(result.queue).toBe(queueName);
    });
  });

  describe('Queue Binding', () => {
    beforeEach(async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertQueue(QUEUES.orderCreated, { durable: true });
    });

    it('should bind queue to exchange with routing key', async () => {
      await channel.bindQueue(
        QUEUES.orderCreated,
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated
      );

      // Test that binding works by publishing a message
      const message = { test: 'binding' };
      const published = channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(message))
      );

      expect(published).toBe(true);
    });

    it('should support multiple routing keys per queue', async () => {
      await channel.bindQueue(
        QUEUES.orderCreated,
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated
      );
      
      await channel.bindQueue(
        QUEUES.orderCreated,
        EXCHANGES.orders,
        ROUTING_KEYS.orderConfirmed
      );

      // Both routing keys should work
      const message1 = { event: 'created' };
      const message2 = { event: 'confirmed' };

      expect(channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(message1))
      )).toBe(true);

      expect(channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderConfirmed,
        Buffer.from(JSON.stringify(message2))
      )).toBe(true);
    });

    it('should support wildcard routing keys', async () => {
      await channel.assertQueue('orders.all', { durable: true });
      
      await channel.bindQueue(
        'orders.all',
        EXCHANGES.orders,
        'order.#' // Match all order events
      );

      const message = { test: 'wildcard' };
      expect(channel.publish(
        EXCHANGES.orders,
        'order.created.test',
        Buffer.from(JSON.stringify(message))
      )).toBe(true);
    });
  });

  describe('Message Publishing', () => {
    beforeEach(async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertQueue(QUEUES.orderCreated, { durable: true });
      await channel.bindQueue(
        QUEUES.orderCreated,
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated
      );
    });

    it('should publish message to exchange', async () => {
      const orderEvent = {
        eventType: 'order.created',
        orderId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        totalAmount: 199.99,
        items: [
          { productId: '550e8400-e29b-41d4-a716-446655440003', quantity: 2 }
        ],
        timestamp: new Date().toISOString()
      };

      const published = channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(orderEvent)),
        { persistent: true }
      );

      expect(published).toBe(true);
    });

    it('should publish message with headers', async () => {
      const message = { data: 'test' };
      
      const published = channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          headers: {
            'x-event-version': '1.0',
            'x-service': 'order-service'
          }
        }
      );

      expect(published).toBe(true);
    });

    it('should publish message with priority', async () => {
      const message = { data: 'high priority' };
      
      const published = channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          priority: 10
        }
      );

      expect(published).toBe(true);
    });
  });

  describe('Message Consuming', () => {
    beforeEach(async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertQueue(QUEUES.orderCreated, { durable: true });
      await channel.bindQueue(
        QUEUES.orderCreated,
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated
      );
    });

    it('should consume message from queue', async () => {
      const messageReceived = new Promise<any>((resolve) => {
        channel.consume(QUEUES.orderCreated, (msg) => {
          if (msg) {
            resolve(JSON.parse(msg.content.toString()));
            channel.ack(msg);
          }
        });
      });

      const testMessage = { test: 'consume' };
      channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify(testMessage))
      );

      const received = await messageReceived;
      expect(received).toEqual(testMessage);
    });

    it('should acknowledge message after processing', async () => {
      const messageReceived = new Promise<any>((resolve) => {
        channel.consume(QUEUES.orderCreated, (msg) => {
          if (msg) {
            // Process message
            const content = JSON.parse(msg.content.toString());
            
            // Acknowledge
            channel.ack(msg);
            
            resolve(content);
          }
        });
      });

      channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify({ test: 'ack' }))
      );

      const received = await messageReceived;
      expect(received.test).toBe('ack');
    });

    it('should reject message and requeue', async () => {
      let attempts = 0;
      
      channel.consume(QUEUES.orderCreated, (msg) => {
        if (msg) {
          attempts++;
          if (attempts < 3) {
            // Reject and requeue
            channel.nack(msg, false, true);
          } else {
            // Finally acknowledge
            channel.ack(msg);
          }
        }
      });

      channel.publish(
        EXCHANGES.orders,
        ROUTING_KEYS.orderCreated,
        Buffer.from(JSON.stringify({ test: 'retry' }))
      );

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(attempts).toBe(3);
    });
  });

  describe('Event Scenarios', () => {
    beforeEach(async () => {
      // Setup exchanges and queues
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertExchange(EXCHANGES.inventory, 'topic', { durable: true });
      await channel.assertExchange(EXCHANGES.payments, 'topic', { durable: true });
      
      await channel.assertQueue(QUEUES.orderCreated, { durable: true });
      await channel.assertQueue(QUEUES.inventoryUpdated, { durable: true });
      await channel.assertQueue(QUEUES.paymentProcessed, { durable: true });
      
      await channel.bindQueue(QUEUES.orderCreated, EXCHANGES.orders, 'order.created');
      await channel.bindQueue(QUEUES.inventoryUpdated, EXCHANGES.inventory, 'inventory.*');
      await channel.bindQueue(QUEUES.paymentProcessed, EXCHANGES.payments, 'payment.*');
    });

    it('should handle order created event flow', async () => {
      const events: any[] = [];

      // Setup consumers
      channel.consume(QUEUES.orderCreated, (msg) => {
        if (msg) {
          events.push({ queue: 'orders', content: JSON.parse(msg.content.toString()) });
          channel.ack(msg);
        }
      });

      // Publish order created event
      const orderEvent = {
        eventType: 'order.created',
        orderId: 'order-123',
        userId: 'user-456',
        items: [
          { productId: 'prod-1', quantity: 2, price: 50.00 },
          { productId: 'prod-2', quantity: 1, price: 100.00 }
        ],
        totalAmount: 200.00
      };

      channel.publish(
        EXCHANGES.orders,
        'order.created',
        Buffer.from(JSON.stringify(orderEvent)),
        { persistent: true }
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events).toHaveLength(1);
      expect(events[0].content.orderId).toBe('order-123');
    });

    it('should handle inventory reservation event', async () => {
      const events: any[] = [];

      channel.consume(QUEUES.inventoryUpdated, (msg) => {
        if (msg) {
          events.push(JSON.parse(msg.content.toString()));
          channel.ack(msg);
        }
      });

      const inventoryEvent = {
        eventType: 'inventory.reserved',
        productId: 'prod-1',
        orderId: 'order-123',
        quantity: 5,
        availableStock: 95
      };

      channel.publish(
        EXCHANGES.inventory,
        'inventory.reserved',
        Buffer.from(JSON.stringify(inventoryEvent)),
        { persistent: true }
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('inventory.reserved');
    });

    it('should handle payment processed event', async () => {
      const events: any[] = [];

      channel.consume(QUEUES.paymentProcessed, (msg) => {
        if (msg) {
          events.push(JSON.parse(msg.content.toString()));
          channel.ack(msg);
        }
      });

      const paymentEvent = {
        eventType: 'payment.success',
        orderId: 'order-123',
        transactionId: 'txn-789',
        amount: 200.00,
        currency: 'USD',
        paymentMethod: 'credit_card'
      };

      channel.publish(
        EXCHANGES.payments,
        'payment.success',
        Buffer.from(JSON.stringify(paymentEvent)),
        { persistent: true }
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events).toHaveLength(1);
      expect(events[0].transactionId).toBe('txn-789');
    });
  });

  describe('Message Reliability', () => {
    it('should persist messages to disk', async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertQueue(QUEUES.orderCreated, { durable: true });

      const message = { important: 'data' };
      
      const published = channel.publish(
        EXCHANGES.orders,
        'order.created',
        Buffer.from(JSON.stringify(message)),
        { 
          persistent: true,  // Save to disk
          deliveryMode: 2    // Persistent delivery mode
        }
      );

      expect(published).toBe(true);
    });

    it('should handle publisher confirms', async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      
      // Enable publisher confirms
      await channel.confirmSelect();

      const message = { test: 'confirm' };
      
      const confirmed = await new Promise<boolean>((resolve, reject) => {
        channel.publish(
          EXCHANGES.orders,
          'order.created',
          Buffer.from(JSON.stringify(message)),
          { persistent: true },
          (err) => {
            if (err) reject(err);
            else resolve(true);
          }
        );
      });

      expect(confirmed).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle high throughput', async () => {
      await channel.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
      await channel.assertQueue('perf-test', { durable: true });
      await channel.bindQueue('perf-test', EXCHANGES.orders, 'perf.test');

      const messageCount = 1000;
      const startTime = Date.now();

      // Publish many messages
      for (let i = 0; i < messageCount; i++) {
        channel.publish(
          EXCHANGES.orders,
          'perf.test',
          Buffer.from(JSON.stringify({ index: i })),
          { persistent: false } // Don't persist for performance
        );
      }

      const publishTime = Date.now() - startTime;
      
      // Should publish 1000 messages in less than 5 seconds
      expect(publishTime).toBeLessThan(5000);
    });
  });
});
