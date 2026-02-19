import Redis from 'ioredis';
import config from '../../config';
import logger from '../../utils/logger';

// Redis client instance
let redisClient: Redis | null = null;
let isConnected = false;

export const createRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis retry attempt ${times}, retrying in ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    showFriendlyErrorStack: config.server.env === 'development'
  });

  client.on('connect', () => {
    logger.info('✅ Redis client connected');
    isConnected = true;
  });

  client.on('ready', () => {
    logger.info('✅ Redis client ready');
  });

  client.on('error', (error) => {
    logger.error('❌ Redis client error', error);
    isConnected = false;
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
    isConnected = false;
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  redisClient = client;
  return client;
};

export const getRedisClient = (): Redis | null => {
  if (!config.redis.enabled) {
    return null;
  }
  return redisClient || createRedisClient();
};

export const connectCache = async (): Promise<void> => {
  if (!config.redis.enabled) {
    logger.info('Cache is disabled');
    return;
  }

  if (isConnected) {
    logger.debug('Cache already connected');
    return;
  }

  try {
    const client = createRedisClient();
    await client.ping();
    logger.info('✅ Cache connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to cache', error);
    // Don't throw - allow the service to work without cache
  }
};

export const disconnectCache = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Cache disconnected');
  }
};

export const checkCacheHealth = async (): Promise<boolean> => {
  if (!config.redis.enabled || !redisClient) {
    return false;
  }

  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Cache health check failed', error);
    return false;
  }
};

// Cache helper methods
export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!config.redis.enabled || !redisClient) {
    return null;
  }

  try {
    const data = await redisClient.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error(`Error getting cache key: ${key}`, error);
    return null;
  }
};

export const setCache = async <T>(
  key: string, 
  value: T, 
  ttl: number = config.redis.cacheTtl
): Promise<void> => {
  if (!config.redis.enabled || !redisClient) {
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    await redisClient.setex(key, ttl, serialized);
    logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    logger.error(`Error setting cache key: ${key}`, error);
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  if (!config.redis.enabled || !redisClient) {
    return;
  }

  try {
    await redisClient.del(key);
    logger.debug(`Cache deleted: ${key}`);
  } catch (error) {
    logger.error(`Error deleting cache key: ${key}`, error);
  }
};

export const deleteCachePattern = async (pattern: string): Promise<void> => {
  if (!config.redis.enabled || !redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.debug(`Cache pattern deleted: ${pattern} (${keys.length} keys)`);
    }
  } catch (error) {
    logger.error(`Error deleting cache pattern: ${pattern}`, error);
  }
};

export const invalidateProductCache = async (productId?: string): Promise<void> => {
  if (!config.redis.enabled || !redisClient) {
    return;
  }

  try {
    // Delete product list caches
    await deleteCachePattern('products:list:*');
    
    // Delete specific product cache if ID provided
    if (productId) {
      await deleteCache(`products:${productId}`);
      await deleteCachePattern(`products:search:*`);
    }
    
    logger.debug('Product cache invalidated');
  } catch (error) {
    logger.error('Error invalidating product cache', error);
  }
};

// Cache key generators
export const generateProductListKey = (query: Record<string, unknown>): string => {
  const sortedParams = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(':');
  
  return `products:list:${sortedParams}`;
};

export const generateProductKey = (id: string): string => {
  return `products:${id}`;
};

export const generateSearchKey = (search: string, filters: Record<string, unknown>): string => {
  const sortedFilters = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(':');
  
  return `products:search:${search}:${sortedFilters}`;
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectCache();
});

process.on('SIGTERM', async () => {
  await disconnectCache();
});

export default {
  getClient: getRedisClient,
  connect: connectCache,
  disconnect: disconnectCache,
  checkHealth: checkCacheHealth,
  get: getCache,
  set: setCache,
  delete: deleteCache,
  deletePattern: deleteCachePattern,
  invalidateProductCache,
  generateProductListKey,
  generateProductKey,
  generateSearchKey
};
