/**
 * Jest Configuration for E2E Tests
 * End-to-end tests con Supertest
 */
module.exports = {
  name: 'e2e',
  displayName: 'E2E Tests',
  
  // Environment
  testEnvironment: 'node',
  
  // Test files pattern
  testMatch: [
    '**/testing/e2e/**/*.test.ts'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/testing/e2e/setup.ts'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true
    }]
  },
  
  // Module name mapper
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1'
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'services/**/*.ts',
    '!services/**/node_modules/**',
    '!services/**/*.d.ts',
    '!services/**/dist/**'
  ],
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'json'
  ],
  
  coverageDirectory: '<rootDir>/testing/coverage/e2e',
  
  // Test timeout (E2E tests need more time)
  testTimeout: 120000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks
  clearMocks: true,
  
  // Restore mocks
  restoreMocks: true,
  
  // Run tests sequentially (E2E tests should not run in parallel)
  maxWorkers: 1,
  
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: [151001]
      }
    }
  }
};
