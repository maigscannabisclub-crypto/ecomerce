import amqp, { Connection, Channel } from 'amqplib';
import config from '../../config';
import logger from '../../utils/logger';
import { ProductEventDTO } from '../../application/dto/ProductDTO';

// RabbitMQ connection and channel
let connection: Connection | null = null;
let channel: Channel | null = null;
let isConnected = false;

// Exchange and queue names
const EXCHANGE_NAME = config.rabbitmq.exchange;
const QUEUE_NAME = config.rabbitmq.queue;

// Event routing keys
export const RoutingKeys = {
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_STOCK_CHANGED: 'product.stock.changed'
} as const;

export const connectMessageQueue = async (): Promise<void> => {
  if (!config.rabbitmq.enabled) {
    logger.info('Message queue is disabled');
    return;
  }

  if (isConnected && connection && channel) {
    logger.debug('Message queue already connected');
    return;
  }

  try {
    // Create connection
    connection = await amqp.connect(config.rabbitmq.url);
    
    // Create channel
    channel = await connection.createChannel();
    
    // Assert exchange (topic exchange for routing)
    await channel.assertExchange(EXCHANGE_NAME, 'topic', {
      durable: true,
      autoDelete: false
    });
    
    // Assert queue
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      autoDelete: false
    });
    
    // Bind queue to exchange with routing patterns
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'product.*');
    
    // Set prefetch for fair dispatch
    await channel.prefetch(10);
    
    // Handle connection events
    connection.on('error', (error) => {
      logger.error('RabbitMQ connection error', error);
      isConnected = false;
    });
    
    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      isConnected = false;
      // Attempt reconnection after delay
      setTimeout(connectMessageQueue, 5000);
    });
    
    isConnected = true;
    logger.info('✅ Message queue connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to message queue', error);
    isConnected = false;
    // Retry connection after delay
    setTimeout(connectMessageQueue, 5000);
  }
};

export const disconnectMessageQueue = async (): Promise<void> => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    isConnected = false;
    logger.info('Message queue disconnected');
  } catch (error) {
    logger.error('Error disconnecting from message queue', error);
  }
};

export const checkMessageQueueHealth = async (): Promise<boolean> => {
  if (!config.rabbitmq.enabled) {
    return false;
  }

  if (!connection || !channel) {
    return false;
  }

  try {
    // Check if channel is still open
    return channel.connection !== undefined;
  } catch (error) {
    logger.error('Message queue health check failed', error);
    return false;
  }
};

// Publish event to message queue
export const publishEvent = async (
  routingKey: string,
  event: ProductEventDTO
): Promise<boolean> => {
  if (!config.rabbitmq.enabled) {
    logger.debug('Message queue disabled, event not published');
    return false;
  }

  if (!channel || !isConnected) {
    logger.warn('Message queue not connected, event not published');
    return false;
  }

  try {
    const message = Buffer.from(JSON.stringify(event));
    
    const published = channel.publish(EXCHANGE_NAME, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
      messageId: `${event.eventType}-${event.productId}-${Date.now()}`,
      headers: {
        'x-event-type': event.eventType,
        'x-service': config.server.serviceName
      }
    });

    if (published) {
      logger.info(`Event published: ${routingKey}`, {
        eventType: event.eventType,
        productId: event.productId
      });
    } else {
      logger.warn(`Failed to publish event: ${routingKey}`);
    }

    return published;
  } catch (error) {
    logger.error(`Error publishing event: ${routingKey}`, error);
    return false;
  }
};

// Helper methods for specific events
export const publishProductCreated = async (
  productId: string,
  sku: string,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const event: ProductEventDTO = {
    eventType: 'ProductCreated',
    productId,
    sku,
    timestamp: new Date(),
    payload
  };

  return publishEvent(RoutingKeys.PRODUCT_CREATED, event);
};

export const publishProductUpdated = async (
  productId: string,
  sku: string,
  payload: Record<string, unknown>,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<boolean> => {
  const event: ProductEventDTO = {
    eventType: 'ProductUpdated',
    productId,
    sku,
    timestamp: new Date(),
    payload: {
      ...payload,
      changes
    }
  };

  return publishEvent(RoutingKeys.PRODUCT_UPDATED, event);
};

export const publishProductDeleted = async (
  productId: string,
  sku: string,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const event: ProductEventDTO = {
    eventType: 'ProductDeleted',
    productId,
    sku,
    timestamp: new Date(),
    payload
  };

  return publishEvent(RoutingKeys.PRODUCT_DELETED, event);
};

export const publishProductStockChanged = async (
  productId: string,
  sku: string,
  oldStock: number,
  newStock: number,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const event: ProductEventDTO = {
    eventType: 'ProductStockChanged',
    productId,
    sku,
    timestamp: new Date(),
    payload: {
      ...payload,
      stockChange: {
        old: oldStock,
        new: newStock,
        difference: newStock - oldStock
      }
    }
  };

  return publishEvent(RoutingKeys.PRODUCT_STOCK_CHANGED, event);
};

// Consume messages from queue
export const consumeMessages = async (
  handler: (message: ProductEventDTO) => Promise<void>
): Promise<void> => {
  if (!config.rabbitmq.enabled || !channel) {
    logger.warn('Cannot consume messages - queue not available');
    return;
  }

  try {
    await channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        const content = msg.content.toString();
        const event: ProductEventDTO = JSON.parse(content);
        
        logger.info(`Message received: ${event.eventType}`, {
          productId: event.productId
        });

        await handler(event);
        
        channel?.ack(msg);
        
        logger.debug(`Message acknowledged: ${event.eventType}`);
      } catch (error) {
        logger.error('Error processing message', error);
        // Reject message and requeue
        channel?.nack(msg, false, true);
      }
    });

    logger.info(`Started consuming messages from queue: ${QUEUE_NAME}`);
  } catch (error) {
    logger.error('Error starting message consumer', error);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectMessageQueue();
});

process.on('SIGTERM', async () => {
  await disconnectMessageQueue();
});

export default {
  connect: connectMessageQueue,
  disconnect: disconnectMessageQueue,
  checkHealth: checkMessageQueueHealth,
  publishEvent,
  publishProductCreated,
  publishProductUpdated,
  publishProductDeleted,
  publishProductStockChanged,
  consumeMessages,
  RoutingKeys
};
