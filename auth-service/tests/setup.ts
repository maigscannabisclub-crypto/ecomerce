import { PrismaClient } from '@prisma/client';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRATION = '15m';
process.env.JWT_REFRESH_EXPIRATION = '7d';
process.env.BCRYPT_SALT_ROUNDS = '4'; // Lower for faster tests
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/auth_test_db?schema=public';

// Global test timeout
jest.setTimeout(30000);

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  auditLog: jest.fn(),
  perfLog: jest.fn(),
}));

// Global teardown
afterAll(async () => {
  // Clean up any remaining connections
  await new Promise((resolve) => setTimeout(resolve, 500));
});
