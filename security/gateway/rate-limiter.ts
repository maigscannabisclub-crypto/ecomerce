/**
 * Enterprise Rate Limiter
 * Multi-tier rate limiting: IP-based, user-based, and endpoint-based
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client for distributed rate limiting
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 1, // Use separate DB for rate limiting
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Rate limit configurations
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  skipSuccessfulRequests?: boolean;
}

// Tiered rate limiting configurations
const RATE_LIMITS = {
  // General: 100 requests/minute per IP
  general: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:general',
  },
  // Auth: 5 attempts/minute (strict)
  auth: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'ratelimit:auth',
  },
  // API: 1000 requests/minute per authenticated user
  api: {
    windowMs: 60 * 1000,
    maxRequests: 1000,
    keyPrefix: 'ratelimit:api',
  },
  // Admin: 500 requests/minute
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 500,
    keyPrefix: 'ratelimit:admin',
  },
  // Strict: 10 requests/minute (for sensitive endpoints)
  strict: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'ratelimit:strict',
  },
} as const;

type RateLimitTier = keyof typeof RATE_LIMITS;

// IP whitelist/blacklist
const IP_WHITELIST = new Set(
  (process.env.IP_WHITELIST || '').split(',').filter(Boolean)
);
const IP_BLACKLIST = new Set(
  (process.env.IP_BLACKLIST || '').split(',').filter(Boolean)
);

/**
 * Generate rate limit key based on request context
 */
function generateKey(req: Request, config: RateLimitConfig): string {
  const identifier = req.user?.id || req.ip || 'unknown';
  const endpoint = req.route?.path || req.path;
  return `${config.keyPrefix}:${identifier}:${endpoint}`;
}

/**
 * Check if IP is whitelisted
 */
export function isWhitelisted(ip: string): boolean {
  return IP_WHITELIST.has(ip);
}

/**
 * Check if IP is blacklisted
 */
export function isBlacklisted(ip: string): boolean {
  return IP_BLACKLIST.has(ip);
}

/**
 * Add IP to blacklist
 */
export async function blacklistIP(
  ip: string,
  durationMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  const key = `blacklist:ip:${ip}`;
  await redis.setex(key, Math.floor(durationMs / 1000), '1');
  IP_BLACKLIST.add(ip);
  logger.warn({ ip, durationMs }, 'IP added to blacklist');
}

/**
 * Remove IP from blacklist
 */
export async function unblacklistIP(ip: string): Promise<void> {
  const key = `blacklist:ip:${ip}`;
  await redis.del(key);
  IP_BLACKLIST.delete(ip);
  logger.info({ ip }, 'IP removed from blacklist');
}

/**
 * Core rate limiting function using sliding window algorithm
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  // Use Redis sorted set for sliding window
  const multi = redis.multi();
  
  // Remove old entries outside the window
  multi.zremrangebyscore(key, 0, windowStart);
  
  // Count current requests in window
  multi.zcard(key);
  
  // Add current request
  multi.zadd(key, now, `${now}-${Math.random()}`);
  
  // Set expiry on the key
  multi.pexpire(key, config.windowMs);
  
  const results = await multi.exec();
  const currentCount = (results?.[1]?.[1] as number) || 0;
  
  const allowed = currentCount < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - currentCount - 1);
  const resetTime = now + config.windowMs;
  
  return { allowed, remaining, resetTime };
}

/**
 * Create rate limiter middleware for specific tier
 */
