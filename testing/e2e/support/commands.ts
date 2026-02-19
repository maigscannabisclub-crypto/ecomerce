/**
 * Cypress Custom Commands
 * Comandos personalizados para tests E2E
 */

// Login command
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type(email);
    cy.get('[data-testid="password-input"]').type(password);
    cy.get('[data-testid="login-button"]').click();
    
    // Wait for login to complete
    cy.url().should('not.include', '/login');
    cy.get('[data-testid="user-menu"]').should('be.visible');
  });
});

// Login as admin
Cypress.Commands.add('loginAsAdmin', () => {
  const adminEmail = Cypress.env('adminEmail') || 'admin@example.com';
  const adminPassword = Cypress.env('adminPassword') || 'Admin123!';
  
  cy.login(adminEmail, adminPassword);
});

// Register command
Cypress.Commands.add('register', (userData) => {
  cy.visit('/register');
  cy.get('[data-testid="firstName-input"]').type(userData.firstName);
  cy.get('[data-testid="lastName-input"]').type(userData.lastName);
  cy.get('[data-testid="email-input"]').type(userData.email);
  cy.get('[data-testid="password-input"]').type(userData.password);
  cy.get('[data-testid="confirmPassword-input"]').type(userData.password);
  cy.get('[data-testid="register-button"]').click();
  
  // Wait for registration to complete
  cy.url().should('include', '/login');
  cy.verifyToast('Registration successful', 'success');
});

// Add to cart command
Cypress.Commands.add('addToCart', (productId: string, quantity = 1) => {
  cy.visit(`/products/${productId}`);
  cy.get('[data-testid="product-detail"]').should('be.visible');
  
  if (quantity > 1) {
    cy.get('[data-testid="quantity-input"]').clear().type(quantity.toString());
  }
  
  cy.get('[data-testid="add-to-cart-button"]').click();
  cy.verifyToast('Added to cart', 'success');
});

// Go to cart command
Cypress.Commands.add('goToCart', () => {
  cy.get('[data-testid="cart-icon"]').click();
  cy.get('[data-testid="cart-page"]').should('be.visible');
});

// Checkout command
Cypress.Commands.add('checkout', () => {
  cy.goToCart();
  cy.get('[data-testid="checkout-button"]').click();
  cy.get('[data-testid="checkout-page"]').should('be.visible');
});

// Complete order command
Cypress.Commands.add('completeOrder', (paymentData) => {
  // Fill shipping address
  cy.get('[data-testid="shipping-street"]').type('123 Test Street');
  cy.get('[data-testid="shipping-city"]').type('Test City');
  cy.get('[data-testid="shipping-state"]').type('TS');
  cy.get('[data-testid="shipping-zip"]').type('12345');
  cy.get('[data-testid="shipping-country"]').type('US');
  
  // Continue to payment
  cy.get('[data-testid="continue-to-payment"]').click();
  
  // Fill payment details
  cy.get('[data-testid="card-number"]').type(paymentData.cardNumber);
  cy.get('[data-testid="card-expiry"]').type(paymentData.expiry);
  cy.get('[data-testid="card-cvc"]').type(paymentData.cvc);
  
  // Complete order
  cy.get('[data-testid="complete-order-button"]').click();
  
  // Wait for order confirmation
  cy.get('[data-testid="order-confirmation"]').should('be.visible');
});

// Search products command
Cypress.Commands.add('searchProducts', (query: string) => {
  cy.get('[data-testid="search-input"]').type(query);
  cy.get('[data-testid="search-button"]').click();
  cy.get('[data-testid="search-results"]').should('be.visible');
});

// Wait for loading command
Cypress.Commands.add('waitForLoading', () => {
  cy.get('[data-testid="loading-spinner"]', { timeout: 10000 }).should('not.exist');
});

// Verify toast notification
Cypress.Commands.add('verifyToast', (message: string, type = 'success') => {
  cy.get(`[data-testid="toast-${type}"]`)
    .should('be.visible')
    .and('contain.text', message);
});

// Clear cart command
Cypress.Commands.add('clearCart', () => {
  cy.goToCart();
  cy.get('body').then(($body) => {
    if ($body.find('[data-testid="cart-item"]').length > 0) {
      cy.get('[data-testid="clear-cart-button"]').click();
      cy.get('[data-testid="confirm-clear-cart"]').click();
      cy.verifyToast('Cart cleared', 'success');
    }
  });
});

// Mock API command
Cypress.Commands.add('mockApi', (method: string, url: string, response: any) => {
  cy.intercept(method, url, {
    statusCode: 200,
    body: response
  }).as('mockedApi');
});

// Wait for API call
Cypress.Commands.add('waitForApi', (alias: string) => {
  return cy.wait(`@${alias}`, { timeout: 10000 });
});

// Admin commands
Cypress.Commands.add('createProduct', (productData: {
  name: string;
  description: string;
  price: number;
  sku: string;
  category: string;
  stockQuantity: number;
}) => {
  cy.visit('/admin/products/new');
  cy.get('[data-testid="product-name"]').type(productData.name);
  cy.get('[data-testid="product-description"]').type(productData.description);
  cy.get('[data-testid="product-price"]').type(productData.price.toString());
  cy.get('[data-testid="product-sku"]').type(productData.sku);
  cy.get('[data-testid="product-category"]').select(productData.category);
  cy.get('[data-testid="product-stock"]').type(productData.stockQuantity.toString());
  
  cy.get('[data-testid="save-product-button"]').click();
  cy.verifyToast('Product created successfully', 'success');
});

Cypress.Commands.add('updateStock', (productId: string, newStock: number) => {
  cy.visit(`/admin/products/${productId}/edit`);
  cy.get('[data-testid="product-stock"]').clear().type(newStock.toString());
  cy.get('[data-testid="save-product-button"]').click();
  cy.verifyToast('Product updated successfully', 'success');
});

// Export for TypeScript
declare global {
  namespace Cypress {
    interface Chainable {
      createProduct(productData: {
        name: string;
        description: string;
        price: number;
        sku: string;
        category: string;
        stockQuantity: number;
      }): Chainable<void>;
      updateStock(productId: string, newStock: number): Chainable<void>;
    }
  }
}
