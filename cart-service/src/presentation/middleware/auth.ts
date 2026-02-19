import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import logger from '../../utils/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        [key: string]: any;
      };
    }
  }
}

export interface JWTPayload {
  id: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authorization header is required',
      });
      return;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authorization header must be in format: Bearer <token>',
      });
      return;
    }

    const token = parts[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token is required',
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      ...decoded,
    };

    logger.debug(`User authenticated: ${decoded.id}`);

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token has expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token',
      });
      return;
    }

    logger.error('Authentication error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An error occurred during authentication',
    });
  }
};

/**
 * Middleware to optionally verify JWT token
 * If token is present and valid, attaches user to request
 * If token is missing or invalid, continues without user
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No token, continue without user
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

    if (!token) {
      next();
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      ...decoded,
    };

    logger.debug(`User authenticated (optional): ${decoded.id}`);

    next();
  } catch (error) {
    // Token verification failed, continue without user
    logger.debug('Optional auth: token verification failed, continuing without user');
    next();
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is accessing their own resource
 * or has admin privileges
 */
export const requireOwnershipOrAdmin = (
  paramName: string = 'userId'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const resourceUserId = req.params[paramName] || req.body.userId;
    const isAdmin = req.user.role === 'admin';
    const isOwner = req.user.id === resourceUserId;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only access your own resources',
      });
      return;
    }

    next();
  };
};

/**
 * Generate a test token for development/testing
 */
export const generateTestToken = (payload: Partial<JWTPayload> = {}): string => {
  const defaultPayload = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
    ...payload,
  };

  return jwt.sign(defaultPayload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

export default authenticate;
