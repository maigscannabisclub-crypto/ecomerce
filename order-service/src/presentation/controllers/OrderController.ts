import { Request, Response, NextFunction } from 'express';
import { OrderStatus } from '@prisma/client';
import { OrderService } from '../../application/services/OrderService';
import { SagaOrchestrator } from '../../application/services/SagaOrchestrator';
import { OutboxProcessor } from '../../infrastructure/messaging/outboxProcessor';
import { createLogger } from '../../utils/logger';
import {
  CreateOrderRequest,
  CreateOrderFromCartRequest,
  UpdateOrderStatusRequest,
  CancelOrderRequest,
  OrderListResponse,
  OrderResponse,
} from '../../application/dto/OrderDTO';

const logger = createLogger('OrderController');

// Extended Request type with user info
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roles: string[];
  };
}

export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly sagaOrchestrator: SagaOrchestrator,
    private readonly outboxProcessor: OutboxProcessor
  ) {}

  /**
   * Create order from cart
   */
  createOrderFromCart = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userEmail = req.user?.email;

      if (!userId || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const data: CreateOrderFromCartRequest = req.body;
      const token = req.headers.authorization?.replace('Bearer ', '') || '';

      logger.info('Creating order from cart', {
        userId,
        cartId: data.cartId,
      });

      const order = await this.orderService.createOrderFromCart(
        data,
        userId,
        userEmail,
        token
      );

      // Start the order saga
      await this.sagaOrchestrator.startOrderSaga(order.id);

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully',
      });
    } catch (error) {
      logger.error('Failed to create order from cart', {
        error: (error as Error).message,
      });
      next(error);
    }
  };

  /**
   * Create order directly
   */
  createOrder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userEmail = req.user?.email;

      if (!userId || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const data: CreateOrderRequest = req.body;

      logger.info('Creating order', { userId });

      const order = await this.orderService.createOrder(data, userId, userEmail);

      // Start the order saga
      await this.sagaOrchestrator.startOrderSaga(order.id);

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully',
      });
    } catch (error) {
      logger.error('Failed to create order', {
        error: (error as Error).message,
      });
      next(error);
    }
  };

  /**
   * Get order by ID
   */
  getOrderById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const isAdmin = req.user?.roles?.includes('admin');

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      logger.debug('Getting order by ID', { orderId: id, userId });

      // Admin can see any order, regular users only their own
      const order = await this.orderService.getOrderById(
        id,
        isAdmin ? undefined : userId
      );

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      if ((error as Error).message === 'Order not found') {
        res.status(404).json({
          success: false,
          error: 'Order not found',
        });
        return;
      }
      if ((error as Error).message === 'Access denied') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }
      next(error);
    }
  };

  /**
   * Get order by order number
   */
  getOrderByNumber = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { orderNumber } = req.params;

      logger.debug('Getting order by number', { orderNumber });

      const order = await this.orderService.getOrderByNumber(orderNumber);

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      if ((error as Error).message === 'Order not found') {
        res.status(404).json({
          success: false,
          error: 'Order not found',
        });
        return;
      }
      next(error);
    }
  };

  /**
   * List user's orders
   */
  listUserOrders = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as OrderStatus | undefined;

      logger.debug('Listing user orders', { userId, page, limit, status });

      const orders = await this.orderService.listUserOrders(
        userId,
        page,
        limit,
        status
      );

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * List all orders (admin only)
   */
  listAllOrders = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as OrderStatus | undefined;
      const userId = req.query.userId as string | undefined;

      logger.debug('Listing all orders', { page, limit, status, userId });

      const orders = await this.orderService.listAllOrders(
        page,
        limit,
        status,
        userId
      );

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update order status (admin only)
   */
  updateOrderStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const data: UpdateOrderStatusRequest = req.body;
      const updatedBy = req.user?.userId || 'system';

      logger.info('Updating order status', {
        orderId: id,
        newStatus: data.status,
        updatedBy,
      });

      const order = await this.orderService.updateOrderStatus(
        id,
        data,
        updatedBy
      );

      res.status(200).json({
        success: true,
        data: order,
        message: 'Order status updated successfully',
      });
    } catch (error) {
      if ((error as Error).message === 'Order not found') {
        res.status(404).json({
          success: false,
          error: 'Order not found',
        });
        return;
      }
      if ((error as Error).message.includes('Invalid status transition')) {
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
        return;
      }
      next(error);
    }
  };

  /**
   * Cancel order
   */
  cancelOrder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const data: CancelOrderRequest = req.body;
      const cancelledBy = req.user?.userId;
      const isAdmin = req.user?.roles?.includes('admin');

      if (!cancelledBy) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      logger.info('Cancelling order', {
        orderId: id,
        cancelledBy,
        reason: data.reason,
      });

      // Get order to check ownership
      const order = await this.orderService.getOrderById(id);

      // Only admin or order owner can cancel
      if (!isAdmin && order.userId !== cancelledBy) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      const cancelledOrder = await this.orderService.cancelOrder(
        id,
        data,
        cancelledBy
      );

      res.status(200).json({
        success: true,
        data: cancelledOrder,
        message: 'Order cancelled successfully',
      });
    } catch (error) {
      if ((error as Error).message === 'Order not found') {
        res.status(404).json({
          success: false,
          error: 'Order not found',
        });
        return;
      }
      if ((error as Error).message.includes('cannot be cancelled')) {
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
        return;
      }
      next(error);
    }
  };

  /**
   * Get order statistics (admin only)
   */
  getOrderStatistics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.debug('Getting order statistics');

      const stats = await this.orderService.getOrderStatistics();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get outbox statistics (admin only)
   */
  getOutboxStatistics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.debug('Getting outbox statistics');

      const stats = await this.outboxProcessor.getStatistics();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get failed outbox events (admin only)
   */
  getFailedOutboxEvents = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      logger.debug('Getting failed outbox events', { limit });

      const events = await this.outboxProcessor.getFailedEvents(limit);

      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retry failed outbox event (admin only)
   */
  retryFailedOutboxEvent = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { eventId } = req.params;

      logger.info('Retrying failed outbox event', { eventId });

      const success = await this.outboxProcessor.retryFailedEvent(eventId);

      if (success) {
        res.status(200).json({
          success: true,
          message: 'Event retry initiated',
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to retry event',
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get active sagas (admin only)
   */
  getActiveSagas = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.debug('Getting active sagas');

      const sagas = this.sagaOrchestrator.getActiveSagas();

      res.status(200).json({
        success: true,
        data: sagas,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Health check
   */
  healthCheck = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'order-service',
          version: '1.0.0',
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default OrderController;
