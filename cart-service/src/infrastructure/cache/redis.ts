import Redis from 'ioredis';
import { config } from '../../config';
import logger from '../../utils/logger';

class RedisClient {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      this.client = new Redis(config.redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis client connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });
    } catch (error) {
      logger.error('Failed to create Redis client:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  // Cart cache operations
  async getCart(userId: string): Promise<any | null> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready, skipping cache get');
        return null;
      }

      const key = `cart:${userId}`;
      const data = await this.client!.get(key);
      
      if (data) {
        logger.debug(`Cache hit for cart: ${userId}`);
        return JSON.parse(data);
      }
      
      logger.debug(`Cache miss for cart: ${userId}`);
      return null;
    } catch (error) {
      logger.error('Error getting cart from cache:', error);
      return null;
    }
  }

  async setCart(userId: string, cart: any, ttl?: number): Promise<void> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready, skipping cache set');
        return;
      }

      const key = `cart:${userId}`;
      const expiration = ttl || config.redisTtlCart;
      
      await this.client!.setex(key, expiration, JSON.stringify(cart));
      logger.debug(`Cart cached for user: ${userId}, TTL: ${expiration}s`);
    } catch (error) {
      logger.error('Error setting cart in cache:', error);
    }
  }

  async deleteCart(userId: string): Promise<void> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready, skipping cache delete');
        return;
      }

      const key = `cart:${userId}`;
      await this.client!.del(key);
      logger.debug(`Cart removed from cache for user: ${userId}`);
    } catch (error) {
      logger.error('Error deleting cart from cache:', error);
    }
  }

  async invalidateCart(userId: string): Promise<void> {
    await this.deleteCart(userId);
  }

  // Batch operations
  async getMultipleCarts(userIds: string[]): Promise<Record<string, any>> {
    try {
      if (!this.isReady() || userIds.length === 0) {
        return {};
      }

      const keys = userIds.map(id => `cart:${id}`);
      const values = await this.client!.mget(...keys);

      const result: Record<string, any> = {};
      userIds.forEach((userId, index) => {
        if (values[index]) {
          result[userId] = JSON.parse(values[index]);
        }
      });

      return result;
    } catch (error) {
      logger.error('Error getting multiple carts from cache:', error);
      return {};
    }
  }

  // Health check
  async healthCheck(): Promise<{
    healthy: boolean;
    latency: number;
    message?: string;
  }> {
    const start = Date.now();
    try {
      if (!this.client) {
        return {
          healthy: false,
          latency: 0,
          message: 'Redis client not initialized',
        };
      }

      await this.client.ping();
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
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // General cache operations
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isReady()) return null;
      
      const data = await this.client!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Error getting key ${key} from cache:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      if (!this.isReady()) return;
      
      const data = JSON.stringify(value);
      if (ttl) {
        await this.client!.setex(key, ttl, data);
      } else {
        await this.client!.set(key, data);
      }
    } catch (error) {
      logger.error(`Error setting key ${key} in cache:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      if (!this.isReady()) return;
      await this.client!.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key} from cache:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  // Pattern-based deletion
  async deletePattern(pattern: string): Promise<void> {
    try {
      if (!this.isReady()) return;
      
      const keys = await this.client!.keys(pattern);
      if (keys.length > 0) {
        await this.client!.del(...keys);
        logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Error deleting keys matching pattern ${pattern}:`, error);
    }
  }

  // Get TTL
  async getTTL(key: string): Promise<number> {
    try {
      if (!this.isReady()) return -1;
      return await this.client!.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }
}

// Singleton instance
const redisClient = new RedisClient();

export default redisClient;
