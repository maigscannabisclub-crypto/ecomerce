import winston from 'winston';
import { config, isDevelopment } from '../config';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata, null, 2)}`;
  }
  return msg;
});

// Create Winston logger instance
const createLogger = (): winston.Logger => {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isDevelopment()
        ? combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            devFormat
          )
        : combine(
            timestamp(),
            json()
          )
    })
  ];

  // Add file transport if filename is configured
  if (config.logger.filename) {
    transports.push(
      new winston.transports.File({
        filename: config.logger.filename,
        format: combine(timestamp(), json()),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
  }

  // Add error file transport in production
  if (isDevelopment() && config.logger.filename) {
    transports.push(
      new winston.transports.File({
        filename: `error-${config.logger.filename}`,
        level: 'error',
        format: combine(timestamp(), json()),
        maxsize: 5242880,
        maxFiles: 5
      })
    );
  }

  return winston.createLogger({
    level: config.logger.level,
    defaultMeta: {
      service: 'api-gateway',
      environment: config.env,
      version: process.env.npm_package_version || '1.0.0'
    },
    transports,
    exitOnError: false,
    handleExceptions: true,
    handleRejections: true
  });
};

// Logger instance
export const logger = createLogger();

// Request context logger
export interface RequestContext {
  correlationId: string;
  requestId: string;
  userId?: string;
  path: string;
  method: string;
  ip: string;
  userAgent?: string;
}

// Create child logger with request context
export const createRequestLogger = (context: RequestContext): winston.Logger => {
  return logger.child({
    correlationId: context.correlationId,
    requestId: context.requestId,
    userId: context.userId,
    path: context.path,
    method: context.method,
    ip: context.ip,
    userAgent: context.userAgent
  });
};

// Log levels helper
export const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Stream for Morgan integration
export const stream = {
  write: (message: string): void => {
    logger.http(message.trim());
  }
};

// Performance logging helper
export const logPerformance = (
  operation: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void => {
  logger.debug(`Performance: ${operation}`, {
    operation,
    durationMs,
    ...metadata
  });
};

// Error logging helper
export const logError = (
  error: Error,
  context?: Record<string, unknown>
): void => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, unknown>
): void => {
  logger.warn(`Security Event: ${event}`, {
    security: true,
    event,
    severity,
    ...details
  });
};

export default logger;
