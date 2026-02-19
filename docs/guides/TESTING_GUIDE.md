# Guía de Testing

## Índice
1. [Estrategia de Testing](#estrategia-de-testing)
2. [Tests Unitarios](#tests-unitarios)
3. [Tests de Integración](#tests-de-integración)
4. [Tests E2E](#tests-e2e)
5. [Tests de Carga](#tests-de-carga)
6. [Cobertura de Código](#cobertura-de-código)
7. [Testing en CI/CD](#testing-en-cicd)

---

## Estrategia de Testing

### Pirámide de Testing

```
                    ▲
                   / \
                  / E2E \          # Pocos tests, alto costo
                 /─────────\
                /            \
               /  Integration  \   # Tests de integración
              /──────────────────\
             /                      \
            /     Unit Tests          \  # Muchos tests, bajo costo
           /─────────────────────────────\
```

### Tipos de Tests

| Tipo | Alcance | Velocidad | Costo | Cantidad |
|------|---------|-----------|-------|----------|
| Unit | Función/clase | < 10ms | Bajo | 70-80% |
| Integration | Servicios/DB | < 1s | Medio | 15-20% |
| E2E | Flujo completo | < 10s | Alto | 5-10% |

---

## Tests Unitarios

### Configuración

```json
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ecommerce/shared$': '<rootDir>/../packages/shared/src'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
```

### Ejemplo de Test Unitario

```typescript
// tests/unit/services/order.service.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OrderService } from '../../../src/application/services/order.service';
import { IOrderRepository } from '../../../src/domain/repositories/order.repository.interface';
import { IInventoryClient } from '../../../src/infrastructure/clients/inventory.client';
import { IPaymentClient } from '../../../src/infrastructure/clients/payment.client';
import { EventPublisher } from '@ecommerce/shared/messaging';

describe('OrderService', () => {
  let orderService: OrderService;
  let mockOrderRepository: jest.Mocked<IOrderRepository>;
  let mockInventoryClient: jest.Mocked<IInventoryClient>;
  let mockPaymentClient: jest.Mocked<IPaymentClient>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;

  beforeEach(() => {
    mockOrderRepository = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    } as unknown as jest.Mocked<IOrderRepository>;

    mockInventoryClient = {
      checkAvailability: jest.fn(),
      reserveStock: jest.fn()
    } as unknown as jest.Mocked<IInventoryClient>;

    mockPaymentClient = {
      createPayment: jest.fn()
    } as unknown as jest.Mocked<IPaymentClient>;

    mockEventPublisher = {
      publish: jest.fn()
    } as unknown as jest.Mocked<EventPublisher>;

    orderService = new OrderService(
      mockOrderRepository,
      mockInventoryClient,
      mockPaymentClient,
      mockEventPublisher
    );
  });

  describe('createOrder', () => {
    it('should create order successfully when items are available', async () => {
      // Arrange
      const createOrderDto = {
        userId: 'user-123',
        items: [
          { productId: 'prod-1', quantity: 2, unitPrice: 50 }
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'NYC',
          state: 'NY',
          zip: '10001',
          country: 'US'
        }
      };

      mockInventoryClient.checkAvailability.mockResolvedValue({
        available: true,
        items: [{ productId: 'prod-1', available: 10 }]
      });

      mockInventoryClient.reserveStock.mockResolvedValue({
        reservationId: 'res-123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      mockPaymentClient.createPayment.mockResolvedValue({
        paymentId: 'pay-123',
        status: 'pending',
        clientSecret: 'secret-123'
      });

      const expectedOrder = {
        id: 'order-123',
        userId: 'user-123',
        status: 'PENDING',
        total: 100
      };

      mockOrderRepository.create.mockResolvedValue(expectedOrder);

      // Act
      const result = await orderService.createOrder(createOrderDto);

      // Assert
      expect(result).toEqual(expectedOrder);
      expect(mockInventoryClient.checkAvailability).toHaveBeenCalledWith(
        createOrderDto.items
      );
      expect(mockInventoryClient.reserveStock).toHaveBeenCalled();
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        'domain.order.OrderCreated',
        expect.any(Object)
      );
    });

    it('should throw error when items are not available', async () => {
      // Arrange
      const createOrderDto = {
        userId: 'user-123',
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 50 }]
      };

      mockInventoryClient.checkAvailability.mockResolvedValue({
        available: false,
        items: [{ productId: 'prod-1', available: 1, requested: 2 }]
      });

      // Act & Assert
      await expect(orderService.createOrder(createOrderDto))
        .rejects
        .toThrow('Items not available');

      expect(mockInventoryClient.reserveStock).not.toHaveBeenCalled();
      expect(mockOrderRepository.create).not.toHaveBeenCalled();
    });
  });
});
```

### Mocking

```typescript
// tests/mocks/repositories.mock.ts
export const createMockOrderRepository = (): jest.Mocked<IOrderRepository> => ({
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
});

// tests/mocks/prisma.mock.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

export type Context = {
  prisma: PrismaClient;
};

export type MockContext = {
  prisma: DeepMockProxy<PrismaClient>;
};

export const createMockContext = (): MockContext => {
  return {
    prisma: mockDeep<PrismaClient>()
  };
};
```

---

## Tests de Integración

### Configuración de Test Database

```typescript
// tests/integration/setup.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Run migrations on test database
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }
  });
});

beforeEach(async () => {
  // Clean database before each test
  const tables = ['orders', 'order_items', 'payments'];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

### Test de API

```typescript
// tests/integration/api/orders.test.ts
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../../src/index';
import { prisma } from '../../../src/infrastructure/persistence/prisma';
import { generateTestToken } from '../../helpers/auth';

describe('Orders API Integration', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user and get token
    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'Test',
        lastName: 'User'
      }
    });
    userId = testUser.id;
    authToken = generateTestToken(testUser);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/orders', () => {
    it('should create a new order', async () => {
      // Arrange
      const orderData = {
        items: [
          { productId: 'prod-1', quantity: 2 }
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'NYC',
          state: 'NY',
          zip: '10001',
          country: 'US'
        }
      };

      // Act
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.data.userId).toBe(userId);

      // Verify in database
      const order = await prisma.order.findUnique({
        where: { id: response.body.data.id }
      });
      expect(order).not.toBeNull();
    });

    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/api/v1/orders')
        .send({ items: [] })
        .expect(401);
    });

    it('should return 400 for invalid data', async () => {
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: 'invalid' })
        .expect(400);
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should return user orders', async () => {
      // Create test orders
      await prisma.order.createMany({
        data: [
          { userId, status: 'PENDING', total: 100 },
          { userId, status: 'CONFIRMED', total: 200 }
        ]
      });

      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });
  });
});
```

### Test de Database

```typescript
// tests/integration/database/order.repository.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaOrderRepository } from '../../../src/infrastructure/persistence/prisma-order.repository';
import { prisma } from '../../setup';

