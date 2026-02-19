# Guía de Desarrollo

## Índice
1. [Configuración del Entorno](#configuración-del-entorno)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Convenciones de Código](#convenciones-de-código)
4. [Desarrollo de Microservicios](#desarrollo-de-microservicios)
5. [Base de Datos](#base-de-datos)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Buenas Prácticas](#buenas-prácticas)

---

## Configuración del Entorno

### Prerrequisitos

- **Node.js**: 18.x o superior
- **npm**: 9.x o superior
- **Docker**: 24.x o superior
- **Docker Compose**: 2.20.x o superior
- **Git**: 2.40.x o superior
- **Make**: (opcional pero recomendado)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/company/ecommerce-platform.git
cd ecommerce-platform

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones locales

# 4. Iniciar infraestructura (databases, message broker)
make infra-up

# 5. Ejecutar migraciones
make migrate

# 6. Cargar datos de prueba (opcional)
make seed
```

### Estructura de Variables de Entorno

```bash
# .env - Development
NODE_ENV=development
LOG_LEVEL=debug

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=ecommerce
DB_PASSWORD=dev_password
DB_NAME=ecommerce_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# JWT
JWT_SECRET=your-dev-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Services
AUTH_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
# ... etc
```

### Comandos Útiles

```bash
# Iniciar todos los servicios
make start

# Iniciar servicio específico
make dev-service SERVICE=auth

# Ver logs
make logs
make logs SERVICE=auth

# Ejecutar tests
make test
make test-unit
make test-integration

# Lint y formato
make lint
make format

# Detener todo
make stop
```

---

## Estructura del Proyecto

### Organización de Carpetas

```
ecommerce-platform/
├── 📁 apps/                          # Microservicios
│   ├── 📁 gateway/                   # API Gateway
│   │   ├── 📁 src/
│   │   │   ├── 📁 config/           # Configuración
│   │   │   ├── 📁 middleware/       # Middlewares
│   │   │   ├── 📁 routes/           # Rutas
│   │   │   ├── 📁 services/         # Lógica de negocio
│   │   │   ├── 📁 utils/            # Utilidades
│   │   │   └── 📄 index.ts          # Entry point
│   │   ├── 📁 tests/
│   │   ├── 📁 prisma/               # Database schema
│   │   ├── 📄 Dockerfile
│   │   ├── 📄 package.json
│   │   └── 📄 tsconfig.json
│   │
│   ├── 📁 auth-service/              # Auth Service
│   ├── 📁 product-service/           # Product Service
│   ├── 📁 cart-service/              # Cart Service
│   ├── 📁 order-service/             # Order Service
│   ├── 📁 inventory-service/         # Inventory Service
│   └── 📁 reporting-service/         # Reporting Service
│
├── 📁 packages/                      # Código compartido
│   ├── 📁 shared/                    # Utilidades compartidas
│   │   ├── 📁 src/
│   │   │   ├── 📁 errors/           # Error classes
│   │   │   ├── 📁 logger/           # Logger configuration
│   │   │   ├── 📁 middleware/       # Shared middlewares
│   │   │   ├── 📁 types/            # Shared types
│   │   │   └── 📁 utils/            # Shared utilities
│   │   └── 📄 package.json
│   │
│   ├── 📁 types/                     # TypeScript definitions
│   └── 📁 eslint-config/             # Configuración ESLint
│
├── 📁 infrastructure/                # Infraestructura
│   ├── 📁 docker/                    # Docker configs
│   ├── 📁 k8s/                       # Kubernetes manifests
│   ├── 📁 terraform/                 # Infrastructure as Code
│   └── 📁 monitoring/                # Monitoring configs
│
├── 📁 docs/                          # Documentación
├── 📁 scripts/                       # Scripts de utilidad
├── 📄 package.json                   # Root package.json
├── 📄 docker-compose.yml             # Docker Compose dev
├── 📄 Makefile                       # Comandos principales
└── 📄 turbo.json                     # Turborepo config
```

### Clean Architecture en Servicios

```
apps/{service}/src/
├── 📁 presentation/        # Capa de presentación
│   ├── 📁 controllers/    # HTTP controllers
│   ├── 📁 routes/         # Route definitions
│   ├── 📁 middleware/     # HTTP middlewares
│   └── 📁 validators/     # Input validation
│
├── 📁 application/         # Capa de aplicación
│   ├── 📁 services/       # Application services
│   ├── 📁 use-cases/      # Use cases
│   ├── 📁 dto/            # Data Transfer Objects
│   └── 📁 mappers/        # Data mappers
│
├── 📁 domain/              # Capa de dominio
│   ├── 📁 entities/       # Domain entities
│   ├── 📁 value-objects/  # Value objects
│   ├── 📁 repositories/   # Repository interfaces
│   ├── 📁 events/         # Domain events
│   └── 📁 services/       # Domain services
│
└── 📁 infrastructure/      # Capa de infraestructura
    ├── 📁 persistence/    # Database implementations
    ├── 📁 messaging/      # Message broker
    ├── 📁 cache/          # Cache implementations
    ├── 📁 http/           # External HTTP clients
    └── 📁 config/         # Configuration
```

---

## Convenciones de Código

### TypeScript Style Guide

```typescript
// ✅ DO: Use explicit types
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

function getUserById(id: string): Promise<User> {
  // implementation
}

// ❌ DON'T: Use implicit any
function getUser(id) {  // Error: implicit any
  // implementation
}

// ✅ DO: Use type guards
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'email' in obj
  );
}

// ✅ DO: Use readonly for immutable data
interface Config {
  readonly apiUrl: string;
  readonly timeout: number;
}

// ✅ DO: Use enums for constants
enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

// ✅ DO: Use discriminated unions
type OrderEvent =
  | { type: 'OrderCreated'; payload: OrderCreatedPayload }
  | { type: 'OrderConfirmed'; payload: OrderConfirmedPayload }
  | { type: 'OrderCancelled'; payload: OrderCancelledPayload };
```

### Naming Conventions

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Clases | PascalCase | `UserService`, `OrderRepository` |
| Interfaces | PascalCase con prefijo | `IUserRepository`, `IEmailService` |
| Tipos | PascalCase | `UserDto`, `OrderStatus` |
| Enums | PascalCase | `OrderStatus`, `PaymentMethod` |
| Variables/Funciones | camelCase | `getUserById`, `isValid` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT` |
| Archivos | kebab-case | `user-service.ts`, `order-validator.ts` |
| Directorios | kebab-case | `use-cases/`, `value-objects/` |

### ESLint Configuration

```json
// .eslintrc.json
{
  "extends": [
    "@ecommerce/eslint-config"
  ],
  "rules": {
    // TypeScript
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    
    // Import
    "import/order": ["error", {
      "groups": [
        "builtin",
        "external",
        "internal",
        "parent",
        "sibling",
        "index"
      ],
      "newlines-between": "always"
    }],
    
    // General
    "no-console": ["warn", { "allow": ["error"] }],
    "prefer-const": "error",
    "eqeqeq": ["error", "always"]
  }
}
```

---

## Desarrollo de Microservicios

### Crear un Nuevo Servicio

```bash
# 1. Crear estructura de carpetas
mkdir -p apps/new-service/src/{presentation,application,domain,infrastructure}

# 2. Inicializar package.json
cd apps/new-service
npm init -y

# 3. Instalar dependencias
npm install express cors helmet compression
npm install -D typescript @types/express @types/node ts-node nodemon

# 4. Configurar TypeScript
npx tsc --init

# 5. Crear entry point
# src/index.ts
```

### Template de Servicio

```typescript
// apps/new-service/src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '@ecommerce/shared';
import { errorHandler } from '@ecommerce/shared/middleware';
import { healthRouter } from './presentation/routes/health';
import { config } from './infrastructure/config';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);

// Error handling
app.use(errorHandler);

// Start server
const PORT = config.port || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
```

### Implementando un Endpoint

```typescript
// apps/product-service/src/presentation/routes/products.ts
import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { validate } from '../middleware/validate';
import { createProductSchema, updateProductSchema } from '../validators/product.validator';
import { authenticate, authorize } from '@ecommerce/shared/middleware';

const router = Router();
const controller = new ProductController();

// Public routes
router.get('/', controller.list);
router.get('/search', controller.search);
router.get('/:id', controller.getById);

// Protected routes
router.post(
  '/',
  authenticate,
  authorize(['admin', 'product_manager']),
  validate(createProductSchema),
  controller.create
);

router.put(
  '/:id',
  authenticate,
  authorize(['admin', 'product_manager']),
  validate(updateProductSchema),
  controller.update
);

router.delete(
  '/:id',
  authenticate,
  authorize(['admin']),
  controller.delete
);

export { router as productRouter };
```

```typescript
// apps/product-service/src/presentation/controllers/product.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ProductService } from '../../application/services/product.service';
import { CreateProductDto } from '../../application/dto/create-product.dto';
import { logger } from '@ecommerce/shared';

export class ProductController {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page = 1, limit = 20, category, search } = req.query;
      
      const result = await this.productService.list({
        page: Number(page),
        limit: Number(limit),
        category: category as string,
        search: search as string
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto: CreateProductDto = req.body;
      const product = await this.productService.create(dto);

      res.status(201).json({
        success: true,
        data: product
      });
    } catch (error) {
      next(error);
    }
  };

  // ... other methods
}
```

### Publicando Eventos

```typescript
// apps/order-service/src/application/services/order.service.ts
import { EventPublisher } from '@ecommerce/shared/messaging';
import { OrderCreatedEvent } from '../../domain/events/order-created.event';

export class OrderService {
  private eventPublisher: EventPublisher;

  constructor() {
    this.eventPublisher = new EventPublisher();
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Create order in database
    const order = await this.orderRepository.create(dto);

    // Publish event
    const event = new OrderCreatedEvent({
      orderId: order.id,
      userId: order.userId,
      total: order.total,
      items: order.items
    });

    await this.eventPublisher.publish('domain.order.OrderCreated', event);

    return order;
  }
}
```

### Consumiendo Eventos

```typescript
// apps/inventory-service/src/infrastructure/messaging/event-consumer.ts
import { EventSubscriber } from '@ecommerce/shared/messaging';
import { InventoryService } from '../../application/services/inventory.service';

export class InventoryEventConsumer {
  private inventoryService: InventoryService;

  constructor() {
    this.inventoryService = new InventoryService();
  }

  async start(): Promise<void> {
    const subscriber = new EventSubscriber();

    await subscriber.subscribe(
      'domain.order.OrderCreated',
      this.handleOrderCreated.bind(this)
    );

    await subscriber.subscribe(
      'domain.order.OrderCancelled',
      this.handleOrderCancelled.bind(this)
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await this.inventoryService.reserveStock({
        orderId: event.orderId,
        items: event.items
      });
    } catch (error) {
      logger.error('Failed to reserve stock', { error, event });
      // Implement retry or compensation
    }
  }

  private async handleOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    try {
      await this.inventoryService.releaseReservation(event.orderId);
    } catch (error) {
      logger.error('Failed to release reservation', { error, event });
    }
  }
}
```

---

## Base de Datos

### Prisma Schema

```prisma
// apps/product-service/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Product {
  id          String   @id @default(uuid())
  sku         String   @unique
  name        String
  slug        String   @unique
  description String?
  price       Decimal  @db.Decimal(10, 2)
  comparePrice Decimal? @db.Decimal(10, 2)
  
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  
  images      ProductImage[]
  variants    ProductVariant[]
  inventory   Inventory?
  
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([categoryId])
  @@index([slug])
  @@index([isActive])
  @@map("products")
}

model Category {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  description String?
  parentId    String?
  parent      Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryHierarchy")
  products    Product[]
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@map("categories")
}

model ProductImage {
  id        String  @id @default(uuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  url       String
  alt       String?
  isPrimary Boolean @default(false)
  sortOrder Int     @default(0)
  
  @@map("product_images")
}
```

### Migraciones

```bash
# Crear nueva migración
cd apps/product-service
npx prisma migrate dev --name add_product_variants

# Aplicar migraciones
npx prisma migrate deploy

# Generar cliente
npx prisma generate

# Reset (development only)
npx prisma migrate reset

# Ver estado
npx prisma migrate status
```

### Repositorio Pattern

```typescript
// apps/product-service/src/domain/repositories/product.repository.interface.ts
export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  findAll(options: FindAllOptions): Promise<PaginatedResult<Product>>;
  create(data: CreateProductData): Promise<Product>;
  update(id: string, data: UpdateProductData): Promise<Product>;
  delete(id: string): Promise<void>;
  exists(sku: string): Promise<boolean>;
}

// apps/product-service/src/infrastructure/persistence/prisma-product.repository.ts
import { PrismaClient } from '@prisma/client';
import { IProductRepository } from '../../domain/repositories/product.repository.interface';

export class PrismaProductRepository implements IProductRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async findById(id: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: true,
        inventory: true
      }
    });

    return product ? this.mapToDomain(product) : null;
  }

  async findAll(options: FindAllOptions): Promise<PaginatedResult<Product>> {
    const { page = 1, limit = 20, category, search } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category && { categoryId: category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          images: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.product.count({ where })
    ]);

    return {
      data: products.map(this.mapToDomain),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  private mapToDomain(prismaProduct: PrismaProduct): Product {
    return new Product({
      id: prismaProduct.id,
      sku: prismaProduct.sku,
      name: prismaProduct.name,
      // ...
    });
  }
}
```

---

## Testing

### Estructura de Tests

```
apps/{service}/
├── 📁 src/
└── 📁 tests/
    ├── 📁 unit/              # Tests unitarios
    │   ├── 📁 domain/       # Domain layer tests
    │   ├── 📁 application/  # Application layer tests
    │   └── 📁 infrastructure/ # Infrastructure tests
    ├── 📁 integration/       # Tests de integración
    │   ├── 📁 api/          # API tests
    │   └── 📁 database/     # Database tests
    └── 📁 e2e/               # End-to-end tests
```

### Test Unitario

```typescript
// apps/product-service/tests/unit/services/product.service.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProductService } from '../../../src/application/services/product.service';
import { IProductRepository } from '../../../src/domain/repositories/product.repository.interface';

describe('ProductService', () => {
  let productService: ProductService;
  let mockRepository: jest.Mocked<IProductRepository>;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn()
    } as unknown as jest.Mocked<IProductRepository>;

    productService = new ProductService(mockRepository);
  });

  describe('create', () => {
    it('should create a product successfully', async () => {
      // Arrange
      const dto = {
        sku: 'SKU-123',
        name: 'Test Product',
        price: 99.99,
        categoryId: 'cat-456'
      };

      const expectedProduct = {
        id: 'prod-789',
        ...dto,
        createdAt: new Date()
      };

      mockRepository.exists.mockResolvedValue(false);
      mockRepository.create.mockResolvedValue(expectedProduct);

      // Act
      const result = await productService.create(dto);

      // Assert
      expect(result).toEqual(expectedProduct);
      expect(mockRepository.create).toHaveBeenCalledWith(dto);
    });

    it('should throw error if SKU already exists', async () => {
      // Arrange
      const dto = {
        sku: 'SKU-123',
        name: 'Test Product',
        price: 99.99,
        categoryId: 'cat-456'
      };

      mockRepository.exists.mockResolvedValue(true);

      // Act & Assert
      await expect(productService.create(dto))
        .rejects
        .toThrow('Product with this SKU already exists');
    });
  });
});
```

### Test de Integración

```typescript
// apps/product-service/tests/integration/api/products.test.ts
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../../src/index';
import { prisma } from '../../../src/infrastructure/persistence/prisma';

describe('Products API', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/products', () => {
    it('should return paginated products', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('should filter products by category', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .query({ category: 'electronics' })
        .expect(200);

      expect(response.body.data.every(
        (p: Product) => p.categoryId === 'electronics'
      )).toBe(true);
    });
  });

  describe('POST /api/v1/products', () => {
    it('should create a product with valid data', async () => {
      const productData = {
        sku: 'TEST-001',
        name: 'Test Product',
        price: 99.99,
        categoryId: 'cat-test'
      };

      const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(productData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe(productData.sku);
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid' })  // Missing required fields
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

---

## Debugging

### Configuración de VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Gateway",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["ts-node", "--transpile-only"],
      "args": ["apps/gateway/src/index.ts"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "ecommerce:*"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:debug"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Logging

```typescript
import { logger } from '@ecommerce/shared';

// Different log levels
logger.debug('Debug information', { requestId, userId });
logger.info('User action', { action: 'login', userId });
logger.warn('Warning condition', { resource: 'rate-limit' });
logger.error('Error occurred', { error, context });

// Structured logging
logger.info('Order processed', {
  orderId: order.id,
  userId: order.userId,
  total: order.total,
  items: order.items.length,
  duration: processingTime
});
```

---

## Buenas Prácticas

### Checklist de Desarrollo

```
□ Código
  □ TypeScript strict mode habilitado
  □ Sin errores de lint
  □ Tests unitarios escritos
  □ Cobertura > 80%
  □ Sin console.log (usar logger)

□ API
  □ Validación de inputs
  □ Manejo de errores apropiado
  □ Respuestas consistentes
  □ Documentación actualizada

□ Base de Datos
  □ Migraciones creadas
  □ Índices apropiados
  □ Queries optimizadas

□ Seguridad
  □ Autenticación verificada
  □ Autorización implementada
  □ No exponer datos sensibles
  □ Input sanitizado

□ Performance
  □ Cache donde aplica
  □ N+1 queries evitados
  □ Paginación implementada
```

### Code Review Checklist

```
□ Funcionalidad
  □ Cumple con los requisitos
  □ Maneja casos edge
  □ Sin bugs obvios

□ Calidad de Código
  □ Legible y mantenible
  □ Nombres descriptivos
  □ Sin código duplicado
  □ Principios SOLID

□ Testing
  □ Tests unitarios
  □ Tests de integración
  □ Casos edge cubiertos

□ Documentación
  □ README actualizado
  □ Comentarios donde necesario
  □ API docs actualizadas
```

---

## Referencias

- [Testing Guide](TESTING_GUIDE.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Troubleshooting](TROUBLESHOOTING.md)
