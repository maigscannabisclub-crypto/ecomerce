import { Request, Response } from 'express';
import { AuthService, AuthError, ValidationError } from '../../application/services/AuthService';
import prisma from '../../infrastructure/database/prisma';
import logger from '../../utils/logger';
import {
  RegisterUserRequestDTO,
  LoginUserRequestDTO,
  RefreshTokenRequestDTO,
  LogoutUserRequestDTO,
  UpdateProfileRequestDTO,
  ChangePasswordRequestDTO,
} from '../../application/dto/AuthDTO';

/**
 * Success response wrapper
 */
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Error response wrapper
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Auth Controller
 * Handles HTTP requests for authentication operations
 */
export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService(prisma);
  }

  /**
   * Create success response
   */
  private createSuccessResponse<T>(
    data: T,
    req: Request
  ): SuccessResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
      },
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    code: string,
    message: string,
    req: Request,
    details?: unknown
  ): ErrorResponse {
    return {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
      },
    };
  }

  /**
   * Handle controller errors
   */
  private handleError(
    error: unknown,
    res: Response,
    req: Request
  ): void {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController' });

    if (error instanceof AuthError) {
      childLogger.warn('Auth error', { code: error.code, message: error.message });
      res.status(error.statusCode).json(
        this.createErrorResponse(error.code, error.message, req)
      );
      return;
    }

    if (error instanceof ValidationError) {
      childLogger.warn('Validation error', { field: error.field, message: error.message });
      res.status(400).json(
        this.createErrorResponse('VALIDATION_ERROR', error.message, req, {
          field: error.field,
        })
      );
      return;
    }

    if (error instanceof Error) {
      childLogger.error('Unexpected error', { error: error.message, stack: error.stack });
      res.status(500).json(
        this.createErrorResponse(
          'INTERNAL_ERROR',
          'An unexpected error occurred',
          req
        )
      );
      return;
    }

    childLogger.error('Unknown error', { error });
    res.status(500).json(
      this.createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred', req)
    );
  }

  /**
   * Register new user
   * POST /auth/register
   */
  register = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'register' });

    try {
      childLogger.info('Processing registration request');

      const data: RegisterUserRequestDTO = req.body;
      const result = await this.authService.register(data, correlationId);

      childLogger.info('Registration successful', { userId: result.user.id });

      res.status(201).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Login user
   * POST /auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'login' });

    try {
      childLogger.info('Processing login request');

      const data: LoginUserRequestDTO = req.body;
      const result = await this.authService.login(data, correlationId);

      childLogger.info('Login successful', { userId: result.user.id });

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Refresh access token
   * POST /auth/refresh
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'refreshToken' });

    try {
      childLogger.info('Processing token refresh request');

      const data: RefreshTokenRequestDTO = req.body;
      const result = await this.authService.refreshToken(data, correlationId);

      childLogger.info('Token refresh successful');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Logout user
   * POST /auth/logout
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'logout' });

    try {
      childLogger.info('Processing logout request');

      const data: LogoutUserRequestDTO = req.body;
      const result = await this.authService.logout(data, correlationId);

      childLogger.info('Logout successful');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Logout user from all devices
   * POST /auth/logout-all
   */
  logoutAll = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'logoutAll' });

    try {
      childLogger.info('Processing logout-all request');

      if (!req.user) {
        res.status(401).json(
          this.createErrorResponse('UNAUTHORIZED', 'Authentication required', req)
        );
        return;
      }

      const result = await this.authService.logoutAll(req.user.userId, correlationId);

      childLogger.info('Logout from all devices successful');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Get user profile
   * GET /auth/profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'getProfile' });

    try {
      childLogger.info('Processing get profile request');

      if (!req.user) {
        res.status(401).json(
          this.createErrorResponse('UNAUTHORIZED', 'Authentication required', req)
        );
        return;
      }

      const result = await this.authService.getProfile(req.user.userId, correlationId);

      childLogger.info('Profile retrieved successfully');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Update user profile
   * PUT /auth/profile
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'updateProfile' });

    try {
      childLogger.info('Processing update profile request');

      if (!req.user) {
        res.status(401).json(
          this.createErrorResponse('UNAUTHORIZED', 'Authentication required', req)
        );
        return;
      }

      const data: UpdateProfileRequestDTO = req.body;
      const result = await this.authService.updateProfile(
        req.user.userId,
        data,
        correlationId
      );

      childLogger.info('Profile updated successfully');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Change user password
   * PUT /auth/change-password
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'changePassword' });

    try {
      childLogger.info('Processing change password request');

      if (!req.user) {
        res.status(401).json(
          this.createErrorResponse('UNAUTHORIZED', 'Authentication required', req)
        );
        return;
      }

      const data: ChangePasswordRequestDTO = req.body;
      const result = await this.authService.changePassword(
        req.user.userId,
        data,
        correlationId
      );

      childLogger.info('Password changed successfully');

      res.status(200).json(this.createSuccessResponse(result, req));
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Verify token (for other services)
   * GET /auth/verify
   */
  verifyToken = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';
    const childLogger = logger.child({ correlationId, controller: 'AuthController', action: 'verifyToken' });

    try {
      childLogger.info('Processing token verification request');

      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

      const result = await this.authService.verifyToken(token, correlationId);

      if (result.valid) {
        childLogger.info('Token verified successfully');
        res.status(200).json(this.createSuccessResponse(result, req));
      } else {
        childLogger.warn('Token verification failed');
        res.status(401).json(this.createSuccessResponse(result, req));
      }
    } catch (error) {
      this.handleError(error, res, req);
    }
  };

  /**
   * Health check
   * GET /health
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'no-correlation-id';

    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;

      res.status(200).json({
        success: true,
        data: {
          status: 'healthy',
          service: 'auth-service',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          checks: {
            database: 'connected',
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        },
      });
    } catch (error) {
      logger.error('Health check failed', { error, correlationId });

      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service is unhealthy',
        },
        data: {
          status: 'unhealthy',
          service: 'auth-service',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'disconnected',
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        },
      });
    }
  };
}

export default AuthController;
