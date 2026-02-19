/**
 * Order Service Consumer Contract Tests
 * Tests de contrato desde la perspectiva del consumidor (frontend/web)
 */
import { Pact } from '@pact-foundation/pact';
import path from 'path';
import axios from 'axios';

const MOCK_SERVER_PORT = 8991;
const PROVIDER_NAME = 'order-service';
const CONSUMER_NAME = 'web-frontend';

describe('Order Service Consumer Contract Tests', () => {
  const provider = new Pact({
    consumer: CONSUMER_NAME,
    provider: PROVIDER_NAME,
    port: MOCK_SERVER_PORT,
    log: path.resolve(process.cwd(), 'testing/contract/logs', 'order-service.log'),
    dir: path.resolve(process.cwd(), 'testing/contract/pacts'),
    logLevel: 'warn',
    pactfileWriteMode: 'merge'
  });

  beforeAll(async () => {
    await provider.setup();
  });

  afterAll(async () => {
    await provider.finalize();
  });

  afterEach(async () => {
    await provider.verify();
  });

  describe('Create Order', () => {
    it('should create a new order', async () => {
      const orderRequest = {
        items: [
          { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 2, price: 99.99 },
          { productId: '550e8400-e29b-41d4-a716-446655440002', quantity: 1, price: 49.99 }
        ],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        paymentMethod: 'credit_card'
      };

      const expectedResponse = {
        id: '550e8400-e29b-41d4-a716-446655440010',
        status: 'pending',
        totalAmount: 249.97,
        items: [
          { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 2, unitPrice: 99.99, totalPrice: 199.98 },
          { productId: '550e8400-e29b-41d4-a716-446655440002', quantity: 1, unitPrice: 49.99, totalPrice: 49.99 }
        ],
        paymentStatus: 'pending',
        createdAt: '2024-01-15T10:30:00.000Z'
      };

      await provider.addInteraction({
        state: 'user is authenticated',
        uponReceiving: 'a request to create a new order',
        withRequest: {
          method: 'POST',
          path: '/api/v1/orders',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-jwt-token'
          },
          body: orderRequest
        },
        willRespondWith: {
          status: 201,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      });

      const response = await axios.post(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders`,
        orderRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-jwt-token'
          }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data).toMatchObject(expectedResponse);
    });

    it('should return 400 for invalid order data', async () => {
      const invalidRequest = {
        items: [], // Empty items
        shippingAddress: {}
      };

      await provider.addInteraction({
        state: 'user is authenticated',
        uponReceiving: 'a request to create order with invalid data',
        withRequest: {
          method: 'POST',
          path: '/api/v1/orders',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-jwt-token'
          },
          body: invalidRequest
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: 'Items are required',
            code: 'INVALID_ORDER_DATA'
          }
        }
      });

      try {
        await axios.post(
          `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders`,
          invalidRequest,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer mock-jwt-token'
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe('Items are required');
      }
    });
  });

  describe('Get Order', () => {
    it('should return order by id', async () => {
      const orderId = '550e8400-e29b-41d4-a716-446655440010';

      const expectedResponse = {
        id: orderId,
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
      };

      await provider.addInteraction({
        state: 'order exists',
        uponReceiving: 'a request to get order by id',
        withRequest: {
          method: 'GET',
          path: `/api/v1/orders/${orderId}`,
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders/${orderId}`,
        {
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject(expectedResponse);
    });

    it('should return 404 for non-existent order', async () => {
      const orderId = '550e8400-e29b-41d4-a716-446655440999';

      await provider.addInteraction({
        state: 'order does not exist',
        uponReceiving: 'a request to get non-existent order',
        withRequest: {
          method: 'GET',
          path: `/api/v1/orders/${orderId}`,
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: 'Order not found',
            code: 'ORDER_NOT_FOUND'
          }
        }
      });

      try {
        await axios.get(
          `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders/${orderId}`,
          {
            headers: {
              'Authorization': 'Bearer mock-jwt-token'
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toBe('Order not found');
      }
    });
  });

  describe('Cancel Order', () => {
    it('should cancel an order', async () => {
      const orderId = '550e8400-e29b-41d4-a716-446655440010';

      await provider.addInteraction({
        state: 'order can be cancelled',
        uponReceiving: 'a request to cancel an order',
        withRequest: {
          method: 'PUT',
          path: `/api/v1/orders/${orderId}/cancel`,
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: orderId,
            status: 'cancelled',
            cancelledAt: '2024-01-15T11:00:00.000Z'
          }
        }
      });

      const response = await axios.put(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders/${orderId}/cancel`,
        {},
        {
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('cancelled');
    });

    it('should return 400 for order that cannot be cancelled', async () => {
      const orderId = '550e8400-e29b-41d4-a716-446655440011';

      await provider.addInteraction({
        state: 'order cannot be cancelled',
        uponReceiving: 'a request to cancel non-cancellable order',
        withRequest: {
          method: 'PUT',
          path: `/api/v1/orders/${orderId}/cancel`,
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: 'Order cannot be cancelled',
            code: 'ORDER_NOT_CANCELLABLE',
            reason: 'Order has already been shipped'
          }
        }
      });

      try {
        await axios.put(
          `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders/${orderId}/cancel`,
          {},
          {
            headers: {
              'Authorization': 'Bearer mock-jwt-token'
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.code).toBe('ORDER_NOT_CANCELLABLE');
      }
    });
  });

  describe('List Orders', () => {
    it('should return list of user orders', async () => {
      await provider.addInteraction({
        state: 'user has orders',
        uponReceiving: 'a request to list user orders',
        withRequest: {
          method: 'GET',
          path: '/api/v1/orders',
          query: { page: '1', limit: '10' },
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            orders: [
              {
                id: '550e8400-e29b-41d4-a716-446655440010',
                status: 'confirmed',
                totalAmount: 249.97,
                itemCount: 2,
                createdAt: '2024-01-15T10:30:00.000Z'
              },
              {
                id: '550e8400-e29b-41d4-a716-446655440011',
                status: 'delivered',
                totalAmount: 149.99,
                itemCount: 1,
                createdAt: '2024-01-10T14:20:00.000Z'
              }
            ],
            pagination: {
              page: 1,
              limit: 10,
              total: 2,
              totalPages: 1
            }
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/orders?page=1&limit=10`,
        {
          headers: {
            'Authorization': 'Bearer mock-jwt-token'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.orders).toHaveLength(2);
      expect(response.data.pagination.total).toBe(2);
    });
  });
});
