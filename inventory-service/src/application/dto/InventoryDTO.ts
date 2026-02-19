import { MovementType } from '../../domain/entities/Inventory';

// ==================== REQUEST DTOs ====================

export interface CreateInventoryRequestDTO {
  productId: string;
  sku: string;
  quantity: number;
  minStock?: number;
  reorderPoint?: number;
  location?: string;
}

export interface ReserveStockRequestDTO {
  quantity: number;
  orderId: string;
}

export interface ReleaseStockRequestDTO {
  quantity: number;
  orderId: string;
}

export interface AdjustStockRequestDTO {
  quantity: number;
  reason: string;
  type: MovementType.IN | MovementType.OUT | MovementType.ADJUSTMENT;
}

export interface UpdateInventoryRequestDTO {
  minStock?: number;
  reorderPoint?: number;
  location?: string;
}

// ==================== RESPONSE DTOs ====================

export interface InventoryResponseDTO {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  minStock: number;
  reorderPoint: number;
  location: string | null;
  isLowStock: boolean;
  needsReorder: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementResponseDTO {
  id: string;
  inventoryId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
}

export interface StockReservationResponseDTO {
  success: boolean;
  productId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  availableStock: number;
  orderId: string;
  message: string;
}

export interface StockReleaseResponseDTO {
  success: boolean;
  productId: string;
  releasedQuantity: number;
  orderId: string;
  message: string;
}

export interface StockAdjustmentResponseDTO {
  success: boolean;
  productId: string;
  previousQuantity: number;
  newQuantity: number;
  adjustment: number;
  type: MovementType;
  reason: string;
  message: string;
}

export interface LowStockAlertResponseDTO {
  productId: string;
  sku: string;
  currentStock: number;
  minStock: number;
  reorderPoint: number;
  location: string | null;
  alertType: 'LOW_STOCK' | 'CRITICAL_STOCK';
}

export interface InventoryMovementsResponseDTO {
  productId: string;
  sku: string;
  movements: InventoryMovementResponseDTO[];
  totalMovements: number;
}

export interface PaginatedInventoryResponseDTO {
  items: InventoryResponseDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== EVENT DTOs ====================

export interface StockReservedEventDTO {
  eventId: string;
  eventType: 'StockReserved';
  timestamp: string;
  payload: {
    productId: string;
    sku: string;
    quantity: number;
    orderId: string;
    availableStock: number;
  };
}

export interface StockReleasedEventDTO {
  eventId: string;
  eventType: 'StockReleased';
  timestamp: string;
  payload: {
    productId: string;
    sku: string;
    quantity: number;
    orderId: string;
    availableStock: number;
  };
}

export interface StockReservationFailedEventDTO {
  eventId: string;
  eventType: 'StockReservationFailed';
  timestamp: string;
  payload: {
    productId: string;
    sku: string;
    requestedQuantity: number;
    availableStock: number;
    orderId: string;
    reason: string;
  };
}

export interface LowStockAlertEventDTO {
  eventId: string;
  eventType: 'LowStockAlert';
  timestamp: string;
  payload: {
    productId: string;
    sku: string;
    currentStock: number;
    minStock: number;
    reorderPoint: number;
    location: string | null;
    alertType: 'LOW_STOCK' | 'CRITICAL_STOCK';
  };
}

export interface OrderCreatedEventDTO {
  eventId: string;
  eventType: 'OrderCreated';
  timestamp: string;
  payload: {
    orderId: string;
    items: Array<{
      productId: string;
      quantity: number;
      sku?: string;
    }>;
    customerId: string;
  };
}

export interface OrderFailedEventDTO {
  eventId: string;
  eventType: 'OrderFailed';
  timestamp: string;
  payload: {
    orderId: string;
    items: Array<{
      productId: string;
      quantity: number;
      sku?: string;
    }>;
    reason: string;
  };
}

// ==================== MAPPERS ====================

import { Inventory, InventoryMovement, InventoryEntity } from '../../domain/entities/Inventory';

export class InventoryMapper {
  static toResponseDTO(inventory: Inventory | InventoryEntity): InventoryResponseDTO {
    const entity = inventory instanceof InventoryEntity ? inventory : new InventoryEntity(inventory);

    return {
      id: entity.id,
      productId: entity.productId,
      sku: entity.sku,
      quantity: entity.quantity,
      reserved: entity.reserved,
      available: entity.available,
      minStock: entity.minStock,
      reorderPoint: entity.reorderPoint,
      location: entity.location || null,
      isLowStock: entity.isLowStock(),
      needsReorder: entity.needsReorder(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  static toMovementResponseDTO(movement: InventoryMovement): InventoryMovementResponseDTO {
    return {
      id: movement.id,
      inventoryId: movement.inventoryId,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
      orderId: movement.orderId || null,
      createdAt: movement.createdAt.toISOString(),
    };
  }

  static toMovementsResponseDTO(
    inventory: Inventory,
    movements: InventoryMovement[]
  ): InventoryMovementsResponseDTO {
    return {
      productId: inventory.productId,
      sku: inventory.sku,
      movements: movements.map((m) => this.toMovementResponseDTO(m)),
      totalMovements: movements.length,
    };
  }

  static toLowStockAlertDTO(inventory: Inventory): LowStockAlertResponseDTO {
    const entity = inventory instanceof InventoryEntity ? inventory : new InventoryEntity(inventory);
    const alertType = inventory.available <= inventory.minStock / 2 ? 'CRITICAL_STOCK' : 'LOW_STOCK';

    return {
      productId: inventory.productId,
      sku: inventory.sku,
      currentStock: inventory.available,
      minStock: inventory.minStock,
      reorderPoint: inventory.reorderPoint,
      location: inventory.location || null,
      alertType,
    };
  }
}
