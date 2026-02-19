/**
 * Cypress E2E Support File
 * Configuración y comandos personalizados para tests E2E
 */

// Import commands
import './commands';

// Global configuration
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login with email and password
       */
      login(email: string, password: string): Chainable<void>;
      
      /**
       * Login as admin
       */
      loginAsAdmin(): Chainable<void>;
      
      /**
       * Register a new user
       */
      register(userData: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
      }): Chainable<void>;
      
      /**
       * Add product to cart
       */
      addToCart(productId: string, quantity?: number): Chainable<void>;
      
      /**
       * Navigate to cart
       */
      goToCart(): Chainable<void>;
      
      /**
       * Proceed to checkout
       */
      checkout(): Chainable<void>;
      
      /**
       * Complete order
       */
      completeOrder(paymentData: {
        cardNumber: string;
        expiry: string;
        cvc: string;
      }): Chainable<void>;
      
      /**
       * Search for products
       */
      searchProducts(query: string): Chainable<void>;
      
      /**
       * Wait for loading state
       */
      waitForLoading(): Chainable<void>;
      
      /**
       * Verify toast notification
       */
      verifyToast(message: string, type?: 'success' | 'error' | 'info'): Chainable<void>;
      
      /**
       * Clear cart
       */
      clearCart(): Chainable<void>;
      
      /**
       * Mock API response
       */
      mockApi(method: string, url: string, response: any): Chainable<void>;
      
      /**
       * Intercept and wait for API call
       */
      waitForApi(alias: string): Chainable<Interception>;
    }
  }
}

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false prevents Cypress from failing the test
  console.error('Uncaught exception:', err);
  return false;
});

// Log test information
beforeEach(() => {
  cy.log(`Running test: ${Cypress.currentTest.title}`);
});

// Preserve cookies between tests
Cypress.Cookies.defaults({
  preserve: ['session', 'token', 'refreshToken']
});

// Set default viewport
Cypress.config('viewportWidth', 1280);
Cypress.config('viewportHeight', 720);
