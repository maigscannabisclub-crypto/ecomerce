import { Request, Response, NextFunction } from 'express';
import { 
  ApiError, 
  ErrorCodes, 
  HttpStatus, 
  ApiErrorResponse,
  AuthenticatedRequest 
} from '../types';
import { logger } from './logger';
import { config, isDevelopment, isProduction } from '../config';

/**
 * Map error codes to HTTP status codes
 */
const errorCodeToStatusMap: Record<string, number> = {
  [ErrorCodes.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCodes.VALIDATION_ERROR]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCodes.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCodes.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCodes.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCodes.METHOD_NOT_ALLOWED]: HttpStatus.METHOD_NOT_ALLOWED,
  [ErrorCodes.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCodes.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCodes.GATEWAY_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [ErrorCodes.BAD_GATEWAY]: HttpStatus.BAD_GATEWAY,
  [ErrorCodes.INVALID_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCodes.TOKEN_EXPIRED]: HttpStatus.UNAUTHORIZED
};

/**
 * Get HTTP status code from error
 */
const getHttpStatus = (error: Error | ApiError): number => {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  // Check if it's a known error code
  if ('code' in error && typeof error.code === 'string') {
    const status = errorCodeToStatusMap[error.code];
    if (status) {
      return status;
    }
  }

  // Default to internal server error
  return HttpStatus.INTERNAL_SERVER_ERROR;
};

/**
 * Format error for response
 */
const formatErrorResponse = (
  error: Error | ApiError,
  correlationId: string
): ApiErrorResponse => {
  const timestamp = new Date().toISOString();

  if (error instanceof ApiError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      correlationId,
      timestamp
    };
  }

  // Handle standard Error objects
  const isOperational = error.name === 'ApiError' || error.name === 'ValidationError';
  
  return {
    success: false,
    error: {
      code: isOperational ? ErrorCodes.BAD_REQUEST : ErrorCodes.INTERNAL_ERROR,
      message: isDevelopment() || !isProduction() 
        ? error.message 
        : 'An unexpected error occurred',
      ...(isDevelopment() && { 
        stack: error.stack,
        name: error.name 
      })
    },
    correlationId,
    timestamp
  };
};

/**
 * Log error with appropriate level
 */
const logError = (
  error: Error | ApiError,
  req: Request,
  statusCode: number
): void => {
  const authReq = req as AuthenticatedRequest;
  
  const logData = {
    correlationId: authReq.correlationId,
    requestId: authReq.requestId,
    path: req.path,
    method: req.method,
    statusCode,
    userId: authReq.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    error: {
      name: error.name,
      message: error.message,
      ...(error instanceof ApiError && { code: error.code, details: error.details }),
      ...(isDevelopment() && { stack: error.stack })
    }
  };

  // Log 5xx errors as errors, 4xx as warnings
  if (statusCode >= 500) {
    logger.error('Server error', logData);
  } else if (statusCode === 429) {
    logger.warn('Rate limit exceeded', logData);
  } else if (statusCode === 401 || statusCode === 403) {
    logger.warn('Authentication/Authorization error', logData);
  } else {
    logger.warn('Client error', logData);
  }
};

/**
 * Global error handler middleware
 * Must be registered after all other middleware and routes
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const correlationId = authReq.correlationId || 'unknown';
  
  // Get appropriate status code
  const statusCode = getHttpStatus(err);
  
  // Log the error
  logError(err, req, statusCode);

  // Format and send response
  const errorResponse = formatErrorResponse(err, correlationId);
  
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 * Catches requests to undefined routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const correlationId = authReq.correlationId;

  logger.warn('Route not found', {
    correlationId,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  const error = new ApiError(
    ErrorCodes.NOT_FOUND,
    `Route ${req.method} ${req.path} not found`,
    HttpStatus.NOT_FOUND
  );

  res.status(HttpStatus.NOT_FOUND).json({
    success: false,
    error: error.toJSON(),
    correlationId,
    timestamp: new Date().toISOString()
  });
};

/**
 * Async handler wrapper
 * Catches errors from async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error handler
 * Formats Joi validation errors
 */
export const handleValidationError = (
  error: unknown,
  correlationId: string
): ApiErrorResponse => {
  const timestamp = new Date().toISOString();

  // Handle Joi validation errors
  if (error && typeof error === 'object' && 'isJoi' in error) {
    const joiError = error as { details: Array<{ path: string[]; message: string }> };
    const details: Record<string, string> = {};
    
    joiError.details.forEach((detail) => {
      const path = detail.path.join('.');
      details[path] = detail.message;
    });

    return {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details
      },
      correlationId,
      timestamp
    };
  }

  // Handle other validation errors
  return {
    success: false,
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: error instanceof Error ? error.message : 'Validation failed'
    },
    correlationId,
    timestamp
  };
};

/**
 * Proxy error handler
 * Handles errors from http-proxy-middleware
 */
export const proxyErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const correlationId = authReq.correlationId;

  logger.error('Proxy error', {
    correlationId,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack
  });

  // Check if response has already been sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine error type
  let errorCode = ErrorCodes.BAD_GATEWAY;
  let statusCode = HttpStatus.BAD_GATEWAY;
  let message = 'Service temporarily unavailable';

  if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
    errorCode = ErrorCodes.GATEWAY_TIMEOUT;
    statusCode = HttpStatus.GATEWAY_TIMEOUT;
    message = 'Service request timeout';
  } else if (err.message.includes('ECONNREFUSED')) {
    errorCode = ErrorCodes.SERVICE_UNAVAILABLE;
    statusCode = HttpStatus.SERVICE_UNAVAILABLE;
    message = 'Service unavailable';
  }

  const apiError = new ApiError(errorCode, message, statusCode, {
    originalError: isDevelopment() ? err.message : undefined
  });

  res.status(statusCode).json({
    success: false,
    error: apiError.toJSON(),
    correlationId,
    timestamp: new Date().toISOString()
  });
};

/**
 * Uncaught exception handler
 * Should be registered at application startup
 */
export const setupUncaughtExceptionHandlers = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });

    // Give time for logs to flush before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason
    });
  });
};

export default errorHandler;
