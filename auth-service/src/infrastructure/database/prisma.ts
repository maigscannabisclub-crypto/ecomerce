import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = (): PrismaClient => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });

  // Middleware for logging queries in development
  if (process.env.NODE_ENV === 'development') {
    client.$use(async (params, next) => {
      const before = Date.now();
      const result = await next(params);
      const after = Date.now();

      logger.debug('Prisma Query', {
        model: params.model,
        action: params.action,
        duration: `${after - before}ms`,
      });

      return result;
    });
  }

  // Middleware for soft delete (optional - can be extended)
  client.$use(async (params, next) => {
    // Add any global middleware logic here
    return next(params);
  });

  return client;
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

// Connection management
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from database', { error });
    throw error;
  }
};

// Health check
export const checkDatabaseHealth = async (): Promise<{
  healthy: boolean;
  latency: number;
  message?: string;
}> => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - start;
    return {
      healthy: false,
      latency,
      message: error instanceof Error ? error.message : 'Database health check failed',
    };
  }
};

// Transaction helper
export const withTransaction = async <T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(async (tx) => {
    return fn(tx as unknown as PrismaClient);
  });
};

export default prisma;
