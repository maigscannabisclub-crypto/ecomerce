import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // Server
  nodeEnv: string;
  port: number;
  serviceName: string;

  // Database
  databaseUrl: string;

  // Redis
  redisUrl: string;
  redisTtlCart: number;

  // JWT
  jwtSecret: string;
  jwtExpiresIn: string;

  // Inventory Service
  inventoryServiceUrl: string;
  inventoryServiceTimeout: number;

  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  };

  // Cart Settings
  cartExpirationDays: number;
  cartMaxItems: number;
  cartMaxQuantityPerItem: number;

  // Logging
  logLevel: string;
  logFormat: string;

  // Health Check
  healthCheckInterval: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export const config: Config = {
  // Server
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3003),
  serviceName: getEnvVar('SERVICE_NAME', 'cart-service'),

  // Database
  databaseUrl: getEnvVar('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/cart_db?schema=public'),

  // Redis
  redisUrl: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
  redisTtlCart: getEnvNumber('REDIS_TTL_CART', 604800), // 7 days in seconds

  // JWT
  jwtSecret: getEnvVar('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production'),
  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),

  // Inventory Service
  inventoryServiceUrl: getEnvVar('INVENTORY_SERVICE_URL', 'http://localhost:3002'),
  inventoryServiceTimeout: getEnvNumber('INVENTORY_SERVICE_TIMEOUT', 5000),

  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: getEnvNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
    timeout: getEnvNumber('CIRCUIT_BREAKER_TIMEOUT', 30000),
    resetTimeout: getEnvNumber('CIRCUIT_BREAKER_RESET_TIMEOUT', 60000),
  },

  // Cart Settings
  cartExpirationDays: getEnvNumber('CART_EXPIRATION_DAYS', 7),
  cartMaxItems: getEnvNumber('CART_MAX_ITEMS', 50),
  cartMaxQuantityPerItem: getEnvNumber('CART_MAX_QUANTITY_PER_ITEM', 99),

  // Logging
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  logFormat: getEnvVar('LOG_FORMAT', 'json'),

  // Health Check
  healthCheckInterval: getEnvNumber('HEALTH_CHECK_INTERVAL', 30000),
};

export default config;
