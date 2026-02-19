import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create the logger
const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: {
    service: config.serviceName,
    environment: config.nodeEnv,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.nodeEnv === 'development'
        ? combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            devFormat
          )
        : combine(
            timestamp(),
            json()
          ),
    }),
  ],
});

// Add file transports in production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: combine(timestamp(), json()),
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: combine(timestamp(), json()),
  }));
}

// Wrapper methods with additional context
export const logInfo = (message: string, meta?: Record<string, any>) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error | unknown, meta?: Record<string, any>) => {
  const errorMeta: Record<string, any> = { ...meta };
  
  if (error instanceof Error) {
    errorMeta.errorName = error.name;
    errorMeta.errorMessage = error.message;
    errorMeta.stack = error.stack;
  } else if (error) {
    errorMeta.error = error;
  }
  
  logger.error(message, errorMeta);
};

export const logWarn = (message: string, meta?: Record<string, any>) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: Record<string, any>) => {
  logger.debug(message, meta);
};

export const logHttp = (message: string, meta?: Record<string, any>) => {
  logger.http(message, meta);
};

// Request context logger
export const createRequestLogger = (requestId: string, userId?: string) => {
  return {
    info: (message: string, meta?: Record<string, any>) => {
      logger.info(message, { requestId, userId, ...meta });
    },
    error: (message: string, error?: Error | unknown, meta?: Record<string, any>) => {
      const errorMeta: Record<string, any> = { requestId, userId, ...meta };
      
      if (error instanceof Error) {
        errorMeta.errorName = error.name;
        errorMeta.errorMessage = error.message;
        errorMeta.stack = error.stack;
      } else if (error) {
        errorMeta.error = error;
      }
      
      logger.error(message, errorMeta);
    },
    warn: (message: string, meta?: Record<string, any>) => {
      logger.warn(message, { requestId, userId, ...meta });
    },
    debug: (message: string, meta?: Record<string, any>) => {
      logger.debug(message, { requestId, userId, ...meta });
    },
  };
};

// Performance logger
export const logPerformance = (
  operation: string,
  durationMs: number,
  meta?: Record<string, any>
) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    durationMs,
    ...meta,
  });
};

// Business event logger
export const logBusinessEvent = (
  event: string,
  data: Record<string, any>
) => {
  logger.info(`Business Event: ${event}`, {
    eventType: event,
    ...data,
  });
};

export default logger;