describe('PrismaOrderRepository', () => {
  let repository: PrismaOrderRepository;

  beforeEach(() => {
    repository = new PrismaOrderRepository(prisma);
  });

  describe('create', () => {
    it('should create order with items', async () => {
      const orderData = {
        userId: 'user-123',
        status: 'PENDING',
        total: 150,
        items: [
          { productId: 'prod-1', quantity: 2, unitPrice: 50, totalPrice: 100 },
          { productId: 'prod-2', quantity: 1, unitPrice: 50, totalPrice: 50 }
        ]
      };

      const order = await repository.create(orderData);

      expect(order.id).toBeDefined();
      expect(order.userId).toBe(orderData.userId);
      expect(order.items).toHaveLength(2);
    });
  });
});
```

---

## Tests E2E

### Configuración con Playwright

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    }
  ],
  webServer: {
    command: 'npm run start:test',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
});
```

### Test E2E

```typescript
// e2e/tests/checkout-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('complete purchase flow', async ({ page }) => {
    // 1. Navigate to homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/E-Commerce/);

    // 2. Search for product
    await page.fill('[data-testid="search-input"]', 'headphones');
    await page.press('[data-testid="search-input"]', 'Enter');
    await expect(page.locator('[data-testid="product-card"]')).toHaveCount.greaterThan(0);

    // 3. Select product
    await page.click('[data-testid="product-card"]:first-child');
    await expect(page.locator('[data-testid="product-detail"]')).toBeVisible();

    // 4. Add to cart
    await page.click('[data-testid="add-to-cart-button"]');
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');

    // 5. Go to cart
    await page.click('[data-testid="cart-link"]');
    await expect(page).toHaveURL(/\/cart/);

    // 6. Proceed to checkout
    await page.click('[data-testid="checkout-button"]');
    await expect(page).toHaveURL(/\/checkout/);

    // 7. Fill shipping information
    await page.fill('[data-testid="shipping-firstName"]', 'John');
    await page.fill('[data-testid="shipping-lastName"]', 'Doe');
    await page.fill('[data-testid="shipping-street"]', '123 Main St');
    await page.fill('[data-testid="shipping-city"]', 'New York');
    await page.selectOption('[data-testid="shipping-state"]', 'NY');
    await page.fill('[data-testid="shipping-zip"]', '10001');

    // 8. Fill payment information (test card)
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');

    // 9. Complete order
    await page.click('[data-testid="place-order-button"]');

    // 10. Verify order confirmation
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-number"]')).toBeVisible();
  });

  test('cart persists after page reload', async ({ page }) => {
    // Add item to cart
    await page.goto('/products/1');
    await page.click('[data-testid="add-to-cart-button"]');

    // Reload page
    await page.reload();

    // Verify cart still has item
    await page.click('[data-testid="cart-link"]');
    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1);
  });
});
```

