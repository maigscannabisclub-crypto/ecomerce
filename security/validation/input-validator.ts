/**
 * Enterprise Input Validation Service
 * Comprehensive validation with strict type checking and sanitization
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

// Validation error interface
interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// Validation result interface
interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
}

// Validation options
interface ValidationOptions {
  abortEarly?: boolean;
  stripUnknown?: boolean;
  strict?: boolean;
}

const defaultOptions: ValidationOptions = {
  abortEarly: false,
  stripUnknown: true,
  strict: true,
};

/**
 * Custom Zod error mapper
 */
function mapZodError(error: ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
    value: err.path.length > 0 ? undefined : undefined,
  }));
}

/**
 * Validate data against schema
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options: ValidationOptions = {}
): ValidationResult<T> {
  const opts = { ...defaultOptions, ...options };
  
  try {
    const result = schema.parse(data, {
      errorMap: (issue, ctx) => {
        // Custom error messages
        switch (issue.code) {
          case z.ZodIssueCode.invalid_type:
            return {
              message: `Expected ${issue.expected}, received ${issue.received}`,
            };
          case z.ZodIssueCode.too_small:
            return {
              message: `Must be at least ${issue.minimum} ${issue.type}`,
            };
          case z.ZodIssueCode.too_big:
            return {
              message: `Must be at most ${issue.maximum} ${issue.type}`,
            };
          case z.ZodIssueCode.invalid_string:
            if (issue.validation === 'email') {
              return { message: 'Invalid email format' };
            }
            if (issue.validation === 'url') {
              return { message: 'Invalid URL format' };
            }
            if (issue.validation === 'uuid') {
              return { message: 'Invalid UUID format' };
            }
            return { message: 'Invalid string format' };
          default:
            return { message: ctx.defaultError };
        }
      },
    });
    
    return {
      success: true,
      data: result,
      errors: [],
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: mapZodError(error),
      };
    }
    
    return {
      success: false,
      errors: [
        {
          field: 'unknown',
          message: 'Validation failed',
          code: 'UNKNOWN_ERROR',
        },
      ],
    };
  }
}

/**
 * Async validate (for async refinements)
 */
export async function validateAsync<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options: ValidationOptions = {}
): Promise<ValidationResult<T>> {
  const opts = { ...defaultOptions, ...options };
  
  try {
    const result = await schema.parseAsync(data);
    return {
      success: true,
      data: result,
      errors: [],
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: mapZodError(error),
      };
    }
    
    return {
      success: false,
      errors: [
        {
          field: 'unknown',
          message: 'Validation failed',
          code: 'UNKNOWN_ERROR',
        },
      ],
    };
  }
}

/**
 * Create validation middleware
 */
export function createValidationMiddleware<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body',
  options: ValidationOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const result = validate(schema, data, options);
    
    if (!result.success) {
      logger.warn(
        {
          path: req.path,
          method: req.method,
          source,
          errors: result.errors,
        },
        'Validation failed'
      );
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'The request contains invalid data',
        code: 'VALIDATION_ERROR',
        details: result.errors,
      });
    }
    
    // Store validated data
    req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = result.data;
    
    next();
  };
}

/**
 * Combined validation middleware for multiple sources
 */
