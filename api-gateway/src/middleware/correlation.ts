import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';

// Headers configuration
const CORRELATION_ID_HEADER = config.correlationId.header.toLowerCase();
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generate a unique correlation ID
 */
export const generateCorrelationId = (): string => {
  return uuidv4();
};

/**
 * Generate a unique request ID (shorter format)
 */
export const generateRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Middleware to handle correlation ID propagation
 * - Extracts existing correlation ID from request headers or generates new one
 * - Sets correlation ID in response headers for client tracking
 * - Attaches correlation ID to request object for downstream use
 */
export const correlationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;

  // Extract or generate correlation ID
  const correlationId = (
    req.headers[CORRELATION_ID_HEADER] as string ||
    req.headers[CORRELATION_ID_HEADER.replace('x-', '')] as string ||
    generateCorrelationId()
  );

  // Generate unique request ID
  const requestId = (
    req.headers[REQUEST_ID_HEADER] as string ||
    generateRequestId()
  );

  // Attach to request object
  authReq.correlationId = correlationId;
  authReq.requestId = requestId;
  authReq.startTime = Date.now();

  // Set response headers for client tracking
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  res.setHeader(REQUEST_ID_HEADER, requestId);

  // Also set in a format that might be expected by some clients
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);

  next();
};

/**
 * Get correlation ID from request
 */
export const getCorrelationId = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  return authReq.correlationId;
};

/**
 * Get request ID from request
 */
export const getRequestId = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  return authReq.requestId;
};

/**
 * Get request duration in milliseconds
 */
export const getRequestDuration = (req: Request): number => {
  const authReq = req as AuthenticatedRequest;
  return Date.now() - authReq.startTime;
};

/**
 * Create headers for proxy requests with correlation ID
 */
export const createProxyHeaders = (req: Request): Record<string, string> => {
  const authReq = req as AuthenticatedRequest;
  
  const headers: Record<string, string> = {
    [CORRELATION_ID_HEADER]: authReq.correlationId,
    [REQUEST_ID_HEADER]: authReq.requestId,
    'X-Forwarded-For': req.ip || 'unknown',
    'X-Forwarded-Proto': req.protocol,
    'X-Forwarded-Host': req.get('host') || 'unknown'
  };

  // Forward user info if authenticated
  if (authReq.user) {
    headers['X-User-Id'] = authReq.user.id;
    headers['X-User-Role'] = authReq.user.role;
    headers['X-User-Email'] = authReq.user.email;
  }

  // Forward original authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return headers;
};

/**
 * Middleware to add correlation ID to error responses
 */
export const addCorrelationToError = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  
  // Attach correlation ID to error object for logging
  (err as Error & { correlationId?: string }).correlationId = authReq.correlationId;
  
  next(err);
};

/**
 * Decorator/higher-order function to wrap async handlers with correlation
 */
export const withCorrelation = <T extends Request>(
  handler: (req: T & AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return async (req: T, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req as T & AuthenticatedRequest, res, next);
    } catch (error) {
      next(error);
    }
  };
};

export default correlationMiddleware;
