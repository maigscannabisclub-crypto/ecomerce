import { CartStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../../config';
import { Cart, CartItem } from '../../domain/entities/Cart';
import {
  AddItemRequestDTO,
  UpdateItemRequestDTO,
  CartResponseDTO,
  toCartResponseDTO,
} from '../dto/CartDTO';
import { cartRepository } from '../../infrastructure/database/prisma';
import redisClient from '../../infrastructure/cache/redis';
import { createInventoryServiceClient, InventoryServiceClient } from '../../infrastructure/http/HttpClient';
import logger from '../../utils/logger';

export class CartService {
  private inventoryClient: InventoryServiceClient;

  constructor() {
    this.inventoryClient = createInventoryServiceClient();
  }

  // ==================== Cart Operations ====================

  async getCart(userId: string): Promise<CartResponseDTO> {
    logger.debug(`Getting cart for user: ${userId}`);

    // Try cache first
    const cachedCart = await redisClient.getCart(userId);
    if (cachedCart) {
      logger.debug(`Cache hit for cart: ${userId}`);
      return cachedCart;
    }

    // Get from database
    let cart = await cartRepository.findActiveByUserId(userId);

    // Create new cart if not exists
    if (!cart) {
      logger.info(`Creating new cart for user: ${userId}`);
      cart = await this.createCart(userId);
    }

    // Check if cart is expired
    if (new Date() > cart.expiresAt) {
      logger.info(`Cart expired for user: ${userId}`);
      await this.expireCart(cart.id);
      cart = await this.createCart(userId);
    }

    const response = toCartResponseDTO(cart);
    
    // Cache the cart
    await redisClient.setCart(userId, response);

    return response;
  }

  async addItem(
    userId: string,
    itemData: AddItemRequestDTO
  ): Promise<CartResponseDTO> {
    logger.info(`Adding item to cart for user: ${userId}`, { 
      productId: itemData.productId, 
      quantity: itemData.quantity 
    });

    // Validate cart limits
    const existingCart = await cartRepository.findActiveByUserId(userId);
    const currentItemCount = existingCart?.items.reduce(
      (sum, item) => sum + item.quantity, 
      0
    ) || 0;

    if (currentItemCount + itemData.quantity > config.cartMaxQuantityPerItem) {
      throw new CartError(
        `Maximum quantity per item (${config.cartMaxQuantityPerItem}) exceeded`,
        'MAX_QUANTITY_EXCEEDED'
      );
    }

    if ((existingCart?.items.length || 0) >= config.cartMaxItems) {
      throw new CartError(
        `Maximum number of items (${config.cartMaxItems}) in cart exceeded`,
        'MAX_ITEMS_EXCEEDED'
      );
    }

    // Check stock availability
    const stockCheck = await this.inventoryClient.checkStock(
      itemData.productId,
      itemData.quantity
    );

    if (!stockCheck.available) {
      throw new CartError(
        `Insufficient stock for product ${itemData.productId}. ` +
        `Available: ${stockCheck.stock}, Requested: ${stockCheck.requested}`,
        'INSUFFICIENT_STOCK'
      );
    }

    // Get product details
    const product = await this.inventoryClient.getProduct(itemData.productId);
    if (!product) {
      throw new CartError(
        `Product ${itemData.productId} not found`,
        'PRODUCT_NOT_FOUND'
      );
    }

    if (!product.isActive) {
      throw new CartError(
        `Product ${product.name} is not available`,
        'PRODUCT_NOT_AVAILABLE'
      );
    }

    // Get or create cart
    let cart = await cartRepository.findActiveByUserId(userId);
    if (!cart) {
      cart = await this.createCart(userId);
    }

    // Check if item already exists in cart
    const existingItem = cart.items.find(
      item => item.productId === itemData.productId
    );

    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + itemData.quantity;
      const unitPrice = existingItem.unitPrice instanceof Decimal 
        ? existingItem.unitPrice.toNumber() 
        : existingItem.unitPrice;
      const newSubtotal = unitPrice * newQuantity;

      await cartRepository.updateItem(existingItem.id, {
        quantity: newQuantity,
        subtotal: newSubtotal,
      });
    } else {
      // Add new item
      await cartRepository.addItem(cart.id, {
        productId: itemData.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: itemData.quantity,
        unitPrice: product.price,
        subtotal: product.price * itemData.quantity,
      });
    }

    // Recalculate total
    const updatedCart = await this.recalculateCartTotal(cart.id);

    // Update expiration
    await this.extendCartExpiration(cart.id);

    // Invalidate cache
    await redisClient.deleteCart(userId);

    logger.info(`Item added to cart for user: ${userId}`, {
      productId: itemData.productId,
      quantity: itemData.quantity,
    });

    return toCartResponseDTO(updatedCart);
  }

  async updateItem(
    userId: string,
    itemId: string,
    updateData: UpdateItemRequestDTO
  ): Promise<CartResponseDTO> {
    logger.info(`Updating item ${itemId} for user: ${userId}`, {
      quantity: updateData.quantity,
    });

    const cart = await cartRepository.findActiveByUserId(userId);
    if (!cart) {
      throw new CartError('Cart not found', 'CART_NOT_FOUND');
    }

    const item = cart.items.find(i => i.id === itemId);
    if (!item) {
      throw new CartError('Item not found in cart', 'ITEM_NOT_FOUND');
    }

    if (updateData.quantity === 0) {
      // Remove item
      await cartRepository.deleteItem(itemId);
    } else {
      // Check stock for new quantity
      const stockCheck = await this.inventoryClient.checkStock(
        item.productId,
        updateData.quantity
      );

      if (!stockCheck.available) {
        throw new CartError(
          `Insufficient stock. Available: ${stockCheck.stock}, ` +
          `Requested: ${updateData.quantity}`,
          'INSUFFICIENT_STOCK'
        );
      }

      // Update item
      const unitPrice = item.unitPrice instanceof Decimal 
        ? item.unitPrice.toNumber() 
        : item.unitPrice;
      const newSubtotal = unitPrice * updateData.quantity;

      await cartRepository.updateItem(itemId, {
        quantity: updateData.quantity,
        subtotal: newSubtotal,
      });
    }

    // Recalculate total
    const updatedCart = await this.recalculateCartTotal(cart.id);

    // Update expiration
    await this.extendCartExpiration(cart.id);

    // Invalidate cache
    await redisClient.deleteCart(userId);

    logger.info(`Item ${itemId} updated for user: ${userId}`);

    return toCartResponseDTO(updatedCart);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponseDTO> {
    logger.info(`Removing item ${itemId} for user: ${userId}`);

    const cart = await cartRepository.findActiveByUserId(userId);
    if (!cart) {
      throw new CartError('Cart not found', 'CART_NOT_FOUND');
    }

    const item = cart.items.find(i => i.id === itemId);
    if (!item) {
      throw new CartError('Item not found in cart', 'ITEM_NOT_FOUND');
    }

    await cartRepository.deleteItem(itemId);

    // Recalculate total
    const updatedCart = await this.recalculateCartTotal(cart.id);

    // Update expiration
    await this.extendCartExpiration(cart.id);

    // Invalidate cache
    await redisClient.deleteCart(userId);

    logger.info(`Item ${itemId} removed for user: ${userId}`);

    return toCartResponseDTO(updatedCart);
  }

  async clearCart(userId: string): Promise<CartResponseDTO> {
    logger.info(`Clearing cart for user: ${userId}`);

    const cart = await cartRepository.findActiveByUserId(userId);
    if (!cart) {
      // Return empty cart
      const newCart = await this.createCart(userId);
      return toCartResponseDTO(newCart);
    }

    await cartRepository.deleteAllItems(cart.id);
    const updatedCart = await cartRepository.updateCart(cart.id, { total: 0 });

    // Invalidate cache
    await redisClient.deleteCart(userId);

    logger.info(`Cart cleared for user: ${userId}`);

    return toCartResponseDTO(updatedCart);
  }

  async mergeCarts(
    userId: string,
    sourceCartId: string
  ): Promise<CartResponseDTO> {
    logger.info(`Merging cart ${sourceCartId} into user ${userId}'s cart`);

    // Get target cart (current user's cart)
    let targetCart = await cartRepository.findActiveByUserId(userId);
    if (!targetCart) {
      targetCart = await this.createCart(userId);
    }

    // Get source cart
    const sourceCart = await cartRepository.findById(sourceCartId);
    if (!sourceCart) {
      throw new CartError('Source cart not found', 'CART_NOT_FOUND');
    }

    if (sourceCart.status !== CartStatus.ACTIVE) {
      throw new CartError(
        'Cannot merge non-active cart',
        'INVALID_CART_STATUS'
      );
    }

    // Merge items
    for (const sourceItem of sourceCart.items) {
      const existingItem = targetCart.items.find(
        item => item.productId === sourceItem.productId
      );

      const sourceQuantity = sourceItem.quantity;
      const sourceUnitPrice = sourceItem.unitPrice instanceof Decimal 
        ? sourceItem.unitPrice.toNumber() 
        : sourceItem.unitPrice;

      if (existingItem) {
        // Merge quantities
        const existingQuantity = existingItem.quantity;
        const newQuantity = existingQuantity + sourceQuantity;

        // Check stock
        const stockCheck = await this.inventoryClient.checkStock(
          sourceItem.productId,
          newQuantity
        );

        if (!stockCheck.available) {
          logger.warn(
            `Insufficient stock for product ${sourceItem.productId} during merge. ` +
            `Using available stock: ${stockCheck.stock}`
          );
          // Use available stock or keep existing
          const finalQuantity = Math.min(
            stockCheck.stock > 0 ? stockCheck.stock : existingQuantity,
            newQuantity
          );
          
          if (finalQuantity > existingQuantity) {
            const newSubtotal = sourceUnitPrice * finalQuantity;
            await cartRepository.updateItem(existingItem.id, {
              quantity: finalQuantity,
              subtotal: newSubtotal,
            });
          }
        } else {
          const existingUnitPrice = existingItem.unitPrice instanceof Decimal 
            ? existingItem.unitPrice.toNumber() 
            : existingItem.unitPrice;
          const newSubtotal = existingUnitPrice * newQuantity;

          await cartRepository.updateItem(existingItem.id, {
            quantity: newQuantity,
            subtotal: newSubtotal,
          });
        }
      } else {
        // Check stock before adding
        const stockCheck = await this.inventoryClient.checkStock(
          sourceItem.productId,
          sourceQuantity
        );

        if (stockCheck.available) {
          await cartRepository.addItem(targetCart.id, {
            productId: sourceItem.productId,
            productName: sourceItem.productName,
            productSku: sourceItem.productSku,
            quantity: sourceQuantity,
            unitPrice: sourceUnitPrice,
            subtotal: sourceUnitPrice * sourceQuantity,
          });
        } else {
          logger.warn(
            `Skipping item ${sourceItem.productId} due to insufficient stock`
          );
        }
      }
    }

    // Mark source cart as converted
    await cartRepository.updateCart(sourceCartId, {
      status: CartStatus.CONVERTED,
    });

    // Recalculate target cart total
    const updatedCart = await this.recalculateCartTotal(targetCart.id);

    // Update expiration
    await this.extendCartExpiration(targetCart.id);

    // Invalidate cache
    await redisClient.deleteCart(userId);

    logger.info(`Carts merged successfully for user: ${userId}`);

    return toCartResponseDTO(updatedCart);
  }

  // ==================== Helper Methods ====================

  private async createCart(userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.cartExpirationDays);

    return cartRepository.create(userId, expiresAt);
  }

  private async recalculateCartTotal(cartId: string) {
    const cart = await cartRepository.findById(cartId);
    if (!cart) {
      throw new CartError('Cart not found', 'CART_NOT_FOUND');
    }

    const newTotal = cart.items.reduce((sum, item) => {
      const subtotal = item.subtotal instanceof Decimal 
        ? item.subtotal.toNumber() 
        : item.subtotal;
      return sum + subtotal;
    }, 0);

    return cartRepository.updateCart(cartId, { total: newTotal });
  }

  private async extendCartExpiration(cartId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.cartExpirationDays);

    return cartRepository.updateCart(cartId, { expiresAt });
  }

  private async expireCart(cartId: string) {
    return cartRepository.updateCart(cartId, {
      status: CartStatus.EXPIRED,
    });
  }

  // ==================== Cleanup Operations ====================

  async cleanupExpiredCarts(): Promise<number> {
    logger.info('Starting expired carts cleanup');

    const result = await cartRepository.updateExpiredCarts();

    logger.info(`Cleaned up ${result.count} expired carts`);

    return result.count;
  }

  // ==================== Health Check ====================

  async getHealth(): Promise<{
    database: boolean;
    cache: boolean;
    inventoryService: { state: string; metrics: any };
  }> {
    return {
      database: true, // Will be checked at infrastructure level
      cache: redisClient.isReady(),
      inventoryService: this.inventoryClient.getHealth(),
    };
  }
}

// Custom error class
export class CartError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CartError';
    Object.setPrototypeOf(this, CartError.prototype);
  }
}

// Singleton instance
export const cartService = new CartService();

export default CartService;
