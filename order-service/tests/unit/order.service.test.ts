import { jest } from '@jest/globals';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { OrderService } from '../../../src/application/services/OrderService';
import { Order } from '../../../src/domain/entities/Order';
import { Decimal } from '@prisma/client/runtime/library';

// Mock Prisma
const mockPrisma = {
  order: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  orderStatusHistory: {
    create: jest.fn(),
  },
  outboxEvent: {
    create: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
} as unknown as PrismaClient;

// Mock HTTP Client
const mockHttpClient = {
  getCart: jest.fn(),
  clearCart: jest.fn(),
};

// Mock Outbox Publisher
const mockOutboxPublisher = {
  scheduleEvent: jest.fn(),
};

describe('OrderService', () => {
  let orderService: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    orderService = new OrderService(
      mockPrisma,
      mockHttpClient,
      mockOutboxPublisher
    );
  });

  describe('createOrder', () => {
    const mockOrderData = {
      items: [
        {
          productId: 'prod-1',
          productName: 'Test Product',
          productSku: 'TEST-001',
          quantity: 2,
          unitPrice: 99.99,
        },
      ],
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'USA',
      },
    };

    const mockCreatedOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      userEmail: 'test@example.com',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      tax: new Decimal(20.00),
      shipping: new Decimal(0),
      grandTotal: new Decimal(219.98),
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'Test Product',
          productSku: 'TEST-001',
          quantity: 2,
          unitPrice: new Decimal(99.99),
          subtotal: new Decimal(199.98),
          createdAt: new Date(),
        },
      ],
      statusHistory: [
        {
          id: 'hist-1',
          status: OrderStatus.PENDING,
          previousStatus: null,
          notes: 'Order created',
          createdBy: 'system',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create an order successfully', async () => {
      (mockPrisma.order.create as jest.Mock).mockResolvedValue(mockCreatedOrder);
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const result = await orderService.createOrder(
        mockOrderData,
        'user-1',
        'test@example.com'
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.items).toHaveLength(1);
      expect(mockPrisma.order.create).toHaveBeenCalled();
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('should throw error when items are empty', async () => {
      await expect(
        orderService.createOrder(
          { items: [] },
          'user-1',
          'test@example.com'
        )
      ).rejects.toThrow('Order must have at least one item');
    });
  });

  describe('createOrderFromCart', () => {
    const mockCartData = {
      id: 'cart-1',
      userId: 'user-1',
      items: [
        {
          productId: 'prod-1',
          productName: 'Test Product',
          productSku: 'TEST-001',
          quantity: 2,
          unitPrice: 99.99,
        },
      ],
      total: 199.98,
    };

    const mockCreatedOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      userEmail: 'test@example.com',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      tax: new Decimal(20.00),
      shipping: new Decimal(0),
      grandTotal: new Decimal(219.98),
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'Test Product',
          productSku: 'TEST-001',
          quantity: 2,
          unitPrice: new Decimal(99.99),
          subtotal: new Decimal(199.98),
          createdAt: new Date(),
        },
      ],
      statusHistory: [
        {
          id: 'hist-1',
          status: OrderStatus.PENDING,
          previousStatus: null,
          notes: 'Order created from cart',
          createdBy: 'system',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create order from cart successfully', async () => {
      mockHttpClient.getCart.mockResolvedValue(mockCartData);
      mockHttpClient.clearCart.mockResolvedValue(undefined);
      (mockPrisma.order.create as jest.Mock).mockResolvedValue(mockCreatedOrder);
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const result = await orderService.createOrderFromCart(
        { cartId: 'cart-1' },
        'user-1',
        'test@example.com',
        'token-123'
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(mockHttpClient.getCart).toHaveBeenCalledWith('cart-1', 'token-123');
      expect(mockPrisma.order.create).toHaveBeenCalled();
    });

    it('should throw error when cart does not belong to user', async () => {
      mockHttpClient.getCart.mockResolvedValue({
        ...mockCartData,
        userId: 'different-user',
      });

      await expect(
        orderService.createOrderFromCart(
          { cartId: 'cart-1' },
          'user-1',
          'test@example.com',
          'token-123'
        )
      ).rejects.toThrow('Cart does not belong to user');
    });

    it('should throw error when cart is empty', async () => {
      mockHttpClient.getCart.mockResolvedValue({
        ...mockCartData,
        items: [],
      });

      await expect(
        orderService.createOrderFromCart(
          { cartId: 'cart-1' },
          'user-1',
          'test@example.com',
          'token-123'
        )
      ).rejects.toThrow('Cart is empty');
    });
  });

  describe('getOrderById', () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      userEmail: 'test@example.com',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      tax: new Decimal(20.00),
      shipping: new Decimal(0),
      grandTotal: new Decimal(219.98),
      items: [],
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return order by id', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const result = await orderService.getOrderById('order-1', 'user-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('order-1');
      expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        include: {
          items: true,
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    it('should throw error when order not found', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(orderService.getOrderById('non-existent')).rejects.toThrow(
        'Order not found'
      );
    });

    it('should throw error when user does not have access', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        userId: 'different-user',
      });

      await expect(
        orderService.getOrderById('order-1', 'user-1')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('listUserOrders', () => {
    const mockOrders = [
      {
        id: 'order-1',
        orderNumber: 'ORD-TEST-001',
        userId: 'user-1',
        status: OrderStatus.PENDING,
        total: new Decimal(199.98),
        tax: new Decimal(20.00),
        shipping: new Decimal(0),
        grandTotal: new Decimal(219.98),
        items: [],
        statusHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return paginated user orders', async () => {
      (mockPrisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);
      (mockPrisma.order.count as jest.Mock).mockResolvedValue(1);

      const result = await orderService.listUserOrders('user-1', 1, 10);

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by status when provided', async () => {
      (mockPrisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);
      (mockPrisma.order.count as jest.Mock).mockResolvedValue(1);

      await orderService.listUserOrders('user-1', 1, 10, OrderStatus.PENDING);

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: OrderStatus.PENDING },
        })
      );
    });
  });

  describe('updateOrderStatus', () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      tax: new Decimal(20.00),
      shipping: new Decimal(0),
      grandTotal: new Decimal(219.98),
      items: [],
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update order status successfully', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (mockPrisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.RESERVED,
      });
      (mockPrisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const result = await orderService.updateOrderStatus(
        'order-1',
        { status: OrderStatus.RESERVED, notes: 'Test update' },
        'admin-1'
      );

      expect(mockPrisma.order.update).toHaveBeenCalled();
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalled();
    });

    it('should throw error for invalid status transition', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        orderService.updateOrderStatus('order-1', {
          status: OrderStatus.PENDING,
        })
      ).rejects.toThrow('Invalid status transition');
    });
  });

  describe('cancelOrder', () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      tax: new Decimal(20.00),
      shipping: new Decimal(0),
      grandTotal: new Decimal(219.98),
      items: [],
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should cancel order successfully', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (mockPrisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });
      (mockPrisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const result = await orderService.cancelOrder(
        'order-1',
        { reason: 'Customer request' },
        'user-1'
      );

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.CANCELLED,
          }),
        })
      );
    });

    it('should throw error when order cannot be cancelled', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        orderService.cancelOrder('order-1', {}, 'user-1')
      ).rejects.toThrow('cannot be cancelled');
    });
  });

  describe('handleStockReserved', () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
        },
      ],
    };

    it('should handle stock reserved event', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (mockPrisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.RESERVED,
      });
      (mockPrisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      await orderService.handleStockReserved('order-1');

      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.RESERVED },
      });
    });

    it('should skip if order is not in PENDING status', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.RESERVED,
      });

      await orderService.handleStockReserved('order-1');

      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('handleStockReservationFailed', () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'ORD-TEST-001',
      userId: 'user-1',
      status: OrderStatus.PENDING,
      total: new Decimal(199.98),
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
        },
      ],
    };

    it('should handle stock reservation failed event', async () => {
      (mockPrisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (mockPrisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.FAILED,
      });
      (mockPrisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      await orderService.handleStockReservationFailed('order-1', 'Out of stock');

      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.FAILED },
      });
    });
  });

  describe('getOrderStatistics', () => {
    it('should return order statistics', async () => {
      (mockPrisma.order.count as jest.Mock).mockResolvedValue(100);
      (mockPrisma.order.groupBy as jest.Mock).mockResolvedValue([
        { status: OrderStatus.PENDING, _count: { status: 10 } },
        { status: OrderStatus.DELIVERED, _count: { status: 50 } },
      ]);
      (mockPrisma.order.aggregate as jest.Mock).mockResolvedValue({
        _sum: { grandTotal: new Decimal(50000) },
        _avg: { grandTotal: new Decimal(500) },
      });

      const result = await orderService.getOrderStatistics();

      expect(result.totalOrders).toBe(100);
      expect(result.totalRevenue).toBe(50000);
      expect(result.averageOrderValue).toBe(500);
    });
  });
});

