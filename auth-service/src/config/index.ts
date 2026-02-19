import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';
export const IS_TEST = NODE_ENV === 'test';

// Server Configuration
export const PORT = parseInt(process.env.PORT || '3001', 10);
export const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';

// Database Configuration
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/auth_db?schema=public';

// JWT Configuration
export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
};

// Bcrypt Configuration
export const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

// Logging Configuration
export const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'combined',
};

// CORS Configuration
export const CORS_CONFIG = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: process.env.CORS_CREDENTIALS === 'true',
};

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
};

// Health Check Configuration
export const HEALTH_CHECK_ENABLED = process.env.HEALTH_CHECK_ENABLED !== 'false';

// API Configuration
export const API_CONFIG = {
  prefix: '/api/v1',
  version: '1.0.0',
};

// Security Configuration
export const SECURITY_CONFIG = {
  // Maximum failed login attempts before temporary lockout
  maxLoginAttempts: 5,
  // Lockout duration in minutes
  lockoutDurationMinutes: 30,
  // Token cleanup interval in hours
  tokenCleanupIntervalHours: 24,
};

// Validate required environment variables
export const validateConfig = (): void => {
  const requiredVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];

  if (IS_PRODUCTION) {
    requiredVars.push('DATABASE_URL');
  }

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  // Validate JWT secrets in production
  if (IS_PRODUCTION) {
    if (JWT_CONFIG.secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long in production');
    }
    if (JWT_CONFIG.refreshSecret.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long in production');
    }
  }
};

// Export all configuration as a single object
export const config = {
  env: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isDevelopment: IS_DEVELOPMENT,
  isTest: IS_TEST,
  port: PORT,
  serviceName: SERVICE_NAME,
  databaseUrl: DATABASE_URL,
  jwt: JWT_CONFIG,
  bcryptSaltRounds: BCRYPT_SALT_ROUNDS,
  log: LOG_CONFIG,
  cors: CORS_CONFIG,
  rateLimit: RATE_LIMIT_CONFIG,
  healthCheckEnabled: HEALTH_CHECK_ENABLED,
  api: API_CONFIG,
  security: SECURITY_CONFIG,
};

export default config;
