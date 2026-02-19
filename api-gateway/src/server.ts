import app from './app';
import { config } from './config';
import { logger } from './middleware/logger';
import { setupUncaughtExceptionHandlers } from './middleware/errorHandler';

// Setup uncaught exception handlers
setupUncaughtExceptionHandlers();

// Server configuration
const PORT = config.port;
const HOST = config.host;

// Graceful shutdown handling
let server: ReturnType<typeof app.listen>;

const gracefulShutdown = (signal: string): void => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', {
        error: err.message
      });
      process.exit(1);
    }

    logger.info('Server closed successfully');

    // Close any remaining connections
    // Add cleanup logic here (database connections, etc.)

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

// Start server
const startServer = (): void => {
  server = app.listen(PORT, HOST, () => {
    logger.info('=================================');
    logger.info('API Gateway Started Successfully');
    logger.info('=================================');
    logger.info(`Environment: ${config.env}`);
    logger.info(`Server running at http://${HOST}:${PORT}`);
    logger.info(`Health check: http://${HOST}:${PORT}/health`);
    logger.info('=================================');
    logger.info('Service Routes:');
    logger.info(`  Auth Service:      ${config.services.auth.url}`);
    logger.info(`  Products Service:  ${config.services.products.url}`);
    logger.info(`  Cart Service:      ${config.services.cart.url}`);
    logger.info(`  Orders Service:    ${config.services.orders.url}`);
    logger.info(`  Inventory Service: ${config.services.inventory.url}`);
    logger.info(`  Reporting Service: ${config.services.reporting.url}`);
    logger.info('=================================');
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    switch (error.code) {
      case 'EACCES':
        logger.error(`Port ${PORT} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });
};

// Start the server
startServer();

// Export for testing
export { server };
