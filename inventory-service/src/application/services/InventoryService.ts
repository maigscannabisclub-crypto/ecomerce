import { PrismaClient, MovementType } from '@prisma/client';
import { Inventory, InventoryMovement, InventoryEntity } from '../../domain/entities/Inventory';
import {
  CreateInventoryRequestDTO,
  ReserveStockRequestDTO,
  ReleaseStockRequestDTO,
  AdjustStockRequestDTO,
  UpdateInventoryRequestDTO,
  InventoryResponseDTO,
  InventoryMovementResponseDTO,
  StockReservationResponseDTO,
  StockReleaseResponseDTO,
  StockAdjustmentResponseDTO,
  LowStockAlertResponseDTO,
  InventoryMovementsResponseDTO,
  InventoryMapper,
} from '../dto/InventoryDTO';
import logger, { logStockOperation, logLowStockAlert } from '../../utils/logger';
import { IdempotencyService } from '../../utils/idempotency';
import { withTransaction } from '../../infrastructure/database/prisma';

export interface IInventoryService {
  // CRUD operations
  createInventory(data: CreateInventoryRequestDTO): Promise<InventoryResponseDTO>;
  getInventoryByProductId(productId: string): Promise<InventoryResponseDTO | null>;
  getInventoryBySku(sku: string): Promise<InventoryResponseDTO | null>;
  updateInventory(productId: string, data: UpdateInventoryRequestDTO): Promise<InventoryResponseDTO>;
  deleteInventory(productId: string): Promise<void>;
  
  // Stock operations
  reserveStock(productId: string, data: ReserveStockRequestDTO): Promise<StockReservationResponseDTO>;
  releaseStock(productId: string, data: ReleaseStockRequestDTO): Promise<StockReleaseResponseDTO>;
  adjustStock(productId: string, data: AdjustStockRequestDTO): Promise<StockAdjustmentResponseDTO>;
  
  // Queries
  getInventoryMovements(productId: string): Promise<InventoryMovementsResponseDTO>;
  getLowStockAlerts(): Promise<LowStockAlertResponseDTO[]>;
  getAllInventory(page: number, limit: number): Promise<{ items: InventoryResponseDTO[]; total: number }>;
  
  // Event handlers
  handleOrderCreated(orderId: string, items: Array<{ productId: string; quantity: number }>): Promise<Array<StockReservationResponseDTO>>;
  handleOrderFailed(orderId: string, items: Array<{ productId: string; quantity: number }>): Promise<Array<StockReleaseResponseDTO>>;
}

export class InventoryService implements IInventoryService {
  private prisma: PrismaClient;
  private idempotencyService: IdempotencyService;
  private eventPublisher: (eventType: string, payload: Record<string, unknown>) => Promise<void>;

  constructor(
    prisma: PrismaClient,
    idempotencyService: IdempotencyService,
    eventPublisher: (eventType: string, payload: Record<string, unknown>) => Promise<void>
  ) {
    this.prisma = prisma;
    this.idempotencyService = idempotencyService;
    this.eventPublisher = eventPublisher;
  }

  // ==================== CRUD OPERATIONS ====================

