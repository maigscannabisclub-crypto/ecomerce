import { Router, Request, Response } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { config } from '../config';
import { authenticate, requireRole } from '../middleware/auth';
import { authRateLimiter, reportRateLimiter } from '../middleware/rateLimiter';
import { createProxyHeaders } from '../middleware/correlation';
import { proxyErrorHandler } from '../middleware/errorHandler';
import { logger } from '../middleware/logger';
import { UserRole, AuthenticatedRequest, GatewayHealthResponse, ServiceHealth } from '../types';

const router = Router();

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

/**
 * Basic health check - liveness probe
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * Readiness probe - checks if gateway is ready to accept traffic
 */
router.get('/health/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    uptime: process.uptime()
  });
});

/**
 * Liveness probe - basic check that service is running
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Comprehensive health check with service status
 */
router.get('/health/detailed', async (_req: Request, res: Response) => {
  const services: ServiceHealth[] = [
    { name: 'auth', status: 'healthy', url: config.services.auth.url, lastChecked: new Date().toISOString() },
    { name: 'products', status: 'healthy', url: config.services.products.url, lastChecked: new Date().toISOString() },
    { name: 'cart', status: 'healthy', url: config.services.cart.url, lastChecked: new Date().toISOString() },
    { name: 'orders', status: 'healthy', url: config.services.orders.url, lastChecked: new Date().toISOString() },
    { name: 'inventory', status: 'healthy', url: config.services.inventory.url, lastChecked: new Date().toISOString() },
    { name: 'reporting', status: 'healthy', url: config.services.reporting.url, lastChecked: new Date().toISOString() }
  ];

  const healthResponse: GatewayHealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services
  };

  res.status(200).json(healthResponse);
});

// ============================================
// PROXY CONFIGURATION FACTORY
// ============================================

/**
 * Create proxy middleware with common configuration
 */
const createServiceProxy = (
  serviceName: string,
  serviceUrl: string,
  options: {
    pathRewrite?: Record<string, string>;
    timeout?: number;
    requireAuth?: boolean;
    allowedRoles?: UserRole[];
  } = {}
) => {
  const {
    pathRewrite,
    timeout = 30000,
    requireAuth = false,
    allowedRoles
  } = options;

  const proxyOptions: Options = {
    target: serviceUrl,
    changeOrigin: true,
    timeout,
    proxyTimeout: timeout,
    pathRewrite,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        const authReq = req as AuthenticatedRequest;
        
        // Add correlation and auth headers
        const headers = createProxyHeaders(req);
        Object.entries(headers).forEach(([key, value]) => {
          proxyReq.setHeader(key, value);
        });

        logger.debug(`Proxying request to ${serviceName}`, {
          correlationId: authReq.correlationId,
          path: req.path,
          method: req.method,
          target: serviceUrl
        });
      },
      proxyRes: (proxyRes, req: Request) => {
        const authReq = req as AuthenticatedRequest;
        
        // Log response
        logger.debug(`Received response from ${serviceName}`, {
          correlationId: authReq.correlationId,
          path: req.path,
          statusCode: proxyRes.statusCode
        });
      },
      error: (err, req: Request, res: Response) => {
        proxyErrorHandler(err, req, res, () => {});
      }
    },
    logLevel: config.env === 'development' ? 'debug' : 'silent'
  };

  const middleware = createProxyMiddleware(proxyOptions);

  // Return array of middlewares (auth + proxy)
  const middlewares = [];
  
  if (requireAuth) {
    middlewares.push(authenticate);
    
    if (allowedRoles && allowedRoles.length > 0) {
      middlewares.push(requireRole(...allowedRoles));
    }
  }
  
  middlewares.push(middleware);
  
  return middlewares;
};

// ============================================
// AUTH SERVICE ROUTES (Port 3001)
// ============================================

// Public auth routes with stricter rate limiting
router.use(
  '/api/v1/auth/register',
  authRateLimiter,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    }
  })
);

router.use(
  '/api/v1/auth/login',
  authRateLimiter,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    }
  })
);

