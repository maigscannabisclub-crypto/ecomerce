import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import config from '../../config';
import logger from '../../utils/logger';

// RabbitMQ connection and channel
let connection: Connection | null = null;
let channel: Channel | null = null;

// Event handlers registry
type EventHandler = (message: unknown) => Promise<void>;
const eventHandlers: Map<string, EventHandler[]> = new Map();

// Create RabbitMQ connection
export const createConnection = async (): Promise<Connection> => {
  try {
    const conn = await amqp.connect(config.rabbitmq.url);
    
    conn.on('error', (error) => {
      logger.error('RabbitMQ connection error', error);
    });
    
    conn.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });
    
    logger.info('RabbitMQ connection established');
    return conn;
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ', error);
    throw error;
  }
};

// Create channel
export const createChannel = async (conn: Connection): Promise<Channel> => {
  try {
    const ch = await conn.createChannel();
    
    ch.on('error', (error) => {
      logger.error('RabbitMQ channel error', error);
    });
    
    ch.on('close', () => {
      logger.warn('RabbitMQ channel closed');
      channel = null;
    });
    
    // Set prefetch for fair dispatch
    await ch.prefetch(1);
    
    logger.info('RabbitMQ channel created');
    return ch;
  } catch (error) {
    logger.error('Failed to create RabbitMQ channel', error);
    throw error;
  }
};

// Initialize RabbitMQ
export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    if (!connection) {
      connection = await createConnection();
    }
    
    if (!channel) {
      channel = await createChannel(connection);
    }
    
    // Assert exchange
    await channel.assertExchange(config.rabbitmq.exchange, 'topic', {
      durable: true,
    });
    
    // Assert queue
    await channel.assertQueue(config.rabbitmq.queue, {
      durable: true,
    });
    
    // Bind queue to exchange with routing keys
    const routingKeys = ['order.completed', 'order.cancelled'];
    for (const key of routingKeys) {
      await channel.bindQueue(config.rabbitmq.queue, config.rabbitmq.exchange, key);
    }
    
    logger.info('RabbitMQ initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ', error);
    throw error;
  }
};

// Close RabbitMQ connection
export const closeRabbitMQ = async (): Promise<void> => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection', error);
  }
};

// Health check for RabbitMQ
export const checkRabbitMQHealth = async (): Promise<{ healthy: boolean; latency: number }> => {
  const start = Date.now();
  try {
    if (!connection || !channel) {
      return { healthy: false, latency: Date.now() - start };
    }
    
    // Try to check if channel is still open
    await channel.checkQueue(config.rabbitmq.queue);
    const latency = Date.now() - start;
    return { healthy: true, latency };
  } catch (error) {
    logger.error('RabbitMQ health check failed', error);
    return { healthy: false, latency: Date.now() - start };
  }
};

// Register event handler
export const registerEventHandler = (
  eventType: string,
  handler: EventHandler
): void => {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, []);
  }
  eventHandlers.get(eventType)!.push(handler);
  logger.info(`Registered handler for event type: ${eventType}`);
};

// Publish message
export const publishMessage = async (
  routingKey: string,
  message: unknown
): Promise<void> => {
  try {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    
    const messageBuffer = Buffer.from(JSON.stringify(message));
    
    const result = channel.publish(
      config.rabbitmq.exchange,
      routingKey,
      messageBuffer,
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
        messageId: generateMessageId(),
      }
    );
    
    if (!result) {
      throw new Error('Failed to publish message');
    }
    
    logger.debug(`Published message to ${routingKey}`);
  } catch (error) {
    logger.error(`Error publishing message to ${routingKey}`, error);
    throw error;
  }
};

// Consume messages
export const startConsuming = async (): Promise<void> => {
  try {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    
    await channel.consume(config.rabbitmq.queue, async (msg: ConsumeMessage | null) => {
      if (!msg) {
        return;
      }
      
      try {
        const content = JSON.parse(msg.content.toString());
        const routingKey = msg.fields.routingKey;
        
        logger.debug(`Received message: ${routingKey}`, { 
          messageId: msg.properties.messageId,
          eventType: content.eventType,
        });
        
        // Determine event type from routing key or message content
        const eventType = content.eventType || routingKey;
        
        // Get handlers for this event type
        const handlers = eventHandlers.get(eventType) || [];
        
        if (handlers.length === 0) {
          logger.warn(`No handlers registered for event type: ${eventType}`);
          channel!.nack(msg, false, false); // Reject and don't requeue
          return;
        }
        
        // Execute all handlers
        for (const handler of handlers) {
          try {
            await handler(content);
          } catch (error) {
            logger.error(`Handler error for event type: ${eventType}`, error);
            // Continue with other handlers even if one fails
          }
        }
        
        // Acknowledge message
        channel!.ack(msg);
        logger.debug(`Message acknowledged: ${routingKey}`);
        
      } catch (error) {
        logger.error('Error processing message', error);
        // Reject message and don't requeue
        channel!.nack(msg, false, false);
      }
    });
    
    logger.info(`Started consuming from queue: ${config.rabbitmq.queue}`);
  } catch (error) {
    logger.error('Error starting consumer', error);
    throw error;
  }
};

// Stop consuming
export const stopConsuming = async (): Promise<void> => {
  try {
    if (channel) {
      await channel.cancel('');
      logger.info('Stopped consuming messages');
    }
  } catch (error) {
    logger.error('Error stopping consumer', error);
  }
};

// Generate unique message ID
const generateMessageId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get connection status
export const getConnectionStatus = (): { connected: boolean; hasChannel: boolean } => {
  return {
    connected: connection !== null,
    hasChannel: channel !== null,
  };
};

// Reconnect with exponential backoff
export const reconnectWithBackoff = async (
  maxRetries = 5,
  baseDelay = 1000
): Promise<void> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`RabbitMQ reconnection attempt ${attempt}/${maxRetries}`);
      await initializeRabbitMQ();
      await startConsuming();
      logger.info('RabbitMQ reconnected successfully');
      return;
    } catch (error) {
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.error(`Reconnection attempt ${attempt} failed, retrying in ${delay}ms`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed to reconnect to RabbitMQ after ${maxRetries} attempts`);
};

export { connection, channel };
