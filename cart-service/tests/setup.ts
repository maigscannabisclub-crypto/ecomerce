import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/cart_db_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key';
process.env.INVENTORY_SERVICE_URL = 'http://localhost:3002';

// Global test timeout
jest.setTimeout(30000);

// Mock Redis
jest.mock('../src/infrastructure/cache/redis', () => ({
  __esModule: true,
  default: {
    getCart: jest.fn().mockResolvedValue(null),
    setCart: jest.fn().mockResolvedValue(undefined),
    deleteCart: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockReturnValue(true),
    healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 10 }),
  },
}));

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logHttp: jest.fn(),
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Global beforeAll
beforeAll(async () => {
  // Any global setup
});

// Global afterAll
afterAll(async () => {
  // Any global cleanup
});

// Global beforeEach
beforeEach(() => {
  jest.clearAllMocks();
});

// Global afterEach
afterEach(() => {
  // Cleanup after each test
});