---

## Tests de Carga

### Configuración con k6

```javascript
// load-tests/checkout-load-test.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 100 },   // Steady state
    { duration: '2m', target: 200 },   // Ramp up
    { duration: '5m', target: 200 },   // Steady state
    { duration: '2m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% under 500ms
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
    errors: ['rate<0.01']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Login and get token
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, {
    email: 'loadtest@example.com',
    password: 'testpassword'
  });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200
  });

  return { token: loginRes.json('tokens.accessToken') };
}

export default function(data) {
  const params = {
    headers: {
      'Authorization': `Bearer ${data.token}`,
      'Content-Type': 'application/json'
    }
  };

  group('Browse Products', () => {
    const res = http.get(`${BASE_URL}/api/v1/products?page=1&limit=20`, params);
    check(res, {
      'products loaded': (r) => r.status === 200,
      'has products': (r) => r.json('data').length > 0
    });
    errorRate.add(res.status !== 200);
  });

  group('View Product Detail', () => {
    const res = http.get(`${BASE_URL}/api/v1/products/prod-1`, params);
    check(res, {
      'product detail loaded': (r) => r.status === 200
    });
    errorRate.add(res.status !== 200);
  });

  group('Add to Cart', () => {
    const res = http.post(`${BASE_URL}/api/v1/cart/items`, JSON.stringify({
      productId: 'prod-1',
      quantity: 1
    }), params);
    check(res, {
      'item added': (r) => r.status === 201
    });
    errorRate.add(res.status !== 201);
  });

  group('Checkout', () => {
    const startTime = Date.now();
    
    const res = http.post(`${BASE_URL}/api/v1/cart/checkout`, JSON.stringify({
      shippingAddress: {
        firstName: 'Test',
        lastName: 'User',
        street: '123 Main St',
        city: 'NYC',
        state: 'NY',
        zip: '10001',
        country: 'US'
      },
      paymentMethod: 'credit_card',
      paymentToken: 'tok_visa'
    }), params);
    
    checkoutDuration.add(Date.now() - startTime);
    
    check(res, {
      'checkout successful': (r) => r.status === 201,
      'order created': (r) => r.json('data.order.id') !== undefined
    });
    errorRate.add(res.status !== 201);
  });

  sleep(1);
}
```

### Ejecutar Tests de Carga

```bash
# Instalar k6
brew install k6

# Ejecutar test
k6 run load-tests/checkout-load-test.js

# Con variables de entorno
k6 run -e BASE_URL=https://api-staging.ecommerce.com load-tests/checkout-load-test.js

# Ejecutar en cloud
k6 cloud load-tests/checkout-load-test.js
```

---

## Cobertura de Código

### Configuración

```json
// jest.config.js
{
  "collectCoverage": true,
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/**/types.ts"
  ],
  "coverageReporters": [
    "text",
    "text-summary",
    "lcov",
    "html"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    },
    "./src/application/": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  }
}
```

### Reporte de Cobertura

```bash
# Generar reporte
npm run test:coverage

# Ver reporte HTML
open coverage/lcov-report/index.html

# Cobertura por archivo
npm run test:coverage -- --collectCoverageFrom="src/services/**/*.ts"
```

---

## Testing en CI/CD

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: ecommerce_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        ports:
          - 6379:6379
      
      rabbitmq:
        image: rabbitmq:3.12
        ports:
          - 5672:5672
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npm run migrate:test
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/ecommerce_test
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/ecommerce_test
          REDIS_URL: redis://localhost:6379
          RABBITMQ_URL: amqp://localhost:5672

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload E2E results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Referencias

- [Development Guide](DEVELOPMENT_GUIDE.md)
- [Contributing Guide](CONTRIBUTING.md)
