import request from 'supertest';
import express, { Application } from 'express';
import jwt from 'jsonwebtoken';

// Mock dependencies before imports
jest.mock('../../src/infrastructure/database/prisma');
jest.mock('../../src/infrastructure/cache/redis');
jest.mock('../../src/infrastructure/messaging/rabbitmq');

import { createApp } from '../../src/app';
import { getPrisma } from '../../src/infrastructure/database/prisma';
import { UserRole } from '../../src/presentation/middleware/auth';

describe('Report Routes Integration Tests', () => {
  let app: Application;
  let mockPrisma: jest.Mocked<any>;
  let adminToken: string;

  beforeAll(async () => {
    // Create admin token
    adminToken = jwt.sign(
      { 
        id: 'admin-1', 
        email: 'admin@example.com', 
        role: UserRole.ADMIN,
        permissions: ['reports:read', 'reports:export'],
      },
      process.env.JWT_SECRET || 'test-jwt-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    // Setup mock Prisma
    mockPrisma = {
      dailyMetric: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      productSales: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
      salesReport: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      processedEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    (getPrisma as jest.Mock).mockReturnValue(mockPrisma);

    // Create app
    app = createApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([1]);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('checks');
    });
  });

  describe('GET /reports/dashboard', () => {
    it('should return dashboard data for admin user', async () => {
      const mockDailyMetrics = [
        {
          id: '1',
          date: new Date(),
          totalOrders: 10,
          totalRevenue: { toString: () => '1000' },
          newCustomers: 5,
          topProductId: 'prod-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.dailyMetric.findMany.mockResolvedValue(mockDailyMetrics);
      mockPrisma.productSales.findMany.mockResolvedValue([]);
      mockPrisma.salesReport.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/reports/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('topProducts');
      expect(response.body.data).toHaveProperty('recentReports');
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/reports/dashboard')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app)
        .get('/reports/dashboard')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('GET /reports/sales', () => {
    it('should return paginated sales reports', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' },
          totalTax: { toString: () => '1000' },
          totalShipping: { toString: () => '500' },
          averageOrderValue: { toString: () => '100' },
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.salesReport.findMany.mockResolvedValue(mockReports);
      mockPrisma.salesReport.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/reports/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter by period', async () => {
      mockPrisma.salesReport.findMany.mockResolvedValue([]);
      mockPrisma.salesReport.count.mockResolvedValue(0);

      await request(app)
        .get('/reports/sales?period=DAILY')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockPrisma.salesReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ period: 'DAILY' }),
        })
      );
    });

    it('should validate date format', async () => {
      const response = await request(app)
        .get('/reports/sales?startDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /reports/products/top', () => {
    it('should return top products', async () => {
      const mockProducts = [
        {
          productId: 'prod-1',
          productName: 'Product 1',
          productSku: 'SKU-001',
          _sum: {
            quantity: 100,
            revenue: { toString: () => '10000' },
          },
        },
      ];

      mockPrisma.productSales.groupBy.mockResolvedValue(mockProducts);

      const response = await request(app)
        .get('/reports/products/top')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      mockPrisma.productSales.groupBy.mockResolvedValue([]);

      await request(app)
        .get('/reports/products/top?limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockPrisma.productSales.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });

  describe('GET /reports/revenue', () => {
    it('should return revenue data', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' },
          totalTax: { toString: () => '1000' },
          totalShipping: { toString: () => '500' },
          averageOrderValue: { toString: () => '100' },
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.salesReport.findMany.mockResolvedValue(mockReports);

      const response = await request(app)
        .get('/reports/revenue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('summary');
    });
  });

  describe('GET /reports/orders/metrics', () => {
    it('should return order metrics', async () => {
      const mockMetrics = [
        {
          id: '1',
          date: new Date(),
          totalOrders: 10,
          totalRevenue: { toString: () => '1000' },
          newCustomers: 5,
          topProductId: 'prod-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.dailyMetric.findMany.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/reports/orders/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalOrders');
      expect(response.body.data).toHaveProperty('ordersTrend');
    });
  });

  describe('GET /reports/export/:type', () => {
    it('should export as JSON', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' },
          totalTax: { toString: () => '1000' },
          totalShipping: { toString: () => '500' },
          averageOrderValue: { toString: () => '100' },
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.salesReport.findMany.mockResolvedValue(mockReports);

      const response = await request(app)
        .get('/reports/export/json')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should export as CSV', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' },
          totalTax: { toString: () => '1000' },
          totalShipping: { toString: () => '500' },
          averageOrderValue: { toString: () => '100' },
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.salesReport.findMany.mockResolvedValue(mockReports);

      const response = await request(app)
        .get('/reports/export/csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should return 400 for invalid export type', async () => {
      const response = await request(app)
        .get('/reports/export/invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
