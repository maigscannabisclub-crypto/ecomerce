import amqp, { Connection, Channel, Message, ConsumeMessage } from 'amqplib';
import { createLogger } from '../../utils/logger';
import config from '../../config';

const logger = createLogger('RabbitMQ');

export interface EventMessage {
  eventType: string;
  aggregateId: string;
  payload: unknown;
  timestamp: string;
  correlationId?: string;
}

export interface EventHandler {
  eventType: string;
  handler: (message: EventMessage) => Promise<void>;
}

export class RabbitMQConnection {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly reconnectInterval = 5000;
  private handlers: Map<string, EventHandler> = new Map();

  async connect(): Promise<void> {
    if (this.isConnecting || this.connection) {
      return;
    }

    this.isConnecting = true;

    try {
      logger.info('Connecting to RabbitMQ', { url: config.rabbitmq.url });

      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Setup exchange
      await this.channel.assertExchange(config.rabbitmq.exchange, 'topic', {
        durable: true,
      });

      // Setup main queue
      await this.channel.assertQueue(config.rabbitmq.queue, {
        durable: true,
      });

      // Setup retry queue with TTL
      await this.channel.assertQueue(config.rabbitmq.retryQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': 30000, // 30 seconds
          'x-dead-letter-exchange': config.rabbitmq.exchange,
          'x-dead-letter-routing-key': 'orders.retry',
        },
      });

      // Setup DLQ
      await this.channel.assertQueue(config.rabbitmq.dlq, {
        durable: true,
      });

      // Bind queues
      await this.channel.bindQueue(
        config.rabbitmq.queue,
        config.rabbitmq.exchange,
        'orders.*'
      );

      await this.channel.bindQueue(
        config.rabbitmq.retryQueue,
        config.rabbitmq.exchange,
        'orders.retry'
      );

      await this.channel.bindQueue(
        config.rabbitmq.dlq,
        config.rabbitmq.exchange,
        'orders.dlq'
      );

      // Setup event handlers for connection
      this.connection.on('error', (error) => {
        logger.error('RabbitMQ connection error', { error: error.message });
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      this.channel.on('error', (error) => {
        logger.error('RabbitMQ channel error', { error: error.message });
      });

      this.channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
      });

      // Set prefetch for fair dispatch
      await this.channel.prefetch(1);

      logger.info('RabbitMQ connected successfully');
      this.isConnecting = false;

      // Start consuming messages
      await this.startConsuming();
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ', {
        error: (error as Error).message,
      });
      this.isConnecting = false;
      this.handleDisconnect();
      throw error;
    }
  }

  private handleDisconnect(): void {
    this.connection = null;
    this.channel = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      logger.info('Attempting to reconnect to RabbitMQ...');
      this.connect().catch((error) => {
        logger.error('Reconnection failed', { error: error.message });
      });
    }, this.reconnectInterval);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      logger.info('RabbitMQ disconnected');
    } catch (error) {
      logger.error('Error disconnecting from RabbitMQ', {
        error: (error as Error).message,
      });
    }
  }

  async publish(
    routingKey: string,
    message: EventMessage,
    options?: {
      persistent?: boolean;
      expiration?: number;
      headers?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    if (!this.channel) {
      logger.error('Cannot publish message: not connected to RabbitMQ');
      return false;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));

      const publishOptions = {
        persistent: options?.persistent ?? true,
        timestamp: Date.now(),
        messageId: `${message.eventType}-${Date.now()}`,
        correlationId: message.correlationId,
        headers: options?.headers,
        expiration: options?.expiration,
      };

      const result = this.channel.publish(
        config.rabbitmq.exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );

      if (result) {
        logger.debug('Message published', {
          routingKey,
          eventType: message.eventType,
          aggregateId: message.aggregateId,
        });
      } else {
        logger.warn('Message publish returned false', {
          routingKey,
          eventType: message.eventType,
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to publish message', {
        routingKey,
        eventType: message.eventType,
        error: (error as Error).message,
      });
      return false;
    }
  }

  async publishEvent(
    eventType: string,
    aggregateId: string,
    payload: unknown,
    options?: {
      persistent?: boolean;
      correlationId?: string;
    }
  ): Promise<boolean> {
    const message: EventMessage = {
      eventType,
      aggregateId,
      payload,
      timestamp: new Date().toISOString(),
      correlationId: options?.correlationId,
    };

    const routingKey = `orders.${eventType.toLowerCase()}`;
    return this.publish(routingKey, message, options);
  }

  registerHandler(eventType: string, handler: (message: EventMessage) => Promise<void>): void {
    logger.info('Registering event handler', { eventType });
    this.handlers.set(eventType, { eventType, handler });
  }

  private async startConsuming(): Promise<void> {
    if (!this.channel) {
      logger.error('Cannot start consuming: not connected');
      return;
    }

    try {
      await this.channel.consume(
        config.rabbitmq.queue,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }

          try {
            const content = msg.content.toString();
            const message: EventMessage = JSON.parse(content);

            logger.debug('Received message', {
              eventType: message.eventType,
              aggregateId: message.aggregateId,
            });

            const handler = this.handlers.get(message.eventType);

            if (handler) {
              await handler.handler(message);
              this.channel?.ack(msg);
            } else {
              logger.warn('No handler registered for event type', {
                eventType: message.eventType,
              });
              // Reject and don't requeue - send to DLQ
              this.channel?.reject(msg, false);
            }
          } catch (error) {
            logger.error('Error processing message', {
              error: (error as Error).message,
              content: msg.content.toString(),
            });

            // Check retry count
            const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

            if (retryCount < 3) {
              // Retry with incremented count
              this.channel?.publish(
                config.rabbitmq.exchange,
                'orders.retry',
                msg.content,
                {
                  ...msg.properties,
                  headers: {
                    ...msg.properties.headers,
                    'x-retry-count': retryCount + 1,
                  },
                }
              );
              this.channel?.ack(msg);
            } else {
              // Max retries reached, send to DLQ
              this.channel?.reject(msg, false);
            }
          }
        }
      );

      logger.info('Started consuming messages');
    } catch (error) {
      logger.error('Error starting consumer', { error: (error as Error).message });
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async checkHealth(): Promise<{
    healthy: boolean;
    error?: string;
  }> {
    if (!this.isConnected()) {
      return { healthy: false, error: 'Not connected' };
    }

    try {
      // Try to check channel state
      await this.channel!.checkQueue(config.rabbitmq.queue);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }
}

// Singleton instance
let rabbitMQInstance: RabbitMQConnection | null = null;

export function getRabbitMQConnection(): RabbitMQConnection {
  if (!rabbitMQInstance) {
    rabbitMQInstance = new RabbitMQConnection();
  }
  return rabbitMQInstance;
}

export async function connectRabbitMQ(): Promise<void> {
  const connection = getRabbitMQConnection();
  await connection.connect();
}

export async function disconnectRabbitMQ(): Promise<void> {
  if (rabbitMQInstance) {
    await rabbitMQInstance.disconnect();
    rabbitMQInstance = null;
  }
}

export default {
  RabbitMQConnection,
  getRabbitMQConnection,
  connectRabbitMQ,
  disconnectRabbitMQ,
};