export function validateRequest<TBody = any, TQuery = any, TParams = any>(schemas: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const allErrors: ValidationError[] = [];
    
    // Validate body
    if (schemas.body) {
      const bodyResult = validate(schemas.body, req.body);
      if (!bodyResult.success) {
        allErrors.push(...bodyResult.errors.map((e) => ({ ...e, source: 'body' })));
      } else {
        (req as any).validatedBody = bodyResult.data;
      }
    }
    
    // Validate query
    if (schemas.query) {
      const queryResult = validate(schemas.query, req.query);
      if (!queryResult.success) {
        allErrors.push(...queryResult.errors.map((e) => ({ ...e, source: 'query' })));
      } else {
        (req as any).validatedQuery = queryResult.data;
      }
    }
    
    // Validate params
    if (schemas.params) {
      const paramsResult = validate(schemas.params, req.params);
      if (!paramsResult.success) {
        allErrors.push(...paramsResult.errors.map((e) => ({ ...e, source: 'params' })));
      } else {
        (req as any).validatedParams = paramsResult.data;
      }
    }
    
    if (allErrors.length > 0) {
      logger.warn(
        {
          path: req.path,
          method: req.method,
          errors: allErrors,
        },
        'Request validation failed'
      );
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'The request contains invalid data',
        code: 'VALIDATION_ERROR',
        details: allErrors,
      });
    }
    
    next();
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // ID validation (UUID)
  id: z.string().uuid('Invalid ID format'),
  
  // Email validation
  email: z
    .string()
    .email('Invalid email format')
    .min(5, 'Email too short')
    .max(254, 'Email too long'),
  
  // Password validation (strong)
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  
  // Phone validation
  phone: z
    .string()
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      'Invalid phone number format (E.164)'
    ),
  
  // URL validation
  url: z.string().url('Invalid URL format'),
  
  // Slug validation
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Invalid slug format'
    )
    .min(1)
    .max(100),
  
  // Currency validation
  currency: z.enum(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']),
  
  // Price validation
  price: z
    .number()
    .positive('Price must be positive')
    .max(999999999.99, 'Price exceeds maximum'),
  
  // Quantity validation
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be positive')
    .max(999999, 'Quantity exceeds maximum'),
  
  // Pagination
  pagination: {
    page: z
      .string()
      .or(z.number())
      .transform((val) => parseInt(String(val), 10))
      .refine((val) => val >= 1, 'Page must be at least 1'),
    limit: z
      .string()
      .or(z.number())
      .transform((val) => parseInt(String(val), 10))
      .refine((val) => val >= 1 && val <= 100, 'Limit must be between 1 and 100'),
  },
  
  // Sort order
  sortOrder: z.enum(['asc', 'desc']),
  
  // Date range
  dateRange: z.object({
    from: z.string().datetime().or(z.date()),
    to: z.string().datetime().or(z.date()),
  }),
  
  // Address
  address: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100).optional(),
    postalCode: z.string().min(1).max(20),
    country: z.string().length(2), // ISO country code
  }),
};

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Sanitize HTML content (basic)
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate file upload
 */
export function validateFileUpload(
  file: Express.Multer.File,
  options: {
    allowedTypes?: string[];
    maxSize?: number;
    maxDimensions?: { width: number; height: number };
  } = {}
): ValidationResult<Express.Multer.File> {
  const { allowedTypes, maxSize = 5 * 1024 * 1024 } = options;
  const errors: ValidationError[] = [];
  
  // Check file type
  if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
    errors.push({
      field: 'file',
      message: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
      code: 'INVALID_FILE_TYPE',
      value: file.mimetype,
    });
  }
  
  // Check file size
  if (file.size > maxSize) {
    errors.push({
      field: 'file',
      message: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`,
      code: 'FILE_TOO_LARGE',
      value: file.size,
    });
  }
  
  // Check for null bytes in filename (path traversal)
  if (file.originalName?.includes('\x00') || file.originalname?.includes('\x00')) {
    errors.push({
      field: 'file',
      message: 'Invalid filename',
      code: 'INVALID_FILENAME',
    });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: file, errors: [] };
}

/**
 * Rate limit validation (for login attempts)
 */
export function validateLoginAttempt(
  attempts: number,
  maxAttempts: number = 5
): ValidationResult<void> {
  if (attempts >= maxAttempts) {
    return {
      success: false,
      errors: [
        {
          field: 'login',
          message: `Too many failed attempts. Please try again later.`,
          code: 'TOO_MANY_ATTEMPTS',
        },
      ],
    };
  }
  
  return { success: true, errors: [] };
}

/**
 * JSON Schema validator (for OpenAPI specs)
 */
export function createJsonSchemaValidator(schema: any) {
  return (data: unknown): ValidationResult<any> => {
    // In production, use ajv or similar
    // This is a simplified placeholder
    return { success: true, data, errors: [] };
  };
}

// Type helpers
export type InferType<T extends ZodSchema> = z.infer<T>;

export default {
  validate,
  validateAsync,
  createValidationMiddleware,
  validateRequest,
  commonSchemas,
  sanitizeString,
  sanitizeHtml,
  validateFileUpload,
  validateLoginAttempt,
  createJsonSchemaValidator,
};
