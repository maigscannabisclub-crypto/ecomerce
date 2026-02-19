import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// Enums
// ============================================
export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum ExportType {
  JSON = 'json',
  CSV = 'csv',
}

// ============================================
// Value Objects
// ============================================
export interface Money {
  amount: number;
  currency: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ============================================
// Sales Report Entity
// ============================================
export interface SalesReportData {
  topCategories?: string[];
  paymentMethods?: Record<string, number>;
  growthRate?: number;
  [key: string]: unknown;
}

export interface SalesReportProps {
  id?: string;
  period: ReportPeriod;
  periodStart: Date;
  periodEnd: Date;
  totalOrders: number;
  totalRevenue: number | Decimal;
  totalTax: number | Decimal;
  totalShipping: number | Decimal;
  averageOrderValue: number | Decimal;
  data?: SalesReportData;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SalesReport {
  readonly id: string;
  readonly period: ReportPeriod;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly totalOrders: number;
  readonly totalRevenue: number;
  readonly totalTax: number;
  readonly totalShipping: number;
  readonly averageOrderValue: number;
  readonly data: SalesReportData;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SalesReportProps) {
    this.id = props.id || '';
    this.period = props.period;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.totalOrders = props.totalOrders;
    this.totalRevenue = this.normalizeDecimal(props.totalRevenue);
    this.totalTax = this.normalizeDecimal(props.totalTax);
    this.totalShipping = this.normalizeDecimal(props.totalShipping);
    this.averageOrderValue = this.normalizeDecimal(props.averageOrderValue);
    this.data = props.data || {};
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  private normalizeDecimal(value: number | Decimal): number {
    if (typeof value === 'number') return value;
    return parseFloat(value.toString());
  }

  static create(props: SalesReportProps): SalesReport {
    return new SalesReport(props);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      period: this.period,
      periodStart: this.periodStart.toISOString(),
      periodEnd: this.periodEnd.toISOString(),
      totalOrders: this.totalOrders,
      totalRevenue: this.totalRevenue,
      totalTax: this.totalTax,
      totalShipping: this.totalShipping,
      averageOrderValue: this.averageOrderValue,
      data: this.data,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

// ============================================
// Product Sales Entity
// ============================================
export interface ProductSalesProps {
  id?: string;
  productId: string;
  productName: string;
  productSku: string;
  period: ReportPeriod;
  periodStart: Date;
  quantity: number;
  revenue: number | Decimal;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProductSales {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly period: ReportPeriod;
  readonly periodStart: Date;
  readonly quantity: number;
  readonly revenue: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProductSalesProps) {
    this.id = props.id || '';
    this.productId = props.productId;
    this.productName = props.productName;
    this.productSku = props.productSku;
    this.period = props.period;
    this.periodStart = props.periodStart;
    this.quantity = props.quantity;
    this.revenue = this.normalizeDecimal(props.revenue);
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  private normalizeDecimal(value: number | Decimal): number {
    if (typeof value === 'number') return value;
    return parseFloat(value.toString());
  }

  static create(props: ProductSalesProps): ProductSales {
    return new ProductSales(props);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      productId: this.productId,
      productName: this.productName,
      productSku: this.productSku,
      period: this.period,
      periodStart: this.periodStart.toISOString(),
      quantity: this.quantity,
      revenue: this.revenue,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

// ============================================
// Daily Metric Entity
// ============================================
export interface DailyMetricProps {
  id?: string;
  date: Date;
  totalOrders: number;
  totalRevenue: number | Decimal;
  newCustomers: number;
  topProductId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class DailyMetric {
  readonly id: string;
  readonly date: Date;
  readonly totalOrders: number;
  readonly totalRevenue: number;
  readonly newCustomers: number;
  readonly topProductId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: DailyMetricProps) {
    this.id = props.id || '';
    this.date = props.date;
    this.totalOrders = props.totalOrders;
    this.totalRevenue = this.normalizeDecimal(props.totalRevenue);
    this.newCustomers = props.newCustomers;
    this.topProductId = props.topProductId || null;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  private normalizeDecimal(value: number | Decimal): number {
    if (typeof value === 'number') return value;
    return parseFloat(value.toString());
  }

  static create(props: DailyMetricProps): DailyMetric {
    return new DailyMetric(props);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      date: this.date.toISOString(),
      totalOrders: this.totalOrders,
      totalRevenue: this.totalRevenue,
      newCustomers: this.newCustomers,
      topProductId: this.topProductId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

// ============================================
// Processed Event Entity
// ============================================
export interface ProcessedEventProps {
  id?: string;
  eventId: string;
  eventType: string;
  processedAt?: Date;
}

export class ProcessedEvent {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly processedAt: Date;

  constructor(props: ProcessedEventProps) {
    this.id = props.id || '';
    this.eventId = props.eventId;
    this.eventType = props.eventType;
    this.processedAt = props.processedAt || new Date();
  }

  static create(props: ProcessedEventProps): ProcessedEvent {
    return new ProcessedEvent(props);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      eventId: this.eventId,
      eventType: this.eventType,
      processedAt: this.processedAt.toISOString(),
    };
  }
}

// ============================================
// Dashboard Summary Entity
// ============================================
export interface DashboardSummaryProps {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  revenueChange: number;
  ordersChange: number;
  aovChange: number;
  topProducts: ProductSales[];
  recentReports: SalesReport[];
  dailyMetrics: DailyMetric[];
  periodStart: Date;
  periodEnd: Date;
}

export class DashboardSummary {
  readonly totalRevenue: number;
  readonly totalOrders: number;
  readonly averageOrderValue: number;
  readonly totalCustomers: number;
  readonly revenueChange: number;
  readonly ordersChange: number;
  readonly aovChange: number;
  readonly topProducts: ProductSales[];
  readonly recentReports: SalesReport[];
  readonly dailyMetrics: DailyMetric[];
  readonly periodStart: Date;
  readonly periodEnd: Date;

  constructor(props: DashboardSummaryProps) {
    this.totalRevenue = props.totalRevenue;
    this.totalOrders = props.totalOrders;
    this.averageOrderValue = props.averageOrderValue;
    this.totalCustomers = props.totalCustomers;
    this.revenueChange = props.revenueChange;
    this.ordersChange = props.ordersChange;
    this.aovChange = props.aovChange;
    this.topProducts = props.topProducts;
    this.recentReports = props.recentReports;
    this.dailyMetrics = props.dailyMetrics;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
  }

  static create(props: DashboardSummaryProps): DashboardSummary {
    return new DashboardSummary(props);
  }

  toJSON(): Record<string, unknown> {
    return {
      totalRevenue: this.totalRevenue,
      totalOrders: this.totalOrders,
      averageOrderValue: this.averageOrderValue,
      totalCustomers: this.totalCustomers,
      revenueChange: this.revenueChange,
      ordersChange: this.ordersChange,
      aovChange: this.aovChange,
      topProducts: this.topProducts.map(p => p.toJSON()),
      recentReports: this.recentReports.map(r => r.toJSON()),
      dailyMetrics: this.dailyMetrics.map(m => m.toJSON()),
      periodStart: this.periodStart.toISOString(),
      periodEnd: this.periodEnd.toISOString(),
    };
  }
}
