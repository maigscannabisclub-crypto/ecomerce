/**
 * Jest Configuration for Contract Tests (Pact)
 * Consumer-driven contract testing entre servicios
 */
module.exports = {
  name: 'contract',
  displayName: 'Contract Tests',
  
  // Environment
  testEnvironment: 'node',
  
  // Test files pattern
  testMatch: [
    '**/testing/contract/**/*.test.ts'
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
  
  // Pact specific configuration
  setupFilesAfterEnv: [
    '<rootDir>/testing/contract/setup.ts'
  ],
  
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
  
  coverageDirectory: '<rootDir>/testing/coverage/contract',
  
  // Test timeout (Pact tests can take longer)
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks
  clearMocks: true,
  
  // Restore mocks
  restoreMocks: true,
  
  // Pact broker configuration (environment variables)
  // PACT_BROKER_URL, PACT_BROKER_TOKEN, etc.
  
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: [151001]
      }
    }
  }
};
