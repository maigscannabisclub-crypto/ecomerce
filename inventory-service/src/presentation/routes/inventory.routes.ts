import { Router } from 'express';
import { InventoryController } from '../controllers/InventoryController';
import { authenticateToken, requireRole, requireAdmin } from '../middleware/auth';
import {
  validateSchema,
  createInventorySchema,
  reserveStockSchema,
  releaseStockSchema,
  adjustStockSchema,
  updateInventorySchema,
  productIdParamSchema,
  skuParamSchema,
  paginationQuerySchema,
  batchReserveStockSchema,
} from '../middleware/validation';

export function createInventoryRoutes(inventoryController: InventoryController): Router {
  const router = Router();

  // ==================== HEALTH CHECK ====================
  // Public endpoint
  router.get('/health', inventoryController.healthCheck);

  // ==================== INVENTORY CRUD ====================
  // Create inventory (ADMIN only)
  router.post(
    '/',
    authenticateToken,
    requireAdmin,
    validateSchema(createInventorySchema),
    inventoryController.createInventory
  );

  // Get all inventory with pagination (Protected)
  router.get(
    '/',
    authenticateToken,
    validateSchema(paginationQuerySchema, 'query'),
    inventoryController.getAllInventory
  );

  // Get inventory by product ID (Protected)
  router.get(
    '/:productId',
    authenticateToken,
    validateSchema(productIdParamSchema, 'params'),
    inventoryController.getInventoryByProductId
  );

  // Get inventory by SKU (Protected)
  router.get(
    '/sku/:sku',
    authenticateToken,
    validateSchema(skuParamSchema, 'params'),
    inventoryController.getInventoryBySku
  );

  // Update inventory settings (ADMIN only)
  router.patch(
    '/:productId',
    authenticateToken,
    requireAdmin,
    validateSchema(productIdParamSchema, 'params'),
    validateSchema(updateInventorySchema),
    inventoryController.updateInventory
  );

  // Delete inventory (ADMIN only)
  router.delete(
    '/:productId',
    authenticateToken,
    requireAdmin,
    validateSchema(productIdParamSchema, 'params'),
    inventoryController.deleteInventory
  );

  // ==================== STOCK OPERATIONS ====================
  // Reserve stock (Protected - for order service integration)
  router.post(
    '/:productId/reserve',
    authenticateToken,
    validateSchema(productIdParamSchema, 'params'),
    validateSchema(reserveStockSchema),
    inventoryController.reserveStock
  );

  // Release stock (Protected - for order service integration)
  router.post(
    '/:productId/release',
    authenticateToken,
    validateSchema(productIdParamSchema, 'params'),
    validateSchema(releaseStockSchema),
    inventoryController.releaseStock
  );

  // Adjust stock (ADMIN only)
  router.post(
    '/:productId/adjust',
    authenticateToken,
    requireAdmin,
    validateSchema(productIdParamSchema, 'params'),
    validateSchema(adjustStockSchema),
    inventoryController.adjustStock
  );

  // ==================== BATCH OPERATIONS ====================
  // Batch reserve stock (Protected - for order service integration)
  router.post(
    '/batch/reserve',
    authenticateToken,
    requireRole('admin', 'order-service'),
    validateSchema(batchReserveStockSchema),
    inventoryController.batchReserveStock
  );

  // Batch release stock (Protected - for order service integration)
  router.post(
    '/batch/release',
    authenticateToken,
    requireRole('admin', 'order-service'),
    validateSchema(batchReserveStockSchema),
    inventoryController.batchReleaseStock
  );

  // ==================== QUERIES ====================
  // Get inventory movements (ADMIN only)
  router.get(
    '/:productId/movements',
    authenticateToken,
    requireAdmin,
    validateSchema(productIdParamSchema, 'params'),
    inventoryController.getInventoryMovements
  );

  // Get low stock alerts (ADMIN only)
  router.get(
    '/alerts/low-stock',
    authenticateToken,
    requireAdmin,
    inventoryController.getLowStockAlerts
  );

  return router;
}

export default createInventoryRoutes;
