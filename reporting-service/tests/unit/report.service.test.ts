import { ReportService } from '../../src/application/services/ReportService';
import { ReportPeriod } from '../../src/domain/entities/Report';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('../../src/infrastructure/database/prisma', () => ({
  getPrisma: jest.fn(),
}));

// Mock Redis cache
jest.mock('../../src/infrastructure/cache/redis', () => ({
  getOrSetCache: jest.fn((key, factory) => factory()),
  setCache: jest.fn(),
  getCache: jest.fn(),
  buildCacheKey: {
    dashboard: () => 'dashboard:summary',
    topProducts: (period: string, startDate: string, limit: number) => 
      `products:top:${period}:${startDate}:${limit}`,
    revenue: (startDate: string, endDate: string, groupBy: string) => 
      `revenue:${startDate}:${endDate}:${groupBy}`,
    orderMetrics: (startDate: string, endDate: string) => 
      `metrics:orders:${startDate}:${endDate}`,
  },
}));

import { getPrisma } from '../../src/infrastructure/database/prisma';

describe('ReportService', () => {
  let reportService: ReportService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    // Create mock Prisma client
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
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    } as unknown as jest.Mocked<PrismaClient>;

    (getPrisma as jest.Mock).mockReturnValue(mockPrisma);
    reportService = new ReportService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should return dashboard data with summary metrics', async () => {
      const mockDailyMetrics = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          totalOrders: 10,
          totalRevenue: { toString: () => '1000' } as any,
          newCustomers: 5,
          topProductId: 'prod-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          date: new Date('2024-01-02'),
          totalOrders: 15,
          totalRevenue: { toString: () => '1500' } as any,
          newCustomers: 3,
          topProductId: 'prod-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockTopProducts = [
        {
          id: '1',
          productId: 'prod-1',
          productName: 'Product 1',
          productSku: 'SKU-001',
          period: 'DAILY',
          periodStart: new Date(),
          quantity: 50,
          revenue: { toString: () => '5000' } as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockRecentReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' } as any,
          totalTax: { toString: () => '1000' } as any,
          totalShipping: { toString: () => '500' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.dailyMetric.findMany as jest.Mock).mockResolvedValue(mockDailyMetrics);
      (mockPrisma.productSales.findMany as jest.Mock).mockResolvedValue(mockTopProducts);
      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue(mockRecentReports);

      const result = await reportService.getDashboard();

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('topProducts');
      expect(result).toHaveProperty('recentReports');
      expect(result).toHaveProperty('dailyMetrics');
      expect(result.summary).toHaveProperty('totalRevenue');
      expect(result.summary).toHaveProperty('totalOrders');
      expect(result.summary).toHaveProperty('averageOrderValue');
    });

    it('should handle empty data gracefully', async () => {
      (mockPrisma.dailyMetric.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.productSales.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue([]);

      const result = await reportService.getDashboard();

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalOrders).toBe(0);
      expect(result.topProducts).toHaveLength(0);
    });
  });

  describe('getSalesReports', () => {
    it('should return paginated sales reports', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' } as any,
          totalTax: { toString: () => '1000' } as any,
          totalShipping: { toString: () => '500' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue(mockReports);
      (mockPrisma.salesReport.count as jest.Mock).mockResolvedValue(1);

      const result = await reportService.getSalesReports({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should filter by period', async () => {
      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.salesReport.count as jest.Mock).mockResolvedValue(0);

      await reportService.getSalesReports({ period: ReportPeriod.WEEKLY });

      expect(mockPrisma.salesReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ period: 'WEEKLY' }),
        })
      );
    });
  });

  describe('getTopProducts', () => {
    it('should return top selling products', async () => {
      const mockProducts = [
        {
          productId: 'prod-1',
          productName: 'Product 1',
          productSku: 'SKU-001',
          _sum: {
            quantity: 100,
            revenue: { toString: () => '10000' } as any,
          },
        },
        {
          productId: 'prod-2',
          productName: 'Product 2',
          productSku: 'SKU-002',
          _sum: {
            quantity: 50,
            revenue: { toString: () => '5000' } as any,
          },
        },
      ];

      (mockPrisma.productSales.groupBy as jest.Mock).mockResolvedValue(mockProducts);

      const result = await reportService.getTopProducts({ limit: 5 });

      expect(result).toHaveLength(2);
      expect(result[0].productName).toBe('Product 1');
      expect(result[0].quantity).toBe(100);
    });
  });

  describe('getRevenue', () => {
    it('should return revenue data grouped by period', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' } as any,
          totalTax: { toString: () => '1000' } as any,
          totalShipping: { toString: () => '500' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          period: 'DAILY',
          periodStart: new Date('2024-01-02'),
          periodEnd: new Date(),
          totalOrders: 150,
          totalRevenue: { toString: () => '15000' } as any,
          totalTax: { toString: () => '1500' } as any,
          totalShipping: { toString: () => '750' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue(mockReports);

      const result = await reportService.getRevenue({ groupBy: ReportPeriod.DAILY });

      expect(result.data).toHaveLength(2);
      expect(result.summary.totalRevenue).toBe(25000);
      expect(result.summary.totalOrders).toBe(250);
    });
  });

  describe('getOrderMetrics', () => {
    it('should return order metrics', async () => {
      const mockMetrics = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          totalOrders: 10,
          totalRevenue: { toString: () => '1000' } as any,
          newCustomers: 5,
          topProductId: 'prod-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          date: new Date('2024-01-02'),
          totalOrders: 15,
          totalRevenue: { toString: () => '1500' } as any,
          newCustomers: 3,
          topProductId: 'prod-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.dailyMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await reportService.getOrderMetrics({});

      expect(result.totalOrders).toBe(25);
      expect(result.ordersTrend).toHaveLength(2);
    });
  });

  describe('exportReport', () => {
    it('should export report as JSON', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' } as any,
          totalTax: { toString: () => '1000' } as any,
          totalShipping: { toString: () => '500' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue(mockReports);

      const result = await reportService.exportReport('json' as any, {});

      expect(result.metadata.contentType).toBe('application/json');
      expect(result.metadata.recordCount).toBe(1);
      expect(JSON.parse(result.data)).toHaveLength(1);
    });

    it('should export report as CSV', async () => {
      const mockReports = [
        {
          id: '1',
          period: 'DAILY',
          periodStart: new Date(),
          periodEnd: new Date(),
          totalOrders: 100,
          totalRevenue: { toString: () => '10000' } as any,
          totalTax: { toString: () => '1000' } as any,
          totalShipping: { toString: () => '500' } as any,
          averageOrderValue: { toString: () => '100' } as any,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.salesReport.findMany as jest.Mock).mockResolvedValue(mockReports);

      const result = await reportService.exportReport('csv' as any, {});

      expect(result.metadata.contentType).toBe('text/csv');
      expect(result.data).toContain('ID,Period');
      expect(result.data).toContain('DAILY');
    });
  });
});
