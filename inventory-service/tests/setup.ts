import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3005';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/inventory_test_db?schema=public';
process.env.JWT_SECRET = 'test-secret-key';
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';

// Global test timeout
jest.setTimeout(30000);

// Mock logger to avoid console noise during tests
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
  logEventReceived: jest.fn(),
  logEventProcessed: jest.fn(),
  logEventFailed: jest.fn(),
  logStockOperation: jest.fn(),
  logLowStockAlert: jest.fn(),
  httpLogStream: {
    write: jest.fn(),
  },
}));

// Mock RabbitMQ
jest.mock('../src/infrastructure/messaging/rabbitmq', () => ({
  __esModule: true,
  createRabbitMQClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getIsConnected: jest.fn().mockReturnValue(true),
  })),
  resetRabbitMQClient: jest.fn(),
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
