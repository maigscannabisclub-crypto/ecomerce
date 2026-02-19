import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app';
import jwt from 'jsonwebtoken';
import config from '../../src/config';

// Mock external dependencies
jest.mock('../../src/infrastructure/database/prisma', () => ({
  __esModule: true,
  default: {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    subcategory: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn()
  }
}));

jest.mock('../../src/infrastructure/cache/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    deletePattern: jest.fn(),
    invalidateProductCache: jest.fn(),
    generateProductKey: jest.fn((id) => `products:${id}`),
    generateProductListKey: jest.fn(() => 'products:list:test'),
    checkHealth: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../../src/infrastructure/messaging/rabbitmq', () => ({
  __esModule: true,
  default: {
    publishProductCreated: jest.fn().mockResolvedValue(true),
    publishProductUpdated: jest.fn().mockResolvedValue(true),
    publishProductDeleted: jest.fn().mockResolvedValue(true),
    publishProductStockChanged: jest.fn().mockResolvedValue(true),
    checkHealth: jest.fn().mockResolvedValue(true)
  }
}));

// Import mocked prisma
import prisma from '../../src/infrastructure/database/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Generate test JWT token
const generateTestToken = (role: string = 'ADMIN') => {
  return jwt.sign(
    { userId: 'test-user-id', email: 'test@example.com', role },
    config.jwt.secret,
    { issuer: config.jwt.issuer }
  );
};

