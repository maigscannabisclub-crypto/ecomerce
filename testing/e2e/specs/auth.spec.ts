/**
 * Authentication E2E Tests
 * Tests de flujos de autenticación
 */
describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Registration', () => {
    it('should register a new user successfully', () => {
      const userData = {
        email: `test${Date.now()}@example.com`,
        password: 'Test123!',
        firstName: 'Test',
        lastName: 'User'
      };

      cy.visit('/register');
      
      // Fill registration form
      cy.get('[data-testid="firstName-input"]').type(userData.firstName);
      cy.get('[data-testid="lastName-input"]').type(userData.lastName);
      cy.get('[data-testid="email-input"]').type(userData.email);
      cy.get('[data-testid="password-input"]').type(userData.password);
      cy.get('[data-testid="confirmPassword-input"]').type(userData.password);
      
      // Submit form
      cy.get('[data-testid="register-button"]').click();
      
      // Verify success
      cy.url().should('include', '/login');
      cy.verifyToast('Registration successful', 'success');
    });

    it('should show error for existing email', () => {
      cy.fixture('users').then((users) => {
        cy.visit('/register');
        
        cy.get('[data-testid="firstName-input"]').type('Test');
        cy.get('[data-testid="lastName-input"]').type('User');
        cy.get('[data-testid="email-input"]').type(users.customer.email);
        cy.get('[data-testid="password-input"]').type('Test123!');
        cy.get('[data-testid="confirmPassword-input"]').type('Test123!');
        
        cy.get('[data-testid="register-button"]').click();
        
        cy.verifyToast('Email already exists', 'error');
      });
    });

    it('should validate password requirements', () => {
      cy.visit('/register');
      
      cy.get('[data-testid="firstName-input"]').type('Test');
      cy.get('[data-testid="lastName-input"]').type('User');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('weak');
      cy.get('[data-testid="confirmPassword-input"]').type('weak');
      
      cy.get('[data-testid="register-button"]').click();
      
      cy.get('[data-testid="password-error"]')
        .should('be.visible')
        .and('contain', 'Password must be at least 8 characters');
    });

    it('should validate matching passwords', () => {
      cy.visit('/register');
      
      cy.get('[data-testid="firstName-input"]').type('Test');
      cy.get('[data-testid="lastName-input"]').type('User');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('Test123!');
      cy.get('[data-testid="confirmPassword-input"]').type('Different123!');
      
      cy.get('[data-testid="register-button"]').click();
      
      cy.get('[data-testid="confirmPassword-error"]')
        .should('be.visible')
        .and('contain', 'Passwords do not match');
    });
  });

  describe('Login', () => {
    it('should login with valid credentials', () => {
      cy.fixture('users').then((users) => {
        cy.visit('/login');
        
        cy.get('[data-testid="email-input"]').type(users.customer.email);
        cy.get('[data-testid="password-input"]').type(users.customer.password);
        cy.get('[data-testid="login-button"]').click();
        
        // Verify successful login
        cy.url().should('eq', Cypress.config().baseUrl + '/');
        cy.get('[data-testid="user-menu"]').should('be.visible');
        cy.get('[data-testid="user-name"]').should('contain', users.customer.firstName);
      });
    });

    it('should show error for invalid credentials', () => {
      cy.visit('/login');
      
      cy.get('[data-testid="email-input"]').type('wrong@example.com');
      cy.get('[data-testid="password-input"]').type('WrongPassword123!');
      cy.get('[data-testid="login-button"]').click();
      
      cy.verifyToast('Invalid email or password', 'error');
    });

    it('should show error for empty fields', () => {
      cy.visit('/login');
      
      cy.get('[data-testid="login-button"]').click();
      
      cy.get('[data-testid="email-error"]')
        .should('be.visible')
        .and('contain', 'Email is required');
      
      cy.get('[data-testid="password-error"]')
        .should('be.visible')
        .and('contain', 'Password is required');
    });

    it('should remember user session', () => {
      cy.fixture('users').then((users) => {
        // Login
        cy.login(users.customer.email, users.customer.password);
        
        // Reload page
        cy.reload();
        
        // Verify still logged in
        cy.get('[data-testid="user-menu"]').should('be.visible');
      });
    });
  });

  describe('Logout', () => {
    it('should logout successfully', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.customer.email, users.customer.password);
        
        // Open user menu
        cy.get('[data-testid="user-menu"]').click();
        cy.get('[data-testid="logout-button"]').click();
        
        // Verify logged out
        cy.url().should('include', '/login');
        cy.get('[data-testid="login-page"]').should('be.visible');
      });
    });
  });

  describe('Password Reset', () => {
    it('should request password reset', () => {
      cy.visit('/forgot-password');
      
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="reset-password-button"]').click();
      
      cy.verifyToast('Password reset email sent', 'success');
    });

    it('should validate email on password reset', () => {
      cy.visit('/forgot-password');
      
      cy.get('[data-testid="reset-password-button"]').click();
      
      cy.get('[data-testid="email-error"]')
        .should('be.visible')
        .and('contain', 'Email is required');
    });
  });

  describe('Protected Routes', () => {
    it('should redirect to login when accessing protected route', () => {
      cy.visit('/orders');
      
      cy.url().should('include', '/login');
      cy.get('[data-testid="login-page"]').should('be.visible');
    });

    it('should allow access to protected route after login', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.customer.email, users.customer.password);
        
        cy.visit('/orders');
        
        cy.url().should('include', '/orders');
        cy.get('[data-testid="orders-page"]').should('be.visible');
      });
    });
  });

  describe('Admin Access', () => {
    it('should access admin panel with admin credentials', () => {
      cy.loginAsAdmin();
      
      cy.visit('/admin');
      
      cy.get('[data-testid="admin-dashboard"]').should('be.visible');
    });

    it('should deny admin access for regular users', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.customer.email, users.customer.password);
        
        cy.visit('/admin');
        
        cy.verifyToast('Access denied', 'error');
        cy.url().should('not.include', '/admin');
      });
    });
  });
});
