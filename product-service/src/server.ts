#!/usr/bin/env node

import app from './app';
import config from './config';
import logger from './utils/logger';
import { connectDatabase } from './infrastructure/database/prisma';
import { connectCache } from './infrastructure/cache/redis';
import { connectMessageQueue } from './infrastructure/messaging/rabbitmq';

// Server instance
let server: ReturnType<typeof app.listen> | null = null;

// ==========================================
// Server Startup
// ==========================================

const startServer = async (): Promise<void> => {
  try {
    logger.info(`🚀 Starting ${config.server.serviceName}...`);
    logger.info(`📍 Environment: ${config.server.env}`);

    // Connect to database
    await connectDatabase();

    // Connect to cache
    await connectCache();

    // Connect to message queue
    await connectMessageQueue();

    // Start HTTP server
    server = app.listen(config.server.port, () => {
      logger.info(`✅ Server running on port ${config.server.port}`);
      logger.info(`📡 API available at http://localhost:${config.server.port}`);
      logger.info(`💚 Health check at http://localhost:${config.server.port}/api/v1/health`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown();

  } catch (error) {
    logger.error('❌ Failed to start server', error);
    process.exit(1);
  }
};

// ==========================================
// Graceful Shutdown
// ==========================================

const setupGracefulShutdown = (): void => {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`📥 Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
      server.close(() => {
        logger.info('🔒 HTTP server closed');
      });
    }

    // Close database connection
    try {
      const { disconnectDatabase } = await import('./infrastructure/database/prisma');
      await disconnectDatabase();
    } catch (error) {
      logger.error('Error disconnecting from database', error);
    }

    // Close cache connection
    try {
      const { disconnectCache } = await import('./infrastructure/cache/redis');
      await disconnectCache();
    } catch (error) {
      logger.error('Error disconnecting from cache', error);
    }

    // Close message queue connection
    try {
      const { disconnectMessageQueue } = await import('./infrastructure/messaging/rabbitmq');
      await disconnectMessageQueue();
    } catch (error) {
      logger.error('Error disconnecting from message queue', error);
    }

    logger.info('👋 Graceful shutdown completed');
    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('💥 Uncaught Exception', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('💥 Unhandled Rejection', reason as Error);
    shutdown('unhandledRejection');
  });
};

// ==========================================
// Start Server
// ==========================================

startServer();

export default server;
