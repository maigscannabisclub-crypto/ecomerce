import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../../application/services/ReportService';
import { 
  getSalesReportSchema,
  getTopProductsSchema,
  getRevenueSchema,
  getOrderMetricsSchema,
  exportReportSchema,
} from '../../application/dto/ReportDTO';
import { ExportType } from '../../domain/entities/Report';
import logger, { createRequestLogger } from '../../utils/logger';

// ============================================
// Report Controller
// ============================================

export class ReportController {
  private reportService: ReportService;

  constructor(reportService: ReportService) {
    this.reportService = reportService;
  }

  // ============================================
  // Dashboard
  // ============================================
  getDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Getting dashboard data');

      const dashboard = await this.reportService.getDashboard();

      reqLogger.info('Dashboard data retrieved successfully');

      res.status(200).json({
        success: true,
        data: dashboard,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      reqLogger.error('Error getting dashboard data', error);
      next(error);
    }
  };

  // ============================================
  // Sales Reports
  // ============================================
  getSalesReports = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Getting sales reports', { query: req.query });

      const { error, value } = getSalesReportSchema.validate(req.query);

      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: { requestId },
        });
        return;
      }

      const reports = await this.reportService.getSalesReports(value);

      reqLogger.info('Sales reports retrieved successfully', {
        count: reports.data.length,
        total: reports.pagination.total,
      });

      res.status(200).json({
        success: true,
        data: reports.data,
        pagination: reports.pagination,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      reqLogger.error('Error getting sales reports', error);
      next(error);
    }
  };

  // ============================================
  // Top Products
  // ============================================
  getTopProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Getting top products', { query: req.query });

      const { error, value } = getTopProductsSchema.validate(req.query);

      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: { requestId },
        });
        return;
      }

      const products = await this.reportService.getTopProducts(value);

      reqLogger.info('Top products retrieved successfully', {
        count: products.length,
      });

      res.status(200).json({
        success: true,
        data: products,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          count: products.length,
        },
      });
    } catch (error) {
      reqLogger.error('Error getting top products', error);
      next(error);
    }
  };

  // ============================================
  // Revenue
  // ============================================
  getRevenue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Getting revenue data', { query: req.query });

      const { error, value } = getRevenueSchema.validate(req.query);

      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: { requestId },
        });
        return;
      }

      const revenue = await this.reportService.getRevenue(value);

      reqLogger.info('Revenue data retrieved successfully', {
        dataPoints: revenue.data.length,
      });

      res.status(200).json({
        success: true,
        data: revenue,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      reqLogger.error('Error getting revenue data', error);
      next(error);
    }
  };

  // ============================================
  // Order Metrics
  // ============================================
  getOrderMetrics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Getting order metrics', { query: req.query });

      const { error, value } = getOrderMetricsSchema.validate(req.query);

      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: { requestId },
        });
        return;
      }

      const metrics = await this.reportService.getOrderMetrics(value);

      reqLogger.info('Order metrics retrieved successfully');

      res.status(200).json({
        success: true,
        data: metrics,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      reqLogger.error('Error getting order metrics', error);
      next(error);
    }
  };

  // ============================================
  // Export Report
  // ============================================
  exportReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const reqLogger = createRequestLogger(requestId, req.user?.id);

    try {
      reqLogger.info('Exporting report', { params: req.params, query: req.query });

      const type = req.params.type as ExportType;

      const { error, value } = exportReportSchema.validate({
        type,
        ...req.query,
      });

      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: { requestId },
        });
        return;
      }

      const { data, metadata } = await this.reportService.exportReport(
        type,
        {
          startDate: value.startDate,
          endDate: value.endDate,
          period: value.period,
        }
      );

      reqLogger.info('Report exported successfully', {
        filename: metadata.filename,
        recordCount: metadata.recordCount,
      });

      res.setHeader('Content-Type', metadata.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-Generated-At', metadata.generatedAt);
      res.setHeader('X-Record-Count', metadata.recordCount.toString());

      res.status(200).send(data);
    } catch (error) {
      reqLogger.error('Error exporting report', error);
      next(error);
    }
  };
}

// ============================================
// Controller Factory
// ============================================

import { getReportService } from '../../application/services/ReportService';

let reportController: ReportController | null = null;

export const getReportController = (): ReportController => {
  if (!reportController) {
    reportController = new ReportController(getReportService());
  }
  return reportController;
};

export default getReportController;
