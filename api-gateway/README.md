# API Gateway - E-Commerce Enterprise

API Gateway centralizado para la plataforma de e-commerce enterprise. Proporciona enrutamiento a microservicios, autenticación JWT, rate limiting, logging estructurado y propagación de correlation IDs.

## Características

- **Enrutamiento a Microservicios**: Proxy a 6 servicios (auth, products, cart, orders, inventory, reporting)
- **Autenticación JWT**: Validación de tokens con soporte para roles y permisos
- **Rate Limiting**: Por IP y por usuario, con límites diferenciados por endpoint
- **Correlation ID**: Propagación automática de IDs de correlación entre servicios
- **Logging Estructurado**: Winston con formato JSON para producción
- **Headers de Seguridad**: Helmet para protección contra ataques comunes
- **CORS Configurable**: Soporte para múltiples orígenes
- **Health Checks**: Endpoints para monitoreo y orquestación

## Arquitectura

```
                    ┌─────────────────┐
                    │   API Gateway   │
                    │     :3000       │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐       ┌─────▼─────┐
   │  Auth   │         │ Products  │       │   Cart    │
   │  :3001  │         │   :3002   │       │   :3003   │
   └─────────┘         └───────────┘       └───────────┘

   ┌─────────┐         ┌───────────┐       ┌───────────┐
   │ Orders  │         │ Inventory │       │ Reporting │
   │  :3004  │         │   :3005   │       │   :3006   │
   └─────────┘         └───────────┘       └───────────┘
```

## Requisitos

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker (opcional)

## Instalación

```bash
# Clonar el repositorio
cd ecommerce-platform/services/api-gateway

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones
```

## Configuración

Variables de entorno principales:

```env
# Application
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_ISSUER=ecommerce-api-gateway
JWT_AUDIENCE=ecommerce-services

# Microservices URLs
SERVICE_AUTH_URL=http://localhost:3001
SERVICE_PRODUCTS_URL=http://localhost:3002
SERVICE_CART_URL=http://localhost:3003
SERVICE_ORDERS_URL=http://localhost:3004
SERVICE_INVENTORY_URL=http://localhost:3005
SERVICE_REPORTING_URL=http://localhost:3006

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

## Uso

### Desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev
```

### Producción

```bash
# Compilar TypeScript
npm run build

# Iniciar servidor
npm start
```

### Docker

```bash
# Construir imagen
docker build -t api-gateway .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env api-gateway

# O usar docker-compose
docker-compose up -d
```

## Endpoints

### Health Checks

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Estado básico del gateway |
| `GET /health/ready` | Readiness probe |
| `GET /health/live` | Liveness probe |
| `GET /health/detailed` | Estado detallado con servicios |

### API Routes

#### Auth Service (Port 3001)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | No | Registro de usuario |
| POST | `/api/v1/auth/login` | No | Inicio de sesión |
| POST | `/api/v1/auth/refresh` | No | Refrescar token |
| POST | `/api/v1/auth/logout` | Sí | Cerrar sesión |
| GET | `/api/v1/auth/me` | Sí | Perfil de usuario |

#### Products Service (Port 3002)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/v1/products` | No | Listar productos |
| GET | `/api/v1/products/:id` | No | Detalle de producto |
| POST | `/api/v1/admin/products` | Admin | Crear producto |

#### Cart Service (Port 3003)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/v1/cart` | Sí | Ver carrito |
| POST | `/api/v1/cart` | Sí | Agregar al carrito |
| PUT | `/api/v1/cart/items/:id` | Sí | Actualizar item |
| DELETE | `/api/v1/cart/items/:id` | Sí | Eliminar item |

#### Orders Service (Port 3004)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/v1/orders` | Sí | Listar órdenes |
| POST | `/api/v1/orders` | Sí | Crear orden |
| GET | `/api/v1/orders/:id` | Sí | Detalle de orden |

#### Inventory Service (Port 3005)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/v1/inventory/:productId` | Sí | Consultar stock |
| POST | `/api/v1/inventory/reserve` | Sí | Reservar stock |
| POST | `/api/v1/inventory/release` | Sí | Liberar reserva |

#### Reporting Service (Port 3006)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/v1/reports` | Admin | Reportes generales |
| GET | `/api/v1/reports/sales` | Admin | Reporte de ventas |
| GET | `/api/v1/reports/inventory` | Admin | Reporte de inventario |

## Testing

```bash
# Ejecutar todos los tests
npm test

# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Coverage
npm run test:coverage
```

## Estructura del Proyecto

```
api-gateway/
├── src/
│   ├── config/
│   │   └── index.ts          # Configuración centralizada
│   ├── middleware/
│   │   ├── auth.ts           # Validación JWT
│   │   ├── correlation.ts    # Correlation ID
│   │   ├── errorHandler.ts   # Manejo de errores
│   │   ├── logger.ts         # Winston logger
│   │   └── rateLimiter.ts    # Rate limiting
│   ├── routes/
│   │   └── index.ts          # Definición de rutas proxy
│   ├── types/
│   │   └── index.ts          # Tipos TypeScript
│   ├── app.ts                # Aplicación Express
│   └── server.ts             # Entry point
├── tests/
│   ├── unit/
│   │   └── gateway.test.ts   # Tests unitarios
│   ├── integration/
│   │   └── proxy.test.ts     # Tests de integración
│   └── setup.ts              # Configuración de tests
├── Dockerfile                # Multi-stage build
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Middleware

### Autenticación

```typescript
import { authenticate, requireRole } from './middleware/auth';

// Rutas protegidas
router.get('/protected', authenticate, handler);

// Rutas con roles específicos
router.get('/admin', authenticate, requireRole('ADMIN'), handler);
```

### Rate Limiting

```typescript
import { apiRateLimiter, authRateLimiter } from './middleware/rateLimiter';

// Rate limiting general
router.use('/api', apiRateLimiter);

// Rate limiting para auth (más estricto)
router.use('/api/v1/auth', authRateLimiter);
```

### Correlation ID

```typescript
import { correlationMiddleware, getCorrelationId } from './middleware/correlation';

// El correlation ID se propaga automáticamente
// Se genera uno nuevo si no existe en el header x-correlation-id
```

## Logging

El gateway utiliza Winston para logging estructurado:

```typescript
import { logger } from './middleware/logger';

logger.info('Mensaje informativo');
logger.warn('Advertencia');
logger.error('Error', { error: err });
```

## Seguridad

- **Helmet**: Headers de seguridad (HSTS, CSP, etc.)
- **CORS**: Configuración flexible de orígenes permitidos
- **Rate Limiting**: Protección contra abuso
- **JWT**: Tokens firmados con expiración

## Monitoreo

### Health Checks

```bash
# Liveness probe
curl http://localhost:3000/health/live

# Readiness probe
curl http://localhost:3000/health/ready

# Estado detallado
curl http://localhost:3000/health/detailed
```

### Métricas

El gateway expone headers de rate limiting:
- `X-RateLimit-Limit`: Límite de requests
- `X-RateLimit-Remaining`: Requests restantes
- `X-RateLimit-Reset`: Tiempo de reset

## Contribución

1. Fork el repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## Licencia

MIT
