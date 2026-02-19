import amqp, { Connection, Channel, Message, ConsumeMessage } from 'amqplib';
import config from '../../config';
import logger, { logEventReceived, logEventProcessed, logEventFailed } from '../../utils/logger';

export interface EventMessage {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface EventHandler {
  (message: EventMessage): Promise<void>;
}

export class RabbitMQClient {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private handlers: Map<string, EventHandler> = new Map();
  private consumerTags: Map<string, string> = new Map();

  constructor(
    private url: string = config.rabbitmq.url,
    private exchange: string = config.rabbitmq.exchange,
    private queue: string = config.rabbitmq.queue
  ) {
    this.maxReconnectAttempts = config.rabbitmq.retryAttempts;
    this.reconnectDelay = config.rabbitmq.retryDelay;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to RabbitMQ...', { url: this.url });

      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Setup event exchange
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });

      // Setup queue
      await this.channel.assertQueue(this.queue, {
        durable: true,
      });

      // Setup dead letter exchange for failed messages
      const dlExchange = `${this.exchange}.dlx`;
      const dlQueue = `${this.queue}.dlq`;

      await this.channel.assertExchange(dlExchange, 'topic', { durable: true });
      await this.channel.assertQueue(dlQueue, { durable: true });
      await this.channel.bindQueue(dlQueue, dlExchange, '#');

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('✅ Connected to RabbitMQ successfully');

      // Setup connection error handlers
      this.setupErrorHandlers();
    } catch (error) {
      logger.error('❌ Failed to connect to RabbitMQ', error);
      await this.handleReconnect();
      throw error;
    }
  }

  /**
   * Setup connection error handlers
   */
  private setupErrorHandlers(): void {
    if (!this.connection || !this.channel) return;

    this.connection.on('error', (error) => {
      logger.error('RabbitMQ connection error', error);
      this.isConnected = false;
      this.handleReconnect();
    });

    this.connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      this.isConnected = false;
      this.handleReconnect();
    });

    this.channel.on('error', (error) => {
      logger.error('RabbitMQ channel error', error);
    });

    this.channel.on('close', () => {
      logger.warn('RabbitMQ channel closed');
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting to reconnect to RabbitMQ in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Re-subscribe to all handlers after reconnection
        await this.resubscribeAll();
      } catch (error) {
        logger.error('Reconnection attempt failed', error);
      }
    }, delay);
  }

  /**
   * Resubscribe all handlers after reconnection
   */
  private async resubscribeAll(): Promise<void> {
    for (const [routingKey, handler] of this.handlers.entries()) {
      await this.subscribe(routingKey, handler);
    }
  }

  /**
   * Publish an event
   */
  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('RabbitMQ not connected');
    }

    const message: EventMessage = {
      eventId: this.generateEventId(),
      eventType,
      timestamp: new Date().toISOString(),
      payload,
    };

    const routingKey = `inventory.${eventType.toLowerCase()}`;
    const buffer = Buffer.from(JSON.stringify(message));

    try {
      const published = this.channel.publish(this.exchange, routingKey, buffer, {
        persistent: true,
        messageId: message.eventId,
        timestamp: Date.now(),
        headers: {
          'x-event-type': eventType,
        },
      });

      if (published) {
        logger.info(`Event published: ${eventType}`, { eventId: message.eventId });
      } else {
        logger.warn(`Event publish returned false: ${eventType}`);
      }
    } catch (error) {
      logger.error(`Failed to publish event: ${eventType}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to events with a routing key pattern
   */
  async subscribe(routingKey: string, handler: EventHandler): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('RabbitMQ not connected');
    }

    // Store handler for reconnection
    this.handlers.set(routingKey, handler);

    // Bind queue to exchange with routing key
    await this.channel.bindQueue(this.queue, this.exchange, routingKey);

    // Consume messages
    const { consumerTag } = await this.channel.consume(
      this.queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const message: EventMessage = JSON.parse(content);

          logEventReceived(message.eventType, message.eventId);

          await handler(message);

          // Acknowledge message
          this.channel!.ack(msg);

          logEventProcessed(message.eventType, message.eventId);
        } catch (error) {
          logger.error('Error processing message', error);

          // Reject message and requeue if it's the first failure
          const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

          if (retryCount < 3) {
            this.channel!.nack(msg, false, false);
            
            // Republish with incremented retry count
            const retryMessage = JSON.parse(msg.content.toString());
            this.channel!.publish(
              this.exchange,
              msg.fields.routingKey,
              Buffer.from(JSON.stringify(retryMessage)),
              {
                ...msg.properties,
                headers: {
                  ...msg.properties.headers,
                  'x-retry-count': retryCount + 1,
                },
              }
            );
          } else {
            // Send to dead letter queue after max retries
            this.channel!.reject(msg, false);
            logEventFailed('MessageProcessing', msg.properties.messageId || 'unknown', error);
          }
        }
      },
      { noAck: false }
    );

    this.consumerTags.set(routingKey, consumerTag);

    logger.info(`Subscribed to events: ${routingKey}`);
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(routingKey: string): Promise<void> {
    if (!this.channel) return;

    const consumerTag = this.consumerTags.get(routingKey);
    if (consumerTag) {
      await this.channel.cancel(consumerTag);
      this.consumerTags.delete(routingKey);
      this.handlers.delete(routingKey);
      logger.info(`Unsubscribed from events: ${routingKey}`);
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', error);
    }
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get channel (for advanced usage)
   */
  getChannel(): Channel | null {
    return this.channel;
  }
}

// Singleton instance
let rabbitMQClient: RabbitMQClient | null = null;

export function createRabbitMQClient(): RabbitMQClient {
  if (!rabbitMQClient) {
    rabbitMQClient = new RabbitMQClient();
  }
  return rabbitMQClient;
}

export function resetRabbitMQClient(): void {
  rabbitMQClient = null;
}

export default RabbitMQClient;
