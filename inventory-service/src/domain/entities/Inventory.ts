export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface InventoryMovement {
  id: string;
  inventoryId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  orderId?: string | null;
  createdAt: Date;
}

export interface Inventory {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  minStock: number;
  reorderPoint: number;
  location?: string | null;
  createdAt: Date;
  updatedAt: Date;
  movements?: InventoryMovement[];
}

export interface ProcessedEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload?: string | null;
  processedAt: Date;
}

export interface StockReservation {
  productId: string;
  quantity: number;
  orderId: string;
}

export interface StockRelease {
  productId: string;
  quantity: number;
  orderId: string;
}

export interface StockAdjustment {
  productId: string;
  quantity: number;
  reason: string;
  type: MovementType.IN | MovementType.OUT | MovementType.ADJUSTMENT;
}

export interface LowStockAlert {
  productId: string;
  sku: string;
  currentStock: number;
  minStock: number;
  reorderPoint: number;
}

export class InventoryEntity implements Inventory {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  minStock: number;
  reorderPoint: number;
  location?: string | null;
  createdAt: Date;
  updatedAt: Date;
  movements?: InventoryMovement[];

  constructor(data: Inventory) {
    this.id = data.id;
    this.productId = data.productId;
    this.sku = data.sku;
    this.quantity = data.quantity;
    this.reserved = data.reserved;
    this.available = data.available;
    this.minStock = data.minStock;
    this.reorderPoint = data.reorderPoint;
    this.location = data.location;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.movements = data.movements;
  }

  /**
   * Check if stock is low
   */
  isLowStock(): boolean {
    return this.available <= this.minStock;
  }

  /**
   * Check if stock is below reorder point
   */
  needsReorder(): boolean {
    return this.available <= this.reorderPoint;
  }

  /**
   * Check if can reserve quantity
   */
  canReserve(quantity: number): boolean {
    return this.available >= quantity;
  }

  /**
   * Calculate available stock
   */
  calculateAvailable(): number {
    return this.quantity - this.reserved;
  }

  /**
   * Reserve stock
   */
  reserve(quantity: number): boolean {
    if (!this.canReserve(quantity)) {
      return false;
    }
    this.reserved += quantity;
    this.available = this.calculateAvailable();
    return true;
  }

  /**
   * Release reserved stock
   */
  release(quantity: number): boolean {
    if (this.reserved < quantity) {
      return false;
    }
    this.reserved -= quantity;
    this.available = this.calculateAvailable();
    return true;
  }

  /**
   * Add stock (IN movement)
   */
  addStock(quantity: number): void {
    this.quantity += quantity;
    this.available = this.calculateAvailable();
  }

  /**
   * Remove stock (OUT movement)
   */
  removeStock(quantity: number): boolean {
    if (this.available < quantity) {
      return false;
    }
    this.quantity -= quantity;
    this.available = this.calculateAvailable();
    return true;
  }

  /**
   * Adjust stock
   */
  adjustStock(newQuantity: number, reason: string): void {
    const difference = newQuantity - this.quantity;
    this.quantity = newQuantity;
    this.available = this.calculateAvailable();
  }

  /**
   * Convert to plain object
   */
  toObject(): Inventory {
    return {
      id: this.id,
      productId: this.productId,
      sku: this.sku,
      quantity: this.quantity,
      reserved: this.reserved,
      available: this.available,
      minStock: this.minStock,
      reorderPoint: this.reorderPoint,
      location: this.location,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      movements: this.movements,
    };
  }
}

export class InventoryMovementEntity implements InventoryMovement {
  id: string;
  inventoryId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  orderId?: string | null;
  createdAt: Date;

  constructor(data: InventoryMovement) {
    this.id = data.id;
    this.inventoryId = data.inventoryId;
    this.type = data.type;
    this.quantity = data.quantity;
    this.reason = data.reason;
    this.orderId = data.orderId;
    this.createdAt = data.createdAt;
  }

  /**
   * Check if movement affects stock quantity
   */
  affectsQuantity(): boolean {
    return [MovementType.IN, MovementType.OUT, MovementType.ADJUSTMENT].includes(this.type);
  }

  /**
   * Check if movement affects reserved quantity
   */
  affectsReserved(): boolean {
    return [MovementType.RESERVE, MovementType.RELEASE].includes(this.type);
  }

  /**
   * Get signed quantity (positive for IN, negative for OUT/RESERVE)
   */
  getSignedQuantity(): number {
    switch (this.type) {
      case MovementType.IN:
      case MovementType.RELEASE:
        return this.quantity;
      case MovementType.OUT:
      case MovementType.RESERVE:
        return -this.quantity;
      case MovementType.ADJUSTMENT:
        return this.quantity; // Can be positive or negative based on context
      default:
        return 0;
    }
  }

  /**
   * Convert to plain object
   */
  toObject(): InventoryMovement {
    return {
      id: this.id,
      inventoryId: this.inventoryId,
      type: this.type,
      quantity: this.quantity,
      reason: this.reason,
      orderId: this.orderId,
      createdAt: this.createdAt,
    };
  }
}
