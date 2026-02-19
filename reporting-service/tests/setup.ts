// ============================================
// Jest Test Setup
// ============================================

import { PrismaClient } from '@prisma/client';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3006';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/reporting_test_db?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
process.env.JWT_SECRET = 'test-jwt-secret';

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  createRequestLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  stream: {
    write: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
