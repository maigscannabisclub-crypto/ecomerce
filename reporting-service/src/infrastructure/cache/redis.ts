import Redis from 'ioredis';
import config from '../../config';
import logger from '../../utils/logger';

// Redis client instance
let redis: Redis | null = null;

// Create Redis client
const createRedisClient = (): Redis => {
  const client = new Redis(config.redis.url, {
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    showFriendlyErrorStack: config.nodeEnv === 'development',
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (error) => {
    logger.error('Redis client error', error);
  });

  client.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  return client;
};

// Initialize Redis client
export const initializeRedis = (): Redis => {
  if (!redis) {
    redis = createRedisClient();
  }
  return redis;
};

// Get Redis client instance
export const getRedis = (): Redis => {
  if (!redis) {
    return initializeRedis();
  }
  return redis;
};

// Close Redis connection
export const closeRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
};

// Health check for Redis
export const checkRedisHealth = async (): Promise<{ healthy: boolean; latency: number }> => {
  const start = Date.now();
  try {
    const client = getRedis();
    await client.ping();
    const latency = Date.now() - start;
    return { healthy: true, latency };
  } catch (error) {
    logger.error('Redis health check failed', error);
    return { healthy: false, latency: Date.now() - start };
  }
};

// ============================================
// Cache Operations
// ============================================

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
}

// Get value from cache
export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = getRedis();
    const value = await client.get(key);
    
    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error(`Error getting cache for key: ${key}`, error);
    return null;
  }
};

// Set value in cache
export const setCache = async <T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> => {
  try {
    const client = getRedis();
    const serializedValue = JSON.stringify(value);
    
    if (options.ttl && options.ttl > 0) {
      await client.setex(key, options.ttl, serializedValue);
    } else {
      await client.set(key, serializedValue);
    }
    
    // Add to tags if specified
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        await client.sadd(`tag:${tag}`, key);
      }
    }
  } catch (error) {
    logger.error(`Error setting cache for key: ${key}`, error);
  }
};

// Delete value from cache
export const deleteCache = async (key: string): Promise<void> => {
  try {
    const client = getRedis();
    await client.del(key);
  } catch (error) {
    logger.error(`Error deleting cache for key: ${key}`, error);
  }
};

// Delete cache by pattern
export const deleteCachePattern = async (pattern: string): Promise<void> => {
  try {
    const client = getRedis();
    const keys = await client.keys(pattern);
    
    if (keys.length > 0) {
      await client.del(...keys);
      logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
    }
  } catch (error) {
    logger.error(`Error deleting cache pattern: ${pattern}`, error);
  }
};

// Invalidate cache by tag
export const invalidateCacheByTag = async (tag: string): Promise<void> => {
  try {
    const client = getRedis();
    const keys = await client.smembers(`tag:${tag}`);
    
    if (keys.length > 0) {
      await client.del(...keys);
      await client.del(`tag:${tag}`);
      logger.debug(`Invalidated ${keys.length} keys for tag: ${tag}`);
    }
  } catch (error) {
    logger.error(`Error invalidating cache for tag: ${tag}`, error);
  }
};

// Get or set cache (cache-aside pattern)
export const getOrSetCache = async <T>(
  key: string,
  factory: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> => {
  const cached = await getCache<T>(key);
  
  if (cached !== null) {
    logger.debug(`Cache hit for key: ${key}`);
    return cached;
  }
  
  logger.debug(`Cache miss for key: ${key}`);
  const value = await factory();
  await setCache(key, value, options);
  
  return value;
};

// Increment counter
export const incrementCounter = async (key: string, amount = 1): Promise<number> => {
  try {
    const client = getRedis();
    return await client.incrby(key, amount);
  } catch (error) {
    logger.error(`Error incrementing counter for key: ${key}`, error);
    return 0;
  }
};

// Set expiration for key
export const expireKey = async (key: string, seconds: number): Promise<void> => {
  try {
    const client = getRedis();
    await client.expire(key, seconds);
  } catch (error) {
    logger.error(`Error setting expiration for key: ${key}`, error);
  }
};

// Cache key builders
export const buildCacheKey = {
  dashboard: () => 'dashboard:summary',
  salesReport: (period: string, startDate: string) => `sales:${period}:${startDate}`,
  topProducts: (period: string, startDate: string, limit: number) => 
    `products:top:${period}:${startDate}:${limit}`,
  revenue: (startDate: string, endDate: string, groupBy: string) => 
    `revenue:${startDate}:${endDate}:${groupBy}`,
  orderMetrics: (startDate: string, endDate: string) => 
    `metrics:orders:${startDate}:${endDate}`,
  dailyMetric: (date: string) => `daily:${date}`,
};

export default getRedis();
