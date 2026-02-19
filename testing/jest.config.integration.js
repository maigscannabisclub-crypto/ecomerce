/**
 * Jest Configuration for Integration Tests
 * Tests de integración con testcontainers, APIs reales y eventos
 */
module.exports = {
  name: 'integration',
  displayName: 'Integration Tests',
  
  // Environment
  testEnvironment: 'node',
  
  // Test files pattern
  testMatch: [
    '**/testing/integration/**/*.test.ts'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/testing/integration/setup.ts'
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
  
  // Module name mapper for aliases
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
    '!services/**/dist/**',
    '!services/**/index.ts'
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
    'json',
    'lcov'
  ],
  
  coverageDirectory: '<rootDir>/testing/coverage/integration',
  
  // Test timeout (longer for integration tests with containers)
  testTimeout: 60000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Detect open handles (useful for finding hanging async operations)
  detectOpenHandles: true,
  
  // Force exit after all tests complete
  forceExit: true,
  
  // Globals
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: [151001]
      }
    }
  }
};
