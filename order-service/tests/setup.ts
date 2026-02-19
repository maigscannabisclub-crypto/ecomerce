// Jest setup file
import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/order_test_db?schema=public';
process.env.JWT_SECRET = 'test-secret-key';
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods during tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
