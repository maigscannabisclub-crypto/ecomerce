import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import config from '../config';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for console output in development
const devFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logs directory if it doesn't exist
const logsDir = path.dirname(config.logFile);

// Transports array
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      devFormat
    ),
  }),
];

// Add file transports in production
if (config.nodeEnv === 'production') {
  // Daily rotating file for all logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(timestamp(), json()),
    })
  );

  // Separate file for error logs
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
}

// Create the logger
const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: { service: config.serviceName },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan integration
export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
export const logInfo = (message: string, meta?: Record<string, unknown>): void => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error | unknown, meta?: Record<string, unknown>): void => {
  const errorMeta: Record<string, unknown> = { ...meta };
  
  if (error instanceof Error) {
    errorMeta.errorName = error.name;
    errorMeta.errorMessage = error.message;
    errorMeta.stack = error.stack;
  } else if (error) {
    errorMeta.error = error;
  }
  
  logger.error(message, errorMeta);
};

export const logWarn = (message: string, meta?: Record<string, unknown>): void => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: Record<string, unknown>): void => {
  logger.debug(message, meta);
};

// Request context logger
export const createRequestLogger = (requestId: string, userId?: string) => {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, { requestId, userId, ...meta });
    },
    error: (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => {
      const errorMeta: Record<string, unknown> = { requestId, userId, ...meta };
      
      if (error instanceof Error) {
        errorMeta.errorName = error.name;
        errorMeta.errorMessage = error.message;
        errorMeta.stack = error.stack;
      } else if (error) {
        errorMeta.error = error;
      }
      
      logger.error(message, errorMeta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, { requestId, userId, ...meta });
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, { requestId, userId, ...meta });
    },
  };
};

export default logger;
