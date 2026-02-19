import { PrismaClient } from '@prisma/client';
import { RabbitMQClient, EventMessage } from './rabbitmq';
import { InventoryService } from '../../application/services/InventoryService';
import { IdempotencyService } from '../../utils/idempotency';
import logger, { logEventReceived, logEventProcessed, logEventFailed } from '../../utils/logger';

export class EventHandlers {
  private inventoryService: InventoryService;
  private idempotencyService: IdempotencyService;
  private rabbitMQClient: RabbitMQClient;

  constructor(
    prisma: PrismaClient,
    rabbitMQClient: RabbitMQClient
  ) {
    this.rabbitMQClient = rabbitMQClient;
    this.idempotencyService = new IdempotencyService(prisma);
    this.inventoryService = new InventoryService(
      prisma,
      this.idempotencyService,
      this.publishEvent.bind(this)
    );
  }

  /**
   * Initialize and register all event handlers
   */
  async initialize(): Promise<void> {
    logger.info('Initializing event handlers...');

    // Subscribe to OrderCreated events
    await this.rabbitMQClient.subscribe('orders.ordercreated', this.handleOrderCreated.bind(this));

    // Subscribe to OrderFailed events
    await this.rabbitMQClient.subscribe('orders.orderfailed', this.handleOrderFailed.bind(this));

    // Subscribe to OrderCancelled events (for additional stock release scenarios)
    await this.rabbitMQClient.subscribe('orders.ordercancelled', this.handleOrderCancelled.bind(this));

    logger.info('✅ Event handlers initialized successfully');
  }

  /**
   * Publish an event to RabbitMQ
   */
  private async publishEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.rabbitMQClient.publish(eventType, payload);
    } catch (error) {
      logger.error(`Failed to publish event: ${eventType}`, error);
      // Don't throw - event publishing should not break the main flow
    }
  }

  /**
   * Handle OrderCreated event
   * Reserve stock for all items in the order
   */
  private async handleOrderCreated(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    await this.idempotencyService.processWithIdempotency(
      eventId,
      eventType,
      async () => {
        const { orderId, items, customerId } = payload as {
          orderId: string;
          items: Array<{ productId: string; quantity: number; sku?: string }>;
          customerId: string;
        };

        if (!orderId || !items || !Array.isArray(items)) {
          throw new Error('Invalid OrderCreated event payload');
        }

        logger.info(`Processing OrderCreated event for order: ${orderId}`, {
          itemCount: items.length,
          customerId,
        });

        // Process stock reservations
        const results = await this.inventoryService.handleOrderCreated(
          orderId,
          items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }))
        );

        // Log results
        const successful = results.filter((r) => r.success).length;
        const failed = results.length - successful;

        logger.info(`OrderCreated processing completed for order: ${orderId}`, {
          successful,
          failed,
          total: results.length,
        });

        // If all reservations failed, publish a failure event
        if (failed === results.length && results.length > 0) {
          await this.publishEvent('StockReservationFailed', {
            orderId,
            items,
            reason: 'All stock reservations failed',
            details: results.map((r) => ({
              productId: r.productId,
              reason: r.message,
            })),
          });
        }

        return results;
      },
      payload as Record<string, unknown>
    );

    logEventProcessed(eventType, eventId);
  }

  /**
   * Handle OrderFailed event
   * Release reserved stock for all items
   */
  private async handleOrderFailed(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    await this.idempotencyService.processWithIdempotency(
      eventId,
      eventType,
      async () => {
        const { orderId, items, reason } = payload as {
          orderId: string;
          items: Array<{ productId: string; quantity: number; sku?: string }>;
          reason: string;
        };

        if (!orderId || !items || !Array.isArray(items)) {
          throw new Error('Invalid OrderFailed event payload');
        }

        logger.info(`Processing OrderFailed event for order: ${orderId}`, {
          itemCount: items.length,
          reason,
        });

        // Process stock releases
        const results = await this.inventoryService.handleOrderFailed(
          orderId,
          items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }))
        );

        // Log results
        const successful = results.filter((r) => r.success).length;
        const failed = results.length - successful;

        logger.info(`OrderFailed processing completed for order: ${orderId}`, {
          successful,
          failed,
          total: results.length,
        });

        return results;
      },
      payload as Record<string, unknown>
    );

    logEventProcessed(eventType, eventId);
  }

  /**
   * Handle OrderCancelled event
   * Release reserved stock for cancelled order items
   */
  private async handleOrderCancelled(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    await this.idempotencyService.processWithIdempotency(
      eventId,
      eventType,
      async () => {
        const { orderId, items, reason } = payload as {
          orderId: string;
          items: Array<{ productId: string; quantity: number; sku?: string }>;
          reason: string;
        };

        if (!orderId || !items || !Array.isArray(items)) {
          throw new Error('Invalid OrderCancelled event payload');
        }

        logger.info(`Processing OrderCancelled event for order: ${orderId}`, {
          itemCount: items.length,
          reason,
        });

        // Process stock releases (same as OrderFailed)
        const results = await this.inventoryService.handleOrderFailed(
          orderId,
          items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }))
        );

        // Log results
        const successful = results.filter((r) => r.success).length;
        const failed = results.length - successful;

        logger.info(`OrderCancelled processing completed for order: ${orderId}`, {
          successful,
          failed,
          total: results.length,
        });

        return results;
      },
      payload as Record<string, unknown>
    );

    logEventProcessed(eventType, eventId);
  }

  /**
   * Handle StockReserved event (for internal coordination)
   */
  async handleStockReserved(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    // This handler can be used for:
    // - Updating analytics
    // - Notifying other services
    // - Audit logging

    logger.info('Stock reserved event received', payload);

    logEventProcessed(eventType, eventId);
  }

  /**
   * Handle StockReleased event (for internal coordination)
   */
  async handleStockReleased(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    logger.info('Stock released event received', payload);

    logEventProcessed(eventType, eventId);
  }

  /**
   * Handle LowStockAlert event (for internal coordination)
   */
  async handleLowStockAlert(message: EventMessage): Promise<void> {
    const { eventId, eventType, payload } = message;

    logEventReceived(eventType, eventId);

    const { productId, sku, currentStock, minStock, alertType } = payload as {
      productId: string;
      sku: string;
      currentStock: number;
      minStock: number;
      alertType: 'LOW_STOCK' | 'CRITICAL_STOCK';
    };

    logger.warn(`Low stock alert: ${sku}`, {
      productId,
      currentStock,
      minStock,
      alertType,
    });

    // Here you could:
    // - Send notifications to purchasing team
    // - Trigger automatic reorder
    // - Update dashboard metrics

    logEventProcessed(eventType, eventId);
  }
}

export default EventHandlers;
