/**
 * =============================================================================
 * RabbitMQ Event Examples for E-Commerce Platform
 * =============================================================================
 * 
 * This file contains examples of how to publish and consume events
 * using the RabbitMQ configuration for the e-commerce platform.
 * 
 * Copy these examples into your service code and adapt as needed.
 */

const amqp = require('amqplib');

// =============================================================================
// CONFIGURATION
// =============================================================================

const RABBITMQ_CONFIG = {
  hostname: process.env.RABBITMQ_HOST || 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT) || 5672,
  username: process.env.RABBITMQ_USER || 'guest',
  password: process.env.RABBITMQ_PASS || 'guest',
  vhost: process.env.RABBITMQ_VHOST || 'ecommerce',
  heartbeat: 60,
  connectionTimeout: 10000
};

const EXCHANGES = {
  EVENTS: 'ecommerce.events',
  RETRY: 'ecommerce.events.retry',
  DLX: 'ecommerce.dlx',
  DELAYED: 'ecommerce.delayed'
};

const ROUTING_KEYS = {
  // Order events
  ORDER_CREATED: 'order.created',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FAILED: 'order.failed',
  
  // Stock events
  STOCK_RESERVED: 'stock.reserved',
  STOCK_RESERVATION_FAILED: 'stock.reservation-failed',
  
  // Product events
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  
  // Inventory events
  LOW_STOCK_ALERT: 'inventory.low-stock'
};

const QUEUES = {
  // Inventory service queues
  INVENTORY_ORDER_CREATED: 'inventory-service.order-created',
  INVENTORY_ORDER_FAILED: 'inventory-service.order-failed',
  INVENTORY_PRODUCT_CREATED: 'inventory-service.product-created',
  INVENTORY_PRODUCT_UPDATED: 'inventory-service.product-updated',
  INVENTORY_LOW_STOCK_ALERT: 'inventory-service.low-stock-alert',
  
  // Order service queues
  ORDER_STOCK_RESERVED: 'order-service.stock-reserved',
  ORDER_STOCK_RESERVATION_FAILED: 'order-service.stock-reservation-failed',
  ORDER_CANCELLED: 'order-service.order-cancelled',
  ORDER_COMPLETED: 'order-service.order-completed',
  
  // Reporting service queues
  REPORTING_ORDER_COMPLETED: 'reporting-service.order-completed',
  REPORTING_ORDER_CANCELLED: 'reporting-service.order-cancelled',
  REPORTING_PRODUCT_CREATED: 'reporting-service.product-created',
  REPORTING_PRODUCT_UPDATED: 'reporting-service.product-updated',
  
  // Notification service queues
  NOTIFICATION_ORDER_CREATED: 'notification-service.order-created',
  NOTIFICATION_ORDER_COMPLETED: 'notification-service.order-completed',
  NOTIFICATION_ORDER_CANCELLED: 'notification-service.order-cancelled',
  NOTIFICATION_LOW_STOCK_ALERT: 'notification-service.low-stock-alert'
};

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

class RabbitMQConnection {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      const amqpUrl = `amqp://${RABBITMQ_CONFIG.username}:${RABBITMQ_CONFIG.password}@${RABBITMQ_CONFIG.hostname}:${RABBITMQ_CONFIG.port}/${RABBITMQ_CONFIG.vhost}`;
      
      this.connection = await amqp.connect(amqpUrl);
      this.channel = await this.connection.createChannel();
      
      // Enable publisher confirms for reliable publishing
      await this.channel.confirmSelect();
      
      // Set prefetch count for fair dispatch
      this.channel.prefetch(10);
      
      console.log('Connected to RabbitMQ');
      
      // Handle connection events
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });
      
      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
      });
      
      return this;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }
}

// =============================================================================
// EVENT PUBLISHER
// =============================================================================

class EventPublisher {
  constructor(channel) {
    this.channel = channel;
  }

