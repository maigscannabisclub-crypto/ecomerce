# Cart Service

Microservicio de carrito de compras para plataforma e-commerce enterprise.

## Características

- **Carrito por usuario**: Un carrito activo por usuario
- **Gestión de items**: Agregar, actualizar, eliminar items
- **Validación de stock**: Consulta al inventory-service
- **Cálculo automático**: Totales y subtotales
- **Expiración**: Carritos inactivos expiran después de 7 días
- **Merge de carritos**: Combinar carrito anónimo al loguear
- **Cache Redis**: Cache de carritos activos
- **Circuit Breaker**: Protección contra fallos del inventory-service

## Tecnologías

- Express.js + TypeScript
- Prisma ORM + PostgreSQL
- Redis para cache
- Joi para validación
- Winston para logging
- Axios + Circuit Breaker
- Jest para testing

## Estructura del Proyecto

```
cart-service/
├── prisma/
│   ├── schema.prisma      # Esquema de base de datos
│   └── seed.ts            # Datos iniciales
├── src/
│   ├── config/            # Configuración
│   ├── domain/entities/   # Entidades de dominio
│   ├── application/       # DTOs y servicios
│   ├── infrastructure/    # Database, cache, HTTP
│   ├── presentation/      # Controllers, middleware, routes
│   ├── utils/             # Logger, circuit breaker
│   ├── app.ts             # App Express
│   └── server.ts          # Entry point
├── tests/
│   ├── unit/              # Tests unitarios
│   └── integration/       # Tests de integración
├── Dockerfile             # Multi-stage build
├── docker-compose.yml     # Orquestación
└── package.json           # Dependencias
```

## Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev

# Seed de datos
npx prisma db seed
```

## Uso

### Desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev
```

### Docker

```bash
# Desarrollo
docker-compose up

# Producción
docker-compose --profile production up
```

### Testing

```bash
# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Todos los tests con coverage
npm run test:coverage
```

## API Endpoints

### Carrito

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/cart` | Obtener carrito del usuario | Sí |
| POST | `/cart/items` | Agregar item al carrito | Sí |
| PUT | `/cart/items/:itemId` | Actualizar cantidad | Sí |
| DELETE | `/cart/items/:itemId` | Eliminar item | Sí |
| DELETE | `/cart` | Vaciar carrito | Sí |
| POST | `/cart/merge` | Merge carrito anónimo | Sí |

### Health

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Ejemplos de Uso

### Obtener carrito

```bash
curl -X GET http://localhost:3003/cart \
  -H "Authorization: Bearer <token>"
```

### Agregar item

```bash
curl -X POST http://localhost:3003/cart/items \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-123",
    "quantity": 2
  }'
```

### Actualizar cantidad

```bash
curl -X PUT http://localhost:3003/cart/items/item-123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 5
  }'
```

### Eliminar item

```bash
curl -X DELETE http://localhost:3003/cart/items/item-123 \
  -H "Authorization: Bearer <token>"
```

### Vaciar carrito

```bash
curl -X DELETE http://localhost:3003/cart \
  -H "Authorization: Bearer <token>"
```

### Merge carritos

```bash
curl -X POST http://localhost:3003/cart/merge \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceCartId": "cart-anonymous-123"
  }'
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servicio | 3003 |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `REDIS_URL` | URL de Redis | - |
| `JWT_SECRET` | Secret para JWT | - |
| `INVENTORY_SERVICE_URL` | URL del inventory-service | http://localhost:3002 |
| `CART_EXPIRATION_DAYS` | Días de expiración | 7 |
| `LOG_LEVEL` | Nivel de logging | info |

## Circuit Breaker

El circuit breaker protege las llamadas al inventory-service:

- **Estados**: CLOSED, OPEN, HALF_OPEN
- **Umbral de fallos**: 5 fallos
- **Timeout**: 30 segundos
- **Reset**: 60 segundos

## Modelo de Datos

### Cart

```prisma
model Cart {
  id        String     @id @default(uuid())
  userId    String     @unique
  items     CartItem[]
  total     Decimal    @default(0)
  status    CartStatus @default(ACTIVE)
  expiresAt DateTime
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}
```

### CartItem

```prisma
model CartItem {
  id          String   @id @default(uuid())
  cartId      String
  productId   String
  productName String
  productSku  String
  quantity    Int
  unitPrice   Decimal
  subtotal    Decimal
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Licencia

MIT
