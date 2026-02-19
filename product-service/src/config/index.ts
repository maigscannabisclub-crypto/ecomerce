import dotenv from 'dotenv';

dotenv.config();

interface Config {
  server: {
    env: string;
    port: number;
    serviceName: string;
  };
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
    db: number;
    cacheTtl: number;
    enabled: boolean;
  };
  rabbitmq: {
    url: string;
    host: string;
    port: number;
    user: string;
    password: string;
    exchange: string;
    queue: string;
    enabled: boolean;
  };
  jwt: {
    secret: string;
    issuer: string;
  };
  logging: {
    level: string;
    format: string;
  };
  security: {
    rateLimit: number;
    rateWindow: number;
  };
}

const config: Config = {
  server: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3002', 10),
    serviceName: process.env.SERVICE_NAME || 'product-service'
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/product_db?schema=public',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'product_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '300', 10),
    enabled: process.env.ENABLE_CACHE !== 'false'
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    exchange: process.env.RABBITMQ_EXCHANGE || 'product.events',
    queue: process.env.RABBITMQ_QUEUE || 'product_queue',
    enabled: process.env.ENABLE_EVENTS !== 'false'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    issuer: process.env.JWT_ISSUER || 'ecommerce-platform'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'combined'
  },
  security: {
    rateLimit: parseInt(process.env.API_RATE_LIMIT || '100', 10),
    rateWindow: parseInt(process.env.API_RATE_WINDOW || '900000', 10)
  }
};

export default config;
