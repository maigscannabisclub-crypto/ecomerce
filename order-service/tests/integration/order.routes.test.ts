import request from 'supertest';
import express, { Application } from 'express';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { OrderStatus } from '@prisma/client';

// Mock dependencies
jest.mock('../../src/infrastructure/database/prisma');
jest.mock('../../src/infrastructure/messaging/rabbitmq');
jest.mock('../../src/infrastructure/http/HttpClient');

import { prisma } from '../../src/infrastructure/database/prisma';
import { getRabbitMQConnection } from '../../src/infrastructure/messaging/rabbitmq';
import { CartServiceClient } from '../../src/infrastructure/http/HttpClient';

// Import after mocks
import { createOrderRoutes } from '../../src/presentation/routes/order.routes';
import { OrderController } from '../../src/presentation/controllers/OrderController';
import { OrderService } from '../../src/application/services/OrderService';
import { SagaOrchestrator } from '../../src/application/services/SagaOrchestrator';
import { OutboxProcessor } from '../../src/infrastructure/messaging/outboxProcessor';

describe('Order Routes Integration Tests', () => {
  let app: Application;
  let authToken: string;
  let adminToken: string;

  const mockUser = {
    userId: 'user-1',
    email: 'test@example.com',
    roles: ['user'],
  };

  const mockAdmin = {
    userId: 'admin-1',
    email: 'admin@example.com',
    roles: ['admin'],
  };

  const mockOrder = {
    id: 'order-1',
    orderNumber: 'ORD-TEST-001',
    userId: 'user-1',
    userEmail: 'test@example.com',
    status: OrderStatus.PENDING,
    total: 199.98,
    tax: 20,
    shipping: 0,
    grandTotal: 219.98,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Test Product',
        productSku: 'TEST-001',
        quantity: 2,
        unitPrice: 99.99,
        subtotal: 199.98,
        createdAt: new Date().toISOString(),
      },
    ],
    statusHistory: [
      {
        id: 'hist-1',
        status: OrderStatus.PENDING,
        previousStatus: null,
        notes: 'Order created',
        createdBy: 'system',
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(() => {
    // Generate test tokens
    authToken = jwt.sign(mockUser, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });
    adminToken = jwt.sign(mockAdmin, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock implementations
    const mockRabbitMQ = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      publish: jest.fn().mockReturnValue(true),
      publishEvent: jest.fn().mockReturnValue(true),
      registerHandler: jest.fn(),
      checkHealth: jest.fn().mockResolvedValue({ healthy: true }),
    };
    (getRabbitMQConnection as jest.Mock).mockReturnValue(mockRabbitMQ);

    const mockCartClient = {
      getCart: jest.fn(),
      clearCart: jest.fn(),
    };
    (CartServiceClient as jest.Mock).mockImplementation(() => mockCartClient);

    // Create services
    const orderService = new OrderService(
      prisma as any,
      {
        getCart: mockCartClient.getCart,
        clearCart: mockCartClient.clearCart,
      },
      { scheduleEvent: jest.fn() }
    );

    const sagaOrchestrator = new SagaOrchestrator(prisma as any, {
      publish: jest.fn(),
    });

    const outboxProcessor = new OutboxProcessor(prisma as any, mockRabbitMQ as any);

    // Create controller and routes
    const orderController = new OrderController(
      orderService,
      sagaOrchestrator,
      outboxProcessor
    );

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/v1', createOrderRoutes(orderController));
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('POST /api/v1/orders', () => {
    const validOrderData = {
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

    it('should create order with valid data', async () => {
      (prisma.order.create as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: mockOrder.items.map((item) => ({
          ...item,
          unitPrice: { toNumber: () => item.unitPrice },
          subtotal: { toNumber: () => item.subtotal },
        })),
      });
      (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validOrderData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .send(validOrderData);

      expect(response.status).toBe(401);
    });

    it('should return 400 with invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: [] });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/orders/from-cart', () => {
    const validCartData = {
      cartId: 'cart-1',
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'USA',
      },
    };

    it('should create order from cart with valid data', async () => {
      const mockCartClient = new CartServiceClient();
      (mockCartClient.getCart as jest.Mock).mockResolvedValue({
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
      });

      (prisma.order.create as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: mockOrder.items.map((item) => ({
          ...item,
          unitPrice: { toNumber: () => item.unitPrice },
          subtotal: { toNumber: () => item.subtotal },
        })),
      });
      (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/orders/from-cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validCartData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 with invalid cart ID', async () => {
      const response = await request(app)
        .post('/api/v1/orders/from-cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cartId: 'invalid-id' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should return user orders', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockOrder,
          total: { toNumber: () => 199.98 },
          tax: { toNumber: () => 20 },
          shipping: { toNumber: () => 0 },
          grandTotal: { toNumber: () => 219.98 },
          items: [],
          statusHistory: [],
        },
      ]);
      (prisma.order.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toHaveLength(1);
    });

    it('should filter by status', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.order.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/orders?status=PENDING')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: OrderStatus.PENDING }),
        })
      );
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app).get('/api/v1/orders');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return order by ID', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: mockOrder.items.map((item) => ({
          ...item,
          unitPrice: { toNumber: () => item.unitPrice },
          subtotal: { toNumber: () => item.subtotal },
        })),
        statusHistory: mockOrder.statusHistory,
      });

      const response = await request(app)
        .get('/api/v1/orders/order-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('order-1');
    });

    it('should return 404 for non-existent order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/orders/non-existent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid order ID format', async () => {
      const response = await request(app)
        .get('/api/v1/orders/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/v1/orders/:id/cancel', () => {
    it('should cancel order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: [],
        statusHistory: [],
      });
      (prisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });
      (prisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .put('/api/v1/orders/order-1/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Changed my mind' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 403 when user does not own the order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        userId: 'different-user',
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: [],
        statusHistory: [],
      });

      const response = await request(app)
        .put('/api/v1/orders/order-1/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/orders/:id/status', () => {
    it('should update order status (admin only)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: [],
        statusHistory: [],
      });
      (prisma.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.RESERVED,
      });
      (prisma.orderStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .put('/api/v1/orders/order-1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: OrderStatus.RESERVED, notes: 'Stock reserved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .put('/api/v1/orders/order-1/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: OrderStatus.RESERVED });

      expect(response.status).toBe(403);
    });

    it('should return 400 for invalid status transition', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
        total: { toNumber: () => 199.98 },
        tax: { toNumber: () => 20 },
        shipping: { toNumber: () => 0 },
        grandTotal: { toNumber: () => 219.98 },
        items: [],
        statusHistory: [],
      });

      const response = await request(app)
        .put('/api/v1/orders/order-1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: OrderStatus.PENDING });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/admin/orders', () => {
    it('should return all orders (admin only)', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockOrder,
          total: { toNumber: () => 199.98 },
          tax: { toNumber: () => 20 },
          shipping: { toNumber: () => 0 },
          grandTotal: { toNumber: () => 219.98 },
          items: [],
          statusHistory: [],
        },
      ]);
      (prisma.order.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/statistics', () => {
    it('should return order statistics (admin only)', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(100);
      (prisma.order.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({
        _sum: { grandTotal: { toNumber: () => 50000 } },
        _avg: { grandTotal: { toNumber: () => 500 } },
      });

      const response = await request(app)
        .get('/api/v1/admin/statistics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalOrders');
      expect(response.body.data).toHaveProperty('totalRevenue');
    });
  });

  describe('GET /api/v1/admin/outbox/statistics', () => {
    it('should return outbox statistics (admin only)', async () => {
      (prisma.outboxEvent.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(85) // published
        .mockResolvedValueOnce(5); // failed

      const response = await request(app)
        .get('/api/v1/admin/outbox/statistics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('pending');
      expect(response.body.data).toHaveProperty('published');
      expect(response.body.data).toHaveProperty('failed');
    });
  });
});
