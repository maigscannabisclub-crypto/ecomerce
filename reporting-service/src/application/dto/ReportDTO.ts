import Joi from 'joi';
import { ReportPeriod, ExportType } from '../../domain/entities/Report';

// ============================================
// Request DTOs
// ============================================

export interface GetSalesReportRequest {
  startDate?: string;
  endDate?: string;
  period?: ReportPeriod;
  page?: number;
  limit?: number;
}

export interface GetTopProductsRequest {
  startDate?: string;
  endDate?: string;
  period?: ReportPeriod;
  limit?: number;
}

export interface GetRevenueRequest {
  startDate?: string;
  endDate?: string;
  groupBy?: ReportPeriod;
}

export interface GetOrderMetricsRequest {
  startDate?: string;
  endDate?: string;
}

export interface ExportReportRequest {
  type: ExportType;
  startDate?: string;
  endDate?: string;
  period?: ReportPeriod;
}

// ============================================
// Validation Schemas
// ============================================

export const getSalesReportSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  period: Joi.string().valid(...Object.values(ReportPeriod)).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const getTopProductsSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  period: Joi.string().valid(...Object.values(ReportPeriod)).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

export const getRevenueSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  groupBy: Joi.string().valid(...Object.values(ReportPeriod)).default(ReportPeriod.DAILY),
});

export const getOrderMetricsSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
});

export const exportReportSchema = Joi.object({
  type: Joi.string().valid(...Object.values(ExportType)).required(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  period: Joi.string().valid(...Object.values(ReportPeriod)).optional(),
});

// ============================================
// Response DTOs
// ============================================

export interface SalesReportResponse {
  id: string;
  period: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalShipping: number;
  averageOrderValue: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSalesResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  period: ReportPeriod;
  periodStart: string;
  quantity: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyMetricResponse {
  id: string;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  newCustomers: number;
  topProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardResponse {
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalCustomers: number;
    revenueChange: number;
    ordersChange: number;
    aovChange: number;
  };
  topProducts: ProductSalesResponse[];
  recentReports: SalesReportResponse[];
  dailyMetrics: DailyMetricResponse[];
  periodStart: string;
  periodEnd: string;
}

export interface RevenueResponse {
  data: {
    period: string;
    periodStart: string;
    revenue: number;
    orders: number;
    tax: number;
    shipping: number;
  }[];
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalTax: number;
    totalShipping: number;
  };
  periodStart: string;
  periodEnd: string;
}

export interface OrderMetricsResponse {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageProcessingTime: number;
  ordersByStatus: Record<string, number>;
  ordersTrend: {
    date: string;
    count: number;
  }[];
  periodStart: string;
  periodEnd: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================
// Event DTOs
// ============================================

export interface OrderCompletedEvent {
  eventId: string;
  eventType: 'OrderCompleted';
  timestamp: string;
  payload: {
    orderId: string;
    customerId: string;
    items: {
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }[];
    totalAmount: number;
    tax: number;
    shipping: number;
    status: string;
    createdAt: string;
    completedAt: string;
  };
}

export interface OrderCancelledEvent {
  eventId: string;
  eventType: 'OrderCancelled';
  timestamp: string;
  payload: {
    orderId: string;
    customerId: string;
    items: {
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }[];
    totalAmount: number;
    tax: number;
    shipping: number;
    status: string;
    createdAt: string;
    cancelledAt: string;
    reason?: string;
  };
}

export type OrderEvent = OrderCompletedEvent | OrderCancelledEvent;

// ============================================
// CSV Export DTO
// ============================================

export interface CsvExportRow {
  [key: string]: string | number | boolean | null;
}

export interface ExportMetadata {
  filename: string;
  contentType: string;
  generatedAt: string;
  recordCount: number;
}
