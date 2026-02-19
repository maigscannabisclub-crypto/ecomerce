# Inventory Service

Microservicio de gestión de inventario para plataforma de e-commerce enterprise.

## Características

- ✅ Gestión completa de stock por producto
- ✅ Reserva y liberación de stock para órdenes
- ✅ Ajuste de inventario (entradas/salidas)
- ✅ Historial completo de movimientos
- ✅ Alertas de stock bajo
- ✅ Comunicación asíncrona con RabbitMQ
- ✅ Idempotencia garantizada para eventos
- ✅ Autenticación JWT y autorización por roles
- ✅ Logging estructurado con Winston
- ✅ Health checks y métricas
- ✅ Docker multi-stage

## Tecnologías

- **Runtime**: Node.js 18+
- **Framework**: Express.js + TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Message Broker**: RabbitMQ
- **Testing**: Jest + Supertest
- **Logging**: Winston

## Estructura del Proyecto

```
src/
├── config/              # Configuración
├── domain/              # Entidades de dominio
│   └── entities/
├── application/         # Lógica de aplicación
│   ├── dto/            # Data Transfer Objects
│   └── services/       # Servicios de negocio
├── infrastructure/      # Infraestructura
│   ├── database/       # Cliente Prisma
│   └── messaging/      # RabbitMQ
├── presentation/        # Capa de presentación
│   ├── controllers/    # Controladores HTTP
│   ├── middleware/     # Middlewares
│   └── routes/         # Definición de rutas
└── utils/              # Utilidades
    ├── logger.ts       # Logger
    └── idempotency.ts  # Servicio de idempotencia
```

## Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Seed de datos iniciales
npm run prisma:seed
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
# Construir y ejecutar con docker-compose
docker-compose up -d

# Ver logs
docker-compose logs -f inventory-service
```

## API Endpoints

### Health Check
- `GET /health` - Estado del servicio

### Inventario
- `GET /api/v1/inventory` - Listar inventario (paginado)
- `POST /api/v1/inventory` - Crear registro de inventario (ADMIN)
- `GET /api/v1/inventory/:productId` - Obtener stock de producto
- `GET /api/v1/inventory/sku/:sku` - Obtener stock por SKU
- `PATCH /api/v1/inventory/:productId` - Actualizar inventario (ADMIN)
- `DELETE /api/v1/inventory/:productId` - Eliminar inventario (ADMIN)

### Operaciones de Stock
- `POST /api/v1/inventory/:productId/reserve` - Reservar stock
- `POST /api/v1/inventory/:productId/release` - Liberar stock
- `POST /api/v1/inventory/:productId/adjust` - Ajustar inventario (ADMIN)

### Batch Operations
- `POST /api/v1/inventory/batch/reserve` - Reservar múltiples productos
- `POST /api/v1/inventory/batch/release` - Liberar múltiples productos

### Consultas
- `GET /api/v1/inventory/:productId/movements` - Historial de movimientos (ADMIN)
- `GET /api/v1/inventory/alerts/low-stock` - Alertas de stock bajo (ADMIN)

## Eventos

### Consumidos (RabbitMQ)
- `OrderCreated` → Reservar stock
- `OrderFailed` → Liberar stock reservado
- `OrderCancelled` → Liberar stock reservado

### Publicados (RabbitMQ)
- `StockReserved` - Stock reservado exitosamente
- `StockReleased` - Stock liberado
- `StockReservationFailed` - Fallo en reserva
- `LowStockAlert` - Alerta de stock bajo

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

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto del servidor | `3005` |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `RABBITMQ_URL` | URL de RabbitMQ | `amqp://localhost:5672` |
| `JWT_SECRET` | Secreto para JWT | - |
| `LOG_LEVEL` | Nivel de logging | `info` |

## Licencia

MIT
