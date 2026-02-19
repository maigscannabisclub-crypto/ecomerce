import { PrismaClient } from '@prisma/client';
import config from '../../config';
import logger from '../../utils/logger';

// Prisma client instance with logging
const prisma = new PrismaClient({
  log: config.server.env === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error', 'warn'],
});

// Connection management
let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  if (isConnected) {
    logger.debug('Database already connected');
    return;
  }

  try {
    await prisma.$connect();
    isConnected = true;
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to database', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (!isConnected) {
    return;
  }

  try {
    await prisma.$disconnect();
    isConnected = false;
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database', error);
    throw error;
  }
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
};

// Middleware for query logging and metrics
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  if (config.server.env === 'development') {
    logger.debug(`Prisma Query: ${params.model}.${params.action}`, {
      duration: `${duration}ms`,
      model: params.model,
      action: params.action
    });
  }

  return result;
});

// Graceful shutdown handler
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

export default prisma;
