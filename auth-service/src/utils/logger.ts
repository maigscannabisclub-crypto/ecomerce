import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Get log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';
const serviceName = process.env.SERVICE_NAME || 'auth-service';

// Custom format for console output in development
const consoleFormat = printf(({ level, message, timestamp, service, correlationId, ...metadata }) => {
  let msg = `${timestamp} [${service}] [${correlationId || 'no-correlation-id'}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Transports array
const transports: winston.transport[] = [];

// Console transport for all environments
transports.push(
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    ),
  })
);

// File transports for production
if (nodeEnv === 'production') {
  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(timestamp(), json()),
    })
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: combine(timestamp(), json()),
    })
  );

  // Audit logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      format: combine(timestamp(), json()),
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    service: serviceName,
  },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  transports,
  exitOnError: false,
});

// Create a child logger with correlation ID
export const createChildLogger = (correlationId: string): winston.Logger => {
  return logger.child({ correlationId });
};

// Audit logging helper
export const auditLog = (
  action: string,
  userId: string | undefined,
  details: Record<string, unknown>,
  correlationId?: string
): void => {
  logger.info('AUDIT_LOG', {
    type: 'audit',
    action,
    userId,
    details,
    correlationId,
    timestamp: new Date().toISOString(),
  });
};

// Performance logging helper
export const perfLog = (
  operation: string,
  durationMs: number,
  correlationId?: string,
  metadata?: Record<string, unknown>
): void => {
  logger.debug('PERFORMANCE_LOG', {
    type: 'performance',
    operation,
    durationMs,
    correlationId,
    ...metadata,
  });
};

export default logger;