router.use(
  '/api/v1/auth/refresh',
  authRateLimiter,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    }
  })
);

// Protected auth routes
router.use(
  '/api/v1/auth/logout',
  authenticate,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    },
    requireAuth: true
  })
);

router.use(
  '/api/v1/auth/me',
  authenticate,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    },
    requireAuth: true
  })
);

router.use(
  '/api/v1/auth/change-password',
  authenticate,
  createServiceProxy('auth-service', config.services.auth.url, {
    pathRewrite: {
      '^/api/v1/auth': '/auth'
    },
    requireAuth: true
  })
);

// ============================================
// PRODUCTS SERVICE ROUTES (Port 3002) - PUBLIC
// ============================================

// Public product routes
router.use(
  '/api/v1/products',
  createServiceProxy('products-service', config.services.products.url, {
    pathRewrite: {
      '^/api/v1/products': '/products'
    },
    requireAuth: false
  })
);

// Individual product routes
router.use(
  '/api/v1/products/:id',
  createServiceProxy('products-service', config.services.products.url, {
    pathRewrite: {
      '^/api/v1/products': '/products'
    },
    requireAuth: false
  })
);

// Product search
router.use(
  '/api/v1/search/products',
  createServiceProxy('products-service', config.services.products.url, {
    pathRewrite: {
      '^/api/v1/search/products': '/search'
    },
    requireAuth: false
  })
);