  async createInventory(data: CreateInventoryRequestDTO): Promise<InventoryResponseDTO> {
    logger.info(`Creating inventory for product: ${data.productId}`);

    // Check if inventory already exists
    const existing = await this.prisma.inventory.findFirst({
      where: {
        OR: [{ productId: data.productId }, { sku: data.sku }],
      },
    });

    if (existing) {
      throw new Error(`Inventory already exists for product ${data.productId} or SKU ${data.sku}`);
    }

    const inventory = await this.prisma.inventory.create({
      data: {
        productId: data.productId,
        sku: data.sku,
        quantity: data.quantity,
        reserved: 0,
        available: data.quantity,
        minStock: data.minStock ?? 10,
        reorderPoint: data.reorderPoint ?? 20,
        location: data.location,
      },
    });

    // Create initial movement record
    await this.prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: MovementType.IN,
        quantity: data.quantity,
        reason: 'Initial stock entry',
      },
    });

    logStockOperation('CREATE_INVENTORY', data.productId, data.quantity, true);

    return InventoryMapper.toResponseDTO(inventory);
  }

  async getInventoryByProductId(productId: string): Promise<InventoryResponseDTO | null> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      return null;
    }

    return InventoryMapper.toResponseDTO(inventory);
  }

  async getInventoryBySku(sku: string): Promise<InventoryResponseDTO | null> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { sku },
    });

    if (!inventory) {
      return null;
    }

    return InventoryMapper.toResponseDTO(inventory);
  }

  async updateInventory(productId: string, data: UpdateInventoryRequestDTO): Promise<InventoryResponseDTO> {
    logger.info(`Updating inventory for product: ${productId}`);

    const inventory = await this.prisma.inventory.update({
      where: { productId },
      data: {
        ...(data.minStock !== undefined && { minStock: data.minStock }),
        ...(data.reorderPoint !== undefined && { reorderPoint: data.reorderPoint }),
        ...(data.location !== undefined && { location: data.location }),
      },
    });

    logStockOperation('UPDATE_INVENTORY', productId, 0, true);

    return InventoryMapper.toResponseDTO(inventory);
  }

  async deleteInventory(productId: string): Promise<void> {
    logger.info(`Deleting inventory for product: ${productId}`);

    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      throw new Error(`Inventory not found for product ${productId}`);
    }

    // Delete movements first (cascade should handle this, but being explicit)
    await this.prisma.inventoryMovement.deleteMany({
      where: { inventoryId: inventory.id },
    });

    // Delete inventory
    await this.prisma.inventory.delete({
      where: { productId },
    });

    logStockOperation('DELETE_INVENTORY', productId, 0, true);
  }

  // ==================== STOCK OPERATIONS ====================

  async reserveStock(productId: string, data: ReserveStockRequestDTO): Promise<StockReservationResponseDTO> {
    const { quantity, orderId } = data;

    logger.info(`Reserving stock for product: ${productId}, quantity: ${quantity}, order: ${orderId}`);

    return withTransaction(async (tx) => {
      // Lock the inventory row for update
      const inventory = await tx.inventory.findUnique({
        where: { productId },
      });

      if (!inventory) {
        throw new Error(`Inventory not found for product ${productId}`);
      }

      const entity = new InventoryEntity(inventory);

      // Check if enough stock available
      if (!entity.canReserve(quantity)) {
        logStockOperation('RESERVE_STOCK', productId, quantity, false);

        // Publish failed reservation event
        await this.eventPublisher('StockReservationFailed', {
          productId,
          sku: inventory.sku,
          requestedQuantity: quantity,
          availableStock: entity.available,
          orderId,
          reason: 'Insufficient stock',
        });

        return {
          success: false,
          productId,
          requestedQuantity: quantity,
          reservedQuantity: 0,
          availableStock: entity.available,
          orderId,
          message: `Insufficient stock. Available: ${entity.available}, Requested: ${quantity}`,
        };
      }

      // Reserve stock
      entity.reserve(quantity);

      // Update inventory
      const updatedInventory = await tx.inventory.update({
        where: { productId },
        data: {
          reserved: entity.reserved,
          available: entity.available,
        },
      });

      // Create movement record
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: MovementType.RESERVE,
          quantity,
          reason: `Stock reserved for order ${orderId}`,
          orderId,
        },
      });

      logStockOperation('RESERVE_STOCK', productId, quantity, true);

      // Check for low stock after reservation
      if (entity.isLowStock()) {
        await this.checkAndPublishLowStockAlert(entity);
      }

      // Publish stock reserved event
      await this.eventPublisher('StockReserved', {
        productId,
        sku: inventory.sku,
        quantity,
        orderId,
        availableStock: entity.available,
      });

      return {
        success: true,
        productId,
        requestedQuantity: quantity,
        reservedQuantity: quantity,
        availableStock: entity.available,
        orderId,
        message: 'Stock reserved successfully',
      };
    });
  }

  async releaseStock(productId: string, data: ReleaseStockRequestDTO): Promise<StockReleaseResponseDTO> {
    const { quantity, orderId } = data;

    logger.info(`Releasing stock for product: ${productId}, quantity: ${quantity}, order: ${orderId}`);

    return withTransaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { productId },
      });

      if (!inventory) {
        throw new Error(`Inventory not found for product ${productId}`);
      }

      const entity = new InventoryEntity(inventory);

      // Check if enough reserved stock to release
      if (entity.reserved < quantity) {
        logStockOperation('RELEASE_STOCK', productId, quantity, false);

        return {
          success: false,
          productId,
          releasedQuantity: 0,
          orderId,
          message: `Cannot release more than reserved. Reserved: ${entity.reserved}, Requested: ${quantity}`,
        };
      }

      // Release stock
      entity.release(quantity);

      // Update inventory
      const updatedInventory = await tx.inventory.update({
        where: { productId },
        data: {
          reserved: entity.reserved,
          available: entity.available,
        },
      });

      // Create movement record
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: MovementType.RELEASE,
          quantity,
          reason: `Stock released for order ${orderId}`,
          orderId,
        },
      });

      logStockOperation('RELEASE_STOCK', productId, quantity, true);

      // Publish stock released event
      await this.eventPublisher('StockReleased', {
        productId,
        sku: inventory.sku,
        quantity,
        orderId,
        availableStock: entity.available,
      });

      return {
        success: true,
        productId,
        releasedQuantity: quantity,
        orderId,
        message: 'Stock released successfully',
      };
    });
  }

  async adjustStock(productId: string, data: AdjustStockRequestDTO): Promise<StockAdjustmentResponseDTO> {
    const { quantity, reason, type } = data;

    logger.info(`Adjusting stock for product: ${productId}, type: ${type}, quantity: ${quantity}`);

    return withTransaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { productId },
      });

      if (!inventory) {
        throw new Error(`Inventory not found for product ${productId}`);
      }

      const previousQuantity = inventory.quantity;
      let newQuantity = previousQuantity;

      switch (type) {
        case MovementType.IN:
          newQuantity = previousQuantity + quantity;
          break;
        case MovementType.OUT:
          if (inventory.available < quantity) {
            throw new Error(`Insufficient available stock. Available: ${inventory.available}, Requested: ${quantity}`);
          }
          newQuantity = previousQuantity - quantity;
          break;
        case MovementType.ADJUSTMENT:
          newQuantity = quantity;
          break;
      }

      const adjustment = newQuantity - previousQuantity;
      const available = newQuantity - inventory.reserved;

      // Update inventory
      const updatedInventory = await tx.inventory.update({
        where: { productId },
        data: {
          quantity: newQuantity,
          available,
        },
      });

      // Create movement record
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type,
          quantity: Math.abs(adjustment),
          reason,
        },
      });

      logStockOperation('ADJUST_STOCK', productId, quantity, true, { type, adjustment });

      // Check for low stock after adjustment
      if (available <= inventory.minStock) {
        await this.checkAndPublishLowStockAlert(new InventoryEntity({ ...inventory, available }));
      }

      return {
        success: true,
        productId,
        previousQuantity,
        newQuantity,
        adjustment,
        type,
        reason,
        message: 'Stock adjusted successfully',
      };
    });
  }

  // ==================== QUERIES ====================

  async getInventoryMovements(productId: string): Promise<InventoryMovementsResponseDTO> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!inventory) {
      throw new Error(`Inventory not found for product ${productId}`);
    }

    return InventoryMapper.toMovementsResponseDTO(inventory, inventory.movements);
  }

  async getLowStockAlerts(): Promise<LowStockAlertResponseDTO[]> {
    const lowStockItems = await this.prisma.inventory.findMany({
      where: {
        available: {
          lte: this.prisma.inventory.fields.minStock,
        },
      },
      orderBy: {
        available: 'asc',
      },
    });

    return lowStockItems.map((item) => InventoryMapper.toLowStockAlertDTO(item));
  }

  async getAllInventory(page: number = 1, limit: number = 20): Promise<{ items: InventoryResponseDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.inventory.count(),
    ]);

    return {
      items: items.map((item) => InventoryMapper.toResponseDTO(item)),
      total,
    };
  }

  // ==================== EVENT HANDLERS ====================

  async handleOrderCreated(
    orderId: string,
    items: Array<{ productId: string; quantity: number }>
  ): Promise<Array<StockReservationResponseDTO>> {
    logger.info(`Handling OrderCreated event for order: ${orderId}`, { itemCount: items.length });

    const results: Array<StockReservationResponseDTO> = [];
    const failedReservations: Array<{ productId: string; reason: string }> = [];

    // Try to reserve stock for all items
    for (const item of items) {
      try {
        const result = await this.reserveStock(item.productId, {
          quantity: item.quantity,
          orderId,
        });
        results.push(result);

        if (!result.success) {
          failedReservations.push({
            productId: item.productId,
            reason: result.message,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to reserve stock for product ${item.productId}`, error);
        
        results.push({
          success: false,
          productId: item.productId,
          requestedQuantity: item.quantity,
          reservedQuantity: 0,
          availableStock: 0,
          orderId,
          message: errorMessage,
        });
        
        failedReservations.push({
          productId: item.productId,
          reason: errorMessage,
        });
      }
    }

    // If any reservation failed, we should release the successful ones
    const successfulReservations = results.filter((r) => r.success);
    if (failedReservations.length > 0 && successfulReservations.length > 0) {
      logger.warn(`Some reservations failed for order ${orderId}, releasing successful ones`);

      for (const success of successfulReservations) {
        try {
          await this.releaseStock(success.productId, {
            quantity: success.reservedQuantity,
            orderId,
          });
        } catch (error) {
          logger.error(`Failed to release stock for product ${success.productId}`, error);
        }
      }

      // Update results to mark successful ones as rolled back
      for (const result of results) {
        if (result.success) {
          result.success = false;
          result.message = 'Reservation rolled back due to other items failing';
        }
      }
    }

    return results;
  }

  async handleOrderFailed(
    orderId: string,
    items: Array<{ productId: string; quantity: number }>
  ): Promise<Array<StockReleaseResponseDTO>> {
    logger.info(`Handling OrderFailed event for order: ${orderId}`, { itemCount: items.length });

    const results: Array<StockReleaseResponseDTO> = [];

    for (const item of items) {
      try {
        const result = await this.releaseStock(item.productId, {
          quantity: item.quantity,
          orderId,
        });
        results.push(result);
      } catch (error) {
        logger.error(`Failed to release stock for product ${item.productId}`, error);
        
        results.push({
          success: false,
          productId: item.productId,
          releasedQuantity: 0,
          orderId,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  // ==================== PRIVATE METHODS ====================

  private async checkAndPublishLowStockAlert(inventory: InventoryEntity): Promise<void> {
    if (inventory.isLowStock()) {
      const alertType = inventory.available <= inventory.minStock / 2 ? 'CRITICAL_STOCK' : 'LOW_STOCK';

      logLowStockAlert(inventory.productId, inventory.available, inventory.minStock);

      await this.eventPublisher('LowStockAlert', {
        productId: inventory.productId,
        sku: inventory.sku,
        currentStock: inventory.available,
        minStock: inventory.minStock,
        reorderPoint: inventory.reorderPoint,
        location: inventory.location,
        alertType,
      });
    }
  }
}

export default InventoryService;
