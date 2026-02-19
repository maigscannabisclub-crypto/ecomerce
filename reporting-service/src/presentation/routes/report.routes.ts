import { Router } from 'express';
import { getReportController } from '../controllers/ReportController';
import { 
  verifyToken, 
  requireAdmin,
  addRequestId,
  addSecurityHeaders,
} from '../middleware/auth';

// ============================================
// Report Routes
// ============================================

const router = Router();
const reportController = getReportController();

// Apply middleware to all routes
router.use(addRequestId);
router.use(addSecurityHeaders);
router.use(verifyToken);
router.use(requireAdmin);

// ============================================
// Dashboard
// ============================================

/**
 * @route   GET /reports/dashboard
 * @desc    Get dashboard summary with key metrics
 * @access  Admin only
 */
router.get('/dashboard', reportController.getDashboard);

// ============================================
// Sales Reports
// ============================================

/**
 * @route   GET /reports/sales
 * @desc    Get sales reports with filtering and pagination
 * @query   startDate - Filter by start date (ISO 8601)
 * @query   endDate - Filter by end date (ISO 8601)
 * @query   period - Filter by period (DAILY, WEEKLY, MONTHLY, YEARLY)
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20, max: 100)
 * @access  Admin only
 */
router.get('/sales', reportController.getSalesReports);

// ============================================
// Top Products
// ============================================

/**
 * @route   GET /reports/products/top
 * @desc    Get top selling products
 * @query   startDate - Filter by start date (ISO 8601)
 * @query   endDate - Filter by end date (ISO 8601)
 * @query   period - Filter by period (DAILY, WEEKLY, MONTHLY, YEARLY)
 * @query   limit - Number of products to return (default: 10, max: 100)
 * @access  Admin only
 */
router.get('/products/top', reportController.getTopProducts);

// ============================================
// Revenue
// ============================================

/**
 * @route   GET /reports/revenue
 * @desc    Get revenue data grouped by period
 * @query   startDate - Filter by start date (ISO 8601)
 * @query   endDate - Filter by end date (ISO 8601)
 * @query   groupBy - Group by period (DAILY, WEEKLY, MONTHLY, YEARLY) (default: DAILY)
 * @access  Admin only
 */
router.get('/revenue', reportController.getRevenue);

// ============================================
// Order Metrics
// ============================================

/**
 * @route   GET /reports/orders/metrics
 * @desc    Get order metrics and statistics
 * @query   startDate - Filter by start date (ISO 8601)
 * @query   endDate - Filter by end date (ISO 8601)
 * @access  Admin only
 */
router.get('/orders/metrics', reportController.getOrderMetrics);

// ============================================
// Export
// ============================================

/**
 * @route   GET /reports/export/:type
 * @desc    Export report in specified format
 * @param   type - Export format (csv, json)
 * @query   startDate - Filter by start date (ISO 8601)
 * @query   endDate - Filter by end date (ISO 8601)
 * @query   period - Filter by period (DAILY, WEEKLY, MONTHLY, YEARLY)
 * @access  Admin only
 */
router.get('/export/:type', reportController.exportReport);

export default router;
