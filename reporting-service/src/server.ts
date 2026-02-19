#!/usr/bin/env node

import { createApp, initializeServices, shutdownServices } from './app';
import config, { validateConfig } from './config';
import logger from './utils/logger';

// ============================================
// Server Entry Point
// ============================================

const startServer = async (): Promise<void> => {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated');

    // Initialize services
    await initializeServices();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Reporting Service started`, {
        port: config.port,
        environment: config.nodeEnv,
        service: config.serviceName,
      });
      
      console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║           📊 REPORTING SERVICE                           ║
║                                                          ║
║   Status:     🟢 Running                                 ║
║   Port:       ${config.port.toString().padEnd(45)}║
║   Environment: ${config.nodeEnv.padEnd(44)}║
║   Health:     http://localhost:${config.port}/health${' '.repeat(15)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
      `);
    });

    // ============================================
    // Graceful Shutdown
    // ============================================
    
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Shutdown services
        await shutdownServices();
        
        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after timeout
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
      logger.error('Uncaught exception', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', reason as Error, { promise });
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default startServer;
