import { PrismaClient, MovementType } from '@prisma/client';
import { InventoryService } from '../../src/application/services/InventoryService';
import { IdempotencyService } from '../../src/utils/idempotency';
import { InventoryEntity } from '../../src/domain/entities/Inventory';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    inventory: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    processedEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
    MovementType: {
      IN: 'IN',
      OUT: 'OUT',
      RESERVE: 'RESERVE',
      RELEASE: 'RELEASE',
      ADJUSTMENT: 'ADJUSTMENT',
    },
  };
});

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockIdempotencyService: jest.Mocked<IdempotencyService>;
  let mockEventPublisher: jest.Mock;

  const mockInventory = {
    id: 'inv-001',
    productId: 'prod-001',
    sku: 'SKU-001',
    quantity: 100,
    reserved: 10,
    available: 90,
    minStock: 10,
    reorderPoint: 20,
    location: 'WAREHOUSE-A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockIdempotencyService = {
      isEventProcessed: jest.fn(),
      markEventAsProcessed: jest.fn(),
      processWithIdempotency: jest.fn(),
      cleanupOldEvents: jest.fn(),
      getStatistics: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;
    
    mockEventPublisher = jest.fn().mockResolvedValue(undefined);

    inventoryService = new InventoryService(
      mockPrisma,
      mockIdempotencyService,
      mockEventPublisher
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInventory', () => {
    it('should create inventory successfully', async () => {
      const createData = {
        productId: 'prod-001',
        sku: 'SKU-001',
        quantity: 100,
        minStock: 10,
        reorderPoint: 20,
        location: 'WAREHOUSE-A',
      };

      (mockPrisma.inventory.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.inventory.create as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-001',
        inventoryId: 'inv-001',
        type: MovementType.IN,
        quantity: 100,
        reason: 'Initial stock entry',
      });

      const result = await inventoryService.createInventory(createData);

      expect(result).toBeDefined();
      expect(result.productId).toBe(createData.productId);
      expect(result.sku).toBe(createData.sku);
      expect(mockPrisma.inventory.create).toHaveBeenCalled();
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalled();
    });

    it('should throw error if inventory already exists', async () => {
      const createData = {
        productId: 'prod-001',
        sku: 'SKU-001',
        quantity: 100,
      };

      (mockPrisma.inventory.findFirst as jest.Mock).mockResolvedValue(mockInventory);

      await expect(inventoryService.createInventory(createData)).rejects.toThrow(
        'Inventory already exists'
      );
    });
  });

  describe('getInventoryByProductId', () => {
    it('should return inventory by product ID', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);

      const result = await inventoryService.getInventoryByProductId('prod-001');

      expect(result).toBeDefined();
      expect(result?.productId).toBe('prod-001');
      expect(mockPrisma.inventory.findUnique).toHaveBeenCalledWith({
        where: { productId: 'prod-001' },
      });
    });

    it('should return null if inventory not found', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await inventoryService.getInventoryByProductId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock successfully', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 20,
        available: 80,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-002',
        inventoryId: 'inv-001',
        type: MovementType.RESERVE,
        quantity: 10,
        reason: 'Stock reserved for order order-001',
        orderId: 'order-001',
      });

      const result = await inventoryService.reserveStock('prod-001', {
        quantity: 10,
        orderId: 'order-001',
      });

      expect(result.success).toBe(true);
      expect(result.reservedQuantity).toBe(10);
      expect(mockEventPublisher).toHaveBeenCalledWith('StockReserved', expect.any(Object));
    });

    it('should fail reservation if insufficient stock', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue({
        ...mockInventory,
        available: 5,
      });

      const result = await inventoryService.reserveStock('prod-001', {
        quantity: 10,
        orderId: 'order-001',
      });

      expect(result.success).toBe(false);
      expect(mockEventPublisher).toHaveBeenCalledWith('StockReservationFailed', expect.any(Object));
    });

    it('should throw error if inventory not found', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        inventoryService.reserveStock('prod-001', {
          quantity: 10,
          orderId: 'order-001',
        })
      ).rejects.toThrow('Inventory not found');
    });
  });

  describe('releaseStock', () => {
    it('should release stock successfully', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 5,
        available: 95,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-003',
        inventoryId: 'inv-001',
        type: MovementType.RELEASE,
        quantity: 5,
        reason: 'Stock released for order order-001',
        orderId: 'order-001',
      });

      const result = await inventoryService.releaseStock('prod-001', {
        quantity: 5,
        orderId: 'order-001',
      });

      expect(result.success).toBe(true);
      expect(result.releasedQuantity).toBe(5);
      expect(mockEventPublisher).toHaveBeenCalledWith('StockReleased', expect.any(Object));
    });

    it('should fail release if releasing more than reserved', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 5,
      });

      const result = await inventoryService.releaseStock('prod-001', {
        quantity: 10,
        orderId: 'order-001',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('adjustStock', () => {
    it('should add stock (IN movement)', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        quantity: 120,
        available: 110,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-004',
        inventoryId: 'inv-001',
        type: MovementType.IN,
        quantity: 20,
        reason: 'Stock received from supplier',
      });

      const result = await inventoryService.adjustStock('prod-001', {
        quantity: 20,
        reason: 'Stock received from supplier',
        type: MovementType.IN,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(120);
      expect(result.adjustment).toBe(20);
    });

    it('should remove stock (OUT movement)', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        quantity: 80,
        available: 70,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-005',
        inventoryId: 'inv-001',
        type: MovementType.OUT,
        quantity: 20,
        reason: 'Stock sent to store',
      });

      const result = await inventoryService.adjustStock('prod-001', {
        quantity: 20,
        reason: 'Stock sent to store',
        type: MovementType.OUT,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(80);
      expect(result.adjustment).toBe(-20);
    });

    it('should adjust stock to specific quantity', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        quantity: 150,
        available: 140,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({
        id: 'mov-006',
        inventoryId: 'inv-001',
        type: MovementType.ADJUSTMENT,
        quantity: 50,
        reason: 'Inventory count adjustment',
      });

      const result = await inventoryService.adjustStock('prod-001', {
        quantity: 150,
        reason: 'Inventory count adjustment',
        type: MovementType.ADJUSTMENT,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(150);
      expect(result.adjustment).toBe(50);
    });

    it('should throw error if OUT quantity exceeds available stock', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue({
        ...mockInventory,
        available: 5,
      });

      await expect(
        inventoryService.adjustStock('prod-001', {
          quantity: 10,
          reason: 'Stock sent to store',
          type: MovementType.OUT,
        })
      ).rejects.toThrow('Insufficient available stock');
    });
  });

  describe('getLowStockAlerts', () => {
    it('should return low stock items', async () => {
      const lowStockItems = [
        { ...mockInventory, available: 5, minStock: 10 },
        { ...mockInventory, id: 'inv-002', available: 3, minStock: 10 },
      ];

      (mockPrisma.inventory.findMany as jest.Mock).mockResolvedValue(lowStockItems);

      const result = await inventoryService.getLowStockAlerts();

      expect(result).toHaveLength(2);
      expect(result[0].currentStock).toBe(5);
      expect(result[0].minStock).toBe(10);
      expect(result[0].alertType).toBe('LOW_STOCK');
    });

    it('should return critical stock for very low items', async () => {
      const criticalStockItems = [
        { ...mockInventory, available: 2, minStock: 10 },
      ];

      (mockPrisma.inventory.findMany as jest.Mock).mockResolvedValue(criticalStockItems);

      const result = await inventoryService.getLowStockAlerts();

      expect(result[0].alertType).toBe('CRITICAL_STOCK');
    });
  });

  describe('getInventoryMovements', () => {
    it('should return inventory movements', async () => {
      const inventoryWithMovements = {
        ...mockInventory,
        movements: [
          {
            id: 'mov-001',
            inventoryId: 'inv-001',
            type: MovementType.IN,
            quantity: 100,
            reason: 'Initial stock entry',
            orderId: null,
            createdAt: new Date(),
          },
        ],
      };

      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventoryWithMovements);

      const result = await inventoryService.getInventoryMovements('prod-001');

      expect(result.productId).toBe('prod-001');
      expect(result.movements).toHaveLength(1);
      expect(result.totalMovements).toBe(1);
    });

    it('should throw error if inventory not found', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(inventoryService.getInventoryMovements('non-existent')).rejects.toThrow(
        'Inventory not found'
      );
    });
  });

  describe('handleOrderCreated', () => {
    it('should reserve stock for all items in order', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 20,
        available: 80,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({});

      const items = [
        { productId: 'prod-001', quantity: 5 },
        { productId: 'prod-002', quantity: 5 },
      ];

      const result = await inventoryService.handleOrderCreated('order-001', items);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.success)).toBe(true);
    });

    it('should rollback successful reservations if any fail', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockInventory)
        .mockResolvedValueOnce({ ...mockInventory, available: 2 });
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 15,
        available: 85,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({});

      const items = [
        { productId: 'prod-001', quantity: 5 },
        { productId: 'prod-002', quantity: 10 }, // Will fail - only 2 available
      ];

      const result = await inventoryService.handleOrderCreated('order-001', items);

      expect(result.every((r) => !r.success)).toBe(true);
    });
  });

  describe('handleOrderFailed', () => {
    it('should release stock for all items in failed order', async () => {
      (mockPrisma.inventory.findUnique as jest.Mock).mockResolvedValue(mockInventory);
      (mockPrisma.inventory.update as jest.Mock).mockResolvedValue({
        ...mockInventory,
        reserved: 5,
        available: 95,
      });
      (mockPrisma.inventoryMovement.create as jest.Mock).mockResolvedValue({});

      const items = [
        { productId: 'prod-001', quantity: 5 },
      ];

      const result = await inventoryService.handleOrderFailed('order-001', items);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });
  });

  describe('InventoryEntity', () => {
    it('should correctly calculate available stock', () => {
      const entity = new InventoryEntity(mockInventory);
      expect(entity.calculateAvailable()).toBe(90);
    });

    it('should correctly check if stock is low', () => {
      const lowStock = new InventoryEntity({
        ...mockInventory,
        available: 5,
        minStock: 10,
      });
      expect(lowStock.isLowStock()).toBe(true);

      const normalStock = new InventoryEntity({
        ...mockInventory,
        available: 20,
        minStock: 10,
      });
      expect(normalStock.isLowStock()).toBe(false);
    });

    it('should correctly check if needs reorder', () => {
      const needsReorder = new InventoryEntity({
        ...mockInventory,
        available: 15,
        reorderPoint: 20,
      });
      expect(needsReorder.needsReorder()).toBe(true);

      const noReorder = new InventoryEntity({
        ...mockInventory,
        available: 25,
        reorderPoint: 20,
      });
      expect(noReorder.needsReorder()).toBe(false);
    });

    it('should correctly reserve stock', () => {
      const entity = new InventoryEntity(mockInventory);
      const result = entity.reserve(10);

      expect(result).toBe(true);
      expect(entity.reserved).toBe(20);
      expect(entity.available).toBe(80);
    });

    it('should fail to reserve if insufficient stock', () => {
      const entity = new InventoryEntity({
        ...mockInventory,
        available: 5,
      });
      const result = entity.reserve(10);

      expect(result).toBe(false);
    });

    it('should correctly release stock', () => {
      const entity = new InventoryEntity(mockInventory);
      const result = entity.release(5);

      expect(result).toBe(true);
      expect(entity.reserved).toBe(5);
      expect(entity.available).toBe(95);
    });

    it('should fail to release more than reserved', () => {
      const entity = new InventoryEntity({
        ...mockInventory,
        reserved: 5,
      });
      const result = entity.release(10);

      expect(result).toBe(false);
    });

    it('should correctly add stock', () => {
      const entity = new InventoryEntity(mockInventory);
      entity.addStock(20);

      expect(entity.quantity).toBe(120);
      expect(entity.available).toBe(110);
    });

    it('should correctly remove stock', () => {
      const entity = new InventoryEntity(mockInventory);
      const result = entity.removeStock(20);

      expect(result).toBe(true);
      expect(entity.quantity).toBe(80);
      expect(entity.available).toBe(70);
    });

    it('should fail to remove more than available', () => {
      const entity = new InventoryEntity({
        ...mockInventory,
        available: 5,
      });
      const result = entity.removeStock(10);

      expect(result).toBe(false);
    });
  });
});
