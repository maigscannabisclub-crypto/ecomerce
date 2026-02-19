import { PrismaClient } from '@prisma/client';
import logger from './logger';

export interface IdempotencyCheckResult {
  isProcessed: boolean;
  processedAt?: Date;
}

export class IdempotencyService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Check if an event has already been processed
   */
  async isEventProcessed(eventId: string): Promise<IdempotencyCheckResult> {
    try {
      const processedEvent = await this.prisma.processedEvent.findUnique({
        where: { eventId },
      });

      if (processedEvent) {
        logger.debug(`Event ${eventId} already processed at ${processedEvent.processedAt}`);
        return {
          isProcessed: true,
          processedAt: processedEvent.processedAt,
        };
      }

      return { isProcessed: false };
    } catch (error) {
      logger.error(`Error checking event idempotency for ${eventId}`, error);
      throw error;
    }
  }

  /**
   * Mark an event as processed
   */
  async markEventAsProcessed(
    eventId: string,
    eventType: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          eventId,
          eventType,
          payload: payload ? JSON.stringify(payload) : null,
        },
      });

      logger.debug(`Event ${eventId} marked as processed`);
    } catch (error) {
      // Handle unique constraint violation (event already processed)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        logger.warn(`Event ${eventId} was already marked as processed (race condition)`);
        return;
      }

      logger.error(`Error marking event ${eventId} as processed`, error);
      throw error;
    }
  }

  /**
   * Process an event with idempotency guarantee
   * @param eventId Unique event identifier
   * @param eventType Type of event
   * @param processor Function to process the event
   * @param payload Optional payload to store
   * @returns Result of the processor function
   */
  async processWithIdempotency<T>(
    eventId: string,
    eventType: string,
    processor: () => Promise<T>,
    payload?: Record<string, unknown>
  ): Promise<T | null> {
    // Check if already processed
    const { isProcessed } = await this.isEventProcessed(eventId);

    if (isProcessed) {
      logger.info(`Skipping already processed event: ${eventType} (${eventId})`);
      return null;
    }

    // Process the event
    const result = await processor();

    // Mark as processed
    await this.markEventAsProcessed(eventId, eventType, payload);

    return result;
  }

  /**
   * Clean up old processed events
   */
  async cleanupOldEvents(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.processedEvent.deleteMany({
        where: {
          processedAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} old processed events`);
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old processed events', error);
      throw error;
    }
  }

  /**
   * Get processed events statistics
   */
  async getStatistics(): Promise<{
    totalProcessed: number;
    byEventType: Record<string, number>;
    oldestEvent: Date | null;
    newestEvent: Date | null;
  }> {
    try {
      const [totalResult, typeResults, oldestResult, newestResult] = await Promise.all([
        this.prisma.processedEvent.count(),
        this.prisma.processedEvent.groupBy({
          by: ['eventType'],
          _count: {
            eventType: true,
          },
        }),
        this.prisma.processedEvent.findFirst({
          orderBy: { processedAt: 'asc' },
          select: { processedAt: true },
        }),
        this.prisma.processedEvent.findFirst({
          orderBy: { processedAt: 'desc' },
          select: { processedAt: true },
        }),
      ]);

      const byEventType: Record<string, number> = {};
      typeResults.forEach((result) => {
        byEventType[result.eventType] = result._count.eventType;
      });

      return {
        totalProcessed: totalResult,
        byEventType,
        oldestEvent: oldestResult?.processedAt || null,
        newestEvent: newestResult?.processedAt || null,
      };
    } catch (error) {
      logger.error('Error getting idempotency statistics', error);
      throw error;
    }
  }
}

// Singleton instance factory
let idempotencyServiceInstance: IdempotencyService | null = null;

export function createIdempotencyService(prisma: PrismaClient): IdempotencyService {
  if (!idempotencyServiceInstance) {
    idempotencyServiceInstance = new IdempotencyService(prisma);
  }
  return idempotencyServiceInstance;
}

export function resetIdempotencyService(): void {
  idempotencyServiceInstance = null;
}

export default IdempotencyService;