  /**
   * Publish an event to the events exchange
   * @param {string} routingKey - The routing key for the event
   * @param {Object} payload - The event payload
   * @param {Object} options - Additional publish options
   */
  async publish(routingKey, payload, options = {}) {
    const event = {
      eventType: this.getEventTypeFromRoutingKey(routingKey),
      payload,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || this.generateId(),
      serviceName: options.serviceName || 'unknown-service',
      version: options.version || '1.0'
    };

    const messageBuffer = Buffer.from(JSON.stringify(event));

    const publishOptions = {
      persistent: true,  // Message survives broker restart
      messageId: event.correlationId,
      timestamp: Date.now(),
      contentType: 'application/json',
      headers: {
        'x-event-type': event.eventType,
        'x-service': event.serviceName,
        'x-version': event.version,
        ...options.headers
      },
      ...options.publishOptions
    };

    try {
      const result = this.channel.publish(
        EXCHANGES.EVENTS,
        routingKey,
        messageBuffer,
        publishOptions
      );

      if (!result) {
        throw new Error('Failed to publish message - channel write buffer full');
      }

      console.log(`Published event: ${event.eventType} with routing key: ${routingKey}`);
      return event.correlationId;
    } catch (error) {
      console.error('Error publishing event:', error);
      throw error;
    }
  }

  /**
   * Publish an event with a delay
   * @param {string} routingKey - The routing key for the event
   * @param {Object} payload - The event payload
   * @param {number} delayMs - Delay in milliseconds
   * @param {Object} options - Additional publish options
   */
  async publishDelayed(routingKey, payload, delayMs, options = {}) {
    const event = {
      eventType: this.getEventTypeFromRoutingKey(routingKey),
      payload,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || this.generateId(),
      serviceName: options.serviceName || 'unknown-service',
      version: options.version || '1.0'
    };

    const messageBuffer = Buffer.from(JSON.stringify(event));

    const publishOptions = {
      persistent: true,
      messageId: event.correlationId,
      timestamp: Date.now(),
      contentType: 'application/json',
      headers: {
        'x-delay': delayMs,
        'x-event-type': event.eventType,
        'x-service': event.serviceName,
        'x-version': event.version,
        ...options.headers
      }
    };

    try {
      const result = this.channel.publish(
        EXCHANGES.DELAYED,
        routingKey,
        messageBuffer,
        publishOptions
      );

      if (!result) {
        throw new Error('Failed to publish delayed message');
      }

      console.log(`Published delayed event: ${event.eventType} (delay: ${delayMs}ms)`);
      return event.correlationId;
    } catch (error) {
      console.error('Error publishing delayed event:', error);
      throw error;
    }
  }

  getEventTypeFromRoutingKey(routingKey) {
    const mapping = {
      [ROUTING_KEYS.ORDER_CREATED]: 'OrderCreated',
      [ROUTING_KEYS.ORDER_COMPLETED]: 'OrderCompleted',
      [ROUTING_KEYS.ORDER_CANCELLED]: 'OrderCancelled',
      [ROUTING_KEYS.ORDER_FAILED]: 'OrderFailed',
      [ROUTING_KEYS.STOCK_RESERVED]: 'StockReserved',
      [ROUTING_KEYS.STOCK_RESERVATION_FAILED]: 'StockReservationFailed',
      [ROUTING_KEYS.PRODUCT_CREATED]: 'ProductCreated',
      [ROUTING_KEYS.PRODUCT_UPDATED]: 'ProductUpdated',
      [ROUTING_KEYS.LOW_STOCK_ALERT]: 'LowStockAlert'
    };
    return mapping[routingKey] || 'UnknownEvent';
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// EVENT CONSUMER
// =============================================================================

class EventConsumer {
  constructor(channel) {
    this.channel = channel;
    this.handlers = new Map();
  }

  /**
   * Register an event handler
   * @param {string} eventType - The event type to handle
   * @param {Function} handler - The handler function
   */
  on(eventType, handler) {
    this.handlers.set(eventType, handler);
  }

  /**
   * Start consuming from a queue
   * @param {string} queueName - The queue to consume from
   * @param {Object} options - Consume options
   */
  async consume(queueName, options = {}) {
    const { useRetry = true, maxRetries = 3 } = options;

    try {
      const { consumerTag } = await this.channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;

          try {
            const event = JSON.parse(msg.content.toString());
            const eventType = event.eventType;

            console.log(`Received event: ${eventType} from queue: ${queueName}`);

            const handler = this.handlers.get(eventType);
            
            if (handler) {
              await handler(event, msg);
              this.channel.ack(msg);
              console.log(`Successfully processed event: ${eventType}`);
            } else {
              console.warn(`No handler registered for event type: ${eventType}`);
              this.channel.nack(msg, false, false); // Send to DLX
            }
          } catch (error) {
            console.error('Error processing message:', error);
            
            if (useRetry) {
              await this.handleRetry(msg, maxRetries);
            } else {
              this.channel.nack(msg, false, false); // Send to DLX
            }
          }
        },
        { noAck: false }
      );

      console.log(`Started consuming from queue: ${queueName} (consumerTag: ${consumerTag})`);
      return consumerTag;
    } catch (error) {
      console.error('Error starting consumer:', error);
      throw error;
    }
  }

