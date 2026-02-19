import { Request, Response, NextFunction } from 'express';
import { InventoryService } from '../../application/services/InventoryService';
import {
  CreateInventoryRequestDTO,
  ReserveStockRequestDTO,
  ReleaseStockRequestDTO,
  AdjustStockRequestDTO,
  UpdateInventoryRequestDTO,
} from '../../application/dto/InventoryDTO';
import logger from '../../utils/logger';

export class InventoryController {
  private inventoryService: InventoryService;

  constructor(inventoryService: InventoryService) {
    this.inventoryService = inventoryService;
  }

  // ==================== CRUD OPERATIONS ====================

  /**
   * Create new inventory record
   * POST /inventory
   */
  createInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: CreateInventoryRequestDTO = req.body;

      logger.info('Creating inventory', { productId: data.productId, sku: data.sku });

      const inventory = await this.inventoryService.createInventory(data);

      res.status(201).json({
        success: true,
        data: inventory,
        message: 'Inventory created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get inventory by product ID
   * GET /inventory/:productId
   */
  getInventoryByProductId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;

      logger.info('Getting inventory by product ID', { productId });

      const inventory = await this.inventoryService.getInventoryByProductId(productId);

      if (!inventory) {
        res.status(404).json({
          success: false,
          error: 'Inventory not found',
          code: 'INVENTORY_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: inventory,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get inventory by SKU
   * GET /inventory/sku/:sku
   */
  getInventoryBySku = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sku } = req.params;

      logger.info('Getting inventory by SKU', { sku });

      const inventory = await this.inventoryService.getInventoryBySku(sku);

      if (!inventory) {
        res.status(404).json({
          success: false,
          error: 'Inventory not found',
          code: 'INVENTORY_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: inventory,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update inventory settings
   * PATCH /inventory/:productId
   */
  updateInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const data: UpdateInventoryRequestDTO = req.body;

      logger.info('Updating inventory', { productId });

      const inventory = await this.inventoryService.updateInventory(productId, data);

      res.status(200).json({
        success: true,
        data: inventory,
        message: 'Inventory updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete inventory record
   * DELETE /inventory/:productId
   */
  deleteInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;

      logger.info('Deleting inventory', { productId });

      await this.inventoryService.deleteInventory(productId);

      res.status(200).json({
        success: true,
        message: 'Inventory deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all inventory records with pagination
   * GET /inventory
   */
  getAllInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      logger.info('Getting all inventory', { page, limit });

      const result = await this.inventoryService.getAllInventory(page, limit);

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== STOCK OPERATIONS ====================

  /**
   * Reserve stock for an order
   * POST /inventory/:productId/reserve
   */
  reserveStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const data: ReserveStockRequestDTO = req.body;

      logger.info('Reserving stock', { productId, quantity: data.quantity, orderId: data.orderId });

      const result = await this.inventoryService.reserveStock(productId, data);

      if (!result.success) {
        res.status(409).json({
          success: false,
          error: result.message,
          code: 'STOCK_RESERVATION_FAILED',
          data: result,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Release reserved stock
   * POST /inventory/:productId/release
   */
  releaseStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const data: ReleaseStockRequestDTO = req.body;

      logger.info('Releasing stock', { productId, quantity: data.quantity, orderId: data.orderId });

      const result = await this.inventoryService.releaseStock(productId, data);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.message,
          code: 'STOCK_RELEASE_FAILED',
          data: result,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Adjust stock quantity
   * POST /inventory/:productId/adjust
   */
  adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const data: AdjustStockRequestDTO = req.body;

      logger.info('Adjusting stock', { productId, type: data.type, quantity: data.quantity });

      const result = await this.inventoryService.adjustStock(productId, data);

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== QUERIES ====================

  /**
   * Get inventory movements history
   * GET /inventory/:productId/movements
   */
  getInventoryMovements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;

      logger.info('Getting inventory movements', { productId });

      const movements = await this.inventoryService.getInventoryMovements(productId);

      res.status(200).json({
        success: true,
        data: movements,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get low stock alerts
   * GET /inventory/alerts/low-stock
   */
  getLowStockAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Getting low stock alerts');

      const alerts = await this.inventoryService.getLowStockAlerts();

      res.status(200).json({
        success: true,
        data: alerts,
        count: alerts.length,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Batch reserve stock for multiple products
   * POST /inventory/batch/reserve
   */
  batchReserveStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, orderId } = req.body;

      logger.info('Batch reserving stock', { itemCount: items.length, orderId });

      const results = await this.inventoryService.handleOrderCreated(
        orderId,
        items.map((item: { productId: string; quantity: number }) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0 && successful.length === 0) {
        res.status(409).json({
          success: false,
          error: 'All stock reservations failed',
          code: 'BATCH_RESERVATION_FAILED',
          data: {
            successful,
            failed,
            total: results.length,
          },
        });
        return;
      }

      res.status(200).json({
        success: failed.length === 0,
        data: {
          successful,
          failed,
          total: results.length,
        },
        message:
          failed.length === 0
            ? 'All stock reservations successful'
            : 'Some stock reservations failed',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Batch release stock for multiple products
   * POST /inventory/batch/release
   */
  batchReleaseStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, orderId } = req.body;

      logger.info('Batch releasing stock', { itemCount: items.length, orderId });

      const results = await this.inventoryService.handleOrderFailed(
        orderId,
        items.map((item: { productId: string; quantity: number }) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      res.status(200).json({
        success: failed.length === 0,
        data: {
          successful,
          failed,
          total: results.length,
        },
        message:
          failed.length === 0
            ? 'All stock releases successful'
            : 'Some stock releases failed',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Health check endpoint
   * GET /health
   */
  healthCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          service: 'inventory-service',
          status: 'healthy',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default InventoryController;
