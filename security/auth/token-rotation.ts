/**
 * JWT Token Rotation Service
 * Implements secure token rotation with refresh token rotation (RTR)
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { blacklistToken, addActiveSession, removeActiveSession } from './jwt-blacklist';

// Redis client for token family tracking
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 3, // Use separate DB for token rotation
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Token configuration
interface TokenConfig {
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
  algorithm: jwt.Algorithm;
}

const defaultConfig: TokenConfig = {
  accessTokenExpiry: '15m', // Short-lived access tokens
  refreshTokenExpiry: '7d', // Longer-lived refresh tokens
  issuer: process.env.JWT_ISSUER || 'ecommerce-platform',
  audience: process.env.JWT_AUDIENCE || 'ecommerce-api',
  algorithm: 'RS256', // Asymmetric algorithm
};

// Token pair interface
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

// Token payload interface
interface TokenPayload {
  sub: string; // User ID
  jti: string; // Token ID
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  roles?: string[];
  permissions?: string[];
  family?: string; // Token family for rotation
  sequence?: number; // Sequence number within family
}

// Token family interface
interface TokenFamily {
  familyId: string;
  userId: string;
  createdAt: number;
  lastSequence: number;
  compromised: boolean;
}

/**
 * Generate RSA key pair for JWT signing
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { generateKeyPairSync } = require('crypto');
  
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  
  return { publicKey, privateKey };
}

/**
 * Create a new token family
 */
async function createTokenFamily(userId: string): Promise<TokenFamily> {
  const family: TokenFamily = {
    familyId: uuidv4(),
    userId,
    createdAt: Date.now(),
    lastSequence: 0,
    compromised: false,
  };
  
  const key = `token-family:${family.familyId}`;
  await redis.setex(
    key,
    7 * 24 * 60 * 60, // 7 days
    JSON.stringify(family)
  );
  
  return family;
}

/**
 * Get token family by ID
 */
