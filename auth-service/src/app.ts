import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { config, CORS_CONFIG } from './config';
import logger from './utils/logger';
import createAuthRoutes from './presentation/routes/auth.routes';
import { AuthController } from './presentation/controllers/AuthController';

/**
 * Create Express application
 */
const createApp = (): Application => {
  const app = express();

  // ============================================
  // Security Middleware
  // ============================================

  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: CORS_CONFIG.origin === '*' ? true : CORS_CONFIG.origin.split(','),
    credentials: CORS_CONFIG.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-ID',
    ],
  }));

  // ============================================
  // Request Middleware
  // ============================================

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Add correlation ID to each request
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const childLogger = logger.child({
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
    });

    childLogger.info('Request started');

    res.on('finish', () => {
      const duration = Date.now() - start;
      childLogger.info('Request completed', {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });

    next();
  });

  // ============================================
  // Health Check Route
  // ============================================

  const authController = new AuthController();
  app.get('/health', authController.healthCheck);

  // ============================================
  // API Routes
  // ============================================

  // Auth routes
  app.use('/auth', createAuthRoutes());

  // API version prefix routes
  app.use('/api/v1/auth', createAuthRoutes());

  // ============================================
  // Error Handling
  // ============================================

  // 404 handler
  app.use((req: Request, res: Response) => {
    logger.warn('Route not found', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
    });

    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
      },
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      correlationId: req.correlationId,
      error: err.message,
      stack: err.stack,
    });

    // Don't leak error details in production
    const isDevelopment = config.isDevelopment;

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        ...(isDevelopment && { details: err.message, stack: err.stack }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
      },
    });
  });

  return app;
};

export default createApp;
