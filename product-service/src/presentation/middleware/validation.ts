import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import logger from '../../utils/logger';

// Validation error response
interface ValidationErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: Array<{
      field: string;
      message: string;
    }>;
  };
}

// Create validation middleware
export const validate = (schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        error.details.forEach((detail) => {
          errors.push({
            field: detail.path.join('.'),
            message: detail.message
          });
        });
      }
    }

    // Validate query
    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        error.details.forEach((detail) => {
          errors.push({
            field: `query.${detail.path.join('.')}`,
            message: detail.message
          });
        });
      }
    }

    // Validate params
    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        error.details.forEach((detail) => {
          errors.push({
            field: `params.${detail.path.join('.')}`,
            message: detail.message
          });
        });
      }
    }

    // If there are errors, return 400 response
    if (errors.length > 0) {
      logger.warn('Validation failed', { errors, path: req.path });
      
      const response: ValidationErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors
        }
      };

      res.status(400).json(response);
      return;
    }

    next();
  };
};

// ==========================================
// Product Validation Schemas
// ==========================================

export const createProductSchema = {
  body: Joi.object({
    sku: Joi.string().required().max(50).trim()
      .messages({
        'string.empty': 'SKU is required',
        'string.max': 'SKU must be less than 50 characters',
        'any.required': 'SKU is required'
      }),
    name: Joi.string().required().max(200).trim()
      .messages({
        'string.empty': 'Product name is required',
        'string.max': 'Product name must be less than 200 characters',
        'any.required': 'Product name is required'
      }),
    description: Joi.string().required().trim()
      .messages({
        'string.empty': 'Description is required',
        'any.required': 'Description is required'
      }),
    price: Joi.number().required().min(0).precision(2)
      .messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative',
        'any.required': 'Price is required'
      }),
    stock: Joi.number().integer().min(0).default(0)
      .messages({
        'number.base': 'Stock must be a number',
        'number.integer': 'Stock must be an integer',
        'number.min': 'Stock cannot be negative'
      }),
    images: Joi.array().items(Joi.string().uri()).default([])
      .messages({
        'array.base': 'Images must be an array',
        'string.uri': 'Each image must be a valid URL'
      }),
    categoryId: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Category ID must be a valid UUID',
        'any.required': 'Category ID is required'
      }),
    subcategoryId: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Subcategory ID must be a valid UUID',
        'any.required': 'Subcategory ID is required'
      }),
    isActive: Joi.boolean().default(true)
      .messages({
        'boolean.base': 'isActive must be a boolean'
      })
  })
};

export const updateProductSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Product ID must be a valid UUID',
        'any.required': 'Product ID is required'
      })
  }),
  body: Joi.object({
    sku: Joi.string().max(50).trim()
      .messages({
        'string.max': 'SKU must be less than 50 characters'
      }),
    name: Joi.string().max(200).trim()
      .messages({
        'string.max': 'Product name must be less than 200 characters'
      }),
    description: Joi.string().trim(),
    price: Joi.number().min(0).precision(2)
      .messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative'
      }),
    stock: Joi.number().integer().min(0)
      .messages({
        'number.base': 'Stock must be a number',
        'number.integer': 'Stock must be an integer',
        'number.min': 'Stock cannot be negative'
      }),
    images: Joi.array().items(Joi.string().uri())
      .messages({
        'array.base': 'Images must be an array',
        'string.uri': 'Each image must be a valid URL'
      }),
    categoryId: Joi.string().uuid()
      .messages({
        'string.guid': 'Category ID must be a valid UUID'
      }),
    subcategoryId: Joi.string().uuid()
      .messages({
        'string.guid': 'Subcategory ID must be a valid UUID'
      }),
    isActive: Joi.boolean()
      .messages({
        'boolean.base': 'isActive must be a boolean'
      })
  }).min(1)
    .messages({
      'object.min': 'At least one field must be provided for update'
    })
};

export const getProductByIdSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Product ID must be a valid UUID',
        'any.required': 'Product ID is required'
      })
  })
};

export const listProductsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.integer': 'Page must be an integer',
        'number.min': 'Page must be at least 1'
      }),
    limit: Joi.number().integer().min(1).max(100).default(10)
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),
    sortBy: Joi.string().valid('name', 'price', 'stock', 'createdAt', 'updatedAt').default('createdAt')
      .messages({
        'string.valid': 'sortBy must be one of: name, price, stock, createdAt, updatedAt'
      }),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      .messages({
        'string.valid': 'sortOrder must be either asc or desc'
      }),
    categoryId: Joi.string().uuid()
      .messages({
        'string.guid': 'Category ID must be a valid UUID'
      }),
    subcategoryId: Joi.string().uuid()
      .messages({
        'string.guid': 'Subcategory ID must be a valid UUID'
      }),
    minPrice: Joi.number().min(0)
      .messages({
        'number.base': 'minPrice must be a number',
        'number.min': 'minPrice cannot be negative'
      }),
    maxPrice: Joi.number().min(0)
      .messages({
        'number.base': 'maxPrice must be a number',
        'number.min': 'maxPrice cannot be negative'
      }),
    name: Joi.string().trim()
      .messages({
        'string.base': 'Name must be a string'
      }),
    isActive: Joi.boolean()
      .messages({
        'boolean.base': 'isActive must be a boolean'
      })
  })
};

