import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Determine log level based on environment
const logLevel = config.server.env === 'production' ? 'info' : config.logging.level;

// Create transports array
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      config.server.env === 'production' ? json() : devFormat
    )
  })
];

// Add file transports in production
if (config.server.env === 'production') {
  // Info log rotation
  transports.push(
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    })
  );

  // Error log rotation
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    service: config.server.serviceName,
    environment: config.server.env
  },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  transports,
  exitOnError: false
});

// Create a stream object for Morgan integration
export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  }
};

// Helper methods for structured logging
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
    }
  };
};

export default logger;
