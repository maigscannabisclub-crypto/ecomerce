import request from 'supertest';
import express from 'express';
import { createInventoryRoutes } from '../../src/presentation/routes/inventory.routes';
import { InventoryController } from '../../src/presentation/controllers/InventoryController';
import { InventoryService } from '../../src/application/services/InventoryService';
import { IdempotencyService } from '../../src/utils/idempotency';
import { MovementType } from '../../src/domain/entities/Inventory';
import { generateToken } from '../../src/presentation/middleware/auth';

// Mock Prisma
const mockPrisma = {
  inventory: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
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
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
  $queryRaw: jest.fn(),
};

// Mock event publisher
const mockEventPublisher = jest.fn().mockResolvedValue(undefined);

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());

  const idempotencyService = new IdempotencyService(mockPrisma as any);
  const inventoryService = new InventoryService(
    mockPrisma as any,
    idempotencyService,
    mockEventPublisher
  );
  const inventoryController = new InventoryController(inventoryService);

  app.use('/api/v1/inventory', createInventoryRoutes(inventoryController));

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  });

  return app;
}

describe('Inventory Routes Integration Tests', () => {
  let app: express.Application;
  let adminToken: string;
  let userToken: string;

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

  beforeAll(() => {
    app = createTestApp();
    adminToken = generateToken('admin-001', 'admin@test.com', ['admin']);
    userToken = generateToken('user-001', 'user@test.com', ['user']);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/v1/inventory/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.service).toBe('inventory-service');
    });
  });

  describe('POST /api/v1/inventory', () => {
    it('should create inventory with admin token', async () => {
      const createData = {
        productId: 'prod-001',
        sku: 'SKU-001',
        quantity: 100,
        minStock: 10,
        reorderPoint: 20,
        location: 'WAREHOUSE-A',
      };

      mockPrisma.inventory.findFirst.mockResolvedValue(null);
      mockPrisma.inventory.create.mockResolvedValue(mockInventory);
      mockPrisma.inventoryMovement.create.mockResolvedValue({
        id: 'mov-001',
        inventoryId: 'inv-001',
        type: MovementType.IN,
        quantity: 100,
        reason: 'Initial stock entry',
      });

      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.productId).toBe(createData.productId);
    });

    it('should reject creation without token', async () => {
      const createData = {
        productId: 'prod-001',
        sku: 'SKU-001',
        quantity: 100,
      };

      const response = await request(app).post('/api/v1/inventory').send(createData);

      expect(response.status).toBe(401);
    });

    it('should reject creation with user token', async () => {
      const createData = {
        productId: 'prod-001',
        sku: 'SKU-001',
        quantity: 100,
      };

      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createData);

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        sku: 'SKU-001',
        quantity: 100,
      };

      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/inventory/:productId', () => {
    it('should get inventory by product ID with valid token', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);

      const response = await request(app)
        .get('/api/v1/inventory/prod-001')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.productId).toBe('prod-001');
    });

    it('should return 404 for non-existent inventory', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/inventory/non-existent')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('INVENTORY_NOT_FOUND');
    });

    it('should validate productId format', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/invalid-uuid')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/inventory/:productId/reserve', () => {
    it('should reserve stock successfully', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrisma.inventory.update.mockResolvedValue({
        ...mockInventory,
        reserved: 20,
        available: 80,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({
        id: 'mov-002',
        inventoryId: 'inv-001',
        type: MovementType.RESERVE,
        quantity: 10,
        reason: 'Stock reserved for order order-001',
        orderId: 'order-001',
      });

      const response = await request(app)
        .post('/api/v1/inventory/prod-001/reserve')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 10,
          orderId: 'order-001',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reservedQuantity).toBe(10);
    });

    it('should fail reservation with insufficient stock', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        ...mockInventory,
        available: 5,
      });

      const response = await request(app)
        .post('/api/v1/inventory/prod-001/reserve')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 10,
          orderId: 'order-001',
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('STOCK_RESERVATION_FAILED');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/inventory/prod-001/reserve')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 10,
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/inventory/:productId/release', () => {
    it('should release stock successfully', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrisma.inventory.update.mockResolvedValue({
        ...mockInventory,
        reserved: 5,
        available: 95,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({
        id: 'mov-003',
        inventoryId: 'inv-001',
        type: MovementType.RELEASE,
        quantity: 5,
        reason: 'Stock released for order order-001',
        orderId: 'order-001',
      });

      const response = await request(app)
        .post('/api/v1/inventory/prod-001/release')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 5,
          orderId: 'order-001',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.releasedQuantity).toBe(5);
    });

    it('should fail release if releasing more than reserved', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        ...mockInventory,
        reserved: 5,
      });

      const response = await request(app)
        .post('/api/v1/inventory/prod-001/release')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 10,
          orderId: 'order-001',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('STOCK_RELEASE_FAILED');
    });
  });

  describe('POST /api/v1/inventory/:productId/adjust', () => {
    it('should adjust stock with admin token', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrisma.inventory.update.mockResolvedValue({
        ...mockInventory,
        quantity: 120,
        available: 110,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({
        id: 'mov-004',
        inventoryId: 'inv-001',
        type: MovementType.IN,
        quantity: 20,
        reason: 'Stock received from supplier',
      });

      const response = await request(app)
        .post('/api/v1/inventory/prod-001/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quantity: 20,
          reason: 'Stock received from supplier',
          type: MovementType.IN,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.adjustment).toBe(20);
    });

    it('should reject adjustment with user token', async () => {
      const response = await request(app)
        .post('/api/v1/inventory/prod-001/adjust')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantity: 20,
          reason: 'Stock received',
          type: MovementType.IN,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/inventory/:productId/movements', () => {
    it('should get inventory movements with admin token', async () => {
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

      mockPrisma.inventory.findUnique.mockResolvedValue(inventoryWithMovements);

      const response = await request(app)
        .get('/api/v1/inventory/prod-001/movements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.movements).toHaveLength(1);
    });

    it('should reject access with user token', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/prod-001/movements')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/inventory/alerts/low-stock', () => {
    it('should get low stock alerts with admin token', async () => {
      const lowStockItems = [
        { ...mockInventory, available: 5, minStock: 10 },
        { ...mockInventory, id: 'inv-002', available: 3, minStock: 10 },
      ];

      mockPrisma.inventory.findMany.mockResolvedValue(lowStockItems);

      const response = await request(app)
        .get('/api/v1/inventory/alerts/low-stock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should reject access with user token', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/alerts/low-stock')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/inventory', () => {
    it('should get all inventory with pagination', async () => {
      mockPrisma.inventory.findMany.mockResolvedValue([mockInventory]);
      mockPrisma.inventory.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/inventory?page=1&limit=20')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
    });

    it('should use default pagination when not provided', async () => {
      mockPrisma.inventory.findMany.mockResolvedValue([mockInventory]);
      mockPrisma.inventory.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
    });
  });

  describe('PATCH /api/v1/inventory/:productId', () => {
    it('should update inventory with admin token', async () => {
      mockPrisma.inventory.update.mockResolvedValue({
        ...mockInventory,
        minStock: 15,
        reorderPoint: 25,
      });

      const response = await request(app)
        .patch('/api/v1/inventory/prod-001')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          minStock: 15,
          reorderPoint: 25,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.minStock).toBe(15);
      expect(response.body.data.reorderPoint).toBe(25);
    });

    it('should require at least one field to update', async () => {
      const response = await request(app)
        .patch('/api/v1/inventory/prod-001')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/inventory/:productId', () => {
    it('should delete inventory with admin token', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrisma.inventoryMovement.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventory.delete.mockResolvedValue(mockInventory);

      const response = await request(app)
        .delete('/api/v1/inventory/prod-001')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Inventory deleted successfully');
    });

    it('should return error if inventory not found', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/v1/inventory/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/v1/inventory/batch/reserve', () => {
    it('should batch reserve stock', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrisma.inventory.update.mockResolvedValue({
        ...mockInventory,
        reserved: 20,
        available: 80,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/inventory/batch/reserve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { productId: 'prod-001', quantity: 5 },
            { productId: 'prod-002', quantity: 5 },
          ],
          orderId: 'order-001',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should validate items array', async () => {
      const response = await request(app)
        .post('/api/v1/inventory/batch/reserve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [],
          orderId: 'order-001',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/inventory/sku/:sku', () => {
    it('should get inventory by SKU', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(mockInventory);

      const response = await request(app)
        .get('/api/v1/inventory/sku/SKU-001')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('SKU-001');
    });

    it('should validate SKU format', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/sku/A')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
