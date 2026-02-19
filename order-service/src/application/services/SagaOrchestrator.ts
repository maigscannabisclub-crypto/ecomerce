import { PrismaClient, OrderStatus, Prisma } from '@prisma/client';
import { createLogger } from '../../utils/logger';
import { OrderDTOMapper } from '../dto/OrderDTO';

const logger = createLogger('SagaOrchestrator');

/**
 * Saga Step Types
 */
export type SagaStepType = 
  | 'CREATE_ORDER'
  | 'RESERVE_STOCK'
  | 'PROCESS_PAYMENT'
  | 'CONFIRM_ORDER'
  | 'SHIP_ORDER'
  | 'CANCEL_ORDER';

/**
 * Saga Step Status
 */
export type SagaStepStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED';

/**
 * Saga Status
 */
export type SagaStatus = 
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED';

/**
 * Saga Step Definition
 */
export interface SagaStep {
  id: string;
  type: SagaStepType;
  status: SagaStepStatus;
  order: number;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  compensatedAt?: Date;
}

/**
 * Saga Definition
 */
export interface Saga {
  id: string;
  orderId: string;
  status: SagaStatus;
  steps: SagaStep[];
  currentStep: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Saga Orchestrator
 * 
 * Manages the distributed transaction flow for order processing
 * using the Saga pattern with compensation.
 */
export class SagaOrchestrator {
  private activeSagas: Map<string, Saga> = new Map();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventPublisher: {
      publish: (eventType: string, payload: unknown) => Promise<void>;
    }
  ) {}