describe('Product API Integration Tests', () => {
  const adminToken = generateTestToken('ADMIN');
  const userToken = generateTestToken('USER');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    it('GET /api/v1/health - should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('checks');
    });
  });

  describe('Public Endpoints', () => {
    describe('GET /api/v1/products', () => {
      it('should return list of products', async () => {
        const mockProducts = [
          {
            id: 'prod-1',
            sku: 'TEST-001',
            name: 'Test Product 1',
            description: 'Description 1',
            price: { toString: () => '10.00' },
            stock: 5,
            images: [],
            categoryId: 'cat-1',
            subcategoryId: 'sub-1',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            category: { id: 'cat-1', name: 'Category 1', slug: 'category-1', description: null, createdAt: new Date(), updatedAt: new Date() },
            subcategory: { id: 'sub-1', name: 'Subcategory 1', slug: 'subcategory-1', categoryId: 'cat-1', createdAt: new Date(), updatedAt: new Date() }
          }
        ];

        mockPrisma.product.count = jest.fn().mockResolvedValue(1);
        mockPrisma.product.findMany = jest.fn().mockResolvedValue(mockProducts);

        const response = await request(app)
          .get('/api/v1/products')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.meta).toHaveProperty('pagination');
      });

      it('should support pagination', async () => {
        mockPrisma.product.count = jest.fn().mockResolvedValue(0);
        mockPrisma.product.findMany = jest.fn().mockResolvedValue([]);

        const response = await request(app)
          .get('/api/v1/products?page=2&limit=5')
          .expect(200);

        expect(response.body.meta.pagination.page).toBe(2);
        expect(response.body.meta.pagination.limit).toBe(5);
      });

      it('should filter by category', async () => {
        mockPrisma.product.count = jest.fn().mockResolvedValue(0);
        mockPrisma.product.findMany = jest.fn().mockResolvedValue([]);

        await request(app)
          .get('/api/v1/products?categoryId=cat-123')
          .expect(200);

        expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ categoryId: 'cat-123', isActive: true })
          })
        );
      });
    });

    describe('GET /api/v1/products/:id', () => {
      it('should return product by ID', async () => {
        const mockProduct = {
          id: 'prod-1',
          sku: 'TEST-001',
          name: 'Test Product',
          description: 'Description',
          price: { toString: () => '10.00' },
          stock: 5,
          images: [],
          categoryId: 'cat-1',
          subcategoryId: 'sub-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Category 1', slug: 'category-1', description: null, createdAt: new Date(), updatedAt: new Date() },
          subcategory: { id: 'sub-1', name: 'Subcategory 1', slug: 'subcategory-1', categoryId: 'cat-1', createdAt: new Date(), updatedAt: new Date() }
        };

        mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);

        const response = await request(app)
          .get('/api/v1/products/prod-1')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe('prod-1');
      });

      it('should return 404 for non-existent product', async () => {
        mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .get('/api/v1/products/non-existent')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
      });

      it('should validate UUID format', async () => {
        const response = await request(app)
          .get('/api/v1/products/invalid-id')
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/v1/products/search', () => {
      it('should search products', async () => {
        mockPrisma.product.count = jest.fn().mockResolvedValue(0);
        mockPrisma.product.findMany = jest.fn().mockResolvedValue([]);

        const response = await request(app)
          .get('/api/v1/products/search?q=test')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.meta.search).toBe('test');
      });

      it('should require search query', async () => {
        const response = await request(app)
          .get('/api/v1/products/search')
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/v1/categories', () => {
      it('should return all categories', async () => {
        const mockCategories = [
          {
            id: 'cat-1',
            name: 'Category 1',
            slug: 'category-1',
            description: null,
            subcategories: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { products: 5 }
          }
        ];

        mockPrisma.category.findMany = jest.fn().mockResolvedValue(mockCategories);

        const response = await request(app)
          .get('/api/v1/categories')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
      });
    });
  });

  describe('Protected Endpoints (Admin Only)', () => {
    describe('POST /api/v1/products', () => {
      it('should create product with valid admin token', async () => {
        const newProduct = {
          id: 'prod-new',
          sku: 'NEW-001',
          name: 'New Product',
          description: 'New Description',
          price: { toString: () => '99.99' },
          stock: 10,
          images: ['https://example.com/image.jpg'],
          categoryId: 'cat-1',
          subcategoryId: 'sub-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Category 1', slug: 'category-1', description: null, createdAt: new Date(), updatedAt: new Date() },
          subcategory: { id: 'sub-1', name: 'Subcategory 1', slug: 'subcategory-1', categoryId: 'cat-1', createdAt: new Date(), updatedAt: new Date() }
        };

        mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);
        mockPrisma.category.findUnique = jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Category 1', slug: 'category-1', description: null, createdAt: new Date(), updatedAt: new Date() });
        mockPrisma.subcategory.findUnique = jest.fn().mockResolvedValue({ id: 'sub-1', name: 'Subcategory 1', slug: 'subcategory-1', categoryId: 'cat-1', createdAt: new Date(), updatedAt: new Date() });
        mockPrisma.product.create = jest.fn().mockResolvedValue(newProduct);

        const response = await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            sku: 'NEW-001',
            name: 'New Product',
            description: 'New Description',
            price: 99.99,
            stock: 10,
            images: ['https://example.com/image.jpg'],
            categoryId: 'cat-1',
            subcategoryId: 'sub-1'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sku).toBe('NEW-001');
      });

      it('should reject without token', async () => {
        const response = await request(app)
          .post('/api/v1/products')
          .send({
            sku: 'NEW-001',
            name: 'New Product',
            description: 'New Description',
            price: 99.99,
            stock: 10,
            categoryId: 'cat-1',
            subcategoryId: 'sub-1'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should reject with non-admin token', async () => {
        const response = await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            sku: 'NEW-001',
            name: 'New Product',
            description: 'New Description',
            price: 99.99,
            stock: 10,
            categoryId: 'cat-1',
            subcategoryId: 'sub-1'
          })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('FORBIDDEN');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'New Product'
            // Missing required fields
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('PUT /api/v1/products/:id', () => {
      it('should update product with admin token', async () => {
        const existingProduct = {
          id: 'prod-1',
          sku: 'TEST-001',
          name: 'Old Name',
          description: 'Old Description',
          price: 50.00,
          stock: 10,
          images: [],
          categoryId: 'cat-1',
          subcategoryId: 'sub-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const updatedProduct = {
          ...existingProduct,
          name: 'Updated Name',
          price: { toString: () => '75.00' },
          category: { id: 'cat-1', name: 'Category 1', slug: 'category-1', description: null, createdAt: new Date(), updatedAt: new Date() },
          subcategory: { id: 'sub-1', name: 'Subcategory 1', slug: 'subcategory-1', categoryId: 'cat-1', createdAt: new Date(), updatedAt: new Date() }
        };

        mockPrisma.product.findUnique = jest.fn()
          .mockResolvedValueOnce(existingProduct)
          .mockResolvedValueOnce(null);
        mockPrisma.product.update = jest.fn().mockResolvedValue(updatedProduct);

        const response = await request(app)
          .put('/api/v1/products/prod-1')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Updated Name', price: 75.00 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Updated Name');
      });
    });

    describe('DELETE /api/v1/products/:id', () => {
      it('should delete product with admin token', async () => {
        const mockProduct = {
          id: 'prod-1',
          sku: 'TEST-001',
          name: 'Test Product',
          categoryId: 'cat-1',
          subcategoryId: 'sub-1'
        };

        mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);
        mockPrisma.product.delete = jest.fn().mockResolvedValue(mockProduct);

        const response = await request(app)
          .delete('/api/v1/products/prod-1')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.meta.message).toBe('Product deleted successfully');
      });
    });

    describe('POST /api/v1/categories', () => {
      it('should create category with admin token', async () => {
        const newCategory = {
          id: 'cat-new',
          name: 'New Category',
          slug: 'new-category',
          description: 'New Description',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        mockPrisma.category.findUnique = jest.fn().mockResolvedValue(null);
        mockPrisma.category.create = jest.fn().mockResolvedValue(newCategory);

        const response = await request(app)
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'New Category',
            slug: 'new-category',
            description: 'New Description'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.slug).toBe('new-category');
      });

      it('should validate slug format', async () => {
        const response = await request(app)
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'New Category',
            slug: 'Invalid Slug With Spaces'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
