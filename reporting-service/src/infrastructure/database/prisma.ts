import { PrismaClient } from '@prisma/client';
import config from '../../config';
import logger from '../../utils/logger';

// Prisma client instance
let prisma: PrismaClient;

// Extended Prisma client with logging
const createPrismaClient = (): PrismaClient => {
  const client = new PrismaClient({
    log: config.nodeEnv === 'development' 
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });

  // Middleware for logging queries in development
  if (config.nodeEnv === 'development') {
    client.$use(async (params, next) => {
      const before = Date.now();
      const result = await next(params);
      const after = Date.now();
      
      logger.debug(`Prisma Query: ${params.model}.${params.action}`, {
        model: params.model,
        action: params.action,
        duration: `${after - before}ms`,
      });
      
      return result;
    });
  }

  return client;
};

// Initialize Prisma client
export const initializePrisma = (): PrismaClient => {
  if (!prisma) {
    prisma = createPrismaClient();
    logger.info('Prisma client initialized');
  }
  return prisma;
};

// Get Prisma client instance
export const getPrisma = (): PrismaClient => {
  if (!prisma) {
    return initializePrisma();
  }
  return prisma;
};

// Connect to database
export const connectDatabase = async (): Promise<void> => {
  try {
    const client = getPrisma();
    await client.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', error);
    throw error;
  }
};

// Disconnect from database
export const disconnectDatabase = async (): Promise<void> => {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('Database disconnected successfully');
    }
  } catch (error) {
    logger.error('Error disconnecting from database', error);
    throw error;
  }
};

// Health check for database
export const checkDatabaseHealth = async (): Promise<{ healthy: boolean; latency: number }> => {
  const start = Date.now();
  try {
    const client = getPrisma();
    await client.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { healthy: true, latency };
  } catch (error) {
    logger.error('Database health check failed', error);
    return { healthy: false, latency: Date.now() - start };
  }
};

// Run migrations
export const runMigrations = async (): Promise<void> => {
  try {
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Database migrations completed');
  } catch (error) {
    logger.error('Database migrations failed', error);
    throw error;
  }
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  const client = getPrisma();
  return await client.$transaction(async (tx) => {
    return await callback(tx as unknown as PrismaClient);
  });
};

// Export Prisma client for direct use
export { PrismaClient };

// Default export
export default getPrisma();
