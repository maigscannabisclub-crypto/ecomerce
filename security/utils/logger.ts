/**
 * Security Logger Utility
 * Structured logging for security events
 */

import pino from 'pino';

// Logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  name: 'security',
  
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'apiKey',
      'privateKey',
      'creditCard',
      'cvv',
      'ssn',
      '*.password',
      '*.token',
      '*.secret',
      'headers.authorization',
      'headers.cookie',
    ],
    remove: true,
  },
  
  // Pretty print in development
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  
  // Base properties for all logs
  base: {
    service: 'security',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
};

// Create logger instance
export const logger = pino(loggerConfig);

// Security event logger
export const securityLogger = logger.child({ component: 'security' });

// Audit logger
export const auditLogger = logger.child({ component: 'audit' });

// Access logger
export const accessLogger = logger.child({ component: 'access' });

// Error logger
export const errorLogger = logger.child({ component: 'error' });

// Performance logger
export const perfLogger = logger.child({ component: 'performance' });

// Log security event
export function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  securityLogger[level](
    {
      event,
      ...details,
    },
    `Security event: ${event}`
  );
}

// Log access attempt
export function logAccess(
  req: any,
  res: any,
  duration?: number
): void {
  accessLogger.info(
    {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
      duration,
      requestId: req.headers['x-request-id'],
      correlationId: req.headers['x-correlation-id'],
    },
    `${req.method} ${req.path} ${res.statusCode}`
  );
}

// Log error with context
export function logError(
  error: Error,
  context: Record<string, any> = {}
): void {
  errorLogger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    },
    error.message
  );
}

// Log performance metric
export function logPerformance(
  operation: string,
  duration: number,
  details: Record<string, any> = {}
): void {
  perfLogger.debug(
    {
      operation,
      duration,
      ...details,
    },
    `Performance: ${operation} took ${duration}ms`
  );
}

export default logger;