  /**
   * Handle message retry with exponential backoff
   * @param {Object} msg - The message to retry
   * @param {number} maxRetries - Maximum number of retries
   */
  async handleRetry(msg, maxRetries) {
    const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;

    if (retryCount > maxRetries) {
      console.log(`Max retries (${maxRetries}) exceeded, sending to DLX`);
      this.channel.nack(msg, false, false);
      return;
    }

    // Calculate delay based on retry count
    const delays = [5000, 30000, 300000]; // 5s, 30s, 5m
    const delay = delays[Math.min(retryCount - 1, delays.length - 1)];
    const delayKey = delay === 5000 ? '5s' : delay === 30000 ? '30s' : '5m';

    console.log(`Retrying message (attempt ${retryCount}/${maxRetries}) with delay ${delay}ms`);

    // Republish to retry exchange
    const retryRoutingKey = `retry.${delayKey}.${msg.fields.routingKey}`;
    
    this.channel.publish(
      EXCHANGES.RETRY,
      retryRoutingKey,
      msg.content,
      {
        persistent: true,
        headers: {
          ...msg.properties.headers,
          'x-retry-count': retryCount,
          'x-original-routing-key': msg.fields.routingKey,
          'x-original-exchange': msg.fields.exchange
        }
      }
    );

    this.channel.ack(msg);
  }

  /**
   * Stop consuming
   * @param {string} consumerTag - The consumer tag to cancel
   */
  async stop(consumerTag) {
    try {
      await this.channel.cancel(consumerTag);
      console.log(`Stopped consumer: ${consumerTag}`);
    } catch (error) {
      console.error('Error stopping consumer:', error);
      throw error;
    }
  }
}

// =============================================================================
// SERVICE-SPECIFIC EXAMPLES
// =============================================================================

// -----------------------------------------------------------------------------
// ORDER SERVICE EXAMPLE
// -----------------------------------------------------------------------------

class OrderService {
  constructor() {
    this.rabbitmq = new RabbitMQConnection();
    this.publisher = null;
    this.consumer = null;
  }

  async initialize() {
    await this.rabbitmq.connect();
    this.publisher = new EventPublisher(this.rabbitmq.channel);
    this.consumer = new EventConsumer(this.rabbitmq.channel);
    
    // Register event handlers
    this.registerHandlers();
    
    // Start consuming
    await this.consumer.consume(QUEUES.ORDER_STOCK_RESERVED);
    await this.consumer.consume(QUEUES.ORDER_STOCK_RESERVATION_FAILED);
  }

  registerHandlers() {
    // Handle successful stock reservation
    this.consumer.on('StockReserved', async (event, msg) => {
      const { orderId, items } = event.payload;
      
      // Update order status to confirmed
      await this.confirmOrder(orderId);
      
      // Publish order completed event
      await this.publisher.publish(
        ROUTING_KEYS.ORDER_COMPLETED,
        { orderId, items, status: 'completed' },
        { serviceName: 'order-service', correlationId: event.correlationId }
      );
    });

    // Handle failed stock reservation
    this.consumer.on('StockReservationFailed', async (event, msg) => {
      const { orderId, reason } = event.payload;
      
      // Update order status to failed
      await this.failOrder(orderId, reason);
      
      // Publish order failed event
      await this.publisher.publish(
        ROUTING_KEYS.ORDER_FAILED,
        { orderId, reason },
        { serviceName: 'order-service', correlationId: event.correlationId }
      );
    });
  }

