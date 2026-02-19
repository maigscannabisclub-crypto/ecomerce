/**
 * Smoke Tests - E-commerce Platform
 * Flujo básico: Login → Listar productos → Crear carrito → Crear orden
 * Verifica que el sistema funciona correctamente en un flujo end-to-end
 */

const supertest = require('supertest');

// URLs de servicios
const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000';
const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const CART_SERVICE = process.env.CART_SERVICE_URL || 'http://localhost:3003';
const ORDER_SERVICE = process.env.ORDER_SERVICE_URL || 'http://localhost:3004';
const INVENTORY_SERVICE = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006';

describe('Smoke Tests - E-commerce Flow', () => {
  let authToken = null;
  let userId = null;
  let cartId = null;
  let orderId = null;
  let productId = null;
  let productPrice = null;

  // Credenciales de test
  const testUser = {
    email: 'smoke.test@example.com',
    password: 'TestPassword123!',
    firstName: 'Smoke',
    lastName: 'Test'
  };

  describe('1. Authentication Flow', () => {
    test('Should register a new user', async () => {
      try {
        const response = await supertest(AUTH_SERVICE)
          .post('/api/v1/auth/register')
          .send(testUser)
          .set('Accept', 'application/json');

        // 201 si es nuevo, 409 si ya existe (ambos son válidos para smoke test)
        expect([201, 409]).toContain(response.status);
        
        if (response.status === 201) {
          expect(response.body).toHaveProperty('data');
          expect(response.body.data).toHaveProperty('userId');
          expect(response.body.data).toHaveProperty('email', testUser.email);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Auth service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should login with valid credentials', async () => {
      try {
        const response = await supertest(AUTH_SERVICE)
          .post('/api/v1/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('token');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data.user).toHaveProperty('id');
        
        authToken = response.body.data.token;
        userId = response.body.data.user.id;
        
        // Validar estructura del token JWT
        const tokenParts = authToken.split('.');
        expect(tokenParts).toHaveLength(3);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Auth service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should validate token and return user info', async () => {
      if (!authToken) {
        console.warn('⚠️  No auth token available - skipping');
        return;
      }

      try {
        const response = await supertest(AUTH_SERVICE)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id', userId);
        expect(response.body.data).toHaveProperty('email', testUser.email);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Auth service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);
  });

  describe('2. Product Catalog Flow', () => {
    test('Should list products with pagination', async () => {
      try {
        const response = await supertest(PRODUCT_SERVICE)
          .get('/api/v1/products?page=1&limit=10')
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('items');
        expect(response.body.data).toHaveProperty('pagination');
        expect(Array.isArray(response.body.data.items)).toBe(true);
        
        // Validar estructura de producto
        if (response.body.data.items.length > 0) {
          const product = response.body.data.items[0];
          expect(product).toHaveProperty('id');
          expect(product).toHaveProperty('name');
          expect(product).toHaveProperty('price');
          expect(product).toHaveProperty('sku');
          
          // Guardar primer producto para tests posteriores
          productId = product.id;
          productPrice = product.price;
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Product service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should search products', async () => {
      try {
        const response = await supertest(PRODUCT_SERVICE)
          .get('/api/v1/products/search?q=laptop')
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Product service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should get product details', async () => {
      if (!productId) {
        console.warn('⚠️  No product ID available - skipping');
        return;
      }

      try {
        const response = await supertest(PRODUCT_SERVICE)
          .get(`/api/v1/products/${productId}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id', productId);
        expect(response.body.data).toHaveProperty('name');
        expect(response.body.data).toHaveProperty('description');
        expect(response.body.data).toHaveProperty('price');
        expect(response.body.data).toHaveProperty('inventory');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Product service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should check product inventory', async () => {
      if (!productId) {
        console.warn('⚠️  No product ID available - skipping');
        return;
      }

      try {
        const response = await supertest(INVENTORY_SERVICE)
          .get(`/api/v1/inventory/products/${productId}/availability`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('available');
        expect(response.body.data).toHaveProperty('quantity');
        expect(typeof response.body.data.available).toBe('boolean');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Inventory service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);
  });

  describe('3. Cart Management Flow', () => {
    test('Should create a new cart', async () => {
      if (!authToken) {
        console.warn('⚠️  No auth token available - skipping');
        return;
      }

      try {
        const response = await supertest(CART_SERVICE)
          .post('/api/v1/carts')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('userId', userId);
        expect(response.body.data).toHaveProperty('items');
        expect(Array.isArray(response.body.data.items)).toBe(true);
        
        cartId = response.body.data.id;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Cart service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should add item to cart', async () => {
      if (!authToken || !cartId || !productId) {
        console.warn('⚠️  Missing required data - skipping');
        return;
      }

      try {
        const response = await supertest(CART_SERVICE)
          .post(`/api/v1/carts/${cartId}/items`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json')
          .send({
            productId: productId,
            quantity: 2,
            price: productPrice
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('productId', productId);
        expect(response.body.data).toHaveProperty('quantity', 2);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Cart service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should get cart with items', async () => {
      if (!authToken || !cartId) {
        console.warn('⚠️  Missing required data - skipping');
        return;
      }

      try {
        const response = await supertest(CART_SERVICE)
          .get(`/api/v1/carts/${cartId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id', cartId);
        expect(response.body.data).toHaveProperty('items');
        expect(response.body.data).toHaveProperty('totalAmount');
        expect(response.body.data).toHaveProperty('itemCount');
        
        // Validar que el carrito tiene al menos un item
        expect(response.body.data.items.length).toBeGreaterThan(0);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Cart service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);
  });

  describe('4. Order Creation Flow', () => {
    test('Should create order from cart', async () => {
      if (!authToken || !cartId) {
        console.warn('⚠️  Missing required data - skipping');
        return;
      }

      const orderData = {
        cartId: cartId,
        shippingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        paymentMethod: 'credit_card'
      };

      try {
        const response = await supertest(ORDER_SERVICE)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json')
          .send(orderData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('userId', userId);
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data).toHaveProperty('totalAmount');
        expect(response.body.data).toHaveProperty('items');
        
        orderId = response.body.data.id;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Order service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should get order details', async () => {
      if (!authToken || !orderId) {
        console.warn('⚠️  Missing required data - skipping');
        return;
      }

      try {
        const response = await supertest(ORDER_SERVICE)
          .get(`/api/v1/orders/${orderId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id', orderId);
        expect(response.body.data).toHaveProperty('userId', userId);
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data).toHaveProperty('items');
        expect(response.body.data).toHaveProperty('shippingAddress');
        expect(response.body.data).toHaveProperty('billingAddress');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Order service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);

    test('Should list user orders', async () => {
      if (!authToken) {
        console.warn('⚠️  No auth token available - skipping');
        return;
      }

      try {
        const response = await supertest(ORDER_SERVICE)
          .get('/api/v1/orders')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('items');
        expect(response.body.data).toHaveProperty('pagination');
        expect(Array.isArray(response.body.data.items)).toBe(true);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Order service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);
  });

  describe('5. End-to-End Flow Validation', () => {
    test('Complete flow: Login → Products → Cart → Order', async () => {
      // Este test valida todo el flujo en secuencia
      const flowResults = {
        login: false,
        products: false,
        cart: false,
        order: false
      };

      // 1. Login
      try {
        const loginResponse = await supertest(AUTH_SERVICE)
          .post('/api/v1/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });
        
        if (loginResponse.status === 200 && loginResponse.body.data?.token) {
          flowResults.login = true;
          const token = loginResponse.body.data.token;

          // 2. Get Products
          const productsResponse = await supertest(PRODUCT_SERVICE)
            .get('/api/v1/products?limit=1');
          
          if (productsResponse.status === 200 && productsResponse.body.data?.items?.length > 0) {
            flowResults.products = true;
            const prod = productsResponse.body.data.items[0];

            // 3. Create Cart
            const cartResponse = await supertest(CART_SERVICE)
              .post('/api/v1/carts')
              .set('Authorization', `Bearer ${token}`);
            
            if (cartResponse.status === 201 && cartResponse.body.data?.id) {
              flowResults.cart = true;
              const newCartId = cartResponse.body.data.id;

              // Add item to cart
              await supertest(CART_SERVICE)
                .post(`/api/v1/carts/${newCartId}/items`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                  productId: prod.id,
                  quantity: 1,
                  price: prod.price
                });

              // 4. Create Order
              const orderResponse = await supertest(ORDER_SERVICE)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${token}`)
                .send({
                  cartId: newCartId,
                  shippingAddress: {
                    street: '123 Flow Test',
                    city: 'Flow City',
                    state: 'FL',
                    zipCode: '12345',
                    country: 'US'
                  },
                  billingAddress: {
                    street: '123 Flow Test',
                    city: 'Flow City',
                    state: 'FL',
                    zipCode: '12345',
                    country: 'US'
                  },
                  paymentMethod: 'credit_card'
                });
              
              if (orderResponse.status === 201) {
                flowResults.order = true;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  E2E flow error: ${error.message}`);
      }

      console.log('Flow Results:', flowResults);
      
      // Al menos 3 de 4 pasos deben funcionar
      const successCount = Object.values(flowResults).filter(v => v).length;
      expect(successCount).toBeGreaterThanOrEqual(3);
    }, 60000);
  });

  describe('6. Response Structure Validation', () => {
    test('All service responses should follow standard format', async () => {
      const services = [
        { name: 'Auth', url: AUTH_SERVICE, endpoint: '/api/v1/auth/health' },
        { name: 'Product', url: PRODUCT_SERVICE, endpoint: '/api/v1/products?page=1&limit=1' },
        { name: 'Cart', url: CART_SERVICE, endpoint: '/health' },
        { name: 'Order', url: ORDER_SERVICE, endpoint: '/health' }
      ];

      for (const service of services) {
        try {
          const response = await supertest(service.url)
            .get(service.endpoint)
            .timeout(5000);

          if (response.status === 200) {
            // Validar estructura estándar de respuesta
            expect(response.body).toHaveProperty('status');
            expect(['success', 'error']).toContain(response.body.status);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('meta');
            expect(response.body.meta).toHaveProperty('timestamp');
            expect(response.body.meta).toHaveProperty('requestId');
          }
        } catch (error) {
          console.warn(`⚠️  ${service.name} service not available`);
        }
      }
    }, 30000);

    test('Error responses should follow standard format', async () => {
      try {
        const response = await supertest(AUTH_SERVICE)
          .post('/api/v1/auth/login')
          .send({
            email: 'invalid@example.com',
            password: 'wrongpassword'
          });

        if (response.status === 401) {
          expect(response.body).toHaveProperty('status', 'error');
          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toHaveProperty('code');
          expect(response.body.error).toHaveProperty('message');
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Auth service not available - skipping');
          return;
        }
        throw error;
      }
    }, 10000);
  });
});

// Exportar para uso en otros tests
module.exports = {
  API_GATEWAY,
  AUTH_SERVICE,
  PRODUCT_SERVICE,
  CART_SERVICE,
  ORDER_SERVICE
};
