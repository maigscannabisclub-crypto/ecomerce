/**
 * Shopping Cart E2E Tests
 * Tests de gestión del carrito de compras
 */
describe('Shopping Cart', () => {
  beforeEach(() => {
    cy.fixture('users').then((users) => {
      cy.login(users.customer.email, users.customer.password);
    });
  });

  describe('Add to Cart', () => {
    it('should add product to cart', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        
        cy.get('[data-testid="add-to-cart-button"]').click();
        
        cy.verifyToast('Added to cart', 'success');
        cy.get('[data-testid="cart-badge"]').should('contain', '1');
      });
    });

    it('should add multiple quantities to cart', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        
        cy.get('[data-testid="quantity-input"]').clear().type('3');
        cy.get('[data-testid="add-to-cart-button"]').click();
        
        cy.verifyToast('Added to cart', 'success');
        
        cy.goToCart();
        cy.get('[data-testid="cart-item-quantity"]').should('have.value', '3');
      });
    });

    it('should add multiple products to cart', () => {
      cy.fixture('products').then((products) => {
        // Add first product
        cy.visit(`/products/${products.laptop.id}`);
        cy.get('[data-testid="add-to-cart-button"]').click();
        cy.verifyToast('Added to cart', 'success');
        
        // Add second product
        cy.visit(`/products/${products.headphones.id}`);
        cy.get('[data-testid="add-to-cart-button"]').click();
        cy.verifyToast('Added to cart', 'success');
        
        // Verify cart has 2 items
        cy.goToCart();
        cy.get('[data-testid="cart-item"]').should('have.length', 2);
      });
    });

    it('should prevent adding more than available stock', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.lowStockProduct.id}`);
        
        cy.get('[data-testid="quantity-input"]').clear().type('10');
        cy.get('[data-testid="add-to-cart-button"]').click();
        
        cy.verifyToast('Not enough stock available', 'error');
      });
    });

    it('should update quantity when adding same product', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        
        // Add product twice
        cy.get('[data-testid="add-to-cart-button"]').click();
        cy.verifyToast('Added to cart', 'success');
        
        cy.get('[data-testid="add-to-cart-button"]').click();
        cy.verifyToast('Cart updated', 'success');
        
        cy.goToCart();
        cy.get('[data-testid="cart-item-quantity"]').should('have.value', '2');
      });
    });
  });

  describe('Cart Page', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 2);
        cy.addToCart(products.headphones.id, 1);
      });
      cy.goToCart();
    });

    it('should display cart items', () => {
      cy.get('[data-testid="cart-item"]').should('have.length', 2);
      cy.get('[data-testid="cart-item"]').each(($item) => {
        cy.wrap($item).find('[data-testid="cart-item-name"]').should('be.visible');
        cy.wrap($item).find('[data-testid="cart-item-price"]').should('be.visible');
        cy.wrap($item).find('[data-testid="cart-item-quantity"]').should('be.visible');
      });
    });

    it('should calculate subtotal correctly', () => {
      cy.fixture('products').then((products) => {
        const expectedSubtotal = (products.laptop.price * 2) + products.headphones.price;
        
        cy.get('[data-testid="cart-subtotal"]')
          .should('contain', expectedSubtotal.toFixed(2));
      });
    });

    it('should update item quantity', () => {
      cy.get('[data-testid="cart-item"]').first().within(() => {
        cy.get('[data-testid="increase-quantity"]').click();
      });
      
      cy.verifyToast('Quantity updated', 'success');
      
      cy.get('[data-testid="cart-item"]').first()
        .find('[data-testid="cart-item-quantity"]')
        .should('have.value', '3');
    });

    it('should decrease item quantity', () => {
      cy.get('[data-testid="cart-item"]').first().within(() => {
        cy.get('[data-testid="decrease-quantity"]').click();
      });
      
      cy.verifyToast('Quantity updated', 'success');
      
      cy.get('[data-testid="cart-item"]').first()
        .find('[data-testid="cart-item-quantity"]')
        .should('have.value', '1');
    });

    it('should remove item from cart', () => {
      cy.get('[data-testid="cart-item"]').first().within(() => {
        cy.get('[data-testid="remove-item"]').click();
      });
      
      cy.get('[data-testid="confirm-remove"]').click();
      
      cy.verifyToast('Item removed from cart', 'success');
      cy.get('[data-testid="cart-item"]').should('have.length', 1);
    });

    it('should clear entire cart', () => {
      cy.get('[data-testid="clear-cart-button"]').click();
      cy.get('[data-testid="confirm-clear-cart"]').click();
      
      cy.verifyToast('Cart cleared', 'success');
      cy.get('[data-testid="empty-cart"]').should('be.visible');
      cy.get('[data-testid="cart-item"]').should('not.exist');
    });

    it('should persist cart after page reload', () => {
      cy.reload();
      
      cy.goToCart();
      cy.get('[data-testid="cart-item"]').should('have.length', 2);
    });

    it('should show empty cart message', () => {
      cy.clearCart();
      
      cy.get('[data-testid="empty-cart"]').should('be.visible');
      cy.get('[data-testid="empty-cart-message"]')
        .should('contain', 'Your cart is empty');
    });
  });

  describe('Cart Calculations', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
      });
      cy.goToCart();
    });

    it('should calculate totals correctly', () => {
      cy.fixture('products').then((products) => {
        const subtotal = products.laptop.price;
        const tax = subtotal * 0.1; // 10% tax
        const shipping = subtotal > 100 ? 0 : 10; // Free shipping over $100
        const total = subtotal + tax + shipping;
        
        cy.get('[data-testid="cart-subtotal"]').should('contain', subtotal.toFixed(2));
        cy.get('[data-testid="cart-tax"]').should('contain', tax.toFixed(2));
        cy.get('[data-testid="cart-shipping"]').should('contain', shipping === 0 ? 'FREE' : shipping.toFixed(2));
        cy.get('[data-testid="cart-total"]').should('contain', total.toFixed(2));
      });
    });

    it('should apply free shipping for orders over threshold', () => {
      cy.fixture('products').then((products) => {
        // Add more items to exceed free shipping threshold
        cy.addToCart(products.laptop.id, 2);
        cy.goToCart();
        
        cy.get('[data-testid="cart-shipping"]').should('contain', 'FREE');
      });
    });

    it('should apply discount code', () => {
      cy.get('[data-testid="discount-input"]').type('SAVE10');
      cy.get('[data-testid="apply-discount"]').click();
      
      cy.verifyToast('Discount applied', 'success');
      cy.get('[data-testid="discount-amount"]').should('be.visible');
    });

    it('should reject invalid discount code', () => {
      cy.get('[data-testid="discount-input"]').type('INVALID');
      cy.get('[data-testid="apply-discount"]').click();
      
      cy.verifyToast('Invalid discount code', 'error');
    });
  });

  describe('Cart Mini View', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
      });
    });

    it('should open cart mini view', () => {
      cy.get('[data-testid="cart-icon"]').click();
      
      cy.get('[data-testid="cart-mini-view"]').should('be.visible');
      cy.get('[data-testid="cart-mini-item"]').should('have.length', 1);
    });

    it('should navigate to full cart from mini view', () => {
      cy.get('[data-testid="cart-icon"]').click();
      cy.get('[data-testid="view-full-cart"]').click();
      
      cy.url().should('include', '/cart');
      cy.get('[data-testid="cart-page"]').should('be.visible');
    });

    it('should remove item from mini cart', () => {
      cy.get('[data-testid="cart-icon"]').click();
      cy.get('[data-testid="cart-mini-item"]').first().within(() => {
        cy.get('[data-testid="remove-mini-item"]').click();
      });
      
      cy.verifyToast('Item removed', 'success');
      cy.get('[data-testid="cart-mini-item"]').should('not.exist');
    });
  });

  describe('Guest Cart', () => {
    it('should persist guest cart after login', () => {
      // Add items as guest
      cy.clearCookies();
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        cy.get('[data-testid="add-to-cart-button"]').click();
        
        // Login
        cy.login(users.customer.email, users.customer.password);
        
        // Verify cart persisted
        cy.goToCart();
        cy.get('[data-testid="cart-item"]').should('have.length', 1);
      });
    });
  });

  describe('Cart Validation', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.addToCart(products.laptop.id, 1);
      });
      cy.goToCart();
    });

    it('should validate stock on quantity increase', () => {
      // Try to increase quantity beyond stock
      cy.get('[data-testid="cart-item"]').first().within(() => {
        cy.get('[data-testid="cart-item-quantity"]').clear().type('999');
        cy.get('[data-testid="update-quantity"]').click();
      });
      
      cy.verifyToast('Not enough stock available', 'error');
    });

    it('should prevent checkout with empty cart', () => {
      cy.clearCart();
      
      cy.get('[data-testid="checkout-button"]').should('be.disabled');
    });

    it('should show out of stock items', () => {
      // Simulate product going out of stock
      cy.fixture('products').then((products) => {
        cy.mockApi('GET', `/api/v1/products/${products.laptop.id}/stock`, {
          available: false,
          quantity: 0
        });
        
        cy.reload();
        
        cy.get('[data-testid="cart-item-out-of-stock"]').should('be.visible');
        cy.get('[data-testid="checkout-button"]').should('be.disabled');
      });
    });
  });
});