  async createOrder(orderData) {
    // Save order to database
    const order = await this.saveOrder(orderData);
    
    // Publish order created event
    await this.publisher.publish(
      ROUTING_KEYS.ORDER_CREATED,
      {
        orderId: order.id,
        userId: order.userId,
        items: order.items,
        total: order.total
      },
      { serviceName: 'order-service' }
    );
    
    return order;
  }

  async cancelOrder(orderId, reason) {
    // Update order status
    await this.updateOrderStatus(orderId, 'cancelled');
    
    // Publish order cancelled event
    await this.publisher.publish(
      ROUTING_KEYS.ORDER_CANCELLED,
      { orderId, reason, cancelledAt: new Date().toISOString() },
      { serviceName: 'order-service' }
    );
  }

  // Placeholder methods
  async saveOrder(data) { return { id: 'order-123', ...data }; }
  async confirmOrder(orderId) { console.log(`Order ${orderId} confirmed`); }
  async failOrder(orderId, reason) { console.log(`Order ${orderId} failed: ${reason}`); }
  async updateOrderStatus(orderId, status) { console.log(`Order ${orderId} status: ${status}`); }
}

// -----------------------------------------------------------------------------
// INVENTORY SERVICE EXAMPLE
// -----------------------------------------------------------------------------

class InventoryService {
  constructor() {
    this.rabbitmq = new RabbitMQConnection();
    this.publisher = null;
    this.consumer = null;
  }

  async initialize() {
    await this.rabbitmq.connect();
    this.publisher = new EventPublisher(this.rabbitmq.channel);
    this.consumer = new EventConsumer(this.rabbitmq.channel);
    
    this.registerHandlers();
    
    await this.consumer.consume(QUEUES.INVENTORY_ORDER_CREATED);
    await this.consumer.consume(QUEUES.INVENTORY_PRODUCT_CREATED);
    await this.consumer.consume(QUEUES.INVENTORY_PRODUCT_UPDATED);
  }

  registerHandlers() {
    // Handle order created - reserve stock
    this.consumer.on('OrderCreated', async (event, msg) => {
      const { orderId, items } = event.payload;
      
      try {
        // Reserve stock for each item
        const reservationResults = await this.reserveStock(items);
        
        if (reservationResults.allReserved) {
          // Publish stock reserved event
          await this.publisher.publish(
            ROUTING_KEYS.STOCK_RESERVED,
            { orderId, items, reservedAt: new Date().toISOString() },
            { serviceName: 'inventory-service', correlationId: event.correlationId }
          );
        } else {
          // Publish stock reservation failed event
          await this.publisher.publish(
            ROUTING_KEYS.STOCK_RESERVATION_FAILED,
            { 
              orderId, 
              items,
              failedItems: reservationResults.failedItems,
              reason: 'Insufficient stock'
            },
            { serviceName: 'inventory-service', correlationId: event.correlationId }
          );
        }
      } catch (error) {
        console.error('Error reserving stock:', error);
        throw error;
      }
    });

    // Handle product created
    this.consumer.on('ProductCreated', async (event, msg) => {
      const { productId, name, initialStock } = event.payload;
      
      // Initialize inventory for new product
      await this.initializeInventory(productId, initialStock);
      
      console.log(`Inventory initialized for product: ${productId}`);
    });

    // Handle product updated
    this.consumer.on('ProductUpdated', async (event, msg) => {
      const { productId, changes } = event.payload;
      
      // Update inventory if needed
      if (changes.stock !== undefined) {
        await this.updateStock(productId, changes.stock);
      }
    });
  }

  async reserveStock(items) {
    const results = { allReserved: true, failedItems: [] };
    
    for (const item of items) {
      const available = await this.checkStock(item.productId, item.quantity);
      
      if (!available) {
        results.allReserved = false;
        results.failedItems.push(item);
      }
    }
    
    if (results.allReserved) {
      // Actually reserve the stock
      for (const item of items) {
        await this.decrementStock(item.productId, item.quantity);
      }
    }
    
    return results;
  }

