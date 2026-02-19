import { jest } from '@jest/globals';
import { ProductService } from '../../src/application/services/ProductService';
import prisma from '../../src/infrastructure/database/prisma';
import cache from '../../src/infrastructure/cache/redis';
import messaging from '../../src/infrastructure/messaging/rabbitmq';

// Mock dependencies
jest.mock('../../src/infrastructure/database/prisma');
jest.mock('../../src/infrastructure/cache/redis');
jest.mock('../../src/infrastructure/messaging/rabbitmq');

describe('ProductService', () => {
  let productService: ProductService;

  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  const mockCache = cache as jest.Mocked<typeof cache>;
  const mockMessaging = messaging as jest.Mocked<typeof messaging>;

  beforeEach(() => {
    productService = new ProductService();
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    const validProductData = {
      sku: 'TEST-001',
      name: 'Test Product',
      description: 'A test product',
      price: 99.99,
      stock: 10,
      images: ['https://example.com/image.jpg'],
      categoryId: 'cat-123',
      subcategoryId: 'sub-123',
      isActive: true
    };

    it('should create a product successfully', async () => {
      const mockProduct = {
        id: 'prod-123',
        ...validProductData,
        price: { toString: () => '99.99' },
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
        subcategory: { id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() }
      };

      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.category.findUnique = jest.fn().mockResolvedValue({ id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() });
      mockPrisma.subcategory.findUnique = jest.fn().mockResolvedValue({ id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() });
      mockPrisma.product.create = jest.fn().mockResolvedValue(mockProduct);
      mockMessaging.publishProductCreated = jest.fn().mockResolvedValue(true);
      mockCache.invalidateProductCache = jest.fn().mockResolvedValue(undefined);

      const result = await productService.createProduct(validProductData);

      expect(result).toBeDefined();
      expect(result.sku).toBe(validProductData.sku);
      expect(mockPrisma.product.create).toHaveBeenCalled();
      expect(mockMessaging.publishProductCreated).toHaveBeenCalled();
      expect(mockCache.invalidateProductCache).toHaveBeenCalled();
    });

    it('should throw error if SKU already exists', async () => {
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue({ id: 'existing', sku: 'TEST-001' });

      await expect(productService.createProduct(validProductData))
        .rejects
        .toThrow('Product with SKU TEST-001 already exists');
    });

    it('should throw error if category does not exist', async () => {
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.category.findUnique = jest.fn().mockResolvedValue(null);

      await expect(productService.createProduct(validProductData))
        .rejects
        .toThrow('Category with ID cat-123 not found');
    });

    it('should throw error if subcategory does not belong to category', async () => {
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.category.findUnique = jest.fn().mockResolvedValue({ id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() });
      mockPrisma.subcategory.findUnique = jest.fn().mockResolvedValue({ id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'different-cat', createdAt: new Date(), updatedAt: new Date() });

      await expect(productService.createProduct(validProductData))
        .rejects
        .toThrow('Subcategory does not belong to the specified category');
    });
  });

  describe('getProductById', () => {
    it('should return product from cache if available', async () => {
      const cachedProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Test Product',
        description: 'A test product',
        price: 99.99,
        stock: 10,
        images: [],
        categoryId: 'cat-123',
        subcategoryId: 'sub-123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockCache.get = jest.fn().mockResolvedValue(cachedProduct);

      const result = await productService.getProductById('prod-123');

      expect(result).toEqual(cachedProduct);
      expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch product from database if not in cache', async () => {
      const mockProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Test Product',
        description: 'A test product',
        price: { toString: () => '99.99' },
        stock: 10,
        images: [],
        categoryId: 'cat-123',
        subcategoryId: 'sub-123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
        subcategory: { id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() }
      };

      mockCache.get = jest.fn().mockResolvedValue(null);
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);
      mockCache.set = jest.fn().mockResolvedValue(undefined);

      const result = await productService.getProductById('prod-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('prod-123');
      expect(mockPrisma.product.findUnique).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return null if product not found', async () => {
      mockCache.get = jest.fn().mockResolvedValue(null);
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);

      const result = await productService.getProductById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getProducts', () => {
    it('should return paginated products', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          sku: 'TEST-001',
          name: 'Product 1',
          description: 'Description 1',
          price: { toString: () => '10.00' },
          stock: 5,
          images: [],
          categoryId: 'cat-123',
          subcategoryId: 'sub-123',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
          subcategory: { id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() }
        }
      ];

      mockCache.get = jest.fn().mockResolvedValue(null);
      mockPrisma.product.count = jest.fn().mockResolvedValue(1);
      mockPrisma.product.findMany = jest.fn().mockResolvedValue(mockProducts);
      mockCache.set = jest.fn().mockResolvedValue(undefined);

      const result = await productService.getProducts({ page: 1, limit: 10 });

      expect(result.products).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should apply filters correctly', async () => {
      mockCache.get = jest.fn().mockResolvedValue(null);
      mockPrisma.product.count = jest.fn().mockResolvedValue(0);
      mockPrisma.product.findMany = jest.fn().mockResolvedValue([]);
      mockCache.set = jest.fn().mockResolvedValue(undefined);

      await productService.getProducts({
        categoryId: 'cat-123',
        minPrice: 10,
        maxPrice: 100,
        isActive: true
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-123',
            price: { gte: 10, lte: 100 },
            isActive: true
          })
        })
      );
    });
  });

  describe('searchProducts', () => {
    it('should search products by query', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          sku: 'TEST-001',
          name: 'Test Product',
          description: 'Description',
          price: { toString: () => '10.00' },
          stock: 5,
          images: [],
          categoryId: 'cat-123',
          subcategoryId: 'sub-123',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
          subcategory: { id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() }
        }
      ];

      mockCache.get = jest.fn().mockResolvedValue(null);
      mockPrisma.product.count = jest.fn().mockResolvedValue(1);
      mockPrisma.product.findMany = jest.fn().mockResolvedValue(mockProducts);
      mockCache.set = jest.fn().mockResolvedValue(undefined);

      const result = await productService.searchProducts('test');

      expect(result.products).toHaveLength(1);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'test' }) })
            ])
          })
        })
      );
    });
  });

  describe('updateProduct', () => {
    it('should update product successfully', async () => {
      const existingProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Old Name',
        description: 'Old Description',
        price: 50.00,
        stock: 10,
        images: [],
        categoryId: 'cat-123',
        subcategoryId: 'sub-123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const updatedProduct = {
        ...existingProduct,
        name: 'New Name',
        price: { toString: () => '75.00' },
        category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
        subcategory: { id: 'sub-123', name: 'Test Subcategory', slug: 'test-subcategory', categoryId: 'cat-123', createdAt: new Date(), updatedAt: new Date() }
      };

      mockPrisma.product.findUnique = jest.fn()
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce(null);
      mockPrisma.product.update = jest.fn().mockResolvedValue(updatedProduct);
      mockMessaging.publishProductUpdated = jest.fn().mockResolvedValue(true);
      mockCache.invalidateProductCache = jest.fn().mockResolvedValue(undefined);

      const result = await productService.updateProduct('prod-123', { name: 'New Name', price: 75.00 });

      expect(result.name).toBe('New Name');
      expect(mockPrisma.product.update).toHaveBeenCalled();
      expect(mockMessaging.publishProductUpdated).toHaveBeenCalled();
    });

    it('should throw error if product not found', async () => {
      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(null);

      await expect(productService.updateProduct('non-existent', { name: 'New Name' }))
        .rejects
        .toThrow('Product with ID non-existent not found');
    });
  });

  describe('deleteProduct', () => {
    it('should delete product successfully', async () => {
      const mockProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Test Product',
        categoryId: 'cat-123',
        subcategoryId: 'sub-123'
      };

      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);
      mockPrisma.product.delete = jest.fn().mockResolvedValue(mockProduct);
      mockMessaging.publishProductDeleted = jest.fn().mockResolvedValue(true);
      mockCache.invalidateProductCache = jest.fn().mockResolvedValue(undefined);

      await productService.deleteProduct('prod-123');

      expect(mockPrisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-123' } });
      expect(mockMessaging.publishProductDeleted).toHaveBeenCalled();
    });
  });

  describe('updateStock', () => {
    it('should increment stock successfully', async () => {
      const mockProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Test Product',
        stock: 10,
        isActive: true
      };

      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);
      mockPrisma.product.update = jest.fn().mockResolvedValue({ ...mockProduct, stock: 15 });
      mockMessaging.publishProductStockChanged = jest.fn().mockResolvedValue(true);
      mockCache.invalidateProductCache = jest.fn().mockResolvedValue(undefined);

      const result = await productService.updateStock('prod-123', { quantity: 5, operation: 'increment' });

      expect(result.currentStock).toBe(15);
      expect(result.previousStock).toBe(10);
    });

    it('should throw error if decrementing below zero', async () => {
      const mockProduct = {
        id: 'prod-123',
        sku: 'TEST-001',
        name: 'Test Product',
        stock: 5
      };

      mockPrisma.product.findUnique = jest.fn().mockResolvedValue(mockProduct);

      await expect(productService.updateStock('prod-123', { quantity: 10, operation: 'decrement' }))
        .rejects
        .toThrow('Insufficient stock');
    });
  });

  describe('createCategory', () => {
    it('should create category successfully', async () => {
      const mockCategory = {
        id: 'cat-123',
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.category.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.category.create = jest.fn().mockResolvedValue(mockCategory);

      const result = await productService.createCategory({
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category'
      });

      expect(result.name).toBe('Test Category');
      expect(result.slug).toBe('test-category');
    });

    it('should throw error if slug already exists', async () => {
      mockPrisma.category.findUnique = jest.fn().mockResolvedValue({ id: 'existing', slug: 'test-category' });

      await expect(productService.createCategory({
        name: 'Test Category',
        slug: 'test-category'
      }))
        .rejects
        .toThrow('Category with slug test-category already exists');
    });
  });

  describe('createSubcategory', () => {
    it('should create subcategory successfully', async () => {
      const mockSubcategory = {
        id: 'sub-123',
        name: 'Test Subcategory',
        slug: 'test-subcategory',
        categoryId: 'cat-123',
        category: { id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.category.findUnique = jest.fn().mockResolvedValue({ id: 'cat-123', name: 'Test Category', slug: 'test-category', description: null, createdAt: new Date(), updatedAt: new Date() });
      mockPrisma.subcategory.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.subcategory.create = jest.fn().mockResolvedValue(mockSubcategory);

      const result = await productService.createSubcategory({
        name: 'Test Subcategory',
        slug: 'test-subcategory',
        categoryId: 'cat-123'
      });

      expect(result.name).toBe('Test Subcategory');
      expect(result.categoryId).toBe('cat-123');
    });
  });
});