// Order Entity Tests
describe('Order Entity', () => {
  describe('generateOrderNumber', () => {
    it('should generate unique order numbers', () => {
      const orderNumber1 = Order.generateOrderNumber();
      const orderNumber2 = Order.generateOrderNumber();

      expect(orderNumber1).toBeDefined();
      expect(orderNumber2).toBeDefined();
      expect(orderNumber1).not.toBe(orderNumber2);
      expect(orderNumber1).toMatch(/^ORD-/);
    });
  });

  describe('calculateTotals', () => {
    it('should calculate totals correctly', () => {
      const items = [
        { quantity: 2, unitPrice: 100 },
        { quantity: 1, unitPrice: 50 },
      ];

      const result = Order.calculateTotals(items, 0.1, 10);

      expect(result.total).toBe(250);
      expect(result.tax).toBe(25);
      expect(result.shipping).toBe(10);
      expect(result.grandTotal).toBe(285);
    });
  });

  describe('create', () => {
    it('should create a new order with correct data', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [
          {
            productId: 'prod-1',
            productName: 'Test Product',
            productSku: 'TEST-001',
            quantity: 2,
            unitPrice: 100,
          },
        ],
        {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'USA',
        }
      );

      expect(order.userId).toBe('user-1');
      expect(order.userEmail).toBe('test@example.com');
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.items).toHaveLength(1);
      expect(order.total).toBe(200);
      expect(order.statusHistory).toHaveLength(1);
    });
  });

  describe('canTransitionTo', () => {
    it('should allow valid status transitions', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      expect(order.canTransitionTo(OrderStatus.RESERVED)).toBe(true);
      expect(order.canTransitionTo(OrderStatus.FAILED)).toBe(true);
      expect(order.canTransitionTo(OrderStatus.CANCELLED)).toBe(true);
      expect(order.canTransitionTo(OrderStatus.PAID)).toBe(false);
    });

    it('should not allow invalid transitions', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      const deliveredOrder = order.transitionTo(OrderStatus.RESERVED);
      const finalOrder = deliveredOrder.transitionTo(OrderStatus.CONFIRMED);

      expect(finalOrder.canTransitionTo(OrderStatus.PENDING)).toBe(false);
    });
  });

  describe('transitionTo', () => {
    it('should transition order status', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      const reservedOrder = order.transitionTo(
        OrderStatus.RESERVED,
        'Stock reserved'
      );

      expect(reservedOrder.status).toBe(OrderStatus.RESERVED);
      expect(reservedOrder.statusHistory).toHaveLength(2);
    });

    it('should throw error for invalid transition', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      expect(() => {
        order.transitionTo(OrderStatus.DELIVERED);
      }).toThrow('Invalid status transition');
    });
  });

  describe('isCancellable', () => {
    it('should return true for cancellable orders', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      expect(order.isCancellable()).toBe(true);
    });

    it('should return false for non-cancellable orders', () => {
      const order = Order.create(
        'user-1',
        'test@example.com',
        [{ productId: '1', productName: 'Test', productSku: 'TEST', quantity: 1, unitPrice: 100 }]
      );

      const deliveredOrder = order
        .transitionTo(OrderStatus.RESERVED)
        .transitionTo(OrderStatus.CONFIRMED)
        .transitionTo(OrderStatus.PAID)
        .transitionTo(OrderStatus.SHIPPED)
        .transitionTo(OrderStatus.DELIVERED);

      expect(deliveredOrder.isCancellable()).toBe(false);
    });
  });
});
