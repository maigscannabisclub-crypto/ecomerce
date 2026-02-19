import { Request, Response, NextFunction } from 'express';
import Joi, { ObjectSchema, ValidationError as JoiValidationError } from 'joi';
import logger from '../../utils/logger';

/**
 * Validation error response
 */
interface ValidationErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: ValidationErrorDetail[];
  };
}

/**
 * Validation error detail
 */
interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Request location type
 */
type RequestLocation = 'body' | 'query' | 'params' | 'headers' | 'cookies';

/**
 * Validation middleware options
 */
interface ValidationOptions {
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

const defaultOptions: ValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: true,
};

/**
 * Format Joi validation error to our standard format
 */
const formatValidationErrors = (
  error: JoiValidationError
): ValidationErrorDetail[] => {
  return error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message.replace(/['"]/g, ''),
    value: detail.context?.value,
  }));
};

/**
 * Create validation middleware
 * @param schema - Joi schema to validate against
 * @param location - Request location to validate (body, query, params, headers)
 * @param options - Validation options
 */
export const validate = (
  schema: ObjectSchema,
  location: RequestLocation = 'body',
  options: ValidationOptions = defaultOptions
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, middleware: 'validate' });

    const dataToValidate = req[location];

    const { error, value } = schema.validate(dataToValidate, {
      ...defaultOptions,
      ...options,
    });

    if (error) {
      childLogger.warn('Validation failed', {
        location,
        errors: error.details.map((d) => d.message),
      });

      const response: ValidationErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: formatValidationErrors(error),
        },
      };

      res.status(400).json(response);
      return;
    }

    // Replace the original data with validated (and potentially transformed) data
    req[location] = value;

    childLogger.debug('Validation successful', { location });

    next();
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema: ObjectSchema, options?: ValidationOptions) => {
  return validate(schema, 'body', options);
};

/**
 * Validate request query
 */
export const validateQuery = (schema: ObjectSchema, options?: ValidationOptions) => {
  return validate(schema, 'query', options);
};

/**
 * Validate request params
 */
export const validateParams = (schema: ObjectSchema, options?: ValidationOptions) => {
  return validate(schema, 'params', options);
};

/**
 * Validate request headers
 */
export const validateHeaders = (schema: ObjectSchema, options?: ValidationOptions) => {
  return validate(schema, 'headers', options);
};

// ============================================
// Common Validation Schemas
// ============================================

/**
 * Email validation schema
 */
export const emailSchema = Joi.string()
  .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'org', 'edu', 'io', 'co'] } })
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  });

/**
 * Password validation schema
 */
export const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[a-zA-Z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base':
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  });

/**
 * UUID validation schema
 */
export const uuidSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.guid': 'Invalid UUID format',
    'string.empty': 'ID is required',
    'any.required': 'ID is required',
  });

/**
 * Name validation schema
 */
export const nameSchema = Joi.string()
  .min(2)
  .max(50)
  .pattern(/^[a-zA-Z\s'-]+$/)
  .required()
  .messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name must not exceed 50 characters',
    'string.pattern.base': 'Name can only contain letters, spaces, hyphens, and apostrophes',
    'string.empty': 'Name is required',
    'any.required': 'Name is required',
  });

// ============================================
// Auth Validation Schemas
// ============================================

/**
 * Register request validation schema
 */
export const registerSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
});

/**
 * Login request validation schema
 */
export const loginSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});

/**
 * Refresh token validation schema
 */
export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required',
    'any.required': 'Refresh token is required',
  }),
});

/**
 * Logout request validation schema
 */
export const logoutSchema = Joi.object({
  refreshToken: Joi.string().optional(),
});

/**
 * Update profile validation schema
 */
export const updateProfileSchema = Joi.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  email: emailSchema.optional(),
}).min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

/**
 * Change password validation schema
 */
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'string.empty': 'Current password is required',
    'any.required': 'Current password is required',
  }),
  newPassword: passwordSchema,
});

// ============================================
// Param Validation Schemas
// ============================================

/**
 * User ID param validation schema
 */
export const userIdParamSchema = Joi.object({
  userId: uuidSchema,
});

export default validate;
