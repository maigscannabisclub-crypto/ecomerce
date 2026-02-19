import { defineConfig } from 'cypress';

/**
 * Cypress Configuration for E2E Testing
 * Tests de interfaz de usuario y flujos completos
 */
export default defineConfig({
  // Project configuration
  projectId: 'ecommerce-platform',
  
  // E2E Testing configuration
  e2e: {
    // Base URL for the application
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    
    // Spec pattern
    specPattern: 'testing/e2e/specs/**/*.spec.ts',
    
    // Support file
    supportFile: 'testing/e2e/support/e2e.ts',
    
    // Fixtures folder
    fixturesFolder: 'testing/e2e/fixtures',
    
    // Screenshots
    screenshotsFolder: 'testing/coverage/e2e/screenshots',
    
    // Videos
    videosFolder: 'testing/coverage/e2e/videos',
    video: true,
    videoCompression: 32,
    
    // Viewport
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Timeouts
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    
    // Retries
    retries: {
      runMode: 2,
      openMode: 0
    },
    
    // Environment variables
    env: {
      // API endpoints
      apiUrl: process.env.API_URL || 'http://localhost:3001',
      
      // Test users
      testUserEmail: process.env.TEST_USER_EMAIL || 'test@example.com',
      testUserPassword: process.env.TEST_USER_PASSWORD || 'Test123!',
      
      // Admin user
      adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
      adminPassword: process.env.ADMIN_PASSWORD || 'Admin123!',
      
      // Coverage
      coverage: true,
      codeCoverage: {
        url: '/api/__coverage__'
      }
    },
    
    // Setup node events
    setupNodeEvents(on, config) {
      // Register code coverage task
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        }
      });
      
      // Return config
      return config;
    }
  },
  
  // Component testing (optional)
  component: {
    devServer: {
      framework: 'react',
      bundler: 'webpack'
    },
    specPattern: 'src/**/*.cy.{ts,tsx}'
  },
  
  // Reporter configuration
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: 'reporter-config.json'
  }
});
