import { PrismaClient, OrderStatus } from '@prisma/client';
import { createLogger } from '../../utils/logger';
import { EventMessage } from './rabbitmq';
import { OrderService } from '../../application/services/OrderService';
import { SagaOrchestrator } from '../../application/services/SagaOrchestrator';
import {
  StockReservedEvent,
  StockReservationFailedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
} from '../../application/dto/OrderDTO';

const logger = createLogger('EventHandlers');

export class EventHandlers {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orderService: OrderService,
    private readonly sagaOrchestrator: SagaOrchestrator
  ) {}

  /**
   * Handle StockReserved event
   */
  async handleStockReserved(message: EventMessage): Promise<void> {
    const payload = message.payload as StockReservedEvent;
    logger.info('Handling StockReserved event', {
      orderId: payload.orderId,
      reservationId: payload.reservationId,
    });

    try {
      // Update order status to RESERVED
      await this.orderService.handleStockReserved(payload.orderId);

      // Notify saga orchestrator
      await this.sagaOrchestrator.handleStockReserved(payload.orderId);

      logger.info('StockReserved event handled successfully', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle StockReserved event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Handle StockReservationFailed event
   */
  async handleStockReservationFailed(message: EventMessage): Promise<void> {
    const payload = message.payload as StockReservationFailedEvent;
    logger.info('Handling StockReservationFailed event', {
      orderId: payload.orderId,
      reason: payload.reason,
    });

    try {
      // Update order status to FAILED
      await this.orderService.handleStockReservationFailed(
        payload.orderId,
        payload.reason
      );

      // Notify saga orchestrator
      await this.sagaOrchestrator.handleStockReservationFailed(
        payload.orderId,
        payload.reason
      );

      logger.info('StockReservationFailed event handled successfully', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle StockReservationFailed event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Handle PaymentCompleted event
   */
  async handlePaymentCompleted(message: EventMessage): Promise<void> {
    const payload = message.payload as PaymentCompletedEvent;
    logger.info('Handling PaymentCompleted event', {
      orderId: payload.orderId,
      paymentId: payload.paymentId,
      amount: payload.amount,
    });

    try {
      // Update order status to PAID
      await this.orderService.updateOrderStatus(
        payload.orderId,
        { status: OrderStatus.PAID, notes: `Payment completed: ${payload.paymentId}` },
        'system'
      );

      logger.info('PaymentCompleted event handled successfully', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle PaymentCompleted event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Handle PaymentFailed event
   */
  async handlePaymentFailed(message: EventMessage): Promise<void> {
    const payload = message.payload as PaymentFailedEvent;
    logger.info('Handling PaymentFailed event', {
      orderId: payload.orderId,
      reason: payload.reason,
    });

    try {
      // Update order status to FAILED
      await this.orderService.updateOrderStatus(
        payload.orderId,
        { status: OrderStatus.FAILED, notes: `Payment failed: ${payload.reason}` },
        'system'
      );

      logger.info('PaymentFailed event handled successfully', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle PaymentFailed event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Handle ReleaseStock event (compensation)
   */
  async handleReleaseStock(message: EventMessage): Promise<void> {
    const payload = message.payload as { orderId: string };
    logger.info('Handling ReleaseStock event', {
      orderId: payload.orderId,
    });

    try {
      // Stock release is handled by inventory service
      // This handler just logs the event
      logger.info('Stock release requested for order', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle ReleaseStock event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Handle RefundPayment event (compensation)
   */
  async handleRefundPayment(message: EventMessage): Promise<void> {
    const payload = message.payload as { orderId: string };
    logger.info('Handling RefundPayment event', {
      orderId: payload.orderId,
    });

    try {
      // Payment refund is handled by payment service
      // This handler just logs the event
      logger.info('Payment refund requested for order', {
        orderId: payload.orderId,
      });
    } catch (error) {
      logger.error('Failed to handle RefundPayment event', {
        orderId: payload.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Register all handlers with RabbitMQ
   */
  registerAllHandlers(registerHandler: (eventType: string, handler: (message: EventMessage) => Promise<void>) => void): void {
    logger.info('Registering all event handlers');

    registerHandler('StockReserved', this.handleStockReserved.bind(this));
    registerHandler('StockReservationFailed', this.handleStockReservationFailed.bind(this));
    registerHandler('PaymentCompleted', this.handlePaymentCompleted.bind(this));
    registerHandler('PaymentFailed', this.handlePaymentFailed.bind(this));
    registerHandler('ReleaseStock', this.handleReleaseStock.bind(this));
    registerHandler('RefundPayment', this.handleRefundPayment.bind(this));

    logger.info('All event handlers registered');
  }
}

export default EventHandlers;
