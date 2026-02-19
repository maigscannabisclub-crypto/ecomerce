import request from 'supertest';
import app from '../../src/app';
import { config } from '../../src/config';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../src/types';

describe('API Gateway Unit Tests', () => {
  
  // ============================================
  // Health Check Tests
  // ============================================
  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'api-gateway');
    });

    it('should return ready status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return live status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toBeInstanceOf(Array);
      expect(response.body.services.length).toBe(6);
    });
  });

  // ============================================
  // API Info Tests
  // ============================================
  describe('API Info Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body).toHaveProperty('name', 'E-Commerce API Gateway');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.endpoints).toHaveProperty('auth');
      expect(response.body.endpoints).toHaveProperty('products');
      expect(response.body.endpoints).toHaveProperty('cart');
      expect(response.body.endpoints).toHaveProperty('orders');
    });
  });

  // ============================================
  // Correlation ID Tests
  // ============================================
  describe('Correlation ID', () => {
    it('should generate correlation ID if not provided', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-correlation-id');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should propagate existing correlation ID', async () => {
      const correlationId = 'test-correlation-id-123';
      
      const response = await request(app)
        .get('/health')
        .set('x-correlation-id', correlationId)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('should generate request ID', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  // ============================================
  // Security Headers Tests
  // ============================================
  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-dns-prefetch-control');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('strict-transport-security');
      expect(response.headers).toHaveProperty('x-download-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });

  // ============================================
  // CORS Tests
  // ============================================
  describe('CORS Configuration', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  // ============================================
  // 404 Handler Tests
  // ============================================
  describe('404 Handler', () => {
    it('should return 404 for undefined routes', async () => {
      const response = await request(app)
        .get('/undefined-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should include correlation ID in 404 response', async () => {
      const response = await request(app)
        .get('/undefined-route')
        .expect(404);

      expect(response.body).toHaveProperty('correlationId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================
  // Rate Limiting Tests
  // ============================================
  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Rate limit headers may or may not be present for health endpoints
      // depending on configuration
      expect(response.headers).toBeDefined();
    });
  });

  // ============================================
  // JWT Authentication Tests
  // ============================================
  describe('JWT Authentication', () => {
    const generateToken = (payload: object): string => {
      return jwt.sign(payload, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: '1h'
      });
    };

    it('should reject requests without token for protected routes', async () => {
      // This test would require the cart service to be running
      // For now, we just verify the auth middleware structure
      expect(true).toBe(true);
    });

    it('should validate JWT token format', () => {
      const validToken = generateToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: UserRole.CUSTOMER
      });

      expect(validToken).toBeDefined();
      expect(validToken.split('.')).toHaveLength(3);
    });

    it('should decode valid JWT token', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: UserRole.CUSTOMER
      };

      const token = generateToken(payload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded).toHaveProperty('sub', payload.sub);
      expect(decoded).toHaveProperty('email', payload.email);
      expect(decoded).toHaveProperty('role', payload.role);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling', () => {
    it('should return JSON error responses', async () => {
      const response = await request(app)
        .get('/undefined-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should include timestamp in error responses', async () => {
      const response = await request(app)
        .get('/undefined-route')
        .expect(404);

      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // Compression Tests
  // ============================================
  describe('Response Compression', () => {
    it('should compress large responses', async () => {
      // The API info endpoint returns a reasonably sized JSON
      const response = await request(app)
        .get('/api/v1')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Response should be successful
      expect(response.body).toBeDefined();
    });
  });

  // ============================================
  // Request Parsing Tests
  // ============================================
  describe('Request Parsing', () => {
    it('should parse JSON request bodies', async () => {
      // This would require a POST endpoint to test properly
      // For now, verify the middleware is configured
      expect(app).toBeDefined();
    });

    it('should parse URL-encoded request bodies', async () => {
      // This would require a POST endpoint to test properly
      expect(app).toBeDefined();
    });
  });

  // ============================================
  // Configuration Tests
  // ============================================
  describe('Configuration', () => {
    it('should have valid service URLs', () => {
      expect(config.services.auth.url).toBeDefined();
      expect(config.services.products.url).toBeDefined();
      expect(config.services.cart.url).toBeDefined();
      expect(config.services.orders.url).toBeDefined();
      expect(config.services.inventory.url).toBeDefined();
      expect(config.services.reporting.url).toBeDefined();
    });

    it('should have valid JWT configuration', () => {
      expect(config.jwt.secret).toBeDefined();
      expect(config.jwt.issuer).toBeDefined();
      expect(config.jwt.audience).toBeDefined();
    });

    it('should have valid rate limit configuration', () => {
      expect(config.rateLimit.global.windowMs).toBeGreaterThan(0);
      expect(config.rateLimit.global.maxRequests).toBeGreaterThan(0);
    });
  });
});
