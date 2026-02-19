# Product Service

Microservicio de gestión de productos para plataforma de e-commerce enterprise.

## Características

- ✅ CRUD completo de productos
- ✅ CRUD de categorías y subcategorías
- ✅ Búsqueda con filtros avanzados
- ✅ Paginación
- ✅ Cache con Redis
- ✅ Eventos asíncronos con RabbitMQ
- ✅ Health checks
- ✅ Logging estructurado
- ✅ Autenticación JWT con roles
- ✅ Validación de datos con Joi

## Tecnologías

- **Runtime:** Node.js 20
- **Framework:** Express.js + TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Cache:** Redis
- **Message Queue:** RabbitMQ
- **Testing:** Jest + Supertest

## Estructura del Proyecto

```
src/
├── config/           # Configuración del servicio
├── domain/           # Entidades de dominio
│   └── entities/
├── application/      # Lógica de aplicación
│   ├── dto/         # Data Transfer Objects
│   └── services/    # Servicios de negocio
├── infrastructure/   # Infraestructura
│   ├── database/    # Prisma client
│   ├── cache/       # Redis client
│   └── messaging/   # RabbitMQ client
├── presentation/     # Capa de presentación
│   ├── controllers/ # Controladores HTTP
│   ├── middleware/  # Middlewares
│   └── routes/      # Definición de rutas
└── utils/           # Utilidades
    └── logger.ts    # Logger con Winston
```

## Requisitos

- Docker y Docker Compose
- Node.js 18+ (para desarrollo local)

## Inicio Rápido

### Con Docker Compose (Recomendado)

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f product-service

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes
docker-compose down -v
```

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev

# Sembrar datos iniciales
npx prisma db seed

# Iniciar en modo desarrollo
npm run dev
```

## API Endpoints

### Health Check
- `GET /api/v1/health` - Estado del servicio

### Productos (Público)
- `GET /api/v1/products` - Listar productos
- `GET /api/v1/products/:id` - Obtener producto por ID
- `GET /api/v1/products/search?q=query` - Buscar productos

### Productos (Admin - Requiere JWT)
- `POST /api/v1/products` - Crear producto
- `PUT /api/v1/products/:id` - Actualizar producto
- `DELETE /api/v1/products/:id` - Eliminar producto
- `PATCH /api/v1/products/:id/stock` - Actualizar stock

### Categorías (Público)
- `GET /api/v1/categories` - Listar categorías
- `GET /api/v1/categories/:id` - Obtener categoría

### Categorías (Admin)
- `POST /api/v1/categories` - Crear categoría
- `PUT /api/v1/categories/:id` - Actualizar categoría
- `DELETE /api/v1/categories/:id` - Eliminar categoría

### Subcategorías (Público)
- `GET /api/v1/categories/:categoryId/subcategories` - Listar subcategorías
- `GET /api/v1/subcategories/:id` - Obtener subcategoría

### Subcategorías (Admin)
- `POST /api/v1/subcategories` - Crear subcategoría
- `PUT /api/v1/subcategories/:id` - Actualizar subcategoría
- `DELETE /api/v1/subcategories/:id` - Eliminar subcategoría

## Parámetros de Consulta

### Listar Productos
```
GET /api/v1/products?page=1&limit=10&sortBy=price&sortOrder=asc&categoryId=xxx&minPrice=10&maxPrice=100
```

### Buscar Productos
```
GET /api/v1/products/search?q=taza&categoryId=xxx&page=1&limit=10
```

## Eventos Publicados

El servicio publica los siguientes eventos a RabbitMQ:

- `product.created` - Producto creado
- `product.updated` - Producto actualizado
- `product.deleted` - Producto eliminado
- `product.stock.changed` - Stock actualizado

## Testing

```bash
# Ejecutar todos los tests
npm test

# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Cobertura
npm run test:coverage
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | Entorno | `development` |
| `PORT` | Puerto del servicio | `3002` |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `REDIS_URL` | URL de Redis | - |
| `RABBITMQ_URL` | URL de RabbitMQ | - |
| `JWT_SECRET` | Secreto JWT | - |
| `LOG_LEVEL` | Nivel de logging | `debug` |

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Iniciar en modo desarrollo |
| `npm run build` | Compilar TypeScript |
| `npm start` | Iniciar en producción |
| `npm test` | Ejecutar tests |
| `npm run prisma:migrate` | Ejecutar migraciones |
| `npm run prisma:seed` | Sembrar datos |
| `npm run prisma:studio` | Abrir Prisma Studio |

## Licencia

MIT
