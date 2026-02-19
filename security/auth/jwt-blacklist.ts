/**
 * JWT Token Blacklist Management
 * Handles token revocation using Redis for distributed systems
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client for token blacklist
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 2, // Use separate DB for token blacklist
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Token metadata interface
interface TokenMetadata {
  jti: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  tokenType: 'access' | 'refresh';
  reason?: string;
}

// Blacklist entry interface
interface BlacklistEntry extends TokenMetadata {
  revokedAt: number;
  revokedBy?: string;
}

/**
 * Add token to blacklist
 */
export async function blacklistToken(
  tokenMetadata: TokenMetadata,
  reason: string = 'logout',
  revokedBy?: string
): Promise<void> {
  const entry: BlacklistEntry = {
    ...tokenMetadata,
    revokedAt: Date.now(),
    reason,
    revokedBy,
  };
  
  // Calculate TTL based on token expiration
  const ttl = Math.max(0, Math.floor((tokenMetadata.expiresAt - Date.now()) / 1000));
  
  if (ttl <= 0) {
    logger.debug({ jti: tokenMetadata.jti }, 'Token already expired, skipping blacklist');
    return;
  }
  
  const key = `jwt:blacklist:${tokenMetadata.jti}`;
  
  try {
    await redis.setex(key, ttl, JSON.stringify(entry));
    
    // Also add to user's revoked tokens list for audit
    const userKey = `jwt:revoked:${tokenMetadata.userId}`;
    await redis.zadd(userKey, Date.now(), tokenMetadata.jti);
    
    // Set expiry on user key (keep for 30 days for audit)
    await redis.expire(userKey, 30 * 24 * 60 * 60);
    
    logger.info(
      {
        jti: tokenMetadata.jti,
        userId: tokenMetadata.userId,
        reason,
        ttl,
      },
      'Token added to blacklist'
    );
  } catch (error) {
    logger.error({ error, jti: tokenMetadata.jti }, 'Failed to blacklist token');
    throw error;
  }
}

/**
 * Check if token is blacklisted
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const key = `jwt:blacklist:${jti}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error({ error, jti }, 'Error checking token blacklist');
    // Fail secure - assume blacklisted on error
    return true;
  }
}

/**
 * Get blacklist entry details
 */
export async function getBlacklistEntry(jti: string): Promise<BlacklistEntry | null> {
  try {
    const key = `jwt:blacklist:${jti}`;
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data) as BlacklistEntry;
  } catch (error) {
    logger.error({ error, jti }, 'Error getting blacklist entry');
    return null;
  }
}

/**
 * Blacklist all tokens for a user (logout all sessions)
 */
export async function blacklistAllUserTokens(
  userId: string,
  reason: string = 'security',
  revokedBy?: string
): Promise<number> {
  try {
    // Get all active tokens for user from session store
    const sessionKey = `sessions:${userId}`;
    const tokens = await redis.smembers(sessionKey);
    
    let revokedCount = 0;
    
    for (const tokenData of tokens) {
      try {
        const parsed = JSON.parse(tokenData);
        await blacklistToken(
          {
            jti: parsed.jti,
            userId,
            issuedAt: parsed.issuedAt,
            expiresAt: parsed.expiresAt,
            tokenType: parsed.tokenType,
          },
          reason,
          revokedBy
        );
        revokedCount++;
      } catch (e) {
        logger.warn({ tokenData, error: e }, 'Failed to parse token data');
      }
    }
    
    // Clear user's session store
    await redis.del(sessionKey);
    
    logger.info(
      { userId, revokedCount, reason },
      'All user tokens blacklisted'
    );
    
    return revokedCount;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to blacklist all user tokens');
    throw error;
  }
}

/**
 * Add token to user's active sessions
 */
export async function addActiveSession(
  userId: string,
  tokenMetadata: TokenMetadata
): Promise<void> {
  const sessionKey = `sessions:${userId}`;
  const sessionData = JSON.stringify(tokenMetadata);
  
  try {
    await redis.sadd(sessionKey, sessionData);
    
    // Set expiry based on token expiration
    const ttl = Math.max(0, Math.floor((tokenMetadata.expiresAt - Date.now()) / 1000));
    if (ttl > 0) {
      await redis.expire(sessionKey, ttl);
    }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add active session');
  }
}

