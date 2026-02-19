import { Request, Response, NextFunction } from 'express';
import { CartService, CartError } from '../../application/services/CartService';
import {
  AddItemRequestDTO,
  UpdateItemRequestDTO,
  MergeCartRequestDTO,
} from '../../application/dto/CartDTO';
import logger from '../../utils/logger';

export class CartController {
  private cartService: CartService;

  constructor() {
    this.cartService = new CartService();
  }

  // ==================== Cart Operations ====================

  getCart = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      logger.debug(`Getting cart for user: ${userId}`);

      const cart = await this.cartService.getCart(userId);

      res.status(200).json({
        success: true,
        data: cart,
      });
    } catch (error) {
      next(error);
    }
  };

  addItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      const itemData: AddItemRequestDTO = req.body;

      logger.info(`Adding item to cart for user: ${userId}`, {
        productId: itemData.productId,
        quantity: itemData.quantity,
      });

      const cart = await this.cartService.addItem(userId, itemData);

      res.status(201).json({
        success: true,
        data: cart,
        message: 'Item added to cart successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  updateItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { itemId } = req.params;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      const updateData: UpdateItemRequestDTO = req.body;

      logger.info(`Updating item ${itemId} for user: ${userId}`, {
        quantity: updateData.quantity,
      });

      const cart = await this.cartService.updateItem(userId, itemId, updateData);

      res.status(200).json({
        success: true,
        data: cart,
        message: 'Item updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  removeItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { itemId } = req.params;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      logger.info(`Removing item ${itemId} for user: ${userId}`);

      const cart = await this.cartService.removeItem(userId, itemId);

      res.status(200).json({
        success: true,
        data: cart,
        message: 'Item removed from cart successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  clearCart = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      logger.info(`Clearing cart for user: ${userId}`);

      const cart = await this.cartService.clearCart(userId);

      res.status(200).json({
        success: true,
        data: cart,
        message: 'Cart cleared successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  mergeCarts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User ID not found in request',
        });
        return;
      }

      const { sourceCartId }: MergeCartRequestDTO = req.body;

      logger.info(`Merging cart ${sourceCartId} for user: ${userId}`);

      const cart = await this.cartService.mergeCarts(userId, sourceCartId);

      res.status(200).json({
        success: true,
        data: cart,
        message: 'Carts merged successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== Health Check ====================

  healthCheck = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.cartService.getHealth();

      const isHealthy = health.cache;

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: {
          service: 'cart-service',
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          ...health,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

// Error handler middleware for cart-specific errors
export const cartErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof CartError) {
    let statusCode = 400;
    
    switch (error.code) {
      case 'CART_NOT_FOUND':
      case 'ITEM_NOT_FOUND':
      case 'PRODUCT_NOT_FOUND':
        statusCode = 404;
        break;
      case 'INSUFFICIENT_STOCK':
      case 'MAX_QUANTITY_EXCEEDED':
      case 'MAX_ITEMS_EXCEEDED':
      case 'PRODUCT_NOT_AVAILABLE':
      case 'INVALID_CART_STATUS':
        statusCode = 400;
        break;
      default:
        statusCode = 400;
    }

    logger.warn(`Cart error: ${error.message}`, { code: error.code });

    res.status(statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
    });
    return;
  }

  next(error);
};

// Singleton instance
export const cartController = new CartController();

export default CartController;
