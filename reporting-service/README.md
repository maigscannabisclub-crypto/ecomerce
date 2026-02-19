# 📊 Reporting Service

Microservicio de reportes y análisis para plataforma e-commerce enterprise.

## 🚀 Características

- **Dashboard de Ventas**: Métricas clave en tiempo real
- **Reportes Exportables**: CSV y JSON
- **Agregación de Datos**: Optimizado para consultas rápidas
- **Cache Inteligente**: Redis para reportes frecuentes
- **Procesamiento de Eventos**: RabbitMQ para OrderCompleted/OrderCancelled
- **Logging Estructurado**: Winston con rotación de archivos
- **Health Checks**: Monitoreo de salud de servicios

## 🏗️ Arquitectura

```
src/
├── config/              # Configuración
├── domain/              # Entidades de dominio
│   └── entities/
├── application/         # Casos de uso
│   ├── dto/
│   └── services/
├── infrastructure/      # Implementaciones
│   ├── database/
│   ├── cache/
│   └── messaging/
├── presentation/        # API REST
│   ├── controllers/
│   ├── middleware/
│   └── routes/
└── utils/               # Utilidades
```

## 🛠️ Tecnologías

- **Node.js 20** + TypeScript
- **Express.js** - Framework web
- **Prisma ORM** - Base de datos
- **PostgreSQL** - Persistencia
- **Redis** - Cache
- **RabbitMQ** - Mensajería
- **Joi** - Validación
- **Winston** - Logging
- **Jest** - Testing

## 📦 Instalación

### Requisitos

- Node.js 18+
- Docker y Docker Compose
- PostgreSQL 16
- Redis 7
- RabbitMQ 3

### Desarrollo Local

```bash
# Clonar repositorio
cd reporting-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev

# Seed de datos
npm run db:seed

# Iniciar en modo desarrollo
npm run dev
```

### Docker Compose

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f reporting-service

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes
docker-compose down -v
```

## 🔌 API Endpoints

### Health Check
```
GET /health
```

### Dashboard (Admin only)
```
GET /reports/dashboard
```

### Sales Reports (Admin only)
```
GET /reports/sales?startDate=2024-01-01&endDate=2024-01-31&period=DAILY&page=1&limit=20
```

### Top Products (Admin only)
```
GET /reports/products/top?startDate=2024-01-01&endDate=2024-01-31&limit=10
```

### Revenue (Admin only)
```
GET /reports/revenue?startDate=2024-01-01&endDate=2024-01-31&groupBy=DAILY
```

### Order Metrics (Admin only)
```
GET /reports/orders/metrics?startDate=2024-01-01&endDate=2024-01-31
```

### Export Report (Admin only)
```
GET /reports/export/csv?startDate=2024-01-01&endDate=2024-01-31
GET /reports/export/json?startDate=2024-01-01&endDate=2024-01-31
```

## 📊 Modelos de Datos

### SalesReport
```prisma
model SalesReport {
  id          String   @id @default(uuid())
  period      String   // DAILY, WEEKLY, MONTHLY, YEARLY
  periodStart DateTime
  periodEnd   DateTime
  totalOrders Int
  totalRevenue Decimal @db.Decimal(12, 2)
  totalTax    Decimal @db.Decimal(12, 2)
  totalShipping Decimal @db.Decimal(12, 2)
  averageOrderValue Decimal @db.Decimal(10, 2)
  data        Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### ProductSales
```prisma
model ProductSales {
  id          String   @id @default(uuid())
  productId   String
  productName String
  productSku  String
  period      String
  periodStart DateTime
  quantity    Int
  revenue     Decimal @db.Decimal(12, 2)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### DailyMetric
```prisma
model DailyMetric {
  id          String   @id @default(uuid())
  date        DateTime @unique
  totalOrders Int      @default(0)
  totalRevenue Decimal @default(0) @db.Decimal(12, 2)
  newCustomers Int    @default(0)
  topProductId String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## 📡 Eventos Consumidos

### OrderCompleted
```json
{
  "eventId": "evt-123",
  "eventType": "OrderCompleted",
  "timestamp": "2024-01-01T12:00:00Z",
  "payload": {
    "orderId": "ord-456",
    "customerId": "cust-789",
    "items": [...],
    "totalAmount": 100.00,
    "tax": 10.00,
    "shipping": 5.00,
    "completedAt": "2024-01-01T12:00:00Z"
  }
}
```

### OrderCancelled
```json
{
  "eventId": "evt-124",
  "eventType": "OrderCancelled",
  "timestamp": "2024-01-01T13:00:00Z",
  "payload": {
    "orderId": "ord-456",
    "customerId": "cust-789",
    "items": [...],
    "totalAmount": 100.00,
    "tax": 10.00,
    "shipping": 5.00,
    "cancelledAt": "2024-01-01T13:00:00Z",
    "reason": "Customer request"
  }
}
```

## 🧪 Testing

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

## 📁 Estructura de Archivos

```
reporting-service/
├── prisma/
│   ├── schema.prisma      # Esquema de base de datos
│   └── seed.ts            # Datos iniciales
├── src/
│   ├── config/
│   │   └── index.ts       # Configuración
│   ├── domain/
│   │   └── entities/
│   │       └── Report.ts  # Entidades de dominio
│   ├── application/
│   │   ├── dto/
│   │   │   └── ReportDTO.ts
│   │   └── services/
│   │       └── ReportService.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   │   └── prisma.ts
│   │   ├── cache/
│   │   │   └── redis.ts
│   │   └── messaging/
│   │       ├── rabbitmq.ts
│   │       └── eventHandlers.ts
│   ├── presentation/
│   │   ├── controllers/
│   │   │   └── ReportController.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── routes/
│   │       └── report.routes.ts
│   ├── utils/
│   │   └── logger.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── unit/
│   │   └── report.service.test.ts
│   ├── integration/
│   │   └── report.routes.test.ts
│   └── setup.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── jest.config.js
└── .env.example
```

## 🔐 Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | Entorno | `development` |
| `PORT` | Puerto del servicio | `3006` |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `REDIS_URL` | URL de Redis | - |
| `RABBITMQ_URL` | URL de RabbitMQ | - |
| `JWT_SECRET` | Secreto JWT | - |
| `LOG_LEVEL` | Nivel de logging | `info` |
| `CACHE_TTL_DASHBOARD` | TTL dashboard (seg) | `900` |
| `CACHE_TTL_REPORT` | TTL reportes (seg) | `3600` |

## 📈 Monitoreo

### Health Check
```bash
curl http://localhost:3006/health
```

### Métricas
- Total de órdenes
- Ingresos totales
- Valor promedio de orden
- Productos más vendidos
- Tendencias diarias

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 👥 Autores

- E-commerce Platform Team

---

<p align="center">Built with ❤️ for enterprise e-commerce</p>
