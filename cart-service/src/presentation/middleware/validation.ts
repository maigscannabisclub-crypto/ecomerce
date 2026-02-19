import { Request, Response, NextFunction } from 'express';
import Joi, { ObjectSchema, ValidationError } from 'joi';
import logger from '../../utils/logger';

/**
 * Middleware factory for validating request body against a Joi schema
 */
export const validateBody = (schema: ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationError = formatValidationError(error);
      logger.warn('Body validation failed', { errors: validationError.errors });
      
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Request body validation failed',
        details: validationError,
      });
      return;
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
};

/**
 * Middleware factory for validating request params against a Joi schema
 */
export const validateParams = (schema: ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
    });

    if (error) {
      const validationError = formatValidationError(error);
      logger.warn('Params validation failed', { errors: validationError.errors });
      
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Request params validation failed',
        details: validationError,
      });
      return;
    }

    // Replace req.params with validated value
    req.params = value;
    next();
  };
};

/**
 * Middleware factory for validating request query against a Joi schema
 */
export const validateQuery = (schema: ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      const validationError = formatValidationError(error);
      logger.warn('Query validation failed', { errors: validationError.errors });
      
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Request query validation failed',
        details: validationError,
      });
      return;
    }

    // Replace req.query with validated value
    req.query = value;
    next();
  };
};

/**
 * Middleware factory for validating multiple parts of the request
 */
export const validateRequest = (schemas: {
  body?: ObjectSchema;
  params?: ObjectSchema;
  query?: ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, any> = {};

    // Validate body
    if (schemas.body) {
      const bodyValidation = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      
      if (bodyValidation.error) {
        errors.body = formatValidationError(bodyValidation.error);
      } else {
        req.body = bodyValidation.value;
      }
    }

    // Validate params
    if (schemas.params) {
      const paramsValidation = schemas.params.validate(req.params, {
        abortEarly: false,
      });
      
      if (paramsValidation.error) {
        errors.params = formatValidationError(paramsValidation.error);
      } else {
        req.params = paramsValidation.value;
      }
    }

    // Validate query
    if (schemas.query) {
      const queryValidation = schemas.query.validate(req.query, {
        abortEarly: false,
      });
      
      if (queryValidation.error) {
        errors.query = formatValidationError(queryValidation.error);
      } else {
        req.query = queryValidation.value;
      }
    }

    // If any validation failed
    if (Object.keys(errors).length > 0) {
      logger.warn('Request validation failed', { errors });
      
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
};

/**
 * Format Joi validation error into a more readable structure
 */
function formatValidationError(error: ValidationError) {
  const errors: Record<string, string[]> = {};

  error.details.forEach((detail) => {
    const path = detail.path.join('.');
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(detail.message);
  });

  return {
    errors,
    message: error.message,
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  uuid: Joi.string().uuid(),
  
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
  
  idParam: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Sanitization middleware to prevent common attacks
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Remove potentially dangerous keys
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    
    // Sanitize string values
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a string value
 */
function sanitizeString(str: string): string {
  // Remove null bytes
  let sanitized = str.replace(/\x00/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }
  
  return sanitized;
}

export default {
  validateBody,
  validateParams,
  validateQuery,
  validateRequest,
  sanitizeInput,
  commonSchemas,
};
