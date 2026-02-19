import { PrismaClient } from '@prisma/client';
import { 
  OrderCompletedEvent, 
  OrderCancelledEvent,
  OrderEvent 
} from '../../application/dto/ReportDTO';
import { ReportPeriod } from '../../domain/entities/Report';
import { getPrisma } from '../database/prisma';
import { 
  invalidateCacheByTag, 
  buildCacheKey,
  deleteCachePattern 
} from '../cache/redis';
import logger from '../../utils/logger';

// ============================================
// Event Handlers
// ============================================

export class EventHandlerService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrisma();
  }

  // ============================================
  // Order Completed Handler
  // ============================================
  async handleOrderCompleted(event: OrderCompletedEvent): Promise<void> {
    const requestId = `evt-${Date.now()}`;
    const eventLogger = logger;
    
    eventLogger.info('Processing OrderCompleted event', {
      requestId,
      eventId: event.eventId,
      orderId: event.payload.orderId,
    });

    try {
      // Check if event was already processed
      const existingEvent = await this.prisma.processedEvent.findUnique({
        where: { eventId: event.eventId },
      });

      if (existingEvent) {
        eventLogger.warn('Event already processed, skipping', {
          requestId,
          eventId: event.eventId,
        });
        return;
      }

      // Process in transaction
      await this.prisma.$transaction(async (tx) => {
        // Mark event as processed
        await tx.processedEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
          },
        });

        // Get date from completed order
        const completedDate = new Date(event.payload.completedAt);
        const dayStart = new Date(completedDate);
        dayStart.setHours(0, 0, 0, 0);

        // Update daily metrics
        await this.updateDailyMetrics(tx, dayStart, event.payload);

        // Update product sales
        await this.updateProductSales(tx, dayStart, event.payload);

        // Update or create sales report
        await this.updateSalesReport(tx, ReportPeriod.DAILY, dayStart, event.payload);
      });

      // Invalidate cache after successful processing
      await this.invalidateRelatedCaches(dayStart);

      eventLogger.info('OrderCompleted event processed successfully', {
        requestId,
        eventId: event.eventId,
      });
    } catch (error) {
      eventLogger.error('Failed to process OrderCompleted event', error, {
        requestId,
        eventId: event.eventId,
      });
      throw error;
    }
  }

  // ============================================
  // Order Cancelled Handler
  // ============================================
  async handleOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    const requestId = `evt-${Date.now()}`;
    
    logger.info('Processing OrderCancelled event', {
      requestId,
      eventId: event.eventId,
      orderId: event.payload.orderId,
    });

    try {
      // Check if event was already processed
      const existingEvent = await this.prisma.processedEvent.findUnique({
        where: { eventId: event.eventId },
      });

      if (existingEvent) {
        logger.warn('Event already processed, skipping', {
          requestId,
          eventId: event.eventId,
        });
        return;
      }

      // Process in transaction
      await this.prisma.$transaction(async (tx) => {
        // Mark event as processed
        await tx.processedEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
          },
        });

        // Get date from cancelled order
        const cancelledDate = new Date(event.payload.cancelledAt);
        const dayStart = new Date(cancelledDate);
        dayStart.setHours(0, 0, 0, 0);

        // Adjust daily metrics
        await this.adjustDailyMetrics(tx, dayStart, event.payload);

        // Adjust product sales
        await this.adjustProductSales(tx, dayStart, event.payload);

        // Adjust sales report
        await this.adjustSalesReport(tx, ReportPeriod.DAILY, dayStart, event.payload);
      });

      // Invalidate cache after successful processing
      await this.invalidateRelatedCaches(dayStart);

      logger.info('OrderCancelled event processed successfully', {
        requestId,
        eventId: event.eventId,
      });
    } catch (error) {
      logger.error('Failed to process OrderCancelled event', error, {
        requestId,
        eventId: event.eventId,
      });
      throw error;
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private async updateDailyMetrics(
    tx: PrismaClient,
    date: Date,
    payload: OrderCompletedEvent['payload']
  ): Promise<void> {
    const existing = await tx.dailyMetric.findUnique({
      where: { date },
    });

    if (existing) {
      await tx.dailyMetric.update({
        where: { date },
        data: {
          totalOrders: { increment: 1 },
          totalRevenue: { increment: payload.totalAmount },
        },
      });
    } else {
      await tx.dailyMetric.create({
        data: {
          date,
          totalOrders: 1,
          totalRevenue: payload.totalAmount,
          newCustomers: 0,
        },
      });
    }
  }

  private async adjustDailyMetrics(
    tx: PrismaClient,
    date: Date,
    payload: OrderCancelledEvent['payload']
  ): Promise<void> {
    const existing = await tx.dailyMetric.findUnique({
      where: { date },
    });

    if (existing) {
      await tx.dailyMetric.update({
        where: { date },
        data: {
          totalOrders: { decrement: 1 },
          totalRevenue: { decrement: payload.totalAmount },
        },
      });
    }
  }

  private async updateProductSales(
    tx: PrismaClient,
    periodStart: Date,
    payload: OrderCompletedEvent['payload']
  ): Promise<void> {
    for (const item of payload.items) {
      const existing = await tx.productSales.findUnique({
        where: {
          productId_period_periodStart: {
            productId: item.productId,
            period: ReportPeriod.DAILY,
            periodStart,
          },
        },
      });

      if (existing) {
        await tx.productSales.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: item.quantity },
            revenue: { increment: item.totalPrice },
          },
        });
      } else {
        await tx.productSales.create({
          data: {
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku,
            period: ReportPeriod.DAILY,
            periodStart,
            quantity: item.quantity,
            revenue: item.totalPrice,
          },
        });
      }
    }
  }

  private async adjustProductSales(
    tx: PrismaClient,
    periodStart: Date,
    payload: OrderCancelledEvent['payload']
  ): Promise<void> {
    for (const item of payload.items) {
      const existing = await tx.productSales.findUnique({
        where: {
          productId_period_periodStart: {
            productId: item.productId,
            period: ReportPeriod.DAILY,
            periodStart,
          },
        },
      });

      if (existing) {
        await tx.productSales.update({
          where: { id: existing.id },
          data: {
            quantity: { decrement: item.quantity },
            revenue: { decrement: item.totalPrice },
          },
        });
      }
    }
  }

  private async updateSalesReport(
    tx: PrismaClient,
    period: ReportPeriod,
    periodStart: Date,
    payload: OrderCompletedEvent['payload']
  ): Promise<void> {
    const periodEnd = new Date(periodStart);
    periodEnd.setHours(23, 59, 59, 999);

    const existing = await tx.salesReport.findUnique({
      where: {
        period_periodStart: {
          period,
          periodStart,
        },
      },
    });

    if (existing) {
      const newTotalOrders = existing.totalOrders + 1;
      const newTotalRevenue = Number(existing.totalRevenue) + payload.totalAmount;
      const newTotalTax = Number(existing.totalTax) + payload.tax;
      const newTotalShipping = Number(existing.totalShipping) + payload.shipping;
      const newAOV = newTotalRevenue / newTotalOrders;

      await tx.salesReport.update({
        where: { id: existing.id },
        data: {
          totalOrders: newTotalOrders,
          totalRevenue: newTotalRevenue,
          totalTax: newTotalTax,
          totalShipping: newTotalShipping,
          averageOrderValue: newAOV,
        },
      });
    } else {
      await tx.salesReport.create({
        data: {
          period,
          periodStart,
          periodEnd,
          totalOrders: 1,
          totalRevenue: payload.totalAmount,
          totalTax: payload.tax,
          totalShipping: payload.shipping,
          averageOrderValue: payload.totalAmount,
          data: {},
        },
      });
    }
  }

  private async adjustSalesReport(
    tx: PrismaClient,
    period: ReportPeriod,
    periodStart: Date,
    payload: OrderCancelledEvent['payload']
  ): Promise<void> {
    const existing = await tx.salesReport.findUnique({
      where: {
        period_periodStart: {
          period,
          periodStart,
        },
      },
    });

    if (existing && existing.totalOrders > 0) {
      const newTotalOrders = existing.totalOrders - 1;
      const newTotalRevenue = Number(existing.totalRevenue) - payload.totalAmount;
      const newTotalTax = Number(existing.totalTax) - payload.tax;
      const newTotalShipping = Number(existing.totalShipping) - payload.shipping;
      const newAOV = newTotalOrders > 0 ? newTotalRevenue / newTotalOrders : 0;

      await tx.salesReport.update({
        where: { id: existing.id },
        data: {
          totalOrders: newTotalOrders,
          totalRevenue: Math.max(0, newTotalRevenue),
          totalTax: Math.max(0, newTotalTax),
          totalShipping: Math.max(0, newTotalShipping),
          averageOrderValue: newAOV,
        },
      });
    }
  }

  private async invalidateRelatedCaches(date: Date): Promise<void> {
    try {
      // Invalidate dashboard cache
      await invalidateCacheByTag('dashboard');
      
      // Invalidate daily metrics cache
      const dateStr = date.toISOString().split('T')[0];
      await deleteCachePattern(`daily:${dateStr}*`);
      await deleteCachePattern('sales:DAILY*');
      await deleteCachePattern('products:top*');
      
      logger.debug('Invalidated related caches', { date: dateStr });
    } catch (error) {
      logger.error('Error invalidating caches', error);
    }
  }
}

// ============================================
// Handler Factory
// ============================================

let eventHandlerService: EventHandlerService | null = null;

export const getEventHandlerService = (): EventHandlerService => {
  if (!eventHandlerService) {
    eventHandlerService = new EventHandlerService();
  }
  return eventHandlerService;
};

// Handler wrappers for RabbitMQ
export const handleOrderCompleted = async (event: unknown): Promise<void> => {
  const service = getEventHandlerService();
  await service.handleOrderCompleted(event as OrderCompletedEvent);
};

export const handleOrderCancelled = async (event: unknown): Promise<void> => {
  const service = getEventHandlerService();
  await service.handleOrderCancelled(event as OrderCancelledEvent);
};
