import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../../utils/logger';

// ============================================
// Types
// ============================================

export interface UserPayload {
  id: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  USER = 'USER',
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// ============================================
// JWT Verification
// ============================================

export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('No authorization header', { requestId });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header is required',
        },
        meta: { requestId },
      });
      return;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logger.warn('Invalid authorization header format', { requestId });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization header format. Use: Bearer <token>',
        },
        meta: { requestId },
      });
      return;
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as UserPayload;
      req.user = decoded;
      logger.debug('Token verified successfully', { 
        requestId, 
        userId: decoded.id,
        role: decoded.role,
      });
      next();
    } catch (jwtError) {
      logger.warn('Invalid token', { requestId, error: jwtError });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
        meta: { requestId },
      });
    }
  } catch (error) {
    logger.error('Error in token verification', error, { requestId });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error verifying authentication',
      },
      meta: { requestId },
    });
  }
};

// ============================================
// Role-based Authorization
// ============================================

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    if (!req.user) {
      logger.warn('No user in request', { requestId });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        meta: { requestId },
      });
      return;
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      logger.warn('Insufficient permissions', { 
        requestId, 
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
      });
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to access this resource',
        },
        meta: { requestId },
      });
      return;
    }

    logger.debug('Role check passed', { 
      requestId, 
      userId: req.user.id,
      role: userRole,
    });
    next();
  };
};

// ============================================
// Admin-only Middleware
// ============================================

export const requireAdmin = requireRole(UserRole.ADMIN);

// ============================================
// Manager or Admin Middleware
// ============================================

export const requireManagerOrAdmin = requireRole(UserRole.ADMIN, UserRole.MANAGER);

// ============================================
// Permission-based Authorization
// ============================================

export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    if (!req.user) {
      logger.warn('No user in request', { requestId });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        meta: { requestId },
      });
      return;
    }

    const userPermissions = req.user.permissions || [];

    const hasAllPermissions = requiredPermissions.every(perm =>
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      logger.warn('Missing permissions', { 
        requestId, 
        userId: req.user.id,
        requiredPermissions,
        userPermissions,
      });
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Missing required permissions',
        },
        meta: { requestId },
      });
      return;
    }

    next();
  };
};

// ============================================
// Optional Authentication
// ============================================

export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No auth header, continue without user
      next();
      return;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      // Invalid format, continue without user
      next();
      return;
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as UserPayload;
      req.user = decoded;
      logger.debug('Optional auth: token verified', { 
        requestId, 
        userId: decoded.id,
      });
    } catch {
      // Invalid token, continue without user
      logger.debug('Optional auth: invalid token', { requestId });
    }

    next();
  } catch (error) {
    logger.error('Error in optional auth', error, { requestId });
    next();
  }
};

// ============================================
// Request ID Middleware
// ============================================

export const addRequestId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Set request ID on request object for later use
  req.headers['x-request-id'] = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-Id', requestId);
  
  next();
};

// ============================================
// CORS Headers Middleware
// ============================================

export const addSecurityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};
