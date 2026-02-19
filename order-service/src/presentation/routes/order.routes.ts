import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateBody,
  validateParams,
  validateQuery,
  createOrderFromCartSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  orderIdParamSchema,
  orderNumberParamSchema,
  eventIdParamSchema,
  listOrdersQuerySchema,
  paginationQuerySchema,
} from '../middleware/validation';

export function createOrderRoutes(
  orderController: OrderController
): Router {
  const router = Router();

  // ============== Public Routes ==============

  // Health check
  router.get('/health', orderController.healthCheck);

  // ============== Protected Routes (Authentication Required) ==============

  // Create order from cart
  router.post(
    '/orders/from-cart',
    authenticate,
    validateBody(createOrderFromCartSchema),
    orderController.createOrderFromCart
  );

  // Create order directly
  router.post(
    '/orders',
    authenticate,
    validateBody(createOrderSchema),
    orderController.createOrder
  );

  // Get user's orders
  router.get(
    '/orders',
    authenticate,
    validateQuery(listOrdersQuerySchema),
    orderController.listUserOrders
  );

  // Get order by ID
  router.get(
    '/orders/:id',
    authenticate,
    validateParams(orderIdParamSchema),
    orderController.getOrderById
  );

  // Get order by order number
  router.get(
    '/orders/number/:orderNumber',
    authenticate,
    validateParams(orderNumberParamSchema),
    orderController.getOrderByNumber
  );

  // Cancel order
  router.put(
    '/orders/:id/cancel',
    authenticate,
    validateParams(orderIdParamSchema),
    validateBody(cancelOrderSchema),
    orderController.cancelOrder
  );

  // ============== Admin Routes ==============

  // List all orders
  router.get(
    '/admin/orders',
    authenticate,
    authorize('admin'),
    validateQuery(listOrdersQuerySchema),
    orderController.listAllOrders
  );

  // Update order status
  router.put(
    '/orders/:id/status',
    authenticate,
    authorize('admin'),
    validateParams(orderIdParamSchema),
    validateBody(updateOrderStatusSchema),
    orderController.updateOrderStatus
  );

  // Get order statistics
  router.get(
    '/admin/statistics',
    authenticate,
    authorize('admin'),
    orderController.getOrderStatistics
  );

  // Get outbox statistics
  router.get(
    '/admin/outbox/statistics',
    authenticate,
    authorize('admin'),
    orderController.getOutboxStatistics
  );

  // Get failed outbox events
  router.get(
    '/admin/outbox/failed',
    authenticate,
    authorize('admin'),
    validateQuery(paginationQuerySchema),
    orderController.getFailedOutboxEvents
  );

  // Retry failed outbox event
  router.post(
    '/admin/outbox/retry/:eventId',
    authenticate,
    authorize('admin'),
    validateParams(eventIdParamSchema),
    orderController.retryFailedOutboxEvent
  );

  // Get active sagas
  router.get(
    '/admin/sagas/active',
    authenticate,
    authorize('admin'),
    orderController.getActiveSagas
  );

  return router;
}

export default createOrderRoutes;
