import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config';
import logger, { httpLogStream } from './utils/logger';
import { createInventoryRoutes } from './presentation/routes/inventory.routes';
import { InventoryController } from './presentation/controllers/InventoryController';
import { InventoryService } from './application/services/InventoryService';
import { IdempotencyService } from './utils/idempotency';
import { prisma, checkDatabaseHealth } from './infrastructure/database/prisma';
import { createRabbitMQClient } from './infrastructure/messaging/rabbitmq';
import { EventHandlers } from './infrastructure/messaging/eventHandlers';

// Create Express application
export function createApp(): Application {
  const app = express();

  // ==================== SECURITY MIDDLEWARE ====================
  
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // In production, you should specify allowed origins
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      
      if (config.server.env === 'development' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      });
    },
  });
  app.use(limiter);

  // ==================== BODY PARSING ====================
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ==================== REQUEST LOGGING ====================
  if (config.logging.enableRequestLogging) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        };

        if (res.statusCode >= 400) {
          logger.warn('HTTP Request', logData);
        } else {
          logger.http('HTTP Request', logData);
        }
      });

      next();
    });
  }

  // ==================== REQUEST ID ====================
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ==================== DEPENDENCY INJECTION ====================
  const idempotencyService = new IdempotencyService(prisma);
  const rabbitMQClient = createRabbitMQClient();
  
  // Event publisher function
  const eventPublisher = async (eventType: string, payload: Record<string, unknown>): Promise<void> => {
    await rabbitMQClient.publish(eventType, payload);
  };

  const inventoryService = new InventoryService(prisma, idempotencyService, eventPublisher);
  const inventoryController = new InventoryController(inventoryService);

  // ==================== ROUTES ====================
  // Health check (before API routes)
  app.get('/health', async (req: Request, res: Response) => {
    const dbHealth = await checkDatabaseHealth();
    const rabbitHealth = rabbitMQClient.getIsConnected();

    const isHealthy = dbHealth.healthy && rabbitHealth;

    const statusCode = isHealthy ? 200 : 503;
    const status = isHealthy ? 'healthy' : 'unhealthy';

    res.status(statusCode).json({
      success: isHealthy,
      data: {
        service: 'inventory-service',
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        checks: {
          database: {
            status: dbHealth.healthy ? 'up' : 'down',
            latency: dbHealth.latency ? `${dbHealth.latency}ms` : undefined,
            error: dbHealth.error,
          },
          rabbitmq: {
            status: rabbitHealth ? 'up' : 'down',
          },
        },
      },
    });
  });

  // API Routes
  app.use('/api/v1/inventory', createInventoryRoutes(inventoryController));

  // ==================== 404 HANDLER ====================
  app.use((req: Request, res: Response) => {
    logger.warn('Route not found', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    res.status(404).json({
      success: false,
      error: 'Route not found',
      code: 'ROUTE_NOT_FOUND',
      path: req.path,
      method: req.method,
    });
  });

  // ==================== ERROR HANDLER ====================
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Log error
    logger.error('Unhandled error', err, {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    // Don't leak error details in production
    const isDevelopment = config.server.env === 'development';

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDevelopment && {
        message: err.message,
        stack: err.stack,
      }),
    });
  });

  return app;
}

// Export for testing
export default createApp;
