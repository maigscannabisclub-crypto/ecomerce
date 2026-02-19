import dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url: string;
  password?: string;
  db: number;
}

export interface RabbitMQConfig {
  url: string;
  exchange: string;
  queue: string;
}

export interface JWTConfig {
  secret: string;
  expiresIn: string;
}

export interface CacheConfig {
  ttlDashboard: number;
  ttlReport: number;
  ttlMetrics: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  serviceName: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  rabbitmq: RabbitMQConfig;
  jwt: JWTConfig;
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  logLevel: string;
  logFile: string;
  healthCheckTimeout: number;
}

const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3006', 10),
  serviceName: process.env.SERVICE_NAME || 'reporting-service',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/reporting_db?schema=public',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'ecommerce.events',
    queue: process.env.RABBITMQ_QUEUE || 'reporting-service-queue',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  cache: {
    ttlDashboard: parseInt(process.env.CACHE_TTL_DASHBOARD || '900', 10),
    ttlReport: parseInt(process.env.CACHE_TTL_REPORT || '3600', 10),
    ttlMetrics: parseInt(process.env.CACHE_TTL_METRICS || '300', 10),
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/reporting-service.log',
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
};

export const validateConfig = (): void => {
  const requiredEnvVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'RABBITMQ_URL',
    'JWT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
};

export default config;