async function getTokenFamily(familyId: string): Promise<TokenFamily | null> {
  const key = `token-family:${familyId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  return JSON.parse(data) as TokenFamily;
}

/**
 * Mark token family as compromised (detected reuse)
 */
async function compromiseTokenFamily(familyId: string): Promise<void> {
  const family = await getTokenFamily(familyId);
  
  if (!family) {
    return;
  }
  
  family.compromised = true;
  
  const key = `token-family:${familyId}`;
  await redis.setex(
    key,
    7 * 24 * 60 * 60,
    JSON.stringify(family)
  );
  
  // Blacklist all tokens in this family
  const familyTokensKey = `family-tokens:${familyId}`;
  const tokens = await redis.smembers(familyTokensKey);
  
  for (const tokenJti of tokens) {
    const tokenData = await redis.get(`jwt:metadata:${tokenJti}`);
    if (tokenData) {
      const metadata = JSON.parse(tokenData);
      await blacklistToken(
        {
          jti: tokenJti,
          userId: family.userId,
          issuedAt: metadata.iat * 1000,
          expiresAt: metadata.exp * 1000,
          tokenType: metadata.type,
        },
        'token_family_compromised'
      );
    }
  }
  
  logger.warn(
    { familyId, userId: family.userId },
    'Token family marked as compromised - possible token reuse attack'
  );
}

/**
 * Store token metadata
 */
async function storeTokenMetadata(
  jti: string,
  payload: TokenPayload,
  familyId: string
): Promise<void> {
  const metadataKey = `jwt:metadata:${jti}`;
  const familyTokensKey = `family-tokens:${familyId}`;
  
  const ttl = payload.exp - Math.floor(Date.now() / 1000);
  
  await redis.setex(metadataKey, ttl, JSON.stringify(payload));
  await redis.sadd(familyTokensKey, jti);
  await redis.expire(familyTokensKey, 7 * 24 * 60 * 60);
}

/**
 * Generate token pair (access + refresh)
 */
export async function generateTokenPair(
  userId: string,
  roles: string[] = [],
  permissions: string[] = [],
  existingFamilyId?: string,
  config: Partial<TokenConfig> = {}
): Promise<TokenPair & { familyId: string }> {
  const tokenConfig = { ...defaultConfig, ...config };
  
  // Get or create token family
  let family: TokenFamily;
  if (existingFamilyId) {
    const existing = await getTokenFamily(existingFamilyId);
    if (existing && !existing.compromised) {
      family = existing;
      family.lastSequence++;
    } else {
      // Family doesn't exist or is compromised, create new one
      family = await createTokenFamily(userId);
    }
  } else {
    family = await createTokenFamily(userId);
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  // Generate access token
  const accessTokenJti = uuidv4();
  const accessTokenPayload: TokenPayload = {
    sub: userId,
    jti: accessTokenJti,
    type: 'access',
    iat: now,
    exp: now + 15 * 60, // 15 minutes
    iss: tokenConfig.issuer,
    aud: tokenConfig.audience,
    roles,
    permissions,
    family: family.familyId,
    sequence: family.lastSequence,
  };
  
  // Generate refresh token
  const refreshTokenJti = uuidv4();
  const refreshTokenPayload: TokenPayload = {
    sub: userId,
    jti: refreshTokenJti,
    type: 'refresh',
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
    iss: tokenConfig.issuer,
    aud: tokenConfig.audience,
    family: family.familyId,
    sequence: family.lastSequence,
  };
  
  // Get private key from environment or key management
  const privateKey = process.env.JWT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('JWT_PRIVATE_KEY not configured');
  }
  
  // Sign tokens
  const accessToken = jwt.sign(accessTokenPayload, privateKey, {
    algorithm: tokenConfig.algorithm,
  });
  
  const refreshToken = jwt.sign(refreshTokenPayload, privateKey, {
    algorithm: tokenConfig.algorithm,
  });
  
  // Store metadata
  await storeTokenMetadata(accessTokenJti, accessTokenPayload, family.familyId);
  await storeTokenMetadata(refreshTokenJti, refreshTokenPayload, family.familyId);
  
  // Update family
  const familyKey = `token-family:${family.familyId}`;
  await redis.setex(
    familyKey,
    7 * 24 * 60 * 60,
    JSON.stringify(family)
  );
  
  // Add to active sessions
  await addActiveSession(userId, {
    jti: accessTokenJti,
    userId,
    issuedAt: now * 1000,
    expiresAt: accessTokenPayload.exp * 1000,
    tokenType: 'access',
  });
  
  logger.info(
    {
      userId,
      familyId: family.familyId,
      sequence: family.lastSequence,
      accessJti: accessTokenJti,
      refreshJti: refreshTokenJti,
    },
    'Token pair generated'
  );
  
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessTokenPayload.exp * 1000,
    refreshTokenExpiresAt: refreshTokenPayload.exp * 1000,
    familyId: family.familyId,
  };
}

/**
 * Rotate refresh token (Refresh Token Rotation)
 */
export async function rotateRefreshToken(
  refreshToken: string,
  config: Partial<TokenConfig> = {}
): Promise<TokenPair & { familyId: string }> {
  const tokenConfig = { ...defaultConfig, ...config };
  
  // Get public key for verification
  const publicKey = process.env.JWT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('JWT_PUBLIC_KEY not configured');
  }
  
  // Verify the refresh token
  let payload: TokenPayload;
  try {
    payload = jwt.verify(refreshToken, publicKey, {
      algorithms: [tokenConfig.algorithm],
      issuer: tokenConfig.issuer,
      audience: tokenConfig.audience,
    }) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
  
  // Check token type
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  
  // Check if token is blacklisted
  const { isTokenBlacklisted } = await import('./jwt-blacklist');
  const isBlacklisted = await isTokenBlacklisted(payload.jti);
  if (isBlacklisted) {
    throw new Error('Token has been revoked');
  }
  
  // Get token family
  const family = await getTokenFamily(payload.family!);
  
  if (!family) {
    // Family doesn't exist, possible cleanup or attack
    throw new Error('Invalid token family');
  }
  
  if (family.compromised) {
    throw new Error('Token family compromised');
  }
  
  // Check sequence number for token reuse detection
  if (payload.sequence! < family.lastSequence) {
    // Token reuse detected! This is a security incident
    await compromiseTokenFamily(payload.family!);
    throw new Error('Token reuse detected - possible theft');
  }
  
  // Blacklist the used refresh token
  await blacklistToken(
    {
      jti: payload.jti,
      userId: payload.sub,
      issuedAt: payload.iat * 1000,
      expiresAt: payload.exp * 1000,
      tokenType: 'refresh',
    },
    'token_rotation'
  );
  
  // Remove from active sessions
  await removeActiveSession(payload.sub, payload.jti);
  
  // Generate new token pair with same family
  return generateTokenPair(
    payload.sub,
    payload.roles,
    payload.permissions,
    payload.family,
    config
  );
}

/**
 * Verify access token
 */
export function verifyAccessToken(
  token: string,
  config: Partial<TokenConfig> = {}
): TokenPayload {
  const tokenConfig = { ...defaultConfig, ...config };
  
  const publicKey = process.env.JWT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('JWT_PUBLIC_KEY not configured');
  }
  
  const payload = jwt.verify(token, publicKey, {
    algorithms: [tokenConfig.algorithm],
    issuer: tokenConfig.issuer,
    audience: tokenConfig.audience,
  }) as TokenPayload;
  
  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }
  
  return payload;
}

/**
 * Decode token without verification (for inspection)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload | null;
  } catch {
    return null;
  }
}

/**
 * Revoke entire token family
 */
export async function revokeTokenFamily(
  familyId: string,
  reason: string = 'user_logout'
): Promise<void> {
  const family = await getTokenFamily(familyId);
  
  if (!family) {
    return;
  }
  
  // Get all tokens in family
  const familyTokensKey = `family-tokens:${familyId}`;
  const tokens = await redis.smembers(familyTokensKey);
  
  for (const tokenJti of tokens) {
    const tokenData = await redis.get(`jwt:metadata:${tokenJti}`);
    if (tokenData) {
      const metadata = JSON.parse(tokenData);
      await blacklistToken(
        {
          jti: tokenJti,
          userId: family.userId,
          issuedAt: metadata.iat * 1000,
          expiresAt: metadata.exp * 1000,
          tokenType: metadata.type,
        },
        reason
      );
    }
  }
  
  // Mark family as compromised
  family.compromised = true;
  const familyKey = `token-family:${familyId}`;
  await redis.setex(
    familyKey,
    7 * 24 * 60 * 60,
    JSON.stringify(family)
  );
  
  logger.info(
    { familyId, userId: family.userId, reason },
    'Token family revoked'
  );
}

/**
 * Get token statistics
 */
export async function getTokenStats(): Promise<{
  activeFamilies: number;
  totalTokens: number;
}> {
  let activeFamilies = 0;
  let totalTokens = 0;
  
  const familyStream = redis.scanStream({
    match: 'token-family:*',
    count: 100,
  });
  
  for await (const keys of familyStream) {
    activeFamilies += keys.length;
  }
  
  const tokenStream = redis.scanStream({
    match: 'jwt:metadata:*',
    count: 100,
  });
  
  for await (const keys of tokenStream) {
    totalTokens += keys.length;
  }
  
  return { activeFamilies, totalTokens };
}

export default {
  generateTokenPair,
  rotateRefreshToken,
  verifyAccessToken,
  decodeToken,
  revokeTokenFamily,
  generateKeyPair,
  getTokenStats,
};
