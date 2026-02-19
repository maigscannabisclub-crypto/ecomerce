import app from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma';
import redisClient from './infrastructure/cache/redis';
import logger from './utils/logger';

const PORT = config.port;

// Start server
const startServer = async () => {
  try {
    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('Database connected successfully');

    // Verify Redis connection
    logger.info('Checking Redis connection...');
    const redisHealth = await redisClient.healthCheck();
    if (redisHealth.healthy) {
      logger.info('Redis connected successfully', { latency: `${redisHealth.latency}ms` });
    } else {
      logger.warn('Redis connection failed, continuing without cache', {
        message: redisHealth.message,
      });
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`=================================`);
      logger.info(`Cart Service started successfully`);
      logger.info(`=================================`);
      logger.info(`Port: ${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Service: ${config.serviceName}`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info(`=================================`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`\nReceived ${signal}. Starting graceful shutdown...`);

      // Close HTTP server
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Disconnect from database
          await disconnectDatabase();
          
          // Disconnect from Redis
          await redisClient.disconnect();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default startServer;