export function createRateLimiter(tier: RateLimitTier = 'general') {
  const config = RATE_LIMITS[tier];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Check whitelist first
    if (isWhitelisted(clientIP)) {
      return next();
    }
    
    // Check blacklist
    if (isBlacklisted(clientIP)) {
      logger.warn({ ip: clientIP, path: req.path }, 'Blocked request from blacklisted IP');
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP has been blocked',
        code: 'IP_BLOCKED',
      });
    }
    
    // Check Redis blacklist
    const blacklistKey = `blacklist:ip:${clientIP}`;
    const isBlocked = await redis.exists(blacklistKey);
    if (isBlocked) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP has been temporarily blocked',
        code: 'IP_BLOCKED',
      });
    }
    
    const key = generateKey(req, config);
    
    try {
      const { allowed, remaining, resetTime } = await checkRateLimit(key, config);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.floor(resetTime / 1000).toString());
      
      if (!allowed) {
        logger.warn(
          {
            ip: clientIP,
            user: req.user?.id,
            path: req.path,
            tier,
          },
          'Rate limit exceeded'
        );
        
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil(config.windowMs / 1000)} seconds`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.windowMs / 1000),
        });
      }
      
      next();
    } catch (error) {
      logger.error({ error, key }, 'Rate limiter error');
      // Fail open in case of Redis error (don't block requests)
      next();
    }
  };
}

/**
 * Burst rate limiter for handling traffic spikes
 */
export function createBurstLimiter(
  burstSize: number = 20,
  refillRate: number = 10
) {
  const buckets = new Map<string, { tokens: number; lastRefill: number }>();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `burst:${req.ip || 'unknown'}`;
    const now = Date.now();
    
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: burstSize, lastRefill: now };
      buckets.set(key, bucket);
    }
    
    // Refill tokens
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timePassed / 1000) * refillRate);
    bucket.tokens = Math.min(burstSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    if (bucket.tokens > 0) {
      bucket.tokens--;
      next();
    } else {
      res.status(429).json({
        error: 'Burst limit exceeded',
        message: 'Too many requests in short time',
        code: 'BURST_LIMIT_EXCEEDED',
      });
    }
  };
}

/**
 * Progressive rate limiter that increases limits on repeated violations
 */
export async function progressiveRateLimit(
  identifier: string,
  baseConfig: RateLimitConfig
): Promise<{ allowed: boolean; penalty: number }> {
  const violationKey = `ratelimit:violations:${identifier}`;
  const violations = parseInt((await redis.get(violationKey)) || '0');
  
  // Increase penalty based on violation count
  const penaltyMultiplier = Math.min(Math.pow(2, violations), 16);
  const adjustedMaxRequests = Math.max(
    1,
    Math.floor(baseConfig.maxRequests / penaltyMultiplier)
  );
  
  const adjustedConfig = {
    ...baseConfig,
    maxRequests: adjustedMaxRequests,
  };
  
  const key = `ratelimit:progressive:${identifier}`;
  const result = await checkRateLimit(key, adjustedConfig);
  
  if (!result.allowed) {
    // Increment violation count
    await redis.incr(violationKey);
    await redis.expire(violationKey, 3600); // Reset after 1 hour
  }
  
  return { allowed: result.allowed, penalty: violations };
}

// Pre-configured middleware exports
export const generalRateLimiter = createRateLimiter('general');
export const authRateLimiter = createRateLimiter('auth');
export const apiRateLimiter = createRateLimiter('api');
export const adminRateLimiter = createRateLimiter('admin');
export const strictRateLimiter = createRateLimiter('strict');

// Combined rate limiter that applies different tiers based on route
export function adaptiveRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    
    // Determine tier based on path
    let tier: RateLimitTier = 'general';
    
    if (path.startsWith('/auth') || path.includes('/login') || path.includes('/register')) {
      tier = 'auth';
    } else if (path.startsWith('/admin')) {
      tier = 'admin';
    } else if (path.startsWith('/api')) {
      tier = req.user ? 'api' : 'general';
    } else if (path.includes('/sensitive') || path.includes('/webhook')) {
      tier = 'strict';
    }
    
    const middleware = createRateLimiter(tier);
    return middleware(req, res, next);
  };
}

export default {
  createRateLimiter,
  generalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  adminRateLimiter,
  strictRateLimiter,
  adaptiveRateLimiter,
  createBurstLimiter,
  blacklistIP,
  unblacklistIP,
  isWhitelisted,
  isBlacklisted,
};
