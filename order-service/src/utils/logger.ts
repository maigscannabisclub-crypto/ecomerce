import winston from 'winston';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';
const logFormat = process.env.LOG_FORMAT || 'json';

// Create format based on environment
const createFormat = () => {
  if (isDevelopment && logFormat === 'pretty') {
    return combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      devFormat
    );
  }
  
  return combine(
    timestamp(),
    json(),
    errors({ stack: true })
  );
};

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    service: 'order-service',
    environment: process.env.NODE_ENV || 'development',
  },
  format: createFormat(),
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log' 
  }));
}

// Create a stream for Morgan HTTP logging
export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

// Helper methods with context
export const createLogger = (context: string) => ({
  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, { context, ...meta });
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    logger.error(message, { context, ...meta });
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, { context, ...meta });
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, { context, ...meta });
  },
});

export default logger;
