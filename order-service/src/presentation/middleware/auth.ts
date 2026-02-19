import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../../utils/logger';
import config from '../../config';

const logger = createLogger('AuthMiddleware');

// Extended Request type with user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        roles: string[];
      };
    }
  }
}

export interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

/**
 * Extract token from request headers
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify JWT token
 */
function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.debug('Token verification failed', {
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Authentication middleware
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'No token provided',
    });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'Invalid or expired token',
    });
    return;
  }

  // Check token expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'Token has expired',
    });
    return;
  }

  // Attach user info to request
  req.user = {
    userId: payload.userId,
    email: payload.email,
    roles: payload.roles || [],
  };

  logger.debug('User authenticated', {
    userId: payload.userId,
    email: payload.email,
    path: req.path,
  });

  next();
}

/**
 * Authorization middleware - check if user has required role
 */
export function authorize(...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const hasRequiredRole = requiredRoles.some((role) =>
      user.roles.includes(role)
    );

    if (!hasRequiredRole) {
      logger.warn('Authorization failed', {
        userId: user.userId,
        requiredRoles,
        userRoles: user.roles,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Insufficient permissions',
      });
      return;
    }

    logger.debug('User authorized', {
      userId: user.userId,
      roles: user.roles,
      path: req.path,
    });

    next();
  };
}

/**
 * Optional authentication middleware
 * Attaches user info if token is valid, but doesn't require it
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (token) {
    const payload = verifyToken(token);

    if (payload) {
      req.user = {
        userId: payload.userId,
        email: payload.email,
        roles: payload.roles || [],
      };
    }
  }

  next();
}

/**
 * Generate JWT token (for testing/development)
 */
export function generateToken(payload: {
  userId: string;
  email: string;
  roles: string[];
}): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export default {
  authenticate,
  authorize,
  optionalAuth,
  generateToken,
};
