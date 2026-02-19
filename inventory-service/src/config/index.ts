import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Config {
  server: {
    env: string;
    port: number;
    host: string;
  };
  database: {
    url: string;
  };
  rabbitmq: {
    url: string;
    exchange: string;
    queue: string;
    retryAttempts: number;
    retryDelay: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  logging: {
    level: string;
    filePath: string;
    enableRequestLogging: boolean;
  };
  stock: {
    lowStockAlertThreshold: number;
    reorderPointDefault: number;
    minStockDefault: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  healthCheck: {
    timeout: number;
  };
}

const config: Config = {
  server: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3005', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/inventory_db?schema=public',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'inventory.events',
    queue: process.env.RABBITMQ_QUEUE || 'inventory-service-queue',
    retryAttempts: parseInt(process.env.RABBITMQ_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.RABBITMQ_RETRY_DELAY || '5000', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
  },
  stock: {
    lowStockAlertThreshold: parseInt(process.env.LOW_STOCK_ALERT_THRESHOLD || '10', 10),
    reorderPointDefault: parseInt(process.env.REORDER_POINT_DEFAULT || '20', 10),
    minStockDefault: parseInt(process.env.MIN_STOCK_DEFAULT || '10', 10),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  healthCheck: {
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
  },
};

// Validation function
export function validateConfig(): void {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'RABBITMQ_URL',
  ];

  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables:', missing.join(', '));
    console.warn('Using default values for development...');
  }
}

export default config;
