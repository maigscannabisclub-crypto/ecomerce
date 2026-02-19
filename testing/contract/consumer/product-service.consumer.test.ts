/**
 * Product Service Consumer Contract Tests
 * Tests de contrato desde la perspectiva del consumidor
 */
import { Pact } from '@pact-foundation/pact';
import path from 'path';
import axios from 'axios';

const MOCK_SERVER_PORT = 8992;
const PROVIDER_NAME = 'product-service';
const CONSUMER_NAME = 'web-frontend';

describe('Product Service Consumer Contract Tests', () => {
  const provider = new Pact({
    consumer: CONSUMER_NAME,
    provider: PROVIDER_NAME,
    port: MOCK_SERVER_PORT,
    log: path.resolve(process.cwd(), 'testing/contract/logs', 'product-service.log'),
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

  describe('Get Products List', () => {
    it('should return paginated list of products', async () => {
      await provider.addInteraction({
        state: 'products exist',
        uponReceiving: 'a request to get products list',
        withRequest: {
          method: 'GET',
          path: '/api/v1/products',
          query: { page: '1', limit: '10' }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            products: [
              {
                id: '550e8400-e29b-41d4-a716-446655440001',
                name: 'Wireless Headphones',
                description: 'High-quality wireless headphones with noise cancellation',
                price: 199.99,
                sku: 'WH-001',
                category: 'electronics',
                stockQuantity: 50,
                images: ['https://example.com/images/wh-001-1.jpg']
              },
              {
                id: '550e8400-e29b-41d4-a716-446655440002',
                name: 'Smart Watch',
                description: 'Feature-rich smartwatch with health tracking',
                price: 299.99,
                sku: 'SW-001',
                category: 'electronics',
                stockQuantity: 30,
                images: ['https://example.com/images/sw-001-1.jpg']
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
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products?page=1&limit=10`
      );

      expect(response.status).toBe(200);
      expect(response.data.products).toHaveLength(2);
      expect(response.data.pagination).toBeDefined();
    });

    it('should filter products by category', async () => {
      await provider.addInteraction({
        state: 'products exist in category',
        uponReceiving: 'a request to get products by category',
        withRequest: {
          method: 'GET',
          path: '/api/v1/products',
          query: { category: 'electronics', page: '1', limit: '10' }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            products: [
              {
                id: '550e8400-e29b-41d4-a716-446655440001',
                name: 'Wireless Headphones',
                price: 199.99,
                category: 'electronics',
                stockQuantity: 50
              }
            ],
            pagination: {
              page: 1,
              limit: 10,
              total: 1,
              totalPages: 1
            }
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products?category=electronics&page=1&limit=10`
      );

      expect(response.status).toBe(200);
      expect(response.data.products[0].category).toBe('electronics');
    });

    it('should search products by name', async () => {
      await provider.addInteraction({
        state: 'products exist matching search',
        uponReceiving: 'a request to search products',
        withRequest: {
          method: 'GET',
          path: '/api/v1/products',
          query: { search: 'headphones', page: '1', limit: '10' }
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            products: [
              {
                id: '550e8400-e29b-41d4-a716-446655440001',
                name: 'Wireless Headphones',
                price: 199.99,
                stockQuantity: 50
              }
            ],
            pagination: {
              page: 1,
              limit: 10,
              total: 1,
              totalPages: 1
            }
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products?search=headphones&page=1&limit=10`
      );

      expect(response.status).toBe(200);
      expect(response.data.products[0].name).toContain('Headphones');
    });
  });

  describe('Get Product by ID', () => {
    it('should return product details', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440001';

      await provider.addInteraction({
        state: 'product exists',
        uponReceiving: 'a request to get product by id',
        withRequest: {
          method: 'GET',
          path: `/api/v1/products/${productId}`
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: productId,
            name: 'Wireless Headphones',
            description: 'High-quality wireless headphones with noise cancellation',
            price: 199.99,
            sku: 'WH-001',
            category: 'electronics',
            stockQuantity: 50,
            images: [
              'https://example.com/images/wh-001-1.jpg',
              'https://example.com/images/wh-001-2.jpg'
            ],
            specifications: {
              batteryLife: '30 hours',
              connectivity: 'Bluetooth 5.0',
              weight: '250g'
            },
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-10T00:00:00.000Z'
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products/${productId}`
      );

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(productId);
      expect(response.data.specifications).toBeDefined();
    });

    it('should return 404 for non-existent product', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440999';

      await provider.addInteraction({
        state: 'product does not exist',
        uponReceiving: 'a request to get non-existent product',
        withRequest: {
          method: 'GET',
          path: `/api/v1/products/${productId}`
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: 'Product not found',
            code: 'PRODUCT_NOT_FOUND'
          }
        }
      });

      try {
        await axios.get(
          `http://localhost:${MOCK_SERVER_PORT}/api/v1/products/${productId}`
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toBe('Product not found');
      }
    });
  });

  describe('Create Product (Admin)', () => {
    it('should create a new product', async () => {
      const productData = {
        name: 'New Product',
        description: 'A brand new product',
        price: 149.99,
        sku: 'NEW-001',
        category: 'electronics',
        stockQuantity: 100,
        images: ['https://example.com/images/new-001.jpg']
      };

      await provider.addInteraction({
        state: 'admin is authenticated',
        uponReceiving: 'a request to create a new product',
        withRequest: {
          method: 'POST',
          path: '/api/v1/products',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin-jwt-token'
          },
          body: productData
        },
        willRespondWith: {
          status: 201,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: '550e8400-e29b-41d4-a716-446655440003',
            ...productData,
            createdAt: '2024-01-15T10:30:00.000Z'
          }
        }
      });

      const response = await axios.post(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products`,
        productData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin-jwt-token'
          }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.name).toBe(productData.name);
    });

    it('should return 403 for non-admin user', async () => {
      const productData = {
        name: 'New Product',
        price: 149.99,
        sku: 'NEW-001'
      };

      await provider.addInteraction({
        state: 'non-admin user is authenticated',
        uponReceiving: 'a request to create product by non-admin',
        withRequest: {
          method: 'POST',
          path: '/api/v1/products',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer user-jwt-token'
          },
          body: productData
        },
        willRespondWith: {
          status: 403,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: 'Forbidden',
            code: 'INSUFFICIENT_PERMISSIONS'
          }
        }
      });

      try {
        await axios.post(
          `http://localhost:${MOCK_SERVER_PORT}/api/v1/products`,
          productData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer user-jwt-token'
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });
  });

  describe('Update Product (Admin)', () => {
    it('should update product details', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440001';
      const updates = {
        price: 179.99,
        stockQuantity: 75
      };

      await provider.addInteraction({
        state: 'product exists and admin is authenticated',
        uponReceiving: 'a request to update a product',
        withRequest: {
          method: 'PUT',
          path: `/api/v1/products/${productId}`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin-jwt-token'
          },
          body: updates
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: productId,
            name: 'Wireless Headphones',
            price: 179.99,
            stockQuantity: 75,
            updatedAt: '2024-01-15T11:00:00.000Z'
          }
        }
      });

      const response = await axios.put(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products/${productId}`,
        updates,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin-jwt-token'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.price).toBe(179.99);
    });
  });

  describe('Check Stock', () => {
    it('should return stock availability', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440001';

      await provider.addInteraction({
        state: 'product has stock',
        uponReceiving: 'a request to check stock availability',
        withRequest: {
          method: 'GET',
          path: `/api/v1/products/${productId}/stock`
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            productId,
            available: true,
            quantity: 50,
            requestedQuantity: 1,
            canFulfill: true
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products/${productId}/stock`
      );

      expect(response.status).toBe(200);
      expect(response.data.available).toBe(true);
    });

    it('should return out of stock', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440002';

      await provider.addInteraction({
        state: 'product is out of stock',
        uponReceiving: 'a request to check out of stock product',
        withRequest: {
          method: 'GET',
          path: `/api/v1/products/${productId}/stock`
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            productId,
            available: false,
            quantity: 0,
            requestedQuantity: 1,
            canFulfill: false
          }
        }
      });

      const response = await axios.get(
        `http://localhost:${MOCK_SERVER_PORT}/api/v1/products/${productId}/stock`
      );

      expect(response.status).toBe(200);
      expect(response.data.available).toBe(false);
    });
  });
});
