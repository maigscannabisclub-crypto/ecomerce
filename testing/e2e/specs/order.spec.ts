/**
 * Order Management E2E Tests
 * Tests de flujo completo de órdenes
 */
describe('Order Management', () => {
  beforeEach(() => {
    cy.fixture('users').then((users) => {
      cy.login(users.customer.email, users.customer.password);
    });
  });

  describe('Complete Purchase Flow', () => {
    it('should complete full purchase flow', () => {
      cy.fixture('products').then((products) => {
        // Step 1: Browse and add products
        cy.visit('/products');
        cy.get('[data-testid="product-card"]').first().click();
        cy.get('[data-testid="add-to-cart-button"]').click();
        cy.verifyToast('Added to cart', 'success');
        
        // Step 2: Go to cart
        cy.goToCart();
        cy.get('[data-testid="cart-item"]').should('have.length.at.least', 1);
        
        // Step 3: Proceed to checkout
        cy.get('[data-testid="checkout-button"]').click();
        cy.url().should('include', '/checkout');
        
        // Step 4: Fill shipping information
        cy.get('[data-testid="shipping-firstName"]').type('John');
        cy.get('[data-testid="shipping-lastName"]').type('Doe');
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="shipping-country"]').select('United States');
        cy.get('[data-testid="shipping-phone"]').type('555-123-4567');
        
        cy.get('[data-testid="continue-to-payment"]').click();
        
        // Step 5: Fill payment information
        cy.get('[data-testid="payment-cardNumber"]').type('4111111111111111');
        cy.get('[data-testid="payment-cardName"]').type('John Doe');
        cy.get('[data-testid="payment-expiry"]').type('12/25');
        cy.get('[data-testid="payment-cvc"]').type('123');
        
        // Step 6: Review and complete order
        cy.get('[data-testid="review-order"]').click();
        cy.get('[data-testid="place-order"]').click();
        
        // Step 7: Verify order confirmation
        cy.url().should('include', '/order-confirmation');
        cy.get('[data-testid="order-confirmation"]').should('be.visible');
        cy.get('[data-testid="order-number"]').should('be.visible');
        cy.verifyToast('Order placed successfully', 'success');
      });
    });

    it('should save shipping address for future use', () => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        cy.get('[data-testid="shipping-firstName"]').type('John');
        cy.get('[data-testid="shipping-lastName"]').type('Doe');
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="save-address"]').check();
        
        cy.get('[data-testid="continue-to-payment"]').click();
        
        // Verify address was saved
        cy.visit('/account/addresses');
        cy.get('[data-testid="saved-address"]').should('contain', '123 Test Street');
      });
    });

    it('should use saved shipping address', () => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        // Select saved address
        cy.get('[data-testid="saved-address-option"]').first().click();
        cy.get('[data-testid="use-saved-address"]').click();
        
        // Verify address is pre-filled
        cy.get('[data-testid="shipping-street"]').should('have.value', '123 Test Street');
      });
    });
  });

  describe('Order History', () => {
    it('should display order history', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="orders-page"]').should('be.visible');
      cy.get('[data-testid="orders-list"]').should('be.visible');
    });

    it('should view order details', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="order-item"]').first().click();
      
      cy.get('[data-testid="order-details"]').should('be.visible');
      cy.get('[data-testid="order-status"]').should('be.visible');
      cy.get('[data-testid="order-items"]').should('be.visible');
      cy.get('[data-testid="order-total"]').should('be.visible');
    });

    it('should filter orders by status', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="status-filter"]').select('delivered');
      
      cy.get('[data-testid="order-item"]').each(($order) => {
        cy.wrap($order).should('contain', 'Delivered');
      });
    });

    it('should search orders', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="order-search"]').type('ORDER-001');
      cy.get('[data-testid="search-orders"]').click();
      
      cy.get('[data-testid="order-item"]').should('contain', 'ORDER-001');
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel pending order', () => {
      // First create an order
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        // Complete checkout flow
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="continue-to-payment"]').click();
        
        cy.get('[data-testid="payment-cardNumber"]').type('4111111111111111');
        cy.get('[data-testid="payment-expiry"]').type('12/25');
        cy.get('[data-testid="payment-cvc"]').type('123');
        cy.get('[data-testid="place-order"]').click();
        
        // Get order number
        cy.get('[data-testid="order-number"]').invoke('text').then((orderNumber) => {
          // Go to orders and cancel
          cy.visit('/orders');
          cy.contains(orderNumber).parents('[data-testid="order-item"]').within(() => {
            cy.get('[data-testid="cancel-order"]').click();
          });
          
          cy.get('[data-testid="confirm-cancel"]').click();
          
          cy.verifyToast('Order cancelled successfully', 'success');
          cy.contains(orderNumber).parents('[data-testid="order-item"]').should('contain', 'Cancelled');
        });
      });
    });

    it('should not allow cancelling shipped order', () => {
      cy.visit('/orders');
      
      // Find a shipped order
      cy.get('[data-testid="order-item"]').each(($order) => {
        cy.wrap($order).find('[data-testid="order-status"]').invoke('text').then((status) => {
          if (status.includes('Shipped') || status.includes('Delivered')) {
            cy.wrap($order).find('[data-testid="cancel-order"]').should('not.exist');
          }
        });
      });
    });
  });

  describe('Order Tracking', () => {
    it('should track order status', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="order-item"]').first().click();
      
      cy.get('[data-testid="order-timeline"]').should('be.visible');
      cy.get('[data-testid="timeline-event"]').should('have.length.at.least', 1);
    });

    it('should show tracking number for shipped orders', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="order-item"]').each(($order) => {
        cy.wrap($order).find('[data-testid="order-status"]').invoke('text').then((status) => {
          if (status.includes('Shipped')) {
            cy.wrap($order).click();
            cy.get('[data-testid="tracking-number"]').should('be.visible');
            cy.get('[data-testid="tracking-link"]').should('have.attr', 'href');
          }
        });
      });
    });
  });

  describe('Reorder', () => {
    it('should reorder previous order', () => {
      cy.visit('/orders');
      
      cy.get('[data-testid="order-item"]').first().within(() => {
        cy.get('[data-testid="reorder-button"]').click();
      });
      
      cy.verifyToast('Items added to cart', 'success');
      
      cy.goToCart();
      cy.get('[data-testid="cart-item"]').should('have.length.at.least', 1);
    });
  });

  describe('Payment Methods', () => {
    it('should save payment method', () => {
      cy.visit('/account/payment-methods');
      
      cy.get('[data-testid="add-payment-method"]').click();
      cy.get('[data-testid="card-number"]').type('4111111111111111');
      cy.get('[data-testid="card-name"]').type('John Doe');
      cy.get('[data-testid="card-expiry"]').type('12/25');
      cy.get('[data-testid="card-cvc"]').type('123');
      cy.get('[data-testid="save-card"]').click();
      
      cy.verifyToast('Payment method saved', 'success');
      cy.get('[data-testid="saved-card"]').should('be.visible');
    });

    it('should use saved payment method at checkout', () => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        // Fill shipping
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="continue-to-payment"]').click();
        
        // Select saved payment method
        cy.get('[data-testid="saved-payment-method"]').first().click();
        
        cy.get('[data-testid="place-order"]').click();
        
        cy.url().should('include', '/order-confirmation');
      });
    });
  });

  describe('Order Notifications', () => {
    it('should receive order confirmation email', () => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="continue-to-payment"]').click();
        
        cy.get('[data-testid="payment-cardNumber"]').type('4111111111111111');
        cy.get('[data-testid="payment-expiry"]').type('12/25');
        cy.get('[data-testid="payment-cvc"]').type('123');
        cy.get('[data-testid="place-order"]').click();
        
        // Verify email notification (mock)
        cy.verifyToast('Order confirmation email sent', 'success');
      });
    });
  });

  describe('Order Errors', () => {
    it('should handle payment failure', () => {
      // Mock payment failure
      cy.mockApi('POST', '/api/v1/orders', {
        statusCode: 400,
        body: {
          error: 'Payment failed',
          code: 'PAYMENT_ERROR'
        }
      });
      
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="continue-to-payment"]').click();
        
        cy.get('[data-testid="payment-cardNumber"]').type('4000000000000002'); // Declined card
        cy.get('[data-testid="payment-expiry"]').type('12/25');
        cy.get('[data-testid="payment-cvc"]').type('123');
        cy.get('[data-testid="place-order"]').click();
        
        cy.verifyToast('Payment failed', 'error');
        cy.get('[data-testid="payment-error"]').should('be.visible');
      });
    });

    it('should handle out of stock during checkout', () => {
      // Mock out of stock
      cy.mockApi('POST', '/api/v1/orders', {
        statusCode: 400,
        body: {
          error: 'Some items are out of stock',
          code: 'OUT_OF_STOCK',
          items: ['550e8400-e29b-41d4-a716-446655440001']
        }
      });
      
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
        cy.checkout();
        
        cy.get('[data-testid="shipping-street"]').type('123 Test Street');
        cy.get('[data-testid="shipping-city"]').type('Test City');
        cy.get('[data-testid="shipping-state"]').select('California');
        cy.get('[data-testid="shipping-zip"]').type('90210');
        cy.get('[data-testid="continue-to-payment"]').click();
        
        cy.get('[data-testid="payment-cardNumber"]').type('4111111111111111');
        cy.get('[data-testid="payment-expiry"]').type('12/25');
        cy.get('[data-testid="payment-cvc"]').type('123');
        cy.get('[data-testid="place-order"]').click();
        
        cy.verifyToast('Some items are out of stock', 'error');
        cy.url().should('include', '/cart');
      });
    });
  });

  describe('Admin Order Management', () => {
    beforeEach(() => {
      cy.loginAsAdmin();
    });

    it('should view all orders', () => {
      cy.visit('/admin/orders');
      
      cy.get('[data-testid="admin-orders-page"]').should('be.visible');
      cy.get('[data-testid="orders-table"]').should('be.visible');
    });

    it('should update order status', () => {
      cy.visit('/admin/orders');
      
      cy.get('[data-testid="order-row"]').first().within(() => {
        cy.get('[data-testid="status-dropdown"]').select('shipped');
      });
      
      cy.verifyToast('Order status updated', 'success');
    });

    it('should process refund', () => {
      cy.visit('/admin/orders');
      
      cy.get('[data-testid="order-row"]').first().within(() => {
        cy.get('[data-testid="process-refund"]').click();
      });
      
      cy.get('[data-testid="refund-amount"]').type('50.00');
      cy.get('[data-testid="refund-reason"]').type('Customer request');
      cy.get('[data-testid="confirm-refund"]').click();
      
      cy.verifyToast('Refund processed successfully', 'success');
    });
  });
});
