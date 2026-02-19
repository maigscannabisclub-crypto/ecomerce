/**
 * Product Management E2E Tests
 * Tests de gestión de productos
 */
describe('Product Management', () => {
  describe('Product Listing', () => {
    beforeEach(() => {
      cy.visit('/products');
    });

    it('should display product list', () => {
      cy.get('[data-testid="products-grid"]').should('be.visible');
      cy.get('[data-testid="product-card"]').should('have.length.at.least', 1);
    });

    it('should display product information', () => {
      cy.get('[data-testid="product-card"]').first().within(() => {
        cy.get('[data-testid="product-name"]').should('be.visible');
        cy.get('[data-testid="product-price"]').should('be.visible');
        cy.get('[data-testid="product-image"]').should('be.visible');
      });
    });

    it('should navigate to product detail', () => {
      cy.fixture('products').then((products) => {
        cy.get('[data-testid="product-card"]')
          .contains(products.laptop.name)
          .click();
        
        cy.url().should('include', `/products/${products.laptop.id}`);
        cy.get('[data-testid="product-detail"]').should('be.visible');
        cy.get('[data-testid="product-name"]').should('contain', products.laptop.name);
      });
    });

    it('should filter products by category', () => {
      cy.get('[data-testid="category-filter"]').click();
      cy.get('[data-testid="category-electronics"]').click();
      
      cy.get('[data-testid="product-card"]').each(($card) => {
        cy.wrap($card).should('contain', 'Electronics');
      });
    });

    it('should sort products by price', () => {
      cy.get('[data-testid="sort-dropdown"]').select('price-asc');
      
      cy.get('[data-testid="product-price"]').then(($prices) => {
        const prices = $prices.map((i, el) => 
          parseFloat(el.innerText.replace('$', ''))
        ).get();
        
        // Check if prices are sorted in ascending order
        for (let i = 0; i < prices.length - 1; i++) {
          expect(prices[i]).to.be.at.most(prices[i + 1]);
        }
      });
    });

    it('should paginate products', () => {
      // Assuming more than 12 products exist
      cy.get('[data-testid="pagination"]').should('be.visible');
      cy.get('[data-testid="next-page"]').click();
      
      cy.url().should('include', 'page=2');
      cy.get('[data-testid="product-card"]').should('be.visible');
    });
  });

  describe('Product Search', () => {
    it('should search products by name', () => {
      cy.fixture('products').then((products) => {
        cy.searchProducts(products.laptop.name);
        
        cy.get('[data-testid="product-card"]').should('contain', products.laptop.name);
      });
    });

    it('should show no results for invalid search', () => {
      cy.searchProducts('xyznonexistent123');
      
      cy.get('[data-testid="no-results"]').should('be.visible');
      cy.get('[data-testid="product-card"]').should('not.exist');
    });

    it('should clear search results', () => {
      cy.searchProducts('laptop');
      
      cy.get('[data-testid="clear-search"]').click();
      
      cy.get('[data-testid="search-input"]').should('have.value', '');
      cy.get('[data-testid="products-grid"]').should('be.visible');
    });
  });

  describe('Product Detail', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
      });
    });

    it('should display product details', () => {
      cy.fixture('products').then((products) => {
        cy.get('[data-testid="product-name"]').should('contain', products.laptop.name);
        cy.get('[data-testid="product-description"]').should('contain', products.laptop.description);
        cy.get('[data-testid="product-price"]').should('contain', products.laptop.price);
        cy.get('[data-testid="product-sku"]').should('contain', products.laptop.sku);
      });
    });

    it('should display product images', () => {
      cy.get('[data-testid="product-images"]').should('be.visible');
      cy.get('[data-testid="product-image"]').should('have.length.at.least', 1);
    });

    it('should display product specifications', () => {
      cy.get('[data-testid="product-specifications"]').should('be.visible');
      cy.get('[data-testid="spec-item"]').should('have.length.at.least', 1);
    });

    it('should show stock availability', () => {
      cy.get('[data-testid="stock-status"]').should('be.visible');
      cy.get('[data-testid="stock-quantity"]').should('contain', 'In Stock');
    });

    it('should show out of stock for unavailable products', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.lowStockProduct.id}`);
        
        cy.get('[data-testid="stock-status"]').should('contain', 'Out of Stock');
        cy.get('[data-testid="add-to-cart-button"]').should('be.disabled');
      });
    });

    it('should adjust quantity', () => {
      cy.get('[data-testid="quantity-input"]').clear().type('3');
      cy.get('[data-testid="quantity-input"]').should('have.value', '3');
    });

    it('should validate quantity limits', () => {
      cy.get('[data-testid="quantity-input"]').clear().type('0');
      cy.get('[data-testid="quantity-error"]')
        .should('be.visible')
        .and('contain', 'Quantity must be at least 1');
    });
  });

  describe('Admin Product Management', () => {
    beforeEach(() => {
      cy.loginAsAdmin();
    });

    it('should create a new product', () => {
      const newProduct = {
        name: 'New Test Product',
        description: 'This is a test product created via E2E tests',
        price: 199.99,
        sku: `TEST-${Date.now()}`,
        category: 'electronics',
        stockQuantity: 50
      };

      cy.createProduct(newProduct);
      
      // Verify product was created
      cy.visit('/admin/products');
      cy.get('[data-testid="products-table"]').should('contain', newProduct.name);
    });

    it('should edit existing product', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/admin/products/${products.laptop.id}/edit`);
        
        const newName = 'Updated Laptop Name';
        cy.get('[data-testid="product-name"]').clear().type(newName);
        cy.get('[data-testid="save-product-button"]').click();
        
        cy.verifyToast('Product updated successfully', 'success');
        
        // Verify update
        cy.visit(`/products/${products.laptop.id}`);
        cy.get('[data-testid="product-name"]').should('contain', newName);
      });
    });

    it('should update product stock', () => {
      cy.fixture('products').then((products) => {
        cy.updateStock(products.laptop.id, 25);
        
        // Verify stock update
        cy.visit(`/products/${products.laptop.id}`);
        cy.get('[data-testid="stock-quantity"]').should('contain', '25');
      });
    });

    it('should upload product images', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/admin/products/${products.laptop.id}/edit`);
        
        cy.get('[data-testid="image-upload"]').selectFile(
          'cypress/fixtures/test-image.jpg',
          { force: true }
        );
        
        cy.get('[data-testid="upload-progress"]').should('be.visible');
        cy.verifyToast('Image uploaded successfully', 'success');
      });
    });

    it('should delete product', () => {
      // First create a product to delete
      const productToDelete = {
        name: 'Product To Delete',
        description: 'This product will be deleted',
        price: 99.99,
        sku: `DELETE-${Date.now()}`,
        category: 'electronics',
        stockQuantity: 10
      };

      cy.createProduct(productToDelete);
      
      cy.visit('/admin/products');
      cy.get('[data-testid="products-table"]')
        .contains(productToDelete.name)
        .parents('tr')
        .find('[data-testid="delete-product"]')
        .click();
      
      cy.get('[data-testid="confirm-delete"]').click();
      
      cy.verifyToast('Product deleted successfully', 'success');
      cy.get('[data-testid="products-table"]').should('not.contain', productToDelete.name);
    });

    it('should validate required fields', () => {
      cy.visit('/admin/products/new');
      
      cy.get('[data-testid="save-product-button"]').click();
      
      cy.get('[data-testid="name-error"]')
        .should('be.visible')
        .and('contain', 'Name is required');
      
      cy.get('[data-testid="price-error"]')
        .should('be.visible')
        .and('contain', 'Price is required');
      
      cy.get('[data-testid="sku-error"]')
        .should('be.visible')
        .and('contain', 'SKU is required');
    });

    it('should validate unique SKU', () => {
      cy.fixture('products').then((products) => {
        cy.visit('/admin/products/new');
        
        cy.get('[data-testid="product-name"]').type('Duplicate SKU Product');
        cy.get('[data-testid="product-price"]').type('99.99');
        cy.get('[data-testid="product-sku"]').type(products.laptop.sku);
        cy.get('[data-testid="product-category"]').select('electronics');
        
        cy.get('[data-testid="save-product-button"]').click();
        
        cy.verifyToast('SKU already exists', 'error');
      });
    });
  });

  describe('Product Reviews', () => {
    beforeEach(() => {
      cy.fixture('users').then((users) => {
        cy.login(users.customer.email, users.customer.password);
      });
    });

    it('should display product reviews', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        
        cy.get('[data-testid="reviews-section"]').should('be.visible');
        cy.get('[data-testid="review-item"]').should('have.length.at.least', 0);
      });
    });

    it('should submit a review', () => {
      cy.fixture('products').then((products) => {
        cy.visit(`/products/${products.laptop.id}`);
        
        cy.get('[data-testid="write-review"]').click();
        cy.get('[data-testid="rating-stars"]').find('[data-value="5"]').click();
        cy.get('[data-testid="review-text"]').type('Great product! Highly recommended.');
        cy.get('[data-testid="submit-review"]').click();
        
        cy.verifyToast('Review submitted successfully', 'success');
      });
    });
  });
});