// Protected product management routes (admin only)
router.use(
  '/api/v1/admin/products',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  createServiceProxy('products-service', config.services.products.url, {
    pathRewrite: {
      '^/api/v1/admin/products': '/admin/products'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// ============================================
// CART SERVICE ROUTES (Port 3003) - PROTECTED
// ============================================

// All cart routes require authentication
router.use(
  '/api/v1/cart',
  authenticate,
  createServiceProxy('cart-service', config.services.cart.url, {
    pathRewrite: {
      '^/api/v1/cart': '/cart'
    },
    requireAuth: true
  })
);

// Cart item operations
router.use(
  '/api/v1/cart/items',
  authenticate,
  createServiceProxy('cart-service', config.services.cart.url, {
    pathRewrite: {
      '^/api/v1/cart/items': '/cart/items'
    },
    requireAuth: true
  })
);

// Cart checkout
router.use(
  '/api/v1/cart/checkout',
  authenticate,
  createServiceProxy('cart-service', config.services.cart.url, {
    pathRewrite: {
      '^/api/v1/cart/checkout': '/cart/checkout'
    },
    requireAuth: true
  })
);

// ============================================
// ORDERS SERVICE ROUTES (Port 3004) - PROTECTED
// ============================================

// User order routes
router.use(
  '/api/v1/orders',
  authenticate,
  createServiceProxy('orders-service', config.services.orders.url, {
    pathRewrite: {
      '^/api/v1/orders': '/orders'
    },
    requireAuth: true
  })
);

// Order operations
router.use(
  '/api/v1/orders/:id',
  authenticate,
  createServiceProxy('orders-service', config.services.orders.url, {
    pathRewrite: {
      '^/api/v1/orders': '/orders'
    },
    requireAuth: true
  })
);

// Order tracking (can be public with order number)
router.use(
  '/api/v1/orders/track/:trackingNumber',
  createServiceProxy('orders-service', config.services.orders.url, {
    pathRewrite: {
      '^/api/v1/orders/track': '/orders/track'
    },
    requireAuth: false
  })
);

// Admin order management
router.use(
  '/api/v1/admin/orders',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT),
  createServiceProxy('orders-service', config.services.orders.url, {
    pathRewrite: {
      '^/api/v1/admin/orders': '/admin/orders'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT]
  })
);

// ============================================
// INVENTORY SERVICE ROUTES (Port 3005) - PROTECTED
// ============================================

// Inventory check by product ID
router.use(
  '/api/v1/inventory/:productId',
  authenticate,
  createServiceProxy('inventory-service', config.services.inventory.url, {
    pathRewrite: {
      '^/api/v1/inventory': '/inventory'
    },
    requireAuth: true
  })
);

// Bulk inventory check
router.use(
  '/api/v1/inventory/bulk',
  authenticate,
  createServiceProxy('inventory-service', config.services.inventory.url, {
    pathRewrite: {
      '^/api/v1/inventory/bulk': '/inventory/bulk'
    },
    requireAuth: true
  })
);

// Inventory reservations
router.use(
  '/api/v1/inventory/reserve',
  authenticate,
  createServiceProxy('inventory-service', config.services.inventory.url, {
    pathRewrite: {
      '^/api/v1/inventory/reserve': '/inventory/reserve'
    },
    requireAuth: true
  })
);

// Release reservation
router.use(
  '/api/v1/inventory/release',
  authenticate,
  createServiceProxy('inventory-service', config.services.inventory.url, {
    pathRewrite: {
      '^/api/v1/inventory/release': '/inventory/release'
    },
    requireAuth: true
  })
);

// Admin inventory management
router.use(
  '/api/v1/admin/inventory',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  createServiceProxy('inventory-service', config.services.inventory.url, {
    pathRewrite: {
      '^/api/v1/admin/inventory': '/admin/inventory'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// ============================================
// REPORTING SERVICE ROUTES (Port 3006) - ADMIN ONLY
// ============================================

// Reports with rate limiting
router.use(
  '/api/v1/reports',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  reportRateLimiter,
  createServiceProxy('reporting-service', config.services.reporting.url, {
    pathRewrite: {
      '^/api/v1/reports': '/reports'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// Sales reports
router.use(
  '/api/v1/reports/sales',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  reportRateLimiter,
  createServiceProxy('reporting-service', config.services.reporting.url, {
    pathRewrite: {
      '^/api/v1/reports/sales': '/reports/sales'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// Inventory reports
router.use(
  '/api/v1/reports/inventory',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  reportRateLimiter,
  createServiceProxy('reporting-service', config.services.reporting.url, {
    pathRewrite: {
      '^/api/v1/reports/inventory': '/reports/inventory'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// Customer reports
router.use(
  '/api/v1/reports/customers',
  authenticate,
  requireRole(UserRole.ADMIN),
  reportRateLimiter,
  createServiceProxy('reporting-service', config.services.reporting.url, {
    pathRewrite: {
      '^/api/v1/reports/customers': '/reports/customers'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN]
  })
);

// Export reports
router.use(
  '/api/v1/reports/export',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  reportRateLimiter,
  createServiceProxy('reporting-service', config.services.reporting.url, {
    pathRewrite: {
      '^/api/v1/reports/export': '/reports/export'
    },
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]
  })
);

// ============================================
// API INFO ENDPOINT
// ============================================

router.get('/api/v1', (_req: Request, res: Response) => {
  res.json({
    name: 'E-Commerce API Gateway',
    version: '1.0.0',
    description: 'Enterprise API Gateway for E-Commerce Platform',
    documentation: '/api/v1/docs',
    health: '/health',
    endpoints: {
      auth: {
        base: '/api/v1/auth',
        public: ['/register', '/login', '/refresh'],
        protected: ['/logout', '/me', '/change-password']
      },
      products: {
        base: '/api/v1/products',
        public: ['GET /', 'GET /:id'],
        protected: ['POST /', 'PUT /:id', 'DELETE /:id']
      },
      cart: {
        base: '/api/v1/cart',
        protected: ['GET /', 'POST /', 'PUT /', 'DELETE /']
      },
      orders: {
        base: '/api/v1/orders',
        protected: ['GET /', 'POST /', 'GET /:id']
      },
      inventory: {
        base: '/api/v1/inventory',
        protected: ['GET /:productId', 'POST /reserve', 'POST /release']
      },
      reports: {
        base: '/api/v1/reports',
        admin: ['GET /', 'GET /sales', 'GET /inventory', 'GET /customers', 'POST /export']
      }
    }
  });
});

export default router;
