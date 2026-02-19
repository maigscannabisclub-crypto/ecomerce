import { Request, Response, NextFunction } from 'express';
import Joi, { ObjectSchema, ValidationError } from 'joi';
import logger from '../../utils/logger';
import { MovementType } from '../../domain/entities/Inventory';

/**
 * Generic validation middleware factory
 */
export function validateSchema(schema: ObjectSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dataToValidate = source === 'body' ? req.body : source === 'query' ? req.query : req.params;

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationErrors = formatValidationErrors(error);

      logger.warn('Validation failed', {
        path: req.path,
        source,
        errors: validationErrors,
      });

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationErrors,
      });
      return;
    }

    // Replace the original data with validated and sanitized data
    if (source === 'body') {
      req.body = value;
    } else if (source === 'query') {
      req.query = value;
    } else {
      req.params = value;
    }

    next();
  };
}

/**
 * Format Joi validation errors into a readable format
 */
function formatValidationErrors(error: ValidationError): Array<{ field: string; message: string }> {
  return error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message,
  }));
}

// ==================== VALIDATION SCHEMAS ====================

/**
 * Schema for creating inventory
 */
export const createInventorySchema = Joi.object({
  productId: Joi.string().uuid().required().messages({
    'string.empty': 'Product ID is required',
    'string.uuid': 'Product ID must be a valid UUID',
    'any.required': 'Product ID is required',
  }),
  sku: Joi.string().min(3).max(50).required().messages({
    'string.empty': 'SKU is required',
    'string.min': 'SKU must be at least 3 characters',
    'string.max': 'SKU must be at most 50 characters',
    'any.required': 'SKU is required',
  }),
  quantity: Joi.number().integer().min(0).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 0',
    'any.required': 'Quantity is required',
  }),
  minStock: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Minimum stock must be a number',
    'number.integer': 'Minimum stock must be an integer',
    'number.min': 'Minimum stock must be at least 0',
  }),
  reorderPoint: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Reorder point must be a number',
    'number.integer': 'Reorder point must be an integer',
    'number.min': 'Reorder point must be at least 0',
  }),
  location: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'Location must be at most 100 characters',
  }),
});

/**
 * Schema for reserving stock
 */
export const reserveStockSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 1',
    'any.required': 'Quantity is required',
  }),
  orderId: Joi.string().uuid().required().messages({
    'string.empty': 'Order ID is required',
    'string.uuid': 'Order ID must be a valid UUID',
    'any.required': 'Order ID is required',
  }),
});

/**
 * Schema for releasing stock
 */
export const releaseStockSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 1',
    'any.required': 'Quantity is required',
  }),
  orderId: Joi.string().uuid().required().messages({
    'string.empty': 'Order ID is required',
    'string.uuid': 'Order ID must be a valid UUID',
    'any.required': 'Order ID is required',
  }),
});

/**
 * Schema for adjusting stock
 */
export const adjustStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 0',
    'any.required': 'Quantity is required',
  }),
  reason: Joi.string().min(3).max(500).required().messages({
    'string.empty': 'Reason is required',
    'string.min': 'Reason must be at least 3 characters',
    'string.max': 'Reason must be at most 500 characters',
    'any.required': 'Reason is required',
  }),
  type: Joi.string()
    .valid(MovementType.IN, MovementType.OUT, MovementType.ADJUSTMENT)
    .required()
    .messages({
      'string.empty': 'Type is required',
      'any.only': 'Type must be one of: IN, OUT, ADJUSTMENT',
      'any.required': 'Type is required',
    }),
});

/**
 * Schema for updating inventory
 */
export const updateInventorySchema = Joi.object({
  minStock: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Minimum stock must be a number',
    'number.integer': 'Minimum stock must be an integer',
    'number.min': 'Minimum stock must be at least 0',
  }),
  reorderPoint: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Reorder point must be a number',
    'number.integer': 'Reorder point must be an integer',
    'number.min': 'Reorder point must be at least 0',
  }),
  location: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'Location must be at most 100 characters',
  }),
}).min(1);

/**
 * Schema for product ID parameter
 */
export const productIdParamSchema = Joi.object({
  productId: Joi.string().uuid().required().messages({
    'string.empty': 'Product ID is required',
    'string.uuid': 'Product ID must be a valid UUID',
    'any.required': 'Product ID is required',
  }),
});

/**
 * Schema for SKU parameter
 */
export const skuParamSchema = Joi.object({
  sku: Joi.string().min(3).max(50).required().messages({
    'string.empty': 'SKU is required',
    'string.min': 'SKU must be at least 3 characters',
    'string.max': 'SKU must be at most 50 characters',
    'any.required': 'SKU is required',
  }),
});

/**
 * Schema for pagination query parameters
 */
export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Page must be a number',
    'number.integer': 'Page must be an integer',
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    'number.base': 'Limit must be a number',
    'number.integer': 'Limit must be an integer',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must be at most 100',
  }),
});

/**
 * Schema for batch stock reservation
 */
export const batchReserveStockSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.base': 'Items must be an array',
      'array.min': 'At least one item is required',
      'any.required': 'Items are required',
    }),
  orderId: Joi.string().uuid().required().messages({
    'string.empty': 'Order ID is required',
    'string.uuid': 'Order ID must be a valid UUID',
    'any.required': 'Order ID is required',
  }),
});

export default {
  validateSchema,
  createInventorySchema,
  reserveStockSchema,
  releaseStockSchema,
  adjustStockSchema,
  updateInventorySchema,
  productIdParamSchema,
  skuParamSchema,
  paginationQuerySchema,
  batchReserveStockSchema,
};
