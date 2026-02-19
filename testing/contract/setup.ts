/**
 * Contract Tests Setup
 * Configuración para Pact contract testing
 */
import path from 'path';

// Pact configuration
export const PACT_CONFIG = {
  // Consumer configuration
  consumer: {
    name: process.env.PACT_CONSUMER_NAME || 'web-frontend',
    dir: path.resolve(process.cwd(), 'testing/contract/pacts')
  },
  
  // Provider configuration
  provider: {
    name: process.env.PACT_PROVIDER_NAME || 'order-service',
    baseUrl: process.env.PROVIDER_BASE_URL || 'http://localhost:3001'
  },
  
  // Pact Broker configuration
  broker: {
    url: process.env.PACT_BROKER_URL || 'http://localhost:9292',
    token: process.env.PACT_BROKER_TOKEN,
    username: process.env.PACT_BROKER_USERNAME,
    password: process.env.PACT_BROKER_PASSWORD
  },
  
  // Pact publication
  publish: process.env.PACT_PUBLISH === 'true',
  
  // Provider verification
  providerVersion: process.env.GIT_COMMIT || '1.0.0',
  providerBranch: process.env.GIT_BRANCH || 'main',
  
  // Consumer version selectors for provider verification
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true }
  ]
};

// Helper function to get pact file path
export function getPactFilePath(consumer: string, provider: string): string {
  return path.join(
    PACT_CONFIG.consumer.dir,
    `${consumer}-${provider}.json`
  );
}

// Helper to check if running in CI
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}
