import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  url: string;
}

interface RabbitMQConfig {
  url: string;
  exchange: string;
  queue: string;
  retryQueue: string;
  dlq: string;
}

interface ServiceUrls {
  inventory: string;
  cart: string;
  user: string;
  payment: string;
}

interface JWTConfig {
  secret: string;
  expiresIn: string;
}

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
}

interface OutboxConfig {
  processorIntervalMs: number;
  maxRetries: number;
}

interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  rabbitmq: RabbitMQConfig;
  services: ServiceUrls;
  jwt: JWTConfig;
  retry: RetryConfig;
  outbox: OutboxConfig;
  healthCheckTimeoutMs: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

function getEnvVarAsInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }
  return parsed;
}

export const config: AppConfig = {
  port: getEnvVarAsInt('PORT', 3004),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  
  database: {
    url: getEnvVar('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/order_db?schema=public'),
  },
  
  rabbitmq: {
    url: getEnvVar('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
    exchange: getEnvVar('RABBITMQ_EXCHANGE', 'orders.exchange'),
    queue: getEnvVar('RABBITMQ_QUEUE', 'orders.queue'),
    retryQueue: getEnvVar('RABBITMQ_RETRY_QUEUE', 'orders.retry.queue'),
    dlq: getEnvVar('RABBITMQ_DLQ', 'orders.dlq'),
  },
  
  services: {
    inventory: getEnvVar('INVENTORY_SERVICE_URL', 'http://localhost:3002'),
    cart: getEnvVar('CART_SERVICE_URL', 'http://localhost:3003'),
    user: getEnvVar('USER_SERVICE_URL', 'http://localhost:3001'),
    payment: getEnvVar('PAYMENT_SERVICE_URL', 'http://localhost:3005'),
  },
  
  jwt: {
    secret: getEnvVar('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production'),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),
  },
  
  retry: {
    maxRetries: getEnvVarAsInt('MAX_RETRIES', 3),
    delayMs: getEnvVarAsInt('RETRY_DELAY_MS', 1000),
  },
  
  outbox: {
    processorIntervalMs: getEnvVarAsInt('OUTBOX_PROCESSOR_INTERVAL_MS', 5000),
    maxRetries: getEnvVarAsInt('OUTBOX_MAX_RETRIES', 3),
  },
  
  healthCheckTimeoutMs: getEnvVarAsInt('HEALTH_CHECK_TIMEOUT_MS', 5000),
};

export default config;
