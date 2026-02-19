import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { OrderStatus } from '@prisma/client';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ValidationMiddleware');

// Custom validation error
export class ValidationError extends Error {
  constructor(
    message: string,
    public details: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate request body against Joi schema
 */
export function validateBody(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.debug('Validation failed', {
        path: req.path,
        details,
      });

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details,
      });
      return;
    }

    // Replace request body with validated value
    req.body = value;
    next();
  };
}

/**
 * Validate request params against Joi schema
 */
export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details,
      });
      return;
    }

    req.params = value;
    next();
  };
}

/**
 * Validate request query against Joi schema
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details,
      });
      return;
    }

    req.query = value;
    next();
  };
}

// ============== Validation Schemas ==============

// Address schema
const addressSchema = Joi.object({
  street: Joi.string().required().max(255),
  city: Joi.string().required().max(100),
  state: Joi.string().required().max(100),
  zipCode: Joi.string().required().max(20),
  country: Joi.string().required().max(100),
});

// Order item schema
const orderItemSchema = Joi.object({
  productId: Joi.string().uuid().required(),
  productName: Joi.string().required().max(255),
  productSku: Joi.string().required().max(100),
  quantity: Joi.number().integer().min(1).max(1000).required(),
  unitPrice: Joi.number().positive().precision(2).required(),
});

// Create order from cart schema
export const createOrderFromCartSchema = Joi.object({
  cartId: Joi.string().uuid().required(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  notes: Joi.string().max(1000).optional().allow(''),
});

// Create order schema
export const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).max(100).required(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  notes: Joi.string().max(1000).optional().allow(''),
});

// Update order status schema
export const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .required(),
  notes: Joi.string().max(1000).optional().allow(''),
});

// Cancel order schema
export const cancelOrderSchema = Joi.object({
  reason: Joi.string().max(1000).optional().allow(''),
});

// Order ID param schema
export const orderIdParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Order number param schema
export const orderNumberParamSchema = Joi.object({
  orderNumber: Joi.string().required().max(100),
});

// Event ID param schema
export const eventIdParamSchema = Joi.object({
  eventId: Joi.string().uuid().required(),
});

// List orders query schema
export const listOrdersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .optional(),
  userId: Joi.string().uuid().optional(),
});

// Pagination query schema
export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(1000).optional(),
});

// ============== Error Handler ==============

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: err.message,
    });
    return;
  }

  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: err.message,
    });
    return;
  }

  if (err.name === 'ForbiddenError') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: err.message,
    });
    return;
  }

  if (err.name === 'NotFoundError') {
    res.status(404).json({
      success: false,
      error: 'Not found',
      message: err.message,
    });
    return;
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as { code: string; meta?: Record<string, unknown> };
    
    // Unique constraint violation
    if (prismaError.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Resource already exists',
        meta: prismaError.meta,
      });
      return;
    }

    // Foreign key constraint violation
    if (prismaError.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Referenced resource does not exist',
      });
      return;
    }

    // Record not found
    if (prismaError.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Resource not found',
      });
      return;
    }
  }

  // Default error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
  });
}

/**
 * 404 handler middleware
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

export default {
  validateBody,
  validateParams,
  validateQuery,
  errorHandler,
  notFoundHandler,
  createOrderFromCartSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  orderIdParamSchema,
  orderNumberParamSchema,
  eventIdParamSchema,
  listOrdersQuerySchema,
  paginationQuerySchema,
};
