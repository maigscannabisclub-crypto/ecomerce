import { jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { CartStatus } from '@prisma/client';
import { CartService, CartError } from '../../src/application/services/CartService';
import { cartRepository } from '../../src/infrastructure/database/prisma';
import redisClient from '../../src/infrastructure/cache/redis';
import { createInventoryServiceClient } from '../../src/infrastructure/http/HttpClient';

// Mock dependencies
jest.mock('../../src/infrastructure/database/prisma');
jest.mock('../../src/infrastructure/cache/redis');
jest.mock('../../src/infrastructure/http/HttpClient');

describe('CartService', () => {
  let cartService: CartService;
  let mockInventoryClient: any;

  const mockUserId = 'user-123';
  const mockCartId = 'cart-123';
  const mockProductId = 'prod-123';
  const mockItemId = 'item-123';

  const mockProduct = {
    id: mockProductId,
    name: 'Test Product',
    sku: 'TEST-001',
    price: 99.99,
    stock: 100,
    isActive: true,
  };

  const mockCartItem = {
    id: mockItemId,
    cartId: mockCartId,
    productId: mockProductId,
    productName: 'Test Product',
    productSku: 'TEST-001',
    quantity: 2,
    unitPrice: new Decimal(99.99),
    subtotal: new Decimal(199.98),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCart = {
    id: mockCartId,
    userId: mockUserId,
    items: [mockCartItem],
    total: new Decimal(199.98),
    status: CartStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock inventory client
    mockInventoryClient = {
      checkStock: jest.fn().mockResolvedValue({
        available: true,
        stock: 100,
        requested: 2,
      }),
      getProduct: jest.fn().mockResolvedValue(mockProduct),
      getHealth: jest.fn().mockReturnValue({
        state: 'CLOSED',
        metrics: {},
      }),
    };

    (createInventoryServiceClient as jest.Mock).mockReturnValue(mockInventoryClient);

    cartService = new CartService();
  });

  describe('getCart', () => {
    it('should return cached cart if available', async () => {
      const cachedCart = {
        id: mockCartId,
        userId: mockUserId,
        items: [],
        total: 0,
        status: CartStatus.ACTIVE,
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        itemCount: 0,
        isExpired: false,
      };

      (redisClient.getCart as jest.Mock).mockResolvedValue(cachedCart);

      const result = await cartService.getCart(mockUserId);

      expect(result).toEqual(cachedCart);
      expect(redisClient.getCart).toHaveBeenCalledWith(mockUserId);
      expect(cartRepository.findActiveByUserId).not.toHaveBeenCalled();
    });

    it('should create new cart if user has no active cart', async () => {
      (redisClient.getCart as jest.Mock).mockResolvedValue(null);
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);
      (cartRepository.create as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.getCart(mockUserId);

      expect(cartRepository.create).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Date)
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should create new cart if existing cart is expired', async () => {
      const expiredCart = {
        ...mockCart,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };

      (redisClient.getCart as jest.Mock).mockResolvedValue(null);
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(expiredCart);
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...expiredCart,
        status: CartStatus.EXPIRED,
      });
      (cartRepository.create as jest.Mock).mockResolvedValue({
        ...mockCart,
        id: 'new-cart-id',
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.getCart(mockUserId);

      expect(cartRepository.updateCart).toHaveBeenCalledWith(
        mockCartId,
        { status: CartStatus.EXPIRED }
      );
      expect(result.id).toBe('new-cart-id');
    });
  });

  describe('addItem', () => {
    const addItemData = {
      productId: mockProductId,
      quantity: 2,
    };

    it('should add new item to cart successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.addItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [mockCartItem],
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [mockCartItem],
      });

      const result = await cartService.addItem(mockUserId, addItemData);

      expect(mockInventoryClient.checkStock).toHaveBeenCalledWith(
        mockProductId,
        addItemData.quantity
      );
      expect(mockInventoryClient.getProduct).toHaveBeenCalledWith(mockProductId);
      expect(cartRepository.addItem).toHaveBeenCalled();
      expect(redisClient.deleteCart).toHaveBeenCalledWith(mockUserId);
      expect(result.items).toHaveLength(1);
    });

    it('should update quantity if item already exists in cart', async () => {
      const existingItem = {
        ...mockCartItem,
        quantity: 1,
        subtotal: new Decimal(99.99),
      };

      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [existingItem],
        total: new Decimal(99.99),
      });
      (cartRepository.updateItem as jest.Mock).mockResolvedValue({
        ...existingItem,
        quantity: 3,
        subtotal: new Decimal(299.97),
      });
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...existingItem, quantity: 3, subtotal: new Decimal(299.97) }],
        total: new Decimal(299.97),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...existingItem, quantity: 3, subtotal: new Decimal(299.97) }],
        total: new Decimal(299.97),
      });

      const result = await cartService.addItem(mockUserId, addItemData);

      expect(cartRepository.updateItem).toHaveBeenCalled();
      expect(result.items[0].quantity).toBe(3);
    });

    it('should throw error if stock is insufficient', async () => {
      mockInventoryClient.checkStock.mockResolvedValue({
        available: false,
        stock: 1,
        requested: 2,
      });

      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);

      await expect(cartService.addItem(mockUserId, addItemData)).rejects.toThrow(
        CartError
      );
    });

    it('should throw error if product not found', async () => {
      mockInventoryClient.getProduct.mockResolvedValue(null);

      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);

      await expect(cartService.addItem(mockUserId, addItemData)).rejects.toThrow(
        CartError
      );
    });

    it('should throw error if product is not active', async () => {
      mockInventoryClient.getProduct.mockResolvedValue({
        ...mockProduct,
        isActive: false,
      });

      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);

      await expect(cartService.addItem(mockUserId, addItemData)).rejects.toThrow(
        CartError
      );
    });
  });

  describe('updateItem', () => {
    const updateData = { quantity: 5 };

    it('should update item quantity successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.updateItem as jest.Mock).mockResolvedValue({
        ...mockCartItem,
        quantity: 5,
        subtotal: new Decimal(499.95),
      });
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...mockCartItem, quantity: 5, subtotal: new Decimal(499.95) }],
        total: new Decimal(499.95),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [{ ...mockCartItem, quantity: 5, subtotal: new Decimal(499.95) }],
        total: new Decimal(499.95),
      });

      const result = await cartService.updateItem(mockUserId, mockItemId, updateData);

      expect(cartRepository.updateItem).toHaveBeenCalledWith(mockItemId, {
        quantity: 5,
        subtotal: 499.95,
      });
      expect(result.items[0].quantity).toBe(5);
    });

    it('should remove item when quantity is 0', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.updateItem(mockUserId, mockItemId, { quantity: 0 });

      expect(cartRepository.deleteItem).toHaveBeenCalledWith(mockItemId);
      expect(result.items).toHaveLength(0);
    });

    it('should throw error if cart not found', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        cartService.updateItem(mockUserId, mockItemId, updateData)
      ).rejects.toThrow(CartError);
    });

    it('should throw error if item not found', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await expect(
        cartService.updateItem(mockUserId, 'non-existent-item', updateData)
      ).rejects.toThrow(CartError);
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteItem as jest.Mock).mockResolvedValue(mockCartItem);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.removeItem(mockUserId, mockItemId);

      expect(cartRepository.deleteItem).toHaveBeenCalledWith(mockItemId);
      expect(result.items).toHaveLength(0);
      expect(redisClient.deleteCart).toHaveBeenCalledWith(mockUserId);
    });

    it('should throw error if cart not found', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        cartService.removeItem(mockUserId, mockItemId)
      ).rejects.toThrow(CartError);
    });

    it('should throw error if item not found', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await expect(
        cartService.removeItem(mockUserId, mockItemId)
      ).rejects.toThrow(CartError);
    });
  });

  describe('clearCart', () => {
    it('should clear all items from cart', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.deleteAllItems as jest.Mock).mockResolvedValue({ count: 1 });
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.clearCart(mockUserId);

      expect(cartRepository.deleteAllItems).toHaveBeenCalledWith(mockCartId);
      expect(cartRepository.updateCart).toHaveBeenCalledWith(mockCartId, { total: 0 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should create new cart if no active cart exists', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null);
      (cartRepository.create as jest.Mock).mockResolvedValue({
        ...mockCart,
        id: 'new-cart-id',
        items: [],
        total: new Decimal(0),
      });

      const result = await cartService.clearCart(mockUserId);

      expect(cartRepository.create).toHaveBeenCalled();
      expect(result.items).toHaveLength(0);
    });
  });

  describe('mergeCarts', () => {
    const sourceCartId = 'source-cart-123';

    const sourceCart = {
      ...mockCart,
      id: sourceCartId,
      userId: 'anonymous-user',
      items: [{
        ...mockCartItem,
        id: 'source-item-123',
        productId: 'prod-456',
        productName: 'Another Product',
        productSku: 'TEST-002',
        quantity: 1,
        unitPrice: new Decimal(49.99),
        subtotal: new Decimal(49.99),
      }],
      total: new Decimal(49.99),
    };

    it('should merge source cart into target cart successfully', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.findById as jest.Mock).mockResolvedValue(sourceCart);
      (cartRepository.addItem as jest.Mock).mockResolvedValue(sourceCart.items[0]);
      (cartRepository.updateCart as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [...mockCart.items, sourceCart.items[0]],
        total: new Decimal(249.97),
      });
      (cartRepository.findById as jest.Mock)
        .mockResolvedValueOnce(sourceCart)
        .mockResolvedValue({
          ...mockCart,
          items: [...mockCart.items, sourceCart.items[0]],
          total: new Decimal(249.97),
        });

      mockInventoryClient.checkStock.mockResolvedValue({
        available: true,
        stock: 100,
        requested: 1,
      });

      const result = await cartService.mergeCarts(mockUserId, sourceCartId);

      expect(cartRepository.findById).toHaveBeenCalledWith(sourceCartId);
      expect(cartRepository.updateCart).toHaveBeenCalledWith(
        sourceCartId,
        { status: CartStatus.CONVERTED }
      );
      expect(result.items).toHaveLength(2);
    });

    it('should throw error if source cart not found', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        cartService.mergeCarts(mockUserId, sourceCartId)
      ).rejects.toThrow(CartError);
    });

    it('should throw error if source cart is not active', async () => {
      (cartRepository.findActiveByUserId as jest.Mock).mockResolvedValue(mockCart);
      (cartRepository.findById as jest.Mock).mockResolvedValue({
        ...sourceCart,
        status: CartStatus.EXPIRED,
      });

      await expect(
        cartService.mergeCarts(mockUserId, sourceCartId)
      ).rejects.toThrow(CartError);
    });
  });

  describe('cleanupExpiredCarts', () => {
    it('should update expired carts status', async () => {
      (cartRepository.updateExpiredCarts as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await cartService.cleanupExpiredCarts();

      expect(cartRepository.updateExpiredCarts).toHaveBeenCalled();
      expect(result).toBe(5);
    });
  });
});
