// Jest setup file
import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/product_test_db?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
process.env.JWT_SECRET = 'test-secret-key';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Cleanup after all tests
afterAll(async () => {
  // Add any global cleanup here
});
