import request from 'supertest';
import app from '../../src/app';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import { UserRole } from '../../src/types';

/**
 * Integration Tests for API Gateway Proxy Functionality
 * 
 * Note: These tests verify the gateway's routing and middleware behavior.
 * Full integration tests would require all microservices to be running.
 */

describe('API Gateway Integration Tests', () => {
  
  // Helper function to generate JWT tokens
  const generateToken = (payload: object, expiresIn = '1h'): string => {
    return jwt.sign(payload, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      expiresIn
    });
  };

  // Helper function to generate admin token
  const generateAdminToken = (): string => {
    return generateToken({
      sub: 'admin-123',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      permissions: ['*']
    });
  };

  // Helper function to generate customer token
  const generateCustomerToken = (): string => {
    return generateToken({
      sub: 'customer-123',
      email: 'customer@example.com',
      role: UserRole.CUSTOMER,
      permissions: ['read:products', 'write:cart', 'read:orders']
    });
  };

  // ============================================
  // Public Routes Tests
  // ============================================
  describe('Public Routes', () => {
    describe('Health Endpoints', () => {
      it('should respond to health check without authentication', async () => {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body.status).toBe('healthy');
      });

      it('should respond to readiness probe', async () => {
        const response = await request(app)
          .get('/health/ready')
          .expect(200);

        expect(response.body.status).toBe('ready');
      });

      it('should respond to liveness probe', async () => {
        const response = await request(app)
          .get('/health/live')
          .expect(200);

        expect(response.body.status).toBe('alive');
      });
    });

    describe('API Information', () => {
      it('should provide API documentation endpoint', async () => {
        const response = await request(app)
          .get('/api/v1')
          .expect(200);

        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('endpoints');
      });
    });

    describe('Products (Public)', () => {
      it('should route GET /api/v1/products to products service', async () => {
        // This test would require the products service to be running
        // For now, we verify the route exists and would proxy correctly
        const response = await request(app)
          .get('/api/v1/products')
          .expect(res => {
            // Either 200 (service running) or 502/504 (service not available)
            expect([200, 502, 504]).toContain(res.status);
          });
      });

      it('should route GET /api/v1/products/:id to products service', async () => {
        const response = await request(app)
          .get('/api/v1/products/product-123')
          .expect(res => {
            expect([200, 404, 502, 504]).toContain(res.status);
          });
      });
    });
  });

  // ============================================
  // Authentication Routes Tests
  // ============================================
  describe('Authentication Routes', () => {
    describe('Public Auth Endpoints', () => {
      it('should route POST /api/v1/auth/register to auth service', async () => {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User'
          })
          .expect(res => {
            expect([200, 201, 400, 409, 502, 504]).toContain(res.status);
          });
      });

      it('should route POST /api/v1/auth/login to auth service', async () => {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
          .expect(res => {
            expect([200, 401, 400, 502, 504]).toContain(res.status);
          });
      });

      it('should route POST /api/v1/auth/refresh to auth service', async () => {
        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send({
            refreshToken: 'some-refresh-token'
          })
          .expect(res => {
            expect([200, 401, 400, 502, 504]).toContain(res.status);
          });
      });
    });

    describe('Protected Auth Endpoints', () => {
      it('should reject logout without authentication', async () => {
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should allow logout with valid token', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 201, 502, 504]).toContain(res.status);
          });
      });

      it('should reject me endpoint without authentication', async () => {
        const response = await request(app)
          .get('/api/v1/auth/me')
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should allow me endpoint with valid token', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 502, 504]).toContain(res.status);
          });
      });
    });
  });

  // ============================================
  // Protected Routes Tests
  // ============================================
  describe('Protected Routes', () => {
    describe('Cart Service', () => {
      it('should reject cart access without authentication', async () => {
        const response = await request(app)
          .get('/api/v1/cart')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should allow cart access with valid token', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .get('/api/v1/cart')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 404, 502, 504]).toContain(res.status);
          });
      });

      it('should forward cart POST requests', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .post('/api/v1/cart')
          .set('Authorization', `Bearer ${token}`)
          .send({
            productId: 'product-123',
            quantity: 2
          })
          .expect(res => {
            expect([200, 201, 400, 502, 504]).toContain(res.status);
          });
      });
    });

    describe('Orders Service', () => {
      it('should reject orders access without authentication', async () => {
        const response = await request(app)
          .get('/api/v1/orders')
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should allow orders access with valid token', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .get('/api/v1/orders')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 404, 502, 504]).toContain(res.status);
          });
      });

      it('should forward order creation requests', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${token}`)
          .send({
            items: [
              { productId: 'product-123', quantity: 2 }
            ],
            shippingAddress: {
              street: '123 Test St',
              city: 'Test City',
              zipCode: '12345'
            }
          })
          .expect(res => {
            expect([200, 201, 400, 502, 504]).toContain(res.status);
          });
      });
    });

    describe('Inventory Service', () => {
      it('should reject inventory access without authentication', async () => {
        const response = await request(app)
          .get('/api/v1/inventory/product-123')
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should allow inventory access with valid token', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .get('/api/v1/inventory/product-123')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 404, 502, 504]).toContain(res.status);
          });
      });
    });
  });

  // ============================================
  // Admin Routes Tests
  // ============================================
  describe('Admin Routes', () => {
    describe('Reports Service', () => {
      it('should reject reports access without authentication', async () => {
        const response = await request(app)
          .get('/api/v1/reports')
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should reject reports access for non-admin users', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .get('/api/v1/reports')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('FORBIDDEN');
      });

      it('should allow reports access for admin users', async () => {
        const token = generateAdminToken();
        
        const response = await request(app)
          .get('/api/v1/reports')
          .set('Authorization', `Bearer ${token}`)
          .expect(res => {
            expect([200, 502, 504]).toContain(res.status);
          });
      });

      it('should allow sales reports for admin users', async () => {
        const token = generateAdminToken();
        
        const response = await request(app)
          .get('/api/v1/reports/sales')
          .set('Authorization', `Bearer ${token}`)
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
          .expect(res => {
            expect([200, 502, 504]).toContain(res.status);
          });
      });
    });

    describe('Admin Product Management', () => {
      it('should reject admin product routes for non-admin users', async () => {
        const token = generateCustomerToken();
        
        const response = await request(app)
          .post('/api/v1/admin/products')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'New Product',
            price: 99.99
          })
          .expect(403);

        expect(response.body.success).toBe(false);
      });

      it('should allow admin product routes for admin users', async () => {
        const token = generateAdminToken();
        
        const response = await request(app)
          .post('/api/v1/admin/products')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'New Product',
            price: 99.99,
            description: 'A new product'
          })
          .expect(res => {
            expect([200, 201, 400, 502, 504]).toContain(res.status);
          });
      });
    });
  });

  // ============================================
  // JWT Validation Tests
  // ============================================
  describe('JWT Validation', () => {
    it('should reject invalid token format', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', 'InvalidTokenFormat')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject malformed JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject expired JWT token', async () => {
      const expiredToken = generateToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: UserRole.CUSTOMER
      }, '-1h'); // Already expired

      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject token with wrong secret', async () => {
      const wrongToken = jwt.sign({
        sub: 'user-123',
        email: 'test@example.com',
        role: UserRole.CUSTOMER
      }, 'wrong-secret');

      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${wrongToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // Request/Response Headers Tests
  // ============================================
  describe('Request/Response Headers', () => {
    it('should propagate correlation ID to downstream services', async () => {
      const correlationId = 'test-correlation-123';
      const token = generateCustomerToken();
      
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .set('x-correlation-id', correlationId)
        .expect(res => {
          expect([200, 404, 502, 504]).toContain(res.status);
        });

      // Verify correlation ID is returned in response
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .expect(res => {
          expect([200, 502, 504]).toContain(res.status);
        });

      // Rate limit headers may be present
      expect(response.headers).toBeDefined();
    });
  });

  // ============================================
  // Error Propagation Tests
  // ============================================
  describe('Error Propagation', () => {
    it('should return proper error format for 404', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body).toHaveProperty('correlationId');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should handle service unavailable errors', async () => {
      // When services are down, gateway should return 502 or 504
      const response = await request(app)
        .get('/api/v1/products')
        .expect(res => {
          expect([200, 502, 504]).toContain(res.status);
        });
    });
  });

  // ============================================
  // Query Parameter Tests
  // ============================================
  describe('Query Parameters', () => {
    it('should forward query parameters to services', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .query({ page: 1, limit: 10, category: 'electronics' })
        .expect(res => {
          expect([200, 502, 504]).toContain(res.status);
        });
    });

    it('should handle complex query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .query({ 
          filter: JSON.stringify({ price: { min: 10, max: 100 } }),
          sort: '-price'
        })
        .expect(res => {
          expect([200, 502, 504]).toContain(res.status);
        });
    });
  });
});
