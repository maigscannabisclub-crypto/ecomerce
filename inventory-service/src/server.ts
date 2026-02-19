import { createApp } from './app';
import config, { validateConfig } from './config';
import logger from './utils/logger';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma';
import { createRabbitMQClient } from './infrastructure/messaging/rabbitmq';
import { EventHandlers } from './infrastructure/messaging/eventHandlers';
import { prisma } from './infrastructure/database/prisma';

// Validate configuration
validateConfig();

// Create Express app
const app = createApp();

// Create RabbitMQ client
const rabbitMQClient = createRabbitMQClient();

// Create event handlers
const eventHandlers = new EventHandlers(prisma, rabbitMQClient);

// Server instance
let server: ReturnType<typeof app.listen> | null = null;

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    logger.info('🚀 Starting Inventory Service...');
    logger.info(`Environment: ${config.server.env}`);

    // Connect to database
    await connectDatabase();

    // Connect to RabbitMQ
    await rabbitMQClient.connect();

    // Initialize event handlers
    await eventHandlers.initialize();

    // Start HTTP server
    server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`✅ Inventory Service running on http://${config.server.host}:${config.server.port}`);
      logger.info(`📊 Health check available at http://${config.server.host}:${config.server.port}/health`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown();
  } catch (error) {
    logger.error('❌ Failed to start server', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`📥 Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
      server.close(() => {
        logger.info('🛑 HTTP server closed');
      });
    }

    try {
      // Close RabbitMQ connection
      await rabbitMQClient.close();
      logger.info('📨 RabbitMQ connection closed');

      // Close database connection
      await disconnectDatabase();
      logger.info('💾 Database connection closed');

      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown', error);
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection', { reason, promise });
    shutdown('unhandledRejection');
  });
}

// Start the server
startServer();

export default app;
