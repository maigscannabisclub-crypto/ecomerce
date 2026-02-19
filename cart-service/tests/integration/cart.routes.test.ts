import request from 'supertest';
import { jest } from '@jest/globals';
import express, { Application } from 'express';
import { CartStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// Mock dependencies before importing app
jest.mock('../../src/infrastructure/database/prisma');
jest.mock('../../src/infrastructure/cache/redis');
jest.mock('../../src/infrastructure/http/HttpClient');

import { cartRepository } from '../../src/infrastructure/database/prisma';
import redisClient from '../../src/infrastructure/cache/redis';
import { createInventoryServiceClient } from '../../src/infrastructure/http/HttpClient';
import { generateTestToken } from '../../src/presentation/middleware/auth';

// Import routes directly for testing
import cartRoutes from '../../src/presentation/routes/cart.routes';

const mockInventoryClient = {
  checkStock: jest.fn(),
  getProduct: jest.fn(),
  getHealth: jest.fn().mockReturnValue({ state: 'CLOSED', metrics: {} }),
};

(createInventoryServiceClient as jest.Mock).mockReturnValue(mockInventoryClient);

describe('Cart Routes Integration Tests', () => {
  let app: Application;
  const authToken = generateTestToken({ id: 'test-user-123', email: 'test@example.com' });
  
  const mockUserId = 'test-user-123';
  const mockCartId = 'cart-123';
  const mockProductId = 'prod-123';
  const mockItemId = 'item-123';

  const mockProduct = {
    id: mockProductId,
    name: 'Test Product',
    sku: 'TEST-001',
    price: 99.99,
    stock: 100,
    isActive: true,
  };

  const mockCartItem = {
    id: mockItemId,
    cartId: mockCartId,
    productId: mockProductId,
    productName: 'Test Product',
    productSku: 'TEST-001',
    quantity: 2,
    unitPrice: new Decimal(99.99),
    subtotal: new Decimal(199.98),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCart = {
    id: mockCartId,
    userId: mockUserId,
    items: [mockCartItem],
    total: new Decimal(199.98),
    status: CartStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());
    
    // Add auth middleware mock
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        req.user = { id: mockUserId, email: 'test@example.com' };
      }
      next();
    });
    
    app.use('/cart', cartRoutes);
    
    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
      });
    });
  });

  describe('GET /cart', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/cart');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return cart for authenticated user', async () => {
      (redisClient.getCart as jest.Mock).mockResolvedValue(null);
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);

      const response = await request(app)
        .get('/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', mockCartId);
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data.items).toHaveLength(1);
    });

    it('should create new cart if none exists', async () => {
      (redisClient.getCart as jest.Mock).mockResolvedValue(null);
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);
      (cartRepository.create as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const response = await request(app)
        .get('/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(0);
    });
  });

  describe('POST /cart/items', () => {
    const addItemPayload = {
      productId: mockProductId,
      quantity: 2,
    };

    it('should add item to cart successfully', async () => {
      mockInventoryClient.checkStock.mockResolvedValue({
        available: true,
        stock: 100,
        requested: 2,
      });
      mockInventoryClient.getProduct.mockResolvedValue(mockProduct);
      
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.addItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [mockCartItem],
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [mockCartItem],
      });

      const response = await request(app)
        .post('/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(addItemPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Item added to cart successfully');
    });

    it('should return 400 for invalid product ID', async () => {
      const response = await request(app)
        .post('/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: 'invalid-id', quantity: 2 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid quantity', async () => {
      const response = await request(app)
        .post('/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: mockProductId, quantity: -1 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/cart/items')
        .send(addItemPayload);

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /cart/items/:itemId', () => {
    const updatePayload = { quantity: 5 };

    it('should update item quantity successfully', async () => {
      mockInventoryClient.checkStock.mockResolvedValue({
        available: true,
        stock: 100,
        requested: 5,
      });
      
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.updateItem as jest.Mock).mockResolvedValue({
        ...mockCartItem,
        quantity: 5,
        subtotal: new Decimal(499.95),
      });
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...mockCartItem, quantity: 5, subtotal: new Decimal(499.95) }],
        total: new Decimal(499.95),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...mockCartItem, quantity: 5, subtotal: new Decimal(499.95) }],
        total: new Decimal(499.95),
      });

      const response = await request(app)
        .put(`/cart/items/${mockItemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Item updated successfully');
    });

    it('should remove item when quantity is 0', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const response = await request(app)
        .put(`/cart/items/${mockItemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid item ID', async () => {
      const response = await request(app)
        .put('/cart/items/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatePayload);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /cart/items/:itemId', () => {
    it('should remove item from cart successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const response = await request(app)
        .delete(`/cart/items/${mockItemId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Item removed from cart successfully');
    });

    it('should return 400 for invalid item ID', async () => {
      const response = await request(app)
        .delete('/cart/items/invalid-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /cart', () => {
    it('should clear cart successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteAllItems as jest.Mock).mockResolvedValue({ count: 1 });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const response = await request(app)
        .delete('/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Cart cleared successfully');
    });

    it('should create new cart if none exists', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);
      (cartRepository.create as jest.Mock).mockResolvedValue({
        ...mockCart,
        id: 'new-cart-id',
        items: [],
        total: new Decimal(0),
      });

      const response = await request(app)
        .delete('/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /cart/merge', () => {
    const mergePayload = { sourceCartId: 'source-cart-123' };

    const sourceCart = {
      ...mockCart,
      id: 'source-cart-123',
      userId: 'anonymous-user',
      items: [{
        ...mockCartItem,
        id: 'source-item-123',
        productId: 'prod-456',
        productName: 'Another Product',
        productSku: 'TEST-002',
        quantity: 1,
        unitPrice: new Decimal(49.99),
        subtotal: new Decimal(49.99),
      }],
      total: new Decimal(49.99),
    };

    it('should merge carts successfully', async () => {
      mockInventoryClient.checkStock.mockResolvedValue({
        available: true,
        stock: 100,
        requested: 1,
      });
      
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.findById as jest.Mock)
        .mockResolvedValueOnce(sourceCart)
        .mockResolvedValue({
          ...mockCart,
          items: [...mockCart.items, sourceCart.items[0]],
          total: new Decimal(249.97),
        });
      (cartRepository.addItem as jest.Mock).mockResolvedValue(sourceCart.items[0]);
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [...mockCart.items, sourceCart.items[0]],
        total: new Decimal(249.97),
      });

      const response = await request(app)
        .post('/cart/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .send(mergePayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Carts merged successfully');
    });

    it('should return 400 for invalid source cart ID', async () => {
      const response = await request(app)
        .post('/cart/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sourceCartId: 'invalid-id' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      (redisClient.isReady as jest.Mock).mockReturnValue(true);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('service', 'cart-service');
    });
  });
});
