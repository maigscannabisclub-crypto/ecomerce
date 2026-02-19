import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import config from '../config';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for console output in development
const devFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logs directory if it doesn't exist
const logsDir = path.resolve(config.logging.filePath);

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Define colors for each level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray',
};

winston.addColors(logColors);

// Create file transports
const fileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'inventory-service-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(
    timestamp(),
    json()
  ),
});

const errorFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'inventory-service-error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: combine(
    timestamp(),
    json()
  ),
});

// Console transport
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    devFormat
  ),
});

// Create the logger
const transports: winston.transport[] = [fileTransport, errorFileTransport];

if (config.server.env === 'development') {
  transports.push(consoleTransport);
}

const logger = winston.createLogger({
  level: config.logging.level,
  levels: logLevels,
  defaultMeta: {
    service: 'inventory-service',
    environment: config.server.env,
  },
  format: combine(
    timestamp(),
    errors({ stack: true })
  ),
  transports,
  exitOnError: false,
});

// Stream for Morgan HTTP logging integration
export const httpLogStream = {
  write: (message: string): void => {
    logger.http(message.trim());
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

// Event logging helpers
export const logEventReceived = (eventType: string, eventId: string, meta?: Record<string, unknown>): void => {
  logger.info(`Event received: ${eventType}`, {
    eventType,
    eventId,
    ...meta,
  });
};

export const logEventProcessed = (eventType: string, eventId: string, meta?: Record<string, unknown>): void => {
  logger.info(`Event processed: ${eventType}`, {
    eventType,
    eventId,
    ...meta,
  });
};

export const logEventFailed = (eventType: string, eventId: string, error: Error | unknown, meta?: Record<string, unknown>): void => {
  const errorMeta: Record<string, unknown> = {
    eventType,
    eventId,
    ...meta,
  };

  if (error instanceof Error) {
    errorMeta.errorName = error.name;
    errorMeta.errorMessage = error.message;
  }

  logger.error(`Event processing failed: ${eventType}`, errorMeta);
};

// Business operation logging
export const logStockOperation = (
  operation: string,
  productId: string,
  quantity: number,
  success: boolean,
  meta?: Record<string, unknown>
): void => {
  const logData = {
    operation,
    productId,
    quantity,
    success,
    ...meta,
  };

  if (success) {
    logger.info(`Stock operation: ${operation}`, logData);
  } else {
    logger.warn(`Stock operation failed: ${operation}`, logData);
  }
};

export const logLowStockAlert = (productId: string, currentStock: number, minStock: number): void => {
  logger.warn('Low stock alert', {
    productId,
    currentStock,
    minStock,
    alertType: currentStock <= minStock / 2 ? 'CRITICAL' : 'WARNING',
  });
};

export default logger;
