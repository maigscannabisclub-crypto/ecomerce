import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// JWT configuration from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production';
const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m';
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';

// Token payload interface
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  jti?: string;
}

// Decoded token interface
export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

// Token pair interface
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Generate an access token
 * @param payload - Token payload
 * @returns JWT access token
 */
export const generateAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'access',
  };

  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRATION,
  });
};

/**
 * Generate a refresh token
 * @param payload - Token payload
 * @returns JWT refresh token
 */
export const generateRefreshToken = (payload: Omit<TokenPayload, 'type'>): string => {
  const jti = uuidv4();
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'refresh',
    jti,
  };

  return jwt.sign(tokenPayload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRATION,
  });
};

/**
 * Generate both access and refresh tokens
 * @param userId - User ID
 * @param email - User email
 * @param role - User role
 * @returns Token pair with expiration dates
 */
export const generateTokenPair = (
  userId: string,
  email: string,
  role: string
): TokenPair => {
  const payload = { userId, email, role };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Calculate expiration dates
  const accessTokenExpiresAt = new Date();
  accessTokenExpiresAt.setMinutes(
    accessTokenExpiresAt.getMinutes() + parseExpirationToMinutes(JWT_ACCESS_EXPIRATION)
  );

  const refreshTokenExpiresAt = new Date();
  refreshTokenExpiresAt.setDate(
    refreshTokenExpiresAt.getDate() + parseExpirationToDays(JWT_REFRESH_EXPIRATION)
  );

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
};

/**
 * Verify an access token
 * @param token - JWT token
 * @returns Decoded token payload
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

/**
 * Verify a refresh token
 * @param token - JWT refresh token
 * @returns Decoded token payload
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as DecodedToken;

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
};

/**
 * Decode a token without verification
 * @param token - JWT token
 * @returns Decoded token payload or null
 */
export const decodeToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.decode(token) as DecodedToken;
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Get token expiration date
 * @param token - JWT token
 * @returns Expiration date or null
 */
export const getTokenExpiration = (token: string): Date | null => {
  const decoded = decodeToken(token);
  if (decoded && decoded.exp) {
    return new Date(decoded.exp * 1000);
  }
  return null;
};

/**
 * Check if a token is expired
 * @param token - JWT token
 * @returns Boolean indicating if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }
  return new Date() > expiration;
};

/**
 * Parse JWT expiration string to minutes
 * @param expiration - Expiration string (e.g., '15m', '1h', '7d')
 * @returns Minutes
 */
const parseExpirationToMinutes = (expiration: string): number => {
  const match = expiration.match(/^(\d+)([mhd])$/);
  if (!match) {
    return 15; // Default to 15 minutes
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value;
    case 'h':
      return value * 60;
    case 'd':
      return value * 24 * 60;
    default:
      return 15;
  }
};

/**
 * Parse JWT expiration string to days
 * @param expiration - Expiration string (e.g., '15m', '1h', '7d')
 * @returns Days
 */
const parseExpirationToDays = (expiration: string): number => {
  const match = expiration.match(/^(\d+)([mhd])$/);
  if (!match) {
    return 7; // Default to 7 days
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value / (24 * 60);
    case 'h':
      return value / 24;
    case 'd':
      return value;
    default:
      return 7;
  }
};

/**
 * Extract JWT ID from token
 * @param token - JWT token
 * @returns JWT ID or null
 */
export const getJtiFromToken = (token: string): string | null => {
  const decoded = decodeToken(token);
  return decoded?.jti || null;
};
