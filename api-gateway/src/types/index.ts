import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// User roles enum
export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SUPPORT = 'SUPPORT'
}

// Authenticated user interface
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  permissions?: string[];
}

// Extended request with user and correlation ID
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  correlationId: string;
  requestId: string;
  startTime: number;
}

// JWT token payload
export interface TokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  permissions?: string[];
}

// API Error response
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  correlationId: string;
  timestamp: string;
}

// API Success response
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  correlationId: string;
  timestamp: string;
}

// Service health status
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  url: string;
  responseTime?: number;
  lastChecked: string;
  error?: string;
}

// Gateway health response
export interface GatewayHealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  services: ServiceHealth[];
}

// Log metadata
export interface LogMetadata {
  correlationId: string;
  requestId: string;
  userId?: string;
  path: string;
  method: string;
  userAgent?: string;
  ip: string;
  duration?: number;
  statusCode?: number;
  [key: string]: unknown;
}

// Proxy route configuration
export interface ProxyRouteConfig {
  path: string;
  target: string;
  changeOrigin: boolean;
  pathRewrite?: Record<string, string>;
  timeout: number;
  secure: boolean;
  requireAuth: boolean;
  allowedRoles?: UserRole[];
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

// Rate limit info
export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

// Custom error class
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ApiErrorResponse['error'] {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

// Common error codes
export const ErrorCodes = {
  // Authentication errors (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  BAD_GATEWAY: 'BAD_GATEWAY'
} as const;

// HTTP status codes
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const;
