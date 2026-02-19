import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { 
  AuthenticatedRequest, 
  AuthenticatedUser, 
  TokenPayload, 
  UserRole,
  ApiError,
  ErrorCodes,
  HttpStatus 
} from '../types';
import { logger } from './logger';

// JWT configuration
const JWT_SECRET = config.jwt.secret;
const JWT_ISSUER = config.jwt.issuer;
const JWT_AUDIENCE = config.jwt.audience;

/**
 * Extract JWT token from request headers
 */
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Verify and decode JWT token
 */
const verifyToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'] as jwt.Algorithm[]
    }) as TokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(
        ErrorCodes.TOKEN_EXPIRED,
        'Token has expired',
        HttpStatus.UNAUTHORIZED
      );
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(
        ErrorCodes.INVALID_TOKEN,
        'Invalid token',
        HttpStatus.UNAUTHORIZED
      );
    }

    throw new ApiError(
      ErrorCodes.UNAUTHORIZED,
      'Authentication failed',
      HttpStatus.UNAUTHORIZED
    );
  }
};

/**
 * Convert JWT payload to authenticated user
 */
const payloadToUser = (payload: TokenPayload): AuthenticatedUser => {
  if (!payload.sub || !payload.email || !payload.role) {
    throw new ApiError(
      ErrorCodes.INVALID_TOKEN,
      'Invalid token payload',
      HttpStatus.UNAUTHORIZED
    );
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role as UserRole,
    permissions: payload.permissions || []
  };
};

/**
 * Middleware to authenticate JWT tokens
 * Attaches user object to request if authentication succeeds
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const correlationId = authReq.correlationId;

  try {
    const token = extractToken(req);

    if (!token) {
      throw new ApiError(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required. Please provide a valid token.',
        HttpStatus.UNAUTHORIZED
      );
    }

    const payload = verifyToken(token);
    const user = payloadToUser(payload);

    // Attach user to request
    authReq.user = user;

    logger.debug('User authenticated successfully', {
      correlationId,
      userId: user.id,
      role: user.role
    });

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }

    logger.error('Authentication error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    next(new ApiError(
      ErrorCodes.UNAUTHORIZED,
      'Authentication failed',
      HttpStatus.UNAUTHORIZED
    ));
  }
};

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const correlationId = authReq.correlationId;

    try {
      if (!authReq.user) {
        throw new ApiError(
          ErrorCodes.UNAUTHORIZED,
          'Authentication required',
          HttpStatus.UNAUTHORIZED
        );
      }

      const userRole = authReq.user.role;

      // Admin has access to everything
      if (userRole === UserRole.ADMIN) {
        next();
        return;
      }

      if (!allowedRoles.includes(userRole)) {
        logger.warn('Access denied - insufficient permissions', {
          correlationId,
          userId: authReq.user.id,
          userRole,
          requiredRoles: allowedRoles
        });

        throw new ApiError(
          ErrorCodes.FORBIDDEN,
          `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
          HttpStatus.FORBIDDEN
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has required permissions
 * Must be used after authenticate middleware
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const correlationId = authReq.correlationId;

    try {
      if (!authReq.user) {
        throw new ApiError(
          ErrorCodes.UNAUTHORIZED,
          'Authentication required',
          HttpStatus.UNAUTHORIZED
        );
      }

      const userPermissions = authReq.user.permissions || [];

      // Admin has all permissions
      if (authReq.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      const hasAllPermissions = requiredPermissions.every(perm =>
        userPermissions.includes(perm)
      );

      if (!hasAllPermissions) {
        logger.warn('Access denied - missing permissions', {
          correlationId,
          userId: authReq.user.id,
          userPermissions,
          requiredPermissions
        });

        throw new ApiError(
          ErrorCodes.FORBIDDEN,
          'Access denied. Insufficient permissions.',
          HttpStatus.FORBIDDEN
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
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
  const authReq = req as AuthenticatedRequest;

  try {
    const token = extractToken(req);

    if (token) {
      const payload = verifyToken(token);
      authReq.user = payloadToUser(payload);
    }

    next();
  } catch (error) {
    // Continue without authentication - this is optional
    next();
  }
};

/**
 * Middleware to check if user owns the resource or is admin
 */
export const requireOwnershipOrAdmin = (
  getResourceOwnerId: (req: Request) => string
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    try {
      if (!authReq.user) {
        throw new ApiError(
          ErrorCodes.UNAUTHORIZED,
          'Authentication required',
          HttpStatus.UNAUTHORIZED
        );
      }

      // Admin can access any resource
      if (authReq.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      const resourceOwnerId = getResourceOwnerId(req);

      if (authReq.user.id !== resourceOwnerId) {
        throw new ApiError(
          ErrorCodes.FORBIDDEN,
          'Access denied. You can only access your own resources.',
          HttpStatus.FORBIDDEN
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default authenticate;
