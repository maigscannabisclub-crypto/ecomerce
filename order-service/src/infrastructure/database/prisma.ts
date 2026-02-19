import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PrismaClient');

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientOptions = {
  log: process.env.NODE_ENV === 'development' 
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ] as const
    : undefined,
};

export const prisma = global.prisma || new PrismaClient(prismaClientOptions);

// Log queries in development
if (process.env.NODE_ENV === 'development' && prismaClientOptions.log) {
  prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });

  prisma.$on('error', (e: { message: string }) => {
    logger.error('Prisma Error', { message: e.message });
  });

  prisma.$on('info', (e: { message: string }) => {
    logger.info('Prisma Info', { message: e.message });
  });

  prisma.$on('warn', (e: { message: string }) => {
    logger.warn('Prisma Warning', { message: e.message });
  });
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Connection management
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', {
      error: (error as Error).message,
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Failed to disconnect from database', {
      error: (error as Error).message,
    });
    throw error;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  
  try {
    // Simple query to check connection
    await prisma.$queryRaw`SELECT 1`;
    
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

// Transaction helper with retry
export async function withTransaction<T>(
  fn: (tx: PrismaClient) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        return fn(tx as unknown as PrismaClient);
      });
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a serialization failure
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = 
        errorMessage.includes('could not serialize') ||
        errorMessage.includes('deadlock detected') ||
        errorMessage.includes('lock wait timeout');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      logger.warn(`Transaction failed, retrying (${attempt}/${maxRetries})`, {
        error: lastError.message,
      });

      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 100)
      );
    }
  }

  throw lastError;
}

export default prisma;
