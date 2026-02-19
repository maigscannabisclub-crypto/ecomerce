import { Router } from 'express';
import { CartController, cartErrorHandler } from '../controllers/CartController';
import { authenticate } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import {
  addItemSchema,
  updateItemSchema,
  mergeCartSchema,
  itemIdParamSchema,
} from '../../application/dto/CartDTO';

const router = Router();
const cartController = new CartController();

/**
 * @route   GET /cart
 * @desc    Get user's cart
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  cartController.getCart
);

/**
 * @route   POST /cart/items
 * @desc    Add item to cart
 * @access  Private
 */
router.post(
  '/items',
  authenticate,
  validateBody(addItemSchema),
  cartController.addItem
);

/**
 * @route   PUT /cart/items/:itemId
 * @desc    Update item quantity in cart
 * @access  Private
 */
router.put(
  '/items/:itemId',
  authenticate,
  validateParams(itemIdParamSchema),
  validateBody(updateItemSchema),
  cartController.updateItem
);

/**
 * @route   DELETE /cart/items/:itemId
 * @desc    Remove item from cart
 * @access  Private
 */
router.delete(
  '/items/:itemId',
  authenticate,
  validateParams(itemIdParamSchema),
  cartController.removeItem
);

/**
 * @route   DELETE /cart
 * @desc    Clear cart (remove all items)
 * @access  Private
 */
router.delete(
  '/',
  authenticate,
  cartController.clearCart
);

/**
 * @route   POST /cart/merge
 * @desc    Merge source cart into user's cart
 * @access  Private
 */
router.post(
  '/merge',
  authenticate,
  validateBody(mergeCartSchema),
  cartController.mergeCarts
);

// Apply cart-specific error handler
router.use(cartErrorHandler);

export default router;
