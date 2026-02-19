import createApp from './app';
import { config, validateConfig, PORT } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma';
import logger from './utils/logger';

/**
 * Start the server
 */
const startServer = async (): Promise<void> => {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated successfully');

    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Auth Service started`, {
        port: PORT,
        environment: config.env,
        serviceName: config.serviceName,
      });
      logger.info(`📡 Health check available at: http://localhost:${PORT}/health`);
      logger.info(`🔐 Auth endpoints available at: http://localhost:${PORT}/auth`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Close HTTP server
      server.close(async () => {
        logger.info('HTTP server closed');

        // Disconnect from database
        await disconnectDatabase();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Start the server
startServer();
