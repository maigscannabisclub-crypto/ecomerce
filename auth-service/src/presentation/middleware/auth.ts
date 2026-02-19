import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../../utils/jwt';
import { Role } from '../../domain/entities/User';
import logger from '../../utils/logger';

// Extended Request interface with user property
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      correlationId?: string;
    }
  }
}

/**
 * Authentication error response
 */
interface AuthErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.correlationId || 'no-correlation-id';
  const childLogger = logger.child({ correlationId, middleware: 'authenticate' });

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      childLogger.warn('Authentication failed: No authorization header');
      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header is required',
        },
      };
      res.status(401).json(response);
      return;
    }

    // Check Bearer format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      childLogger.warn('Authentication failed: Invalid authorization format');
      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header must be in format: Bearer <token>',
        },
      };
      res.status(401).json(response);
      return;
    }

    const token = parts[1];

    // Verify token
    const decoded = verifyAccessToken(token);

    // Attach user to request
    req.user = decoded;

    childLogger.debug('Authentication successful', { userId: decoded.userId });

    next();
  } catch (error) {
    childLogger.warn('Authentication failed', { error });

    let errorMessage = 'Invalid token';
    let statusCode = 401;

    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        errorMessage = 'Token has expired';
      } else if (error.message === 'Invalid token') {
        errorMessage = 'Invalid token';
      }
    }

    const response: AuthErrorResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: errorMessage,
      },
    };

    res.status(statusCode).json(response);
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.correlationId || 'no-correlation-id';

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    const decoded = verifyAccessToken(token);

    req.user = decoded;

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Authorization middleware - checks if user has required role
 * @param roles - Array of allowed roles
 */
export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, middleware: 'authorize' });

    try {
      if (!req.user) {
        childLogger.warn('Authorization failed: No user in request');
        const response: AuthErrorResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        };
        res.status(401).json(response);
        return;
      }

      const userRole = req.user.role as Role;

      if (!roles.includes(userRole)) {
        childLogger.warn('Authorization failed: Insufficient permissions', {
          userRole,
          requiredRoles: roles,
        });
        const response: AuthErrorResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions to access this resource',
          },
        };
        res.status(403).json(response);
        return;
      }

      childLogger.debug('Authorization successful', {
        userId: req.user.userId,
        role: userRole,
      });

      next();
    } catch (error) {
      childLogger.error('Authorization error', { error });
      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authorization check failed',
        },
      };
      res.status(500).json(response);
    }
  };
};

/**
 * Admin-only middleware shortcut
 */
export const requireAdmin = authorize(Role.ADMIN);

/**
 * Get current user from request
 * Returns null if no user is authenticated
 */
export const getCurrentUser = (req: Request): TokenPayload | null => {
  return req.user || null;
};

/**
 * Check if current user is authenticated
 */
export const isAuthenticated = (req: Request): boolean => {
  return !!req.user;
};

/**
 * Check if current user has specific role
 */
export const hasRole = (req: Request, role: Role): boolean => {
  return req.user?.role === role;
};

export default authenticate;