/**
 * Remove token from active sessions
 */
export async function removeActiveSession(
  userId: string,
  jti: string
): Promise<void> {
  const sessionKey = `sessions:${userId}`;
  
  try {
    // Get all sessions and find the one with matching JTI
    const sessions = await redis.smembers(sessionKey);
    
    for (const session of sessions) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.jti === jti) {
          await redis.srem(sessionKey, session);
          break;
        }
      } catch (e) {
        // Invalid session data, remove it
        await redis.srem(sessionKey, session);
      }
    }
  } catch (error) {
    logger.error({ error, userId, jti }, 'Failed to remove active session');
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<TokenMetadata[]> {
  const sessionKey = `sessions:${userId}`;
  
  try {
    const sessions = await redis.smembers(sessionKey);
    const validSessions: TokenMetadata[] = [];
    
    for (const session of sessions) {
      try {
        const parsed = JSON.parse(session);
        // Filter out expired sessions
        if (parsed.expiresAt > Date.now()) {
          validSessions.push(parsed);
        } else {
          // Remove expired session
          await redis.srem(sessionKey, session);
        }
      } catch (e) {
        // Remove invalid session data
        await redis.srem(sessionKey, session);
      }
    }
    
    return validSessions;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user sessions');
    return [];
  }
}

/**
 * Cleanup expired blacklist entries (should be called periodically)
 */
export async function cleanupExpiredEntries(): Promise<{
  scanned: number;
  removed: number;
}> {
  let scanned = 0;
  let removed = 0;
  
  try {
    const stream = redis.scanStream({
      match: 'jwt:blacklist:*',
      count: 100,
    });
    
    for await (const keys of stream) {
      scanned += keys.length;
      
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl <= 0) {
          await redis.del(key);
          removed++;
        }
      }
    }
    
    logger.info({ scanned, removed }, 'Blacklist cleanup completed');
  } catch (error) {
    logger.error({ error }, 'Blacklist cleanup failed');
  }
  
  return { scanned, removed };
}

/**
 * Get blacklist statistics
 */
export async function getBlacklistStats(): Promise<{
  totalBlacklisted: number;
  byReason: Record<string, number>;
}> {
  try {
    const stream = redis.scanStream({
      match: 'jwt:blacklist:*',
      count: 100,
    });
    
    let totalBlacklisted = 0;
    const byReason: Record<string, number> = {};
    
    for await (const keys of stream) {
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          totalBlacklisted++;
          const entry = JSON.parse(data) as BlacklistEntry;
          const reason = entry.reason || 'unknown';
          byReason[reason] = (byReason[reason] || 0) + 1;
        }
      }
    }
    
    return { totalBlacklisted, byReason };
  } catch (error) {
    logger.error({ error }, 'Failed to get blacklist stats');
    return { totalBlacklisted: 0, byReason: {} };
  }
}

/**
 * Middleware to check token blacklist
 */
export function blacklistCheckMiddleware() {
  return async (req: any, res: any, next: any) => {
    const token = req.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    try {
      // Decode token to get JTI (without verification - that's done elsewhere)
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token) as { jti?: string } | null;
      
      if (decoded?.jti) {
        const isBlacklisted = await isTokenBlacklisted(decoded.jti);
        
        if (isBlacklisted) {
          logger.warn(
            { jti: decoded.jti, path: req.path },
            'Blacklisted token used'
          );
          
          return res.status(401).json({
            error: 'Token revoked',
            message: 'This token has been revoked',
            code: 'TOKEN_REVOKED',
          });
        }
      }
      
      next();
    } catch (error) {
      logger.error({ error }, 'Error in blacklist check middleware');
      next();
    }
  };
}

export default {
  blacklistToken,
  isTokenBlacklisted,
  getBlacklistEntry,
  blacklistAllUserTokens,
  addActiveSession,
  removeActiveSession,
  getUserSessions,
  cleanupExpiredEntries,
  getBlacklistStats,
  blacklistCheckMiddleware,
};
