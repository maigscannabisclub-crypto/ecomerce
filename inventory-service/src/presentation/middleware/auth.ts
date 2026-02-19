import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../../utils/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roles: string[];
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

/**
 * Middleware to verify JWT token
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      path: req.path,
      ip: req.ip,
    });

    res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'TOKEN_MISSING',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      roles: decoded.roles || [],
    };

    logger.debug('User authenticated', {
      userId: decoded.userId,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Authentication failed: Token expired', {
        path: req.path,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Authentication failed: Invalid token', {
        path: req.path,
        ip: req.ip,
        error: error.message,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    logger.error('Authentication error', error);

    res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        requiredRoles: allowedRoles,
        userRoles: req.user.roles,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: allowedRoles,
      });
      return;
    }

    logger.debug('User authorized', {
      userId: req.user.id,
      roles: req.user.roles,
      path: req.path,
    });

    next();
  };
}

/**
 * Middleware to check if user has any of the required roles (OR logic)
 */
export function requireAnyRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const hasAnyRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasAnyRole) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        requiredRoles: allowedRoles,
        userRoles: req.user.roles,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user is admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  return requireRole('admin')(req, res, next);
}

/**
 * Middleware for optional authentication
 * Attaches user if token is valid, but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      roles: decoded.roles || [],
    };
  } catch (error) {
    // Ignore token errors for optional auth
    logger.debug('Optional auth: Invalid token', { error });
  }

  next();
}

/**
 * Generate JWT token (for testing purposes)
 */
export function generateToken(
  userId: string,
  email: string,
  roles: string[] = []
): string {
  return jwt.sign(
    {
      userId,
      email,
      roles,
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
    }
  );
}

export default {
  authenticateToken,
  requireRole,
  requireAnyRole,
  requireAdmin,
  optionalAuth,
  generateToken,
};
