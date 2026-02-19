import { PrismaClient, OrderStatus, Prisma } from '@prisma/client';
import { Order, OrderData, Address } from '../../domain/entities/Order';
import { OrderDTOMapper } from '../dto/OrderDTO';
import { createLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import config from '../../config';
import {
  OrderResponse,
  OrderListResponse,
  CreateOrderRequest,
  CreateOrderFromCartRequest,
  UpdateOrderStatusRequest,
  CancelOrderRequest,
} from '../dto/OrderDTO';

const logger = createLogger('OrderService');

export interface CartItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
}

export interface CartData {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
}

export class OrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly httpClient: {
      getCart: (cartId: string, token: string) => Promise<CartData>;
      clearCart: (cartId: string, token: string) => Promise<void>;
    },
    private readonly outboxPublisher: {
      scheduleEvent: (eventType: string, aggregateId: string, payload: unknown) => Promise<void>;
    }
  ) {}

  /**
   * Create a new order from cart
   */
  async createOrderFromCart(
    data: CreateOrderFromCartRequest,
    userId: string,
    userEmail: string,
    token: string
  ): Promise<OrderResponse> {
    logger.info('Creating order from cart', { cartId: data.cartId, userId });

    try {
      // Fetch cart data from cart service with retry
      const cart = await withRetry(
        () => this.httpClient.getCart(data.cartId, token),
        {
          maxRetries: config.retry.maxRetries,
          baseDelayMs: config.retry.delayMs,
          retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
        }
      );

      // Validate cart belongs to user
      if (cart.userId !== userId) {
        throw new Error('Cart does not belong to user');
      }

      // Validate cart has items
      if (!cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Create order entity
      const order = Order.create(
        userId,
        userEmail,
        cart.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        data.shippingAddress,
        data.billingAddress,
        data.notes
      );

      // Save order and outbox event in transaction
      const savedOrder = await this.prisma.$transaction(async (tx) => {
        // Create order
        const createdOrder = await tx.order.create({
          data: {
            orderNumber: order.orderNumber,
            userId: order.userId,
            userEmail: order.userEmail,
            status: order.status,
            total: order.total,
            tax: order.tax,
            shipping: order.shipping,
            grandTotal: order.grandTotal,
            shippingAddress: order.shippingAddress as Prisma.InputJsonValue,
            billingAddress: order.billingAddress as Prisma.InputJsonValue,
            notes: order.notes,
            items: {
              create: order.items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                productSku: item.productSku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),
            },
            statusHistory: {
              create: {
                status: OrderStatus.PENDING,
                previousStatus: null,
                notes: 'Order created from cart',
                createdBy: 'system',
              },
            },
          },
          include: {
            items: true,
            statusHistory: true,
          },
        });

        // Create outbox event for OrderCreated
        const eventPayload = OrderDTOMapper.toOrderCreatedEvent({
          ...order.toJSON(),
          id: createdOrder.id,
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'OrderCreated',
            aggregateId: createdOrder.id,
            payload: eventPayload as Prisma.InputJsonValue,
            published: false,
            retryCount: 0,
          },
        });

        return createdOrder;
      });

      // Clear cart after successful order creation
      try {
        await this.httpClient.clearCart(data.cartId, token);
      } catch (error) {
        logger.warn('Failed to clear cart after order creation', {
          cartId: data.cartId,
          error: (error as Error).message,
        });
        // Don't fail the order if cart clearing fails
      }

      logger.info('Order created successfully', {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
      });

      return OrderDTOMapper.toOrderResponse({
        ...order.toJSON(),
        id: savedOrder.id,
        createdAt: savedOrder.createdAt,
        updatedAt: savedOrder.updatedAt,
        items: savedOrder.items.map(item => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
        })),
        statusHistory: savedOrder.statusHistory.map(h => ({
          ...h,
          previousStatus: h.previousStatus as OrderStatus | null,
        })),
      });
    } catch (error) {
      logger.error('Failed to create order from cart', {
        cartId: data.cartId,
        userId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Create a new order directly (without cart)
   */
  async createOrder(
    data: CreateOrderRequest,
    userId: string,
    userEmail: string
  ): Promise<OrderResponse> {
    logger.info('Creating order directly', { userId });

    try {
      // Validate items
      if (!data.items || data.items.length === 0) {
        throw new Error('Order must have at least one item');
      }

      // Create order entity
      const order = Order.create(
        userId,
        userEmail,
        data.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        data.shippingAddress,
        data.billingAddress,
        data.notes
      );

      // Save order and outbox event in transaction
      const savedOrder = await this.prisma.$transaction(async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            orderNumber: order.orderNumber,
            userId: order.userId,
            userEmail: order.userEmail,
            status: order.status,
            total: order.total,
            tax: order.tax,
            shipping: order.shipping,
            grandTotal: order.grandTotal,
            shippingAddress: order.shippingAddress as Prisma.InputJsonValue,
            billingAddress: order.billingAddress as Prisma.InputJsonValue,
            notes: order.notes,
            items: {
              create: order.items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                productSku: item.productSku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),
            },
            statusHistory: {
              create: {
                status: OrderStatus.PENDING,
                previousStatus: null,
                notes: 'Order created',
                createdBy: 'system',
              },
            },
          },
          include: {
            items: true,
            statusHistory: true,
          },
        });

        // Create outbox event for OrderCreated
        const eventPayload = OrderDTOMapper.toOrderCreatedEvent({
          ...order.toJSON(),
          id: createdOrder.id,
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'OrderCreated',
            aggregateId: createdOrder.id,
            payload: eventPayload as Prisma.InputJsonValue,
            published: false,
            retryCount: 0,
          },
        });

        return createdOrder;
      });

      logger.info('Order created successfully', {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
      });

      return OrderDTOMapper.toOrderResponse({
        ...order.toJSON(),
        id: savedOrder.id,
        createdAt: savedOrder.createdAt,
        updatedAt: savedOrder.updatedAt,
        items: savedOrder.items.map(item => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
        })),
        statusHistory: savedOrder.statusHistory.map(h => ({
          ...h,
          previousStatus: h.previousStatus as OrderStatus | null,
        })),
      });
    } catch (error) {
      logger.error('Failed to create order', {
        userId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId?: string): Promise<OrderResponse> {
    logger.debug('Getting order by ID', { orderId, userId });

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if user has access to this order
    if (userId && order.userId !== userId) {
      throw new Error('Access denied');
    }

    return OrderDTOMapper.toOrderResponse({
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
      shippingAddress: order.shippingAddress as Address | undefined,
      billingAddress: order.billingAddress as Address | undefined,
      statusHistory: order.statusHistory.map(h => ({
        ...h,
        previousStatus: h.previousStatus as OrderStatus | null,
      })),
    });
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber: string): Promise<OrderResponse> {
    logger.debug('Getting order by number', { orderNumber });

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    return OrderDTOMapper.toOrderResponse({
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
      shippingAddress: order.shippingAddress as Address | undefined,
      billingAddress: order.billingAddress as Address | undefined,
      statusHistory: order.statusHistory.map(h => ({
        ...h,
        previousStatus: h.previousStatus as OrderStatus | null,
      })),
    });
  }

  /**
   * List orders for a user
   */
  async listUserOrders(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: OrderStatus
  ): Promise<OrderListResponse> {
    logger.debug('Listing user orders', { userId, page, limit, status });

    const where: Prisma.OrderWhereInput = { userId };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map(order =>
        OrderDTOMapper.toOrderResponse({
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
          shippingAddress: order.shippingAddress as Address | undefined,
          billingAddress: order.billingAddress as Address | undefined,
          statusHistory: order.statusHistory.map(h => ({
            ...h,
            previousStatus: h.previousStatus as OrderStatus | null,
          })),
        })
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all orders (admin only)
   */
  async listAllOrders(
    page: number = 1,
    limit: number = 10,
    status?: OrderStatus,
    userId?: string
  ): Promise<OrderListResponse> {
    logger.debug('Listing all orders', { page, limit, status, userId });

    const where: Prisma.OrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (userId) {
      where.userId = userId;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map(order =>
        OrderDTOMapper.toOrderResponse({
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
          shippingAddress: order.shippingAddress as Address | undefined,
          billingAddress: order.billingAddress as Address | undefined,
          statusHistory: order.statusHistory.map(h => ({
            ...h,
            previousStatus: h.previousStatus as OrderStatus | null,
          })),
        })
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    data: UpdateOrderStatusRequest,
    updatedBy?: string
  ): Promise<OrderResponse> {
    logger.info('Updating order status', {
      orderId,
      newStatus: data.status,
      updatedBy,
    });

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    const previousStatus = order.status;

    // Validate status transition
    const orderEntity = new Order({
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
      shippingAddress: order.shippingAddress as Address | undefined,
      billingAddress: order.billingAddress as Address | undefined,
      statusHistory: order.statusHistory.map(h => ({
        ...h,
        previousStatus: h.previousStatus as OrderStatus | null,
      })),
    });

    if (!orderEntity.canTransitionTo(data.status)) {
      throw new Error(
        `Invalid status transition from ${order.status} to ${data.status}`
      );
    }

    // Update order status and create outbox event
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.OrderUpdateInput = {
        status: data.status,
      };

      // Add timestamp based on status
      if (data.status === OrderStatus.PAID) {
        updateData.paidAt = new Date();
      } else if (data.status === OrderStatus.SHIPPED) {
        updateData.shippedAt = new Date();
      } else if (data.status === OrderStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }

      const result = await tx.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
          items: true,
          statusHistory: true,
        },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: data.status,
          previousStatus,
          notes: data.notes,
          createdBy: updatedBy || 'system',
        },
      });

      // Create outbox event for status change
      const eventPayload = OrderDTOMapper.toOrderStatusChangedEvent(
        {
          ...orderEntity.toJSON(),
          id: orderId,
          status: data.status,
        },
        previousStatus
      );

      await tx.outboxEvent.create({
        data: {
          eventType: 'OrderStatusChanged',
          aggregateId: orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });

      // If order is completed, also create OrderCompleted event
      if (data.status === OrderStatus.DELIVERED) {
        const completedEventPayload = OrderDTOMapper.toOrderCompletedEvent({
          ...orderEntity.toJSON(),
          id: orderId,
          status: data.status,
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'OrderCompleted',
            aggregateId: orderId,
            payload: completedEventPayload as Prisma.InputJsonValue,
            published: false,
            retryCount: 0,
          },
        });
      }

      return result;
    });

    logger.info('Order status updated successfully', {
      orderId,
      previousStatus,
      newStatus: data.status,
    });

    return this.getOrderById(orderId);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    orderId: string,
    data: CancelOrderRequest,
    cancelledBy?: string
  ): Promise<OrderResponse> {
    logger.info('Cancelling order', { orderId, cancelledBy });

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        statusHistory: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    const orderEntity = new Order({
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
      shippingAddress: order.shippingAddress as Address | undefined,
      billingAddress: order.billingAddress as Address | undefined,
      statusHistory: order.statusHistory.map(h => ({
        ...h,
        previousStatus: h.previousStatus as OrderStatus | null,
      })),
    });

    if (!orderEntity.isCancellable()) {
      throw new Error(`Order cannot be cancelled in ${order.status} status`);
    }

    const previousStatus = order.status;

    // Cancel order and create outbox event
    const cancelledOrder = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: {
          items: true,
          statusHistory: true,
        },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLED,
          previousStatus,
          notes: data.reason || 'Order cancelled',
          createdBy: cancelledBy || 'system',
        },
      });

      // Create outbox event for OrderCancelled
      const eventPayload = OrderDTOMapper.toOrderCancelledEvent(
        {
          ...orderEntity.toJSON(),
          id: orderId,
          status: OrderStatus.CANCELLED,
        },
        data.reason || 'Order cancelled'
      );

      await tx.outboxEvent.create({
        data: {
          eventType: 'OrderCancelled',
          aggregateId: orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });

      return result;
    });

    logger.info('Order cancelled successfully', { orderId, cancelledBy });

    return this.getOrderById(orderId);
  }

  /**
   * Handle stock reserved event (SAGA pattern)
   */
  async handleStockReserved(orderId: string): Promise<void> {
    logger.info('Handling stock reserved', { orderId });

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        logger.warn('Order is not in PENDING status, skipping', {
          orderId,
          currentStatus: order.status,
        });
        return;
      }

      // Update order status to RESERVED
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.RESERVED },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.RESERVED,
          previousStatus: OrderStatus.PENDING,
          notes: 'Stock reserved successfully',
          createdBy: 'system',
        },
      });

      // Create outbox event for OrderConfirmed
      const eventPayload = {
        eventType: 'OrderConfirmed',
        aggregateId: orderId,
        orderId,
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
          aggregateId: orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });
    });

    logger.info('Stock reserved handled successfully', { orderId });
  }

  /**
   * Handle stock reservation failed event (SAGA pattern)
   */
  async handleStockReservationFailed(
    orderId: string,
    reason: string
  ): Promise<void> {
    logger.info('Handling stock reservation failed', { orderId, reason });

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        logger.warn('Order is not in PENDING status, skipping', {
          orderId,
          currentStatus: order.status,
        });
        return;
      }

      // Update order status to FAILED
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.FAILED,
          previousStatus: OrderStatus.PENDING,
          notes: `Stock reservation failed: ${reason}`,
          createdBy: 'system',
        },
      });

      // Create outbox event for OrderFailed
      const eventPayload = {
        eventType: 'OrderFailed',
        aggregateId: orderId,
        orderId,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        reason,
        items: order.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        timestamp: new Date().toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          eventType: 'OrderFailed',
          aggregateId: orderId,
          payload: eventPayload as Prisma.InputJsonValue,
          published: false,
          retryCount: 0,
        },
      });
    });

    logger.info('Stock reservation failed handled successfully', { orderId });
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(): Promise<{
    totalOrders: number;
    ordersByStatus: Record<OrderStatus, number>;
    totalRevenue: number;
    averageOrderValue: number;
  }> {
    logger.debug('Getting order statistics');

    const [totalOrders, ordersByStatus, revenueStats] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
        _avg: { grandTotal: true },
      }),
    ]);

    const statusCounts = ordersByStatus.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.status]: curr._count.status,
      }),
      {} as Record<OrderStatus, number>
    );

    return {
      totalOrders,
      ordersByStatus: statusCounts,
      totalRevenue: Number(revenueStats._sum.grandTotal || 0),
      averageOrderValue: Number(revenueStats._avg.grandTotal || 0),
    };
  }
}

export default OrderService;
