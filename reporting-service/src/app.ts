import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config';
import logger from './utils/logger';
import reportRoutes from './presentation/routes/report.routes';
import { 
  checkDatabaseHealth, 
  connectDatabase, 
  disconnectDatabase 
} from './infrastructure/database/prisma';
import { 
  checkRedisHealth, 
  initializeRedis 
} from './infrastructure/cache/redis';
import { 
  initializeRabbitMQ, 
  startConsuming, 
  closeRabbitMQ,
  registerEventHandler,
  checkRabbitMQHealth,
} from './infrastructure/messaging/rabbitmq';
import { 
  handleOrderCompleted, 
  handleOrderCancelled 
} from './infrastructure/messaging/eventHandlers';

// ============================================
// Express App Factory
// ============================================

export const createApp = (): Application => {
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
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // In development, allow all origins
      if (config.nodeEnv === 'development') {
        return callback(null, true);
      }
      
      // In production, check against allowed origins
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
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
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
  app.use(limiter);

  // Compression
  app.use(compression());

  // ============================================
  // Body Parsing
  // ============================================
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ============================================
  // Request Logging
  // ============================================
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });
    
    next();
  });

  // ============================================
  // Routes
  // ============================================
  
  // Health check endpoint (public)
  app.get('/health', async (req: Request, res: Response) => {
    const checks = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkRabbitMQHealth(),
    ]);

    const [dbHealth, redisHealth, rabbitHealth] = checks;

    const isHealthy = dbHealth.healthy && redisHealth.healthy && rabbitHealth.healthy;

    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: config.serviceName,
        version: process.env.npm_package_version || '1.0.0',
        environment: config.nodeEnv,
        uptime: process.uptime(),
        checks: {
          database: {
            status: dbHealth.healthy ? 'up' : 'down',
            latency: `${dbHealth.latency}ms`,
          },
          redis: {
            status: redisHealth.healthy ? 'up' : 'down',
            latency: `${redisHealth.latency}ms`,
          },
          rabbitmq: {
            status: rabbitHealth.healthy ? 'up' : 'down',
            latency: `${rabbitHealth.latency}ms`,
          },
        },
      },
    });
  });

  // API routes
  app.use('/reports', reportRoutes);

  // ============================================
  // 404 Handler
  // ============================================
  
  app.use((req: Request, res: Response) => {
    logger.warn('Route not found', {
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
      },
    });
  });

  // ============================================
  // Error Handler
  // ============================================
  
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err, {
      method: req.method,
      path: req.path,
    });

    // Don't leak error details in production
    const isDevelopment = config.nodeEnv === 'development';

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDevelopment ? err.message : 'An unexpected error occurred',
        ...(isDevelopment && { stack: err.stack }),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
};

// ============================================
// Service Initialization
// ============================================

export const initializeServices = async (): Promise<void> => {
  try {
    logger.info('Initializing services...');

    // Initialize database
    await connectDatabase();

    // Initialize Redis
    initializeRedis();

    // Initialize RabbitMQ
    await initializeRabbitMQ();

    // Register event handlers
    registerEventHandler('OrderCompleted', handleOrderCompleted);
    registerEventHandler('order.completed', handleOrderCompleted);
    registerEventHandler('OrderCancelled', handleOrderCancelled);
    registerEventHandler('order.cancelled', handleOrderCancelled);

    // Start consuming messages
    await startConsuming();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', error);
    throw error;
  }
};

// ============================================
// Service Shutdown
// ============================================

export const shutdownServices = async (): Promise<void> => {
  logger.info('Shutting down services...');

  try {
    // Close RabbitMQ
    await closeRabbitMQ();
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ', error);
  }

  try {
    // Disconnect database
    await disconnectDatabase();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error disconnecting database', error);
  }

  logger.info('Services shutdown complete');
};

// ============================================
// Default Export
// ============================================

export default createApp;