  async checkLowStock(productId, threshold = 10) {
    const stock = await this.getStock(productId);
    
    if (stock <= threshold) {
      await this.publisher.publish(
        ROUTING_KEYS.LOW_STOCK_ALERT,
        { 
          productId, 
          currentStock: stock, 
          threshold,
          alertAt: new Date().toISOString()
        },
        { serviceName: 'inventory-service' }
      );
    }
  }

  // Placeholder methods
  async checkStock(productId, quantity) { return true; }
  async decrementStock(productId, quantity) { console.log(`Decremented ${quantity} from ${productId}`); }
  async initializeInventory(productId, stock) { console.log(`Initialized inventory for ${productId}`); }
  async updateStock(productId, stock) { console.log(`Updated stock for ${productId}`); }
  async getStock(productId) { return 100; }
}

// -----------------------------------------------------------------------------
// REPORTING SERVICE EXAMPLE
// -----------------------------------------------------------------------------

class ReportingService {
  constructor() {
    this.rabbitmq = new RabbitMQConnection();
    this.consumer = null;
  }

  async initialize() {
    await this.rabbitmq.connect();
    this.consumer = new EventConsumer(this.rabbitmq.channel);
    
    this.registerHandlers();
    
    await this.consumer.consume(QUEUES.REPORTING_ORDER_COMPLETED);
    await this.consumer.consume(QUEUES.REPORTING_ORDER_CANCELLED);
    await this.consumer.consume(QUEUES.REPORTING_PRODUCT_CREATED);
    await this.consumer.consume(QUEUES.REPORTING_PRODUCT_UPDATED);
  }

  registerHandlers() {
    // Handle order completed - update sales reports
    this.consumer.on('OrderCompleted', async (event, msg) => {
      const { orderId, items, total } = event.payload;
      
      // Update daily sales report
      await this.updateSalesReport({
        orderId,
        amount: total,
        items: items.length,
        date: new Date().toISOString().split('T')[0]
      });
      
      // Update product sales statistics
      for (const item of items) {
        await this.updateProductSales(item.productId, item.quantity, item.price);
      }
    });

    // Handle order cancelled - update cancellation reports
    this.consumer.on('OrderCancelled', async (event, msg) => {
      const { orderId, reason } = event.payload;
      
      await this.updateCancellationReport({
        orderId,
        reason,
        cancelledAt: new Date().toISOString()
      });
    });

    // Handle product created - initialize product metrics
    this.consumer.on('ProductCreated', async (event, msg) => {
      const { productId, name, price } = event.payload;
      
      await this.initializeProductMetrics({
        productId,
        name,
        price,
        createdAt: new Date().toISOString()
      });
    });

    // Handle product updated - update product information
    this.consumer.on('ProductUpdated', async (event, msg) => {
      const { productId, changes } = event.payload;
      
      await this.updateProductMetrics(productId, changes);
    });
  }

  // Placeholder methods
  async updateSalesReport(data) { console.log('Updated sales report:', data); }
  async updateProductSales(productId, quantity, price) { console.log(`Updated sales for ${productId}`); }
  async updateCancellationReport(data) { console.log('Updated cancellation report:', data); }
  async initializeProductMetrics(data) { console.log('Initialized product metrics:', data); }
  async updateProductMetrics(productId, changes) { console.log(`Updated metrics for ${productId}`); }
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

async function main() {
  // Example: Order Service
  const orderService = new OrderService();
  await orderService.initialize();
  
  // Create an order
  const order = await orderService.createOrder({
    userId: 'user-123',
    items: [
      { productId: 'prod-1', quantity: 2, price: 29.99 },
      { productId: 'prod-2', quantity: 1, price: 49.99 }
    ],
    total: 109.97
  });
  
  console.log('Order created:', order);
  
  // Example: Inventory Service
  const inventoryService = new InventoryService();
  await inventoryService.initialize();
  
  // Example: Reporting Service
  const reportingService = new ReportingService();
  await reportingService.initialize();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use in other modules
module.exports = {
  RabbitMQConnection,
  EventPublisher,
  EventConsumer,
  OrderService,
  InventoryService,
  ReportingService,
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES
};
