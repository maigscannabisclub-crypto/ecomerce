import { PrismaClient, Prisma } from '@prisma/client';
import { createLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import config from '../../config';
import { RabbitMQConnection, EventMessage } from './rabbitmq';

const logger = createLogger('OutboxProcessor');

export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: unknown;
  published: boolean;
  retryCount: number;
  error: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}

/**
 * Outbox Pattern Processor
 * 
 * Processes pending events from the outbox table and publishes them to RabbitMQ.
 * This ensures eventual consistency between database writes and event publishing.
 */
export class OutboxProcessor {
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly rabbitMQ: RabbitMQConnection,
    options?: {
      intervalMs?: number;
      maxRetries?: number;
    }
  ) {
    this.intervalMs = options?.intervalMs || config.outbox.processorIntervalMs;
    this.maxRetries = options?.maxRetries || config.outbox.maxRetries;
  }

  /**
   * Start the outbox processor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Outbox processor is already running');
      return;
    }

    logger.info('Starting outbox processor', {
      intervalMs: this.intervalMs,
      maxRetries: this.maxRetries,
    });

    this.isRunning = true;

    // Process immediately on start
    this.processOutbox().catch((error) => {
      logger.error('Error in initial outbox processing', {
        error: (error as Error).message,
      });
    });

    // Schedule periodic processing
    this.processingInterval = setInterval(() => {
      this.processOutbox().catch((error) => {
        logger.error('Error processing outbox', {
          error: (error as Error).message,
        });
      });
    }, this.intervalMs);
  }

  /**
   * Stop the outbox processor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping outbox processor');

    this.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Process pending outbox events
   */
  async processOutbox(): Promise<void> {
    if (!this.rabbitMQ.isConnected()) {
      logger.debug('RabbitMQ not connected, skipping outbox processing');
      return;
    }

    try {
      // Fetch pending events
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: {
          published: false,
          retryCount: {
            lt: this.maxRetries,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 100, // Process in batches
      });

      if (pendingEvents.length === 0) {
        return;
      }

      logger.debug(`Processing ${pendingEvents.length} pending outbox events`);

      // Process each event
      for (const event of pendingEvents) {
        await this.processEvent(event);
      }
    } catch (error) {
      logger.error('Error fetching pending outbox events', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Process a single outbox event
   */
  private async processEvent(event: OutboxEvent): Promise<void> {
    logger.debug('Processing outbox event', {
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      retryCount: event.retryCount,
    });

    try {
      // Publish event to RabbitMQ with retry
      const published = await withRetry(
        async () => {
          const message: EventMessage = {
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            timestamp: new Date().toISOString(),
          };

          const routingKey = `orders.${event.eventType.toLowerCase()}`;
          return this.rabbitMQ.publish(routingKey, message, {
            persistent: true,
          });
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          retryableErrors: ['ECONNREFUSED', 'ENOTFOUND', 'EPIPE'],
        }
      );

      if (published) {
        // Mark event as published
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            published: true,
            publishedAt: new Date(),
          },
        });

        logger.debug('Outbox event published successfully', {
          eventId: event.id,
          eventType: event.eventType,
        });
      } else {
        // Publishing returned false, increment retry count
        await this.incrementRetryCount(event.id, 'Publish returned false');
      }
    } catch (error) {
      logger.error('Failed to publish outbox event', {
        eventId: event.id,
        eventType: event.eventType,
        error: (error as Error).message,
      });

      // Increment retry count and store error
      await this.incrementRetryCount(event.id, (error as Error).message);
    }
  }

  /**
   * Increment retry count for an event
   */
  private async incrementRetryCount(
    eventId: string,
    error: string
  ): Promise<void> {
    try {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          retryCount: {
            increment: 1,
          },
          error: error.substring(0, 500), // Limit error message length
        },
      });
    } catch (updateError) {
      logger.error('Failed to increment retry count', {
        eventId,
        error: (updateError as Error).message,
      });
    }
  }

  /**
   * Schedule a new event in the outbox
   */
  async scheduleEvent(
    eventType: string,
    aggregateId: string,
    payload: unknown
  ): Promise<void> {
    logger.debug('Scheduling outbox event', {
      eventType,
      aggregateId,
    });

    try {
      await this.prisma.outboxEvent.create({
        data: {
          eventType,
          aggregateId,
          payload: payload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });

      logger.debug('Outbox event scheduled', {
        eventType,
        aggregateId,
      });
    } catch (error) {
      logger.error('Failed to schedule outbox event', {
        eventType,
        aggregateId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get outbox statistics
   */
  async getStatistics(): Promise<{
    total: number;
    pending: number;
    published: number;
    failed: number;
  }> {
    const [total, pending, published, failed] = await Promise.all([
      this.prisma.outboxEvent.count(),
      this.prisma.outboxEvent.count({
        where: { published: false, retryCount: { lt: this.maxRetries } },
      }),
      this.prisma.outboxEvent.count({
        where: { published: true },
      }),
      this.prisma.outboxEvent.count({
        where: { published: false, retryCount: { gte: this.maxRetries } },
      }),
    ]);

    return { total, pending, published, failed };
  }

  /**
   * Get failed events that need manual intervention
   */
  async getFailedEvents(limit: number = 100): Promise<OutboxEvent[]> {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        published: false,
        retryCount: {
          gte: this.maxRetries,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return events.map(event => ({
      ...event,
      payload: event.payload as unknown,
    }));
  }

  /**
   * Retry a failed event manually
   */
  async retryFailedEvent(eventId: string): Promise<boolean> {
    logger.info('Manually retrying failed event', { eventId });

    try {
      const event = await this.prisma.outboxEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        logger.error('Event not found', { eventId });
        return false;
      }

      if (event.published) {
        logger.warn('Event is already published', { eventId });
        return false;
      }

      // Reset retry count
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          retryCount: 0,
          error: null,
        },
      });

      // Process the event immediately
      await this.processEvent({
        ...event,
        retryCount: 0,
        error: null,
      });

      return true;
    } catch (error) {
      logger.error('Failed to retry event', {
        eventId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Clean up old published events
   */
  async cleanupOldEvents(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    try {
      const result = await this.prisma.outboxEvent.deleteMany({
        where: {
          published: true,
          publishedAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} old outbox events`);
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup old events', {
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Check if processor is running
   */
  isRunning(): boolean {
    return this.isRunning;
  }
}

export default OutboxProcessor;