export const searchProductsSchema = {
  query: Joi.object({
    q: Joi.string().required().min(1).max(100).trim()
      .messages({
        'string.empty': 'Search query is required',
        'string.min': 'Search query must be at least 1 character',
        'string.max': 'Search query must be less than 100 characters',
        'any.required': 'Search query is required'
      }),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    categoryId: Joi.string().uuid(),
    subcategoryId: Joi.string().uuid(),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0)
  })
};

export const updateStockSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Product ID must be a valid UUID',
        'any.required': 'Product ID is required'
      })
  }),
  body: Joi.object({
    quantity: Joi.number().integer().required().min(0)
      .messages({
        'number.base': 'Quantity must be a number',
        'number.integer': 'Quantity must be an integer',
        'number.min': 'Quantity cannot be negative',
        'any.required': 'Quantity is required'
      }),
    operation: Joi.string().valid('increment', 'decrement', 'set').required()
      .messages({
        'string.valid': 'Operation must be one of: increment, decrement, set',
        'any.required': 'Operation is required'
      })
  })
};

// ==========================================
// Category Validation Schemas
// ==========================================

export const createCategorySchema = {
  body: Joi.object({
    name: Joi.string().required().max(100).trim()
      .messages({
        'string.empty': 'Category name is required',
        'string.max': 'Category name must be less than 100 characters',
        'any.required': 'Category name is required'
      }),
    slug: Joi.string().required().max(100).trim().regex(/^[a-z0-9-]+$/)
      .messages({
        'string.empty': 'Slug is required',
        'string.max': 'Slug must be less than 100 characters',
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens',
        'any.required': 'Slug is required'
      }),
    description: Joi.string().max(500).allow('').optional()
      .messages({
        'string.max': 'Description must be less than 500 characters'
      })
  })
};

export const updateCategorySchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Category ID must be a valid UUID',
        'any.required': 'Category ID is required'
      })
  }),
  body: Joi.object({
    name: Joi.string().max(100).trim()
      .messages({
        'string.max': 'Category name must be less than 100 characters'
      }),
    slug: Joi.string().max(100).trim().regex(/^[a-z0-9-]+$/)
      .messages({
        'string.max': 'Slug must be less than 100 characters',
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens'
      }),
    description: Joi.string().max(500).allow('').optional()
      .messages({
        'string.max': 'Description must be less than 500 characters'
      })
  }).min(1)
    .messages({
      'object.min': 'At least one field must be provided for update'
    })
};

export const getCategoryByIdSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Category ID must be a valid UUID',
        'any.required': 'Category ID is required'
      })
  })
};

// ==========================================
// Subcategory Validation Schemas
// ==========================================

export const createSubcategorySchema = {
  body: Joi.object({
    name: Joi.string().required().max(100).trim()
      .messages({
        'string.empty': 'Subcategory name is required',
        'string.max': 'Subcategory name must be less than 100 characters',
        'any.required': 'Subcategory name is required'
      }),
    slug: Joi.string().required().max(100).trim().regex(/^[a-z0-9-]+$/)
      .messages({
        'string.empty': 'Slug is required',
        'string.max': 'Slug must be less than 100 characters',
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens',
        'any.required': 'Slug is required'
      }),
    categoryId: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Category ID must be a valid UUID',
        'any.required': 'Category ID is required'
      })
  })
};

export const updateSubcategorySchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Subcategory ID must be a valid UUID',
        'any.required': 'Subcategory ID is required'
      })
  }),
  body: Joi.object({
    name: Joi.string().max(100).trim()
      .messages({
        'string.max': 'Subcategory name must be less than 100 characters'
      }),
    slug: Joi.string().max(100).trim().regex(/^[a-z0-9-]+$/)
      .messages({
        'string.max': 'Slug must be less than 100 characters',
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens'
      }),
    categoryId: Joi.string().uuid()
      .messages({
        'string.guid': 'Category ID must be a valid UUID'
      })
  }).min(1)
    .messages({
      'object.min': 'At least one field must be provided for update'
    })
};

export default validate;
