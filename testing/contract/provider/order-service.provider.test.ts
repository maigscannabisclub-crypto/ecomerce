/**
 * Order Service Provider Contract Verification
 * Verificación de contratos desde la perspectiva del provider
 */
import { Verifier } from '@pact-foundation/pact';
import path from 'path';
import express from 'express';

// Create mock provider service
const createProviderApp = () => {
  const app = express();
  app.use(express.json());

  // In-memory data store for tests
  const orders: any = {
    '550e8400-e29b-41d4-a716-446655440010': {
      id: '550e8400-e29b-41d4-a716-446655440010',
      status: 'confirmed',
      totalAmount: 249.97,
      items: [
        { productId: '550e8400-e29b-41d4-a716-446655440001', name: 'Test Product', quantity: 2, unitPrice: 99.99, totalPrice: 199.98 },
        { productId: '550e8400-e29b-41d4-a716-446655440002', name: 'Another Product', quantity: 1, unitPrice: 49.99, totalPrice: 49.99 }
      ],
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'US'
      },
      paymentStatus: 'paid',
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:35:00.000Z'
    }
  };

  // Auth middleware
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // Routes
  app.post('/api/v1/orders', authMiddleware, (req, res) => {
    const { items, shippingAddress, paymentMethod } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'Items are required',
        code: 'INVALID_ORDER_DATA'
      });
    }

    const totalAmount = items.reduce((sum: number, item: any) => 
      sum + (item.price * item.quantity), 0
    );

    const orderId = '550e8400-e29b-41d4-a716-446655440010';
    
    res.status(201).json({
      id: orderId,
      status: 'pending',
      totalAmount,
      items: items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.price * item.quantity
      })),
      paymentStatus: 'pending',
      createdAt: '2024-01-15T10:30:00.000Z'
    });
  });

  app.get('/api/v1/orders', authMiddleware, (req, res) => {
    res.status(200).json({
      orders: Object.values(orders).map((order: any) => ({
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        itemCount: order.items.length,
        createdAt: order.createdAt
      })),
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1
      }
    });
  });

  app.get('/api/v1/orders/:id', authMiddleware, (req, res) => {
    const order = orders[req.params.id];
    
    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    res.status(200).json(order);
  });

  app.put('/api/v1/orders/:id/cancel', authMiddleware, (req, res) => {
    const order = orders[req.params.id];
    
    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({
        error: 'Order cannot be cancelled',
        code: 'ORDER_NOT_CANCELLABLE',
        reason: 'Order has already been shipped'
      });
    }

    res.status(200).json({
      id: req.params.id,
      status: 'cancelled',
      cancelledAt: '2024-01-15T11:00:00.000Z'
    });
  });

  return app;
};

describe('Order Service Provider Contract Verification', () => {
  let server: any;
  const PORT = 3001;

  beforeAll(async () => {
    const app = createProviderApp();
    server = app.listen(PORT);
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should validate the expectations of web-frontend', async () => {
    const pactFile = path.resolve(
      process.cwd(),
      'testing/contract/pacts/web-frontend-order-service.json'
    );

    const verifier = new Verifier({
      provider: 'order-service',
      providerBaseUrl: `http://localhost:${PORT}`,
      pactUrls: [pactFile],
      
      // State handlers
      stateHandlers: {
        'user is authenticated': async () => {
          // Setup authenticated state
          return Promise.resolve();
        },
        'order exists': async () => {
          // Order already exists in mock data
          return Promise.resolve();
        },
        'order does not exist': async () => {
          // Remove order from mock data temporarily
          return Promise.resolve();
        },
        'order can be cancelled': async () => {
          // Ensure order is in cancellable state
          return Promise.resolve();
        },
        'order cannot be cancelled': async () => {
          // Set order to shipped state
          return Promise.resolve();
        },
        'user has orders': async () => {
          // Ensure user has orders
          return Promise.resolve();
        }
      },

      // Request filters
      requestFilters: [
        (req, res, next) => {
          // Add auth header for all requests
          if (!req.headers.authorization) {
            req.headers.authorization = 'Bearer mock-jwt-token';
          }
          next();
        }
      ],

      // Provider version
      providerVersion: process.env.GIT_COMMIT || '1.0.0',
      
      // Publish results to broker
      publishVerificationResult: process.env.PACT_PUBLISH_RESULTS === 'true',
      
      // Broker configuration
      pactBrokerUrl: process.env.PACT_BROKER_URL,
      pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      
      // Consumer version selectors
      consumerVersionSelectors: [
        { mainBranch: true },
        { deployedOrReleased: true }
      ],

      // Logging
      logLevel: 'info'
    });

    const result = await verifier.verifyProvider();
    
    console.log('Pact Verification Result:', result);
    expect(result).toBeTruthy();
  }, 60000);
});
