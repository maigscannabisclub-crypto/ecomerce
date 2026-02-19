import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config';
import { ApiError, ErrorCodes, HttpStatus, AuthenticatedRequest } from '../types';
import { logger } from './logger';

// Store for tracking user-specific limits
const userLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Custom key generator for rate limiting
 * Uses user ID if authenticated, otherwise uses IP address
 */
const keyGenerator = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  
  // Use user ID if authenticated
  if (authReq.user?.id) {
    return `user:${authReq.user.id}`;
  }
  
  // Use IP address for unauthenticated requests
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};

/**
 * Custom handler when rate limit is exceeded
 */
const handler = (req: Request, res: Response): void => {
  const authReq = req as AuthenticatedRequest;
  const key = keyGenerator(req);
  
  logger.warn('Rate limit exceeded', {
    correlationId: authReq.correlationId,
    key,
    path: req.path,
    method: req.method
  });

  const error = new ApiError(
    ErrorCodes.RATE_LIMIT_EXCEEDED,
    'Too many requests. Please try again later.',
    HttpStatus.TOO_MANY_REQUESTS,
    {
      retryAfter: res.getHeader('Retry-After') as string
    }
  );

  res.status(HttpStatus.TOO_MANY_REQUESTS).json({
    success: false,
    error: error.toJSON(),
    correlationId: authReq.correlationId,
    timestamp: new Date().toISOString()
  });
};

/**
 * Skip function for successful requests (optional)
 */
const skipSuccessfulRequests = (req: Request, res: Response): boolean => {
  return config.rateLimit.global.skipSuccessfulRequests && res.statusCode < 400;
};

/**
 * Standard API rate limiter
 * Applied to all API routes
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.api.windowMs,
  max: config.rateLimit.api.maxRequests,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator,
  handler,
  skip: (req: Request, res: Response) => {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/health/ready' || req.path === '/health/live') {
      return true;
    }
    return skipSuccessfulRequests(req, res);
  },
  message: {
    success: false,
    error: {
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests. Please try again later.'
    }
  }
});

/**
 * Stricter rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Always use IP for auth endpoints to prevent user enumeration
    return `auth:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  handler,
  skipFailedRequests: false,
  message: {
    success: false,
    error: {
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'Too many authentication attempts. Please try again later.'
    }
  }
});

/**
 * Global rate limiter
 * Applied to all routes as a first line of defense
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.global.windowMs,
  max: config.rateLimit.global.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP for global rate limiting
    return `global:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  handler: (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    logger.warn('Global rate limit exceeded', {
      correlationId: authReq.correlationId,
      ip: req.ip,
      path: req.path
    });

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      success: false,
      error: {
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Service temporarily unavailable due to high traffic.'
      },
      correlationId: authReq.correlationId,
      timestamp: new Date().toISOString()
    });
  },
  skip: (req: Request) => {
    // Skip health checks
    return req.path === '/health' || req.path === '/health/ready' || req.path === '/health/live';
  }
});

/**
 * Custom rate limiter factory
 * Creates a rate limiter with custom configuration
 */
export const createRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skip?: (req: Request, res: Response) => boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const prefix = options.keyPrefix || 'custom';
      const key = keyGenerator(req);
      return `${prefix}:${key}`;
    },
    handler,
    skip: options.skip
  });
};

/**
 * Admin-only rate limiter (more permissive)
 */
export const adminRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 1000, // 1000 requests per minute for admins
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return `admin:${authReq.user?.id || 'unknown'}`;
  },
  skip: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    // Only apply to admin users
    return authReq.user?.role !== 'ADMIN';
  }
});

/**
 * Report generation rate limiter
 * Prevents abuse of resource-intensive reporting endpoints
 */
export const reportRateLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: 10, // 10 reports per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return `report:${authReq.user?.id || req.ip || 'unknown'}`;
  },
  handler: (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      success: false,
      error: {
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Report generation limit exceeded. Maximum 10 reports per hour.'
      },
      correlationId: authReq.correlationId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get rate limit info for a key
 */
export const getRateLimitInfo = (key: string): { remaining: number; resetTime: number } | null => {
  const data = userLimitStore.get(key);
  if (!data) {
    return null;
  }
  
  // Check if expired
  if (Date.now() > data.resetTime) {
    userLimitStore.delete(key);
    return null;
  }
  
  return {
    remaining: Math.max(0, config.rateLimit.api.maxRequests - data.count),
    resetTime: data.resetTime
  };
};

/**
 * Reset rate limit for a specific key
 */
export const resetRateLimit = (key: string): void => {
  userLimitStore.delete(key);
  logger.info(`Rate limit reset for key: ${key}`);
};

/**
 * Reset all rate limits
 */
export const resetAllRateLimits = (): void => {
  userLimitStore.clear();
  logger.info('All rate limits reset');
};

export default apiRateLimiter;
