import Joi from 'joi';
import { Decimal } from '@prisma/client/runtime/library';

// ==================== Request DTOs ====================

export interface AddItemRequestDTO {
  productId: string;
  quantity: number;
}

export interface UpdateItemRequestDTO {
  quantity: number;
}

export interface MergeCartRequestDTO {
  sourceCartId: string;
}

// ==================== Validation Schemas ====================

export const addItemSchema = Joi.object({
  productId: Joi.string().uuid().required().messages({
    'string.guid': 'Product ID must be a valid UUID',
    'any.required': 'Product ID is required',
  }),
  quantity: Joi.number().integer().min(1).max(99).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 1',
    'number.max': 'Quantity cannot exceed 99',
    'any.required': 'Quantity is required',
  }),
});

export const updateItemSchema = Joi.object({
  quantity: Joi.number().integer().min(0).max(99).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity cannot be negative',
    'number.max': 'Quantity cannot exceed 99',
    'any.required': 'Quantity is required',
  }),
});

export const mergeCartSchema = Joi.object({
  sourceCartId: Joi.string().uuid().required().messages({
    'string.guid': 'Source cart ID must be a valid UUID',
    'any.required': 'Source cart ID is required',
  }),
});

export const itemIdParamSchema = Joi.object({
  itemId: Joi.string().uuid().required().messages({
    'string.guid': 'Item ID must be a valid UUID',
    'any.required': 'Item ID is required',
  }),
});

// ==================== Response DTOs ====================

export interface CartItemResponseDTO {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartResponseDTO {
  id: string;
  userId: string;
  items: CartItemResponseDTO[];
  total: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  isExpired: boolean;
}

export interface CartSummaryDTO {
  id: string;
  total: number;
  itemCount: number;
  status: string;
}

// ==================== Mappers ====================

export function toCartItemResponseDTO(item: {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: Decimal | number;
  subtotal: Decimal | number;
  createdAt: Date;
  updatedAt: Date;
}): CartItemResponseDTO {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productSku: item.productSku,
    quantity: item.quantity,
    unitPrice: item.unitPrice instanceof Decimal 
      ? item.unitPrice.toNumber() 
      : item.unitPrice,
    subtotal: item.subtotal instanceof Decimal 
      ? item.subtotal.toNumber() 
      : item.subtotal,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function toCartResponseDTO(cart: {
  id: string;
  userId: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: Decimal | number;
    subtotal: Decimal | number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: Decimal | number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): CartResponseDTO {
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const isExpired = new Date() > cart.expiresAt;

  return {
    id: cart.id,
    userId: cart.userId,
    items: cart.items.map(toCartItemResponseDTO),
    total: cart.total instanceof Decimal 
      ? cart.total.toNumber() 
      : cart.total,
    status: cart.status,
    expiresAt: cart.expiresAt,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    itemCount,
    isExpired,
  };
}

export function toCartSummaryDTO(cart: {
  id: string;
  total: Decimal | number;
  items: Array<{ quantity: number }>;
  status: string;
}): CartSummaryDTO {
  return {
    id: cart.id,
    total: cart.total instanceof Decimal 
      ? cart.total.toNumber() 
      : cart.total,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    status: cart.status,
  };
}

// ==================== Inventory Service DTOs ====================

export interface InventoryCheckRequestDTO {
  productId: string;
  quantity: number;
}

export interface InventoryCheckResponseDTO {
  productId: string;
  available: boolean;
  stock: number;
  requested: number;
  message?: string;
}

export interface ProductInfoDTO {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
}
