import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Service URLs configuration
interface ServiceConfig {
  url: string;
  timeout: number;
}

interface ServicesConfig {
  auth: ServiceConfig;
  products: ServiceConfig;
  cart: ServiceConfig;
  orders: ServiceConfig;
  inventory: ServiceConfig;
  reporting: ServiceConfig;
}

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
}

// JWT configuration
interface JWTConfig {
  secret: string;
  issuer: string;
  audience: string;
  algorithms: string[];
}

// Logger configuration
interface LoggerConfig {
  level: string;
  format: string;
  filename?: string;
}

// Main configuration interface
interface Config {
  env: string;
  port: number;
  host: string;
  services: ServicesConfig;
  jwt: JWTConfig;
  rateLimit: {
    global: RateLimitConfig;
    auth: RateLimitConfig;
    api: RateLimitConfig;
  };
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  helmet: {
    contentSecurityPolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
  };
  logger: LoggerConfig;
  correlationId: {
    header: string;
  };
}

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'SERVICE_AUTH_URL',
  'SERVICE_PRODUCTS_URL',
  'SERVICE_CART_URL',
  'SERVICE_ORDERS_URL',
  'SERVICE_INVENTORY_URL',
  'SERVICE_REPORTING_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
}

// Parse CORS origins
const parseCorsOrigins = (): string | string[] | boolean => {
  const origins = process.env.CORS_ORIGINS;
  if (!origins || origins === '*') return true;
  return origins.split(',').map(origin => origin.trim());
};

// Configuration object
export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  services: {
    auth: {
      url: process.env.SERVICE_AUTH_URL!,
      timeout: parseInt(process.env.SERVICE_AUTH_TIMEOUT || '30000', 10)
    },
    products: {
      url: process.env.SERVICE_PRODUCTS_URL!,
      timeout: parseInt(process.env.SERVICE_PRODUCTS_TIMEOUT || '30000', 10)
    },
    cart: {
      url: process.env.SERVICE_CART_URL!,
      timeout: parseInt(process.env.SERVICE_CART_TIMEOUT || '30000', 10)
    },
    orders: {
      url: process.env.SERVICE_ORDERS_URL!,
      timeout: parseInt(process.env.SERVICE_ORDERS_TIMEOUT || '30000', 10)
    },
    inventory: {
      url: process.env.SERVICE_INVENTORY_URL!,
      timeout: parseInt(process.env.SERVICE_INVENTORY_TIMEOUT || '30000', 10)
    },
    reporting: {
      url: process.env.SERVICE_REPORTING_URL!,
      timeout: parseInt(process.env.SERVICE_REPORTING_TIMEOUT || '30000', 10)
    }
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    issuer: process.env.JWT_ISSUER || 'ecommerce-api-gateway',
    audience: process.env.JWT_AUDIENCE || 'ecommerce-services',
    algorithms: (process.env.JWT_ALGORITHMS || 'HS256').split(',')
  },

  rateLimit: {
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
      skipSuccessfulRequests: false
    },
    auth: {
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10),
      maxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '10', 10),
      skipSuccessfulRequests: false
    },
    api: {
      windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '100', 10),
      skipSuccessfulRequests: false
    }
  },

  cors: {
    origin: parseCorsOrigins(),
    credentials: process.env.CORS_CREDENTIALS === 'true',
    methods: (process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD').split(','),
    allowedHeaders: (process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Correlation-ID,X-Request-ID').split(',')
  },

  helmet: {
    contentSecurityPolicy: process.env.HELMET_CSP === 'true',
    crossOriginEmbedderPolicy: process.env.HELMET_COEP === 'true'
  },

  logger: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    filename: process.env.LOG_FILE
  },

  correlationId: {
    header: process.env.CORRELATION_ID_HEADER || 'x-correlation-id'
  }
};

// Helper functions
export const isDevelopment = (): boolean => config.env === 'development';
export const isProduction = (): boolean => config.env === 'production';
export const isTest = (): boolean => config.env === 'test';

export default config;
