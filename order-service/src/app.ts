import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import config from './config';
import { prisma } from './infrastructure/database/prisma';
import { getRabbitMQConnection } from './infrastructure/messaging/rabbitmq';
import { CartServiceClient } from './infrastructure/http/HttpClient';
import { OrderService } from './application/services/OrderService';
import { SagaOrchestrator } from './application/services/SagaOrchestrator';
import { OutboxProcessor } from './infrastructure/messaging/outboxProcessor';
import { EventHandlers } from './infrastructure/messaging/eventHandlers';
import { OrderController } from './presentation/controllers/OrderController';
import { createOrderRoutes } from './presentation/routes/order.routes';
import { errorHandler, notFoundHandler } from './presentation/middleware/validation';

const logger = createLogger('App');

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  
  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
    });

    next();
  });

  return app;
}

export async function initializeServices(): Promise<{
  orderService: OrderService;
  sagaOrchestrator: SagaOrchestrator;
  outboxProcessor: OutboxProcessor;
  eventHandlers: EventHandlers;
  rabbitMQ: ReturnType<typeof getRabbitMQConnection>;
}> {
  logger.info('Initializing services...');

  // Initialize RabbitMQ connection
  const rabbitMQ = getRabbitMQConnection();
  await rabbitMQ.connect();

  // Initialize HTTP clients
  const cartServiceClient = new CartServiceClient();

  // Initialize services
  const orderService = new OrderService(
    prisma,
    {
      getCart: cartServiceClient.getCart.bind(cartServiceClient),
      clearCart: cartServiceClient.clearCart.bind(cartServiceClient),
    },
    {
      scheduleEvent: async (eventType, aggregateId, payload) => {
        // This will be handled by outbox processor
        logger.debug('Event scheduled', { eventType, aggregateId });
      },
    }
  );

  // Initialize saga orchestrator
  const sagaOrchestrator = new SagaOrchestrator(prisma, {
    publish: async (eventType, payload) => {
      await rabbitMQ.publishEvent(eventType, (payload as { orderId: string }).orderId, payload);
    },
  });

  // Initialize outbox processor
  const outboxProcessor = new OutboxProcessor(prisma, rabbitMQ);
  outboxProcessor.start();

  // Initialize event handlers
  const eventHandlers = new EventHandlers(prisma, orderService, sagaOrchestrator);
  eventHandlers.registerAllHandlers((eventType, handler) => {
    rabbitMQ.registerHandler(eventType, handler);
  });

  logger.info('Services initialized successfully');

  return {
    orderService,
    sagaOrchestrator,
    outboxProcessor,
    eventHandlers,
    rabbitMQ,
  };
}

export function setupRoutes(
  app: Application,
  orderService: OrderService,
  sagaOrchestrator: SagaOrchestrator,
  outboxProcessor: OutboxProcessor
): void {
  logger.info('Setting up routes...');

  // Create controller
  const orderController = new OrderController(
    orderService,
    sagaOrchestrator,
    outboxProcessor
  );

  // Create and mount routes
  const orderRoutes = createOrderRoutes(orderController);
  app.use('/api/v1', orderRoutes);

  // API info endpoint
  app.get('/api/v1', (req, res) => {
    res.json({
      name: 'Order Service API',
      version: '1.0.0',
      description: 'E-commerce Order Management Service',
      endpoints: {
        health: 'GET /api/v1/health',
        orders: {
          createFromCart: 'POST /api/v1/orders/from-cart',
          create: 'POST /api/v1/orders',
          list: 'GET /api/v1/orders',
          getById: 'GET /api/v1/orders/:id',
          getByNumber: 'GET /api/v1/orders/number/:orderNumber',
          cancel: 'PUT /api/v1/orders/:id/cancel',
          updateStatus: 'PUT /api/v1/orders/:id/status (admin)',
        },
        admin: {
          listAllOrders: 'GET /api/v1/admin/orders',
          statistics: 'GET /api/v1/admin/statistics',
          outboxStats: 'GET /api/v1/admin/outbox/statistics',
          failedOutbox: 'GET /api/v1/admin/outbox/failed',
          retryOutbox: 'POST /api/v1/admin/outbox/retry/:eventId',
          activeSagas: 'GET /api/v1/admin/sagas/active',
        },
      },
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  logger.info('Routes setup complete');
}

export async function createApplication(): Promise<Application> {
  const app = createApp();
  const services = await initializeServices();
  setupRoutes(app, services.orderService, services.sagaOrchestrator, services.outboxProcessor);
  return app;
}

export default createApplication;
