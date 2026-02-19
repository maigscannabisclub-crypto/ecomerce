import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { 
  SalesReport, 
  ProductSales, 
  DailyMetric, 
  DashboardSummary,
  ReportPeriod 
} from '../../domain/entities/Report';
import { 
  SalesReportResponse,
  ProductSalesResponse,
  DailyMetricResponse,
  DashboardResponse,
  RevenueResponse,
  OrderMetricsResponse,
  PaginatedResponse,
  GetSalesReportRequest,
  GetTopProductsRequest,
  GetRevenueRequest,
  GetOrderMetricsRequest,
  ExportType,
  CsvExportRow,
  ExportMetadata,
} from '../dto/ReportDTO';
import { getPrisma } from '../../infrastructure/database/prisma';
import { 
  getOrSetCache, 
  buildCacheKey,
  setCache,
  getCache,
} from '../../infrastructure/cache/redis';
import config from '../../config';
import logger from '../../utils/logger';

// ============================================
// Report Service
// ============================================

export class ReportService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrisma();
  }

  // ============================================
  // Dashboard
  // ============================================
  async getDashboard(): Promise<DashboardResponse> {
    const cacheKey = buildCacheKey.dashboard();
    
    return getOrSetCache(
      cacheKey,
      async () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Get daily metrics for the last 30 days
        const dailyMetrics = await this.prisma.dailyMetric.findMany({
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { date: 'asc' },
        });

        // Get top products
        const topProducts = await this.prisma.productSales.findMany({
          where: {
            periodStart: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { revenue: 'desc' },
          take: 5,
        });

        // Get recent reports
        const recentReports = await this.prisma.salesReport.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        // Calculate summary metrics
        const currentPeriod = dailyMetrics.slice(-7);
        const previousPeriod = dailyMetrics.slice(-14, -7);

        const currentRevenue = currentPeriod.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
        const previousRevenue = previousPeriod.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
        
        const currentOrders = currentPeriod.reduce((sum, m) => sum + m.totalOrders, 0);
        const previousOrders = previousPeriod.reduce((sum, m) => sum + m.totalOrders, 0);

        const revenueChange = previousRevenue > 0 
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
          : 0;
        
        const ordersChange = previousOrders > 0 
          ? ((currentOrders - previousOrders) / previousOrders) * 100 
          : 0;

        const totalRevenue = dailyMetrics.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
        const totalOrders = dailyMetrics.reduce((sum, m) => sum + m.totalOrders, 0);
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const previousAOV = previousOrders > 0 ? previousRevenue / previousOrders : 0;
        const aovChange = previousAOV > 0 
          ? ((averageOrderValue - previousAOV) / previousAOV) * 100 
          : 0;

        return {
          summary: {
            totalRevenue,
            totalOrders,
            averageOrderValue,
            totalCustomers: dailyMetrics.reduce((sum, m) => sum + m.newCustomers, 0),
            revenueChange: Math.round(revenueChange * 100) / 100,
            ordersChange: Math.round(ordersChange * 100) / 100,
            aovChange: Math.round(aovChange * 100) / 100,
          },
          topProducts: topProducts.map(p => this.mapProductSalesToResponse(p)),
          recentReports: recentReports.map(r => this.mapSalesReportToResponse(r)),
          dailyMetrics: dailyMetrics.map(m => this.mapDailyMetricToResponse(m)),
          periodStart: startDate.toISOString(),
          periodEnd: endDate.toISOString(),
        };
      },
      { ttl: config.cache.ttlDashboard, tags: ['dashboard'] }
    );
  }

  // ============================================
  // Sales Reports
  // ============================================
  async getSalesReports(
    params: GetSalesReportRequest
  ): Promise<PaginatedResponse<SalesReportResponse>> {
    const { startDate, endDate, period, page = 1, limit = 20 } = params;

    const where: Prisma.SalesReportWhereInput = {};

    if (startDate || endDate) {
      where.periodStart = {};
      if (startDate) {
        where.periodStart.gte = new Date(startDate);
      }
      if (endDate) {
        where.periodStart.lte = new Date(endDate);
      }
    }

    if (period) {
      where.period = period;
    }

    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.salesReport.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.salesReport.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reports.map(r => this.mapSalesReportToResponse(r)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ============================================
  // Top Products
  // ============================================
  async getTopProducts(
    params: GetTopProductsRequest
  ): Promise<ProductSalesResponse[]> {
    const { startDate, endDate, period, limit = 10 } = params;

    const cacheKey = buildCacheKey.topProducts(
      period || 'ALL',
      startDate || 'ALL',
      limit
    );

    return getOrSetCache(
      cacheKey,
      async () => {
        const where: Prisma.ProductSalesWhereInput = {};

        if (startDate || endDate) {
          where.periodStart = {};
          if (startDate) {
            where.periodStart.gte = new Date(startDate);
          }
          if (endDate) {
            where.periodStart.lte = new Date(endDate);
          }
        }

        if (period) {
          where.period = period;
        }

        // Aggregate by product
        const products = await this.prisma.productSales.groupBy({
          by: ['productId', 'productName', 'productSku'],
          where,
          _sum: {
            quantity: true,
            revenue: true,
          },
          orderBy: {
            _sum: {
              revenue: 'desc',
            },
          },
          take: limit,
        });

        return products.map((p, index) => ({
          id: `agg-${index}`,
          productId: p.productId,
          productName: p.productName,
          productSku: p.productSku,
          period: period || ReportPeriod.DAILY,
          periodStart: startDate || new Date().toISOString(),
          quantity: p._sum.quantity || 0,
          revenue: Number(p._sum.revenue) || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      },
      { ttl: config.cache.ttlReport, tags: ['products'] }
    );
  }

  // ============================================
  // Revenue Reports
  // ============================================
  async getRevenue(params: GetRevenueRequest): Promise<RevenueResponse> {
    const { startDate, endDate, groupBy = ReportPeriod.DAILY } = params;

    const cacheKey = buildCacheKey.revenue(
      startDate || 'ALL',
      endDate || 'ALL',
      groupBy
    );

    return getOrSetCache(
      cacheKey,
      async () => {
        const where: Prisma.SalesReportWhereInput = {
          period: groupBy,
        };

        if (startDate || endDate) {
          where.periodStart = {};
          if (startDate) {
            where.periodStart.gte = new Date(startDate);
          }
          if (endDate) {
            where.periodStart.lte = new Date(endDate);
          }
        }

        const reports = await this.prisma.salesReport.findMany({
          where,
          orderBy: { periodStart: 'asc' },
        });

        const data = reports.map(r => ({
          period: r.period,
          periodStart: r.periodStart.toISOString(),
          revenue: Number(r.totalRevenue),
          orders: r.totalOrders,
          tax: Number(r.totalTax),
          shipping: Number(r.totalShipping),
        }));

        const summary = {
          totalRevenue: data.reduce((sum, d) => sum + d.revenue, 0),
          totalOrders: data.reduce((sum, d) => sum + d.orders, 0),
          averageOrderValue: 0,
          totalTax: data.reduce((sum, d) => sum + d.tax, 0),
          totalShipping: data.reduce((sum, d) => sum + d.shipping, 0),
        };

        summary.averageOrderValue = summary.totalOrders > 0 
          ? summary.totalRevenue / summary.totalOrders 
          : 0;

        return {
          data,
          summary,
          periodStart: startDate || reports[0]?.periodStart.toISOString() || new Date().toISOString(),
          periodEnd: endDate || reports[reports.length - 1]?.periodStart.toISOString() || new Date().toISOString(),
        };
      },
      { ttl: config.cache.ttlReport, tags: ['revenue'] }
    );
  }

  // ============================================
  // Order Metrics
  // ============================================
  async getOrderMetrics(params: GetOrderMetricsRequest): Promise<OrderMetricsResponse> {
    const { startDate, endDate } = params;

    const cacheKey = buildCacheKey.orderMetrics(
      startDate || 'ALL',
      endDate || 'ALL'
    );

    return getOrSetCache(
      cacheKey,
      async () => {
        const where: Prisma.DailyMetricWhereInput = {};

        if (startDate || endDate) {
          where.date = {};
          if (startDate) {
            where.date.gte = new Date(startDate);
          }
          if (endDate) {
            where.date.lte = new Date(endDate);
          }
        }

        const metrics = await this.prisma.dailyMetric.findMany({
          where,
          orderBy: { date: 'asc' },
        });

        const totalOrders = metrics.reduce((sum, m) => sum + m.totalOrders, 0);

        // Calculate orders trend
        const ordersTrend = metrics.map(m => ({
          date: m.date.toISOString().split('T')[0],
          count: m.totalOrders,
        }));

        return {
          totalOrders,
          completedOrders: Math.floor(totalOrders * 0.95), // Estimated
          cancelledOrders: Math.floor(totalOrders * 0.05), // Estimated
          averageProcessingTime: 24, // Placeholder
          ordersByStatus: {
            completed: Math.floor(totalOrders * 0.95),
            cancelled: Math.floor(totalOrders * 0.05),
          },
          ordersTrend,
          periodStart: startDate || metrics[0]?.date.toISOString() || new Date().toISOString(),
          periodEnd: endDate || metrics[metrics.length - 1]?.date.toISOString() || new Date().toISOString(),
        };
      },
      { ttl: config.cache.ttlMetrics, tags: ['metrics'] }
    );
  }

  // ============================================
  // Export Reports
  // ============================================
  async exportReport(
    type: ExportType,
    params: GetSalesReportRequest
  ): Promise<{ data: string; metadata: ExportMetadata }> {
    const { startDate, endDate, period } = params;

    // Fetch data for export
    const where: Prisma.SalesReportWhereInput = {};

    if (startDate || endDate) {
      where.periodStart = {};
      if (startDate) {
        where.periodStart.gte = new Date(startDate);
      }
      if (endDate) {
        where.periodStart.lte = new Date(endDate);
      }
    }

    if (period) {
      where.period = period;
    }

    const reports = await this.prisma.salesReport.findMany({
      where,
      orderBy: { periodStart: 'asc' },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (type === ExportType.CSV) {
      const csv = this.convertToCSV(reports);
      return {
        data: csv,
        metadata: {
          filename: `sales-report-${timestamp}.csv`,
          contentType: 'text/csv',
          generatedAt: new Date().toISOString(),
          recordCount: reports.length,
        },
      };
    } else {
      return {
        data: JSON.stringify(reports.map(r => this.mapSalesReportToResponse(r)), null, 2),
        metadata: {
          filename: `sales-report-${timestamp}.json`,
          contentType: 'application/json',
          generatedAt: new Date().toISOString(),
          recordCount: reports.length,
        },
      };
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private mapSalesReportToResponse(report: {
    id: string;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    totalOrders: number;
    totalRevenue: Decimal;
    totalTax: Decimal;
    totalShipping: Decimal;
    averageOrderValue: Decimal;
    data: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): SalesReportResponse {
    return {
      id: report.id,
      period: report.period as ReportPeriod,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      totalOrders: report.totalOrders,
      totalRevenue: Number(report.totalRevenue),
      totalTax: Number(report.totalTax),
      totalShipping: Number(report.totalShipping),
      averageOrderValue: Number(report.averageOrderValue),
      data: report.data as Record<string, unknown> || {},
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private mapProductSalesToResponse(product: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    period: string;
    periodStart: Date;
    quantity: number;
    revenue: Decimal;
    createdAt: Date;
    updatedAt: Date;
  }): ProductSalesResponse {
    return {
      id: product.id,
      productId: product.productId,
      productName: product.productName,
      productSku: product.productSku,
      period: product.period as ReportPeriod,
      periodStart: product.periodStart.toISOString(),
      quantity: product.quantity,
      revenue: Number(product.revenue),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private mapDailyMetricToResponse(metric: {
    id: string;
    date: Date;
    totalOrders: number;
    totalRevenue: Decimal;
    newCustomers: number;
    topProductId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DailyMetricResponse {
    return {
      id: metric.id,
      date: metric.date.toISOString(),
      totalOrders: metric.totalOrders,
      totalRevenue: Number(metric.totalRevenue),
      newCustomers: metric.newCustomers,
      topProductId: metric.topProductId,
      createdAt: metric.createdAt.toISOString(),
      updatedAt: metric.updatedAt.toISOString(),
    };
  }

  private convertToCSV(reports: Array<{
    id: string;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    totalOrders: number;
    totalRevenue: Decimal;
    totalTax: Decimal;
    totalShipping: Decimal;
    averageOrderValue: Decimal;
  }>): string {
    const headers = [
      'ID',
      'Period',
      'Period Start',
      'Period End',
      'Total Orders',
      'Total Revenue',
      'Total Tax',
      'Total Shipping',
      'Average Order Value',
    ];

    const rows = reports.map(r => [
      r.id,
      r.period,
      r.periodStart.toISOString(),
      r.periodEnd.toISOString(),
      r.totalOrders,
      Number(r.totalRevenue).toFixed(2),
      Number(r.totalTax).toFixed(2),
      Number(r.totalShipping).toFixed(2),
      Number(r.averageOrderValue).toFixed(2),
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

// ============================================
// Service Factory
// ============================================

let reportService: ReportService | null = null;

export const getReportService = (): ReportService => {
  if (!reportService) {
    reportService = new ReportService();
  }
  return reportService;
};

export default getReportService;