  /**
   * Start a new order saga
   */
  async startOrderSaga(orderId: string): Promise<Saga> {
    logger.info('Starting order saga', { orderId });

    const saga: Saga = {
      id: `saga-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      orderId,
      status: 'STARTED',
      steps: [
        {
          id: `step-${Date.now()}-1`,
          type: 'CREATE_ORDER',
          status: 'COMPLETED',
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          type: 'RESERVE_STOCK',
          status: 'PENDING',
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          type: 'CONFIRM_ORDER',
          status: 'PENDING',
          order: 3,
        },
      ],
      currentStep: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.activeSagas.set(saga.id, saga);

    // Execute the first pending step (RESERVE_STOCK)
    await this.executeStep(saga, saga.steps[1]);

    return saga;
  }

  /**
   * Execute a saga step
   */
  private async executeStep(saga: Saga, step: SagaStep): Promise<void> {
    logger.info('Executing saga step', {
      sagaId: saga.id,
      stepId: step.id,
      stepType: step.type,
    });

    step.status = 'IN_PROGRESS';
    step.startedAt = new Date();
    saga.updatedAt = new Date();

    try {
      switch (step.type) {
        case 'RESERVE_STOCK':
          await this.executeReserveStockStep(saga, step);
          break;
        case 'CONFIRM_ORDER':
          await this.executeConfirmOrderStep(saga, step);
          break;
        case 'PROCESS_PAYMENT':
          await this.executeProcessPaymentStep(saga, step);
          break;
        case 'SHIP_ORDER':
          await this.executeShipOrderStep(saga, step);
          break;
        case 'CANCEL_ORDER':
          await this.executeCancelOrderStep(saga, step);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      step.status = 'COMPLETED';
      step.completedAt = new Date();

      logger.info('Saga step completed', {
        sagaId: saga.id,
        stepId: step.id,
        stepType: step.type,
      });

      // Move to next step
      await this.proceedToNextStep(saga);
    } catch (error) {
      step.status = 'FAILED';
      step.error = (error as Error).message;

      logger.error('Saga step failed', {
        sagaId: saga.id,
        stepId: step.id,
        stepType: step.type,
        error: step.error,
      });

      // Start compensation
      await this.compensate(saga);
    }
  }

  /**
   * Execute RESERVE_STOCK step
   */
  private async executeReserveStockStep(
    saga: Saga,
    step: SagaStep
  ): Promise<void> {
    logger.debug('Executing RESERVE_STOCK step', { sagaId: saga.id });

    // Get order details
    const order = await this.prisma.order.findUnique({
      where: { id: saga.orderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Publish OrderCreated event to trigger stock reservation
    const eventPayload = OrderDTOMapper.toOrderCreatedEvent({
      ...order,
      total: Number(order.total),
      tax: Number(order.tax),
      shipping: Number(order.shipping),
      grandTotal: Number(order.grandTotal),
      items: order.items.map(item => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
    });

    await this.eventPublisher.publish('OrderCreated', eventPayload);

    // The actual stock reservation will be handled asynchronously
    // by the inventory service. We'll wait for StockReserved or
    // StockReservationFailed event.
  }

  /**
   * Execute CONFIRM_ORDER step
   */
  private async executeConfirmOrderStep(
    saga: Saga,
    step: SagaStep
  ): Promise<void> {
    logger.debug('Executing CONFIRM_ORDER step', { sagaId: saga.id });

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: saga.orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Update order status to CONFIRMED
      await tx.order.update({
        where: { id: saga.orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId: saga.orderId,
          status: OrderStatus.CONFIRMED,
          previousStatus: OrderStatus.RESERVED,
          notes: 'Order confirmed after stock reservation',
          createdBy: 'system',
        },
      });

      // Create outbox event
      const eventPayload = {
        eventType: 'OrderConfirmed',
        aggregateId: saga.orderId,
        orderId: saga.orderId,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        items: order.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        timestamp: new Date().toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          eventType: 'OrderConfirmed',
          aggregateId: saga.orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });
    });
  }

  /**
   * Execute PROCESS_PAYMENT step
   */
  private async executeProcessPaymentStep(
    saga: Saga,
    step: SagaStep
  ): Promise<void> {
    logger.debug('Executing PROCESS_PAYMENT step', { sagaId: saga.id });

    // This would integrate with payment service
    // For now, we'll just update the order status
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: saga.orderId },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: saga.orderId,
          status: OrderStatus.PAID,
          previousStatus: OrderStatus.CONFIRMED,
          notes: 'Payment processed successfully',
          createdBy: 'system',
        },
      });
    });
  }

  /**
   * Execute SHIP_ORDER step
   */
  private async executeShipOrderStep(
    saga: Saga,
    step: SagaStep
  ): Promise<void> {
    logger.debug('Executing SHIP_ORDER step', { sagaId: saga.id });

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: saga.orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      await tx.order.update({
        where: { id: saga.orderId },
        data: { status: OrderStatus.SHIPPED, shippedAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: saga.orderId,
          status: OrderStatus.SHIPPED,
          previousStatus: OrderStatus.PAID,
          notes: 'Order shipped',
          createdBy: 'system',
        },
      });
    });
  }

  /**
   * Execute CANCEL_ORDER step (compensation)
   */
  private async executeCancelOrderStep(
    saga: Saga,
    step: SagaStep
  ): Promise<void> {
    logger.debug('Executing CANCEL_ORDER step', { sagaId: saga.id });

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: saga.orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const previousStatus = order.status;

      await tx.order.update({
        where: { id: saga.orderId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: saga.orderId,
          status: OrderStatus.CANCELLED,
          previousStatus,
          notes: 'Order cancelled due to saga failure',
          createdBy: 'system',
        },
      });

      // Create outbox event for OrderCancelled
      const eventPayload = {
        eventType: 'OrderCancelled',
        aggregateId: saga.orderId,
        orderId: saga.orderId,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        reason: 'Saga compensation',
        items: order.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        timestamp: new Date().toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          eventType: 'OrderCancelled',
          aggregateId: saga.orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });
    });
  }

  /**
   * Proceed to next step in saga
   */
  private async proceedToNextStep(saga: Saga): Promise<void> {
    const nextStepIndex = saga.steps.findIndex(
      s => s.order > saga.currentStep && s.status === 'PENDING'
    );

    if (nextStepIndex === -1) {
      // All steps completed
      saga.status = 'COMPLETED';
      saga.completedAt = new Date();

      logger.info('Saga completed successfully', {
        sagaId: saga.id,
        orderId: saga.orderId,
      });

      return;
    }

    saga.currentStep = saga.steps[nextStepIndex].order;
    saga.status = 'IN_PROGRESS';

    await this.executeStep(saga, saga.steps[nextStepIndex]);
  }

  /**
   * Compensate a failed saga
   */
  private async compensate(saga: Saga): Promise<void> {
    logger.info('Starting saga compensation', {
      sagaId: saga.id,
      orderId: saga.orderId,
    });

    saga.status = 'COMPENSATING';

    // Get completed steps in reverse order
    const completedSteps = saga.steps
      .filter(s => s.status === 'COMPLETED')
      .sort((a, b) => b.order - a.order);

    for (const step of completedSteps) {
      try {
        step.status = 'COMPENSATING';
        await this.compensateStep(saga, step);
        step.status = 'COMPENSATED';
        step.compensatedAt = new Date();
      } catch (error) {
        logger.error('Failed to compensate step', {
          sagaId: saga.id,
          stepId: step.id,
          stepType: step.type,
          error: (error as Error).message,
        });
        // Continue with other compensations
      }
    }

    saga.status = 'COMPENSATED';
    saga.updatedAt = new Date();

    logger.info('Saga compensation completed', {
      sagaId: saga.id,
      orderId: saga.orderId,
    });
  }

  /**
   * Compensate a specific step
   */
  private async compensateStep(saga: Saga, step: SagaStep): Promise<void> {
    logger.debug('Compensating step', {
      sagaId: saga.id,
      stepId: step.id,
      stepType: step.type,
    });

    switch (step.type) {
      case 'RESERVE_STOCK':
        // Publish event to release reserved stock
        await this.eventPublisher.publish('ReleaseStock', {
          orderId: saga.orderId,
          timestamp: new Date().toISOString(),
        });
        break;
      case 'CONFIRM_ORDER':
        // No specific compensation needed
        break;
      case 'PROCESS_PAYMENT':
        // Refund payment if processed
        await this.eventPublisher.publish('RefundPayment', {
          orderId: saga.orderId,
          timestamp: new Date().toISOString(),
        });
        break;
      case 'SHIP_ORDER':
        // Cancel shipment if possible
        break;
      default:
        logger.warn('No compensation defined for step type', {
          stepType: step.type,
        });
    }
  }

  /**
   * Handle stock reserved event
   */
  async handleStockReserved(orderId: string): Promise<void> {
    logger.info('Handling stock reserved in saga', { orderId });

    // Find active saga for this order
    const saga = Array.from(this.activeSagas.values()).find(
      s => s.orderId === orderId && s.status === 'IN_PROGRESS'
    );

    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }

    const reserveStockStep = saga.steps.find(
      s => s.type === 'RESERVE_STOCK' && s.status === 'IN_PROGRESS'
    );

    if (!reserveStockStep) {
      logger.warn('No RESERVE_STOCK step in progress', { orderId });
      return;
    }

    // Complete the RESERVE_STOCK step
    reserveStockStep.status = 'COMPLETED';
    reserveStockStep.completedAt = new Date();

    // Proceed to next step
    await this.proceedToNextStep(saga);
  }

  /**
   * Handle stock reservation failed event
   */
  async handleStockReservationFailed(
    orderId: string,
    reason: string
  ): Promise<void> {
    logger.info('Handling stock reservation failed in saga', {
      orderId,
      reason,
    });

    // Find active saga for this order
    const saga = Array.from(this.activeSagas.values()).find(
      s => s.orderId === orderId && s.status === 'IN_PROGRESS'
    );

    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }

    const reserveStockStep = saga.steps.find(
      s => s.type === 'RESERVE_STOCK' && s.status === 'IN_PROGRESS'
    );

    if (!reserveStockStep) {
      logger.warn('No RESERVE_STOCK step in progress', { orderId });
      return;
    }

    // Mark step as failed
    reserveStockStep.status = 'FAILED';
    reserveStockStep.error = reason;

    // Start compensation
    await this.compensate(saga);
  }

  /**
   * Get saga by ID
   */
  getSaga(sagaId: string): Saga | undefined {
    return this.activeSagas.get(sagaId);
  }

  /**
   * Get saga by order ID
   */
  getSagaByOrderId(orderId: string): Saga | undefined {
    return Array.from(this.activeSagas.values()).find(
      s => s.orderId === orderId
    );
  }

  /**
   * Get all active sagas
   */
  getActiveSagas(): Saga[] {
    return Array.from(this.activeSagas.values()).filter(
      s => s.status === 'STARTED' || s.status === 'IN_PROGRESS'
    );
  }

  /**
   * Clean up completed sagas
   */
  cleanupCompletedSagas(): void {
    const completedStatuses: SagaStatus[] = ['COMPLETED', 'COMPENSATED', 'FAILED'];
    
    for (const [sagaId, saga] of this.activeSagas.entries()) {
      if (completedStatuses.includes(saga.status)) {
        this.activeSagas.delete(sagaId);
      }
    }

    logger.debug('Cleaned up completed sagas', {
      remainingSagas: this.activeSagas.size,
    });
  }
}

export default SagaOrchestrator;
