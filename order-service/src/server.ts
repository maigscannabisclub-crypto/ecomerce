import { createApplication, initializeServices } from './app';
import { prisma, connectDatabase, disconnectDatabase } from './infrastructure/database/prisma';
import { getRabbitMQConnection, disconnectRabbitMQ } from './infrastructure/messaging/rabbitmq';
import { createLogger } from './utils/logger';
import config from './config';

const logger = createLogger('Server');

let server: ReturnType<typeof import('http').createServer> | null = null;

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Starting Order Service...');
    logger.info(`Environment: ${config.nodeEnv}`);

    // Connect to database
    await connectDatabase();

    // Initialize services (includes RabbitMQ connection)
    const services = await initializeServices();

    // Create Express application
    const app = await createApplication();

    // Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`Order Service is running on port ${config.port}`);
      logger.info(`Health check: http://localhost:${config.port}/api/v1/health`);
      logger.info(`API docs: http://localhost:${config.port}/api/v1`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown(services);
  } catch (error) {
    logger.error('Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(services: {
  outboxProcessor: { stop: () => void };
}): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    // Stop outbox processor
    services.outboxProcessor.stop();
    logger.info('Outbox processor stopped');

    // Disconnect from RabbitMQ
    await disconnectRabbitMQ();
    logger.info('RabbitMQ disconnected');

    // Disconnect from database
    await disconnectDatabase();
    logger.info('Database disconnected');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

// Start the server
startServer().catch((error) => {
  logger.error('Unhandled error starting server', {
    error: (error as Error).message,
  });
  process.exit(1);
});

export default startServer;
