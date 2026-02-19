# Tests de Validación - E-commerce Platform

Este directorio contiene los tests de validación para la plataforma e-commerce, incluyendo health checks, smoke tests, validación de contratos y pruebas de caos.

## 📁 Estructura

```
tests/
├── README.md                          # Este archivo
├── run-all.sh                         # Script maestro para ejecutar todos los tests
├── coverage-check.sh                  # Script para verificar cobertura mínima del 70%
├── validation/
│   ├── health-check.test.js          # Verifica salud de servicios y conexiones
│   ├── smoke-test.test.js            # Flujo básico end-to-end
│   ├── contract-validation.test.js   # Validación de contratos entre servicios
│   └── chaos-test.sh                 # Pruebas de resiliencia y caos
└── reports/                          # Reportes generados (creado automáticamente)
```

## 🚀 Uso Rápido

### Ejecutar todos los tests
```bash
./tests/run-all.sh
```

### Ejecutar tests con cobertura
```bash
./tests/run-all.sh --coverage
```

### Ejecutar tests en modo CI
```bash
./tests/run-all.sh --ci
```

### Saltar tests específicos
```bash
./tests/run-all.sh --skip-chaos --skip-e2e
```

## 📋 Tests Individuales

### 1. Health Check Tests

Verifica que todos los servicios respondan correctamente y las conexiones a dependencias estén funcionando.

```bash
npx jest tests/validation/health-check.test.js
```

**Verifica:**
- ✅ Todos los servicios responden a `/health`
- ✅ Conexiones a bases de datos PostgreSQL
- ✅ Conexión a RabbitMQ
- ✅ Conexión a Redis
- ✅ Al menos 50% de servicios saludables
- ✅ Servicios críticos operativos

**Variables de entorno:**
```bash
API_GATEWAY_URL=http://localhost:3000
AUTH_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
CART_SERVICE_URL=http://localhost:3003
ORDER_SERVICE_URL=http://localhost:3004
INVENTORY_SERVICE_URL=http://localhost:3005
PAYMENT_SERVICE_URL=http://localhost:3006
NOTIFICATION_SERVICE_URL=http://localhost:3007
REPORTING_SERVICE_URL=http://localhost:3008
RABBITMQ_URL=amqp://localhost:5672
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 2. Smoke Tests

Valida el flujo básico completo de la plataforma e-commerce.

```bash
npx jest tests/validation/smoke-test.test.js
```

**Flujo validado:**
1. ✅ Registro de usuario
2. ✅ Login con credenciales válidas
3. ✅ Validación de token JWT
4. ✅ Listado de productos con paginación
5. ✅ Búsqueda de productos
6. ✅ Detalles de producto
7. ✅ Verificación de inventario
8. ✅ Creación de carrito
9. ✅ Agregar items al carrito
10. ✅ Creación de orden
11. ✅ Consulta de órdenes del usuario

### 3. Contract Validation Tests

Valida contratos entre servicios y formatos de eventos.

```bash
npx jest tests/validation/contract-validation.test.js
```

**Valida:**
- ✅ Estructura de respuestas API
- ✅ Formatos de eventos (OrderCreated, InventoryReserved, PaymentProcessed, UserRegistered)
- ✅ Contratos de integración entre servicios
- ✅ Formatos de errores estandarizados
- ✅ Consistencia de IDs entre servicios

### 4. Chaos Tests

Pruebas de ingeniería del caos para validar resiliencia.

```bash
./tests/validation/chaos-test.sh
```

**Simulaciones:**
- ✅ Caída del inventory-service
- ✅ Verificación de circuit breaker
- ✅ Verificación de retry mechanism
- ✅ Simulación de alta latencia
- ✅ Verificación de resiliencia del sistema
- ✅ Prevención de fallos en cascada

**Requisitos:**
- Docker disponible
- Contenedor `inventory-service` accesible

### 5. Coverage Check

Verifica que la cobertura de código sea al menos del 70%.

```bash
./tests/coverage-check.sh
```

**Umbrales:**
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%
- Total: 70%

**Reportes generados:**
- Reporte de texto: `tests/coverage-reports/coverage-report-*.txt`
- Reporte JSON: `tests/coverage-reports/coverage-report-*.json`
- Reporte HTML: `tests/coverage-reports/html-report-*/index.html`

**Personalizar umbral:**
```bash
./tests/coverage-check.sh --threshold 80
```

## 🔧 Configuración

### Configuración de Jest

Los tests utilizan las configuraciones existentes en `testing/`:

- `jest.config.unit.js` - Tests unitarios
- `jest.config.integration.js` - Tests de integración
- `jest.config.contract.js` - Tests de contrato

### Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Service URLs
API_GATEWAY_URL=http://localhost:3000
AUTH_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
CART_SERVICE_URL=http://localhost:3003
ORDER_SERVICE_URL=http://localhost:3004
INVENTORY_SERVICE_URL=http://localhost:3005
PAYMENT_SERVICE_URL=http://localhost:3006
NOTIFICATION_SERVICE_URL=http://localhost:3007
REPORTING_SERVICE_URL=http://localhost:3008

# Database
AUTH_DB_HOST=localhost
AUTH_DB_PORT=5432
AUTH_DB_NAME=auth_db
AUTH_DB_USER=auth_user
AUTH_DB_PASSWORD=auth_pass

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## 📊 Reportes

### Reporte Consolidado

El script `run-all.sh` genera tres tipos de reportes:

1. **Reporte de Texto**: `tests/reports/consolidated-report-*.txt`
2. **Reporte JSON**: `tests/reports/consolidated-report-*.json`
3. **Reporte HTML**: `tests/reports/consolidated-report-*.html`

### Estructura del Reporte JSON

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "duration": 300,
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 1,
    "skipped": 1,
    "success_rate": 88.9
  },
  "results": {
    "unit": "PASSED",
    "integration": "PASSED",
    "contract": "PASSED",
    "e2e": "PASSED",
    "health-check": "PASSED",
    "smoke": "PASSED",
    "chaos": "PASSED",
    "coverage": "PASSED"
  },
  "configuration": {
    "ci_mode": false,
    "coverage_mode": true,
    "parallel": false
  }
}
```

## 🔄 Integración CI/CD

### GitHub Actions

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run all tests
        run: ./tests/run-all.sh --ci --coverage
        
      - name: Upload coverage report
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: tests/coverage-reports/
```

### GitLab CI

```yaml
stages:
  - test

test:
  stage: test
  image: node:18
  script:
    - npm ci
    - ./tests/run-all.sh --ci --coverage
  artifacts:
    paths:
      - tests/reports/
      - tests/coverage-reports/
```

## 🛠️ Troubleshooting

### Tests fallan por conexión

Los tests están diseñados para no fallar si los servicios no están disponibles. Verifica:

1. Que los servicios estén corriendo
2. Que las URLs sean correctas
3. Que no haya firewalls bloqueando conexiones

### Chaos tests no funcionan

Requisitos para chaos tests:
- Docker instalado y ejecutándose
- Contenedor `inventory-service` existe
- Permisos para ejecutar comandos Docker

### Cobertura baja del 70%

Para aumentar la cobertura:
1. Agrega más tests unitarios
2. Asegúrate de probar casos edge
3. Verifica que todos los branches estén cubiertos

## 📚 Referencias

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Pact Contract Testing](https://pact.io/)
- [Chaos Engineering Principles](https://principlesofchaos.org/)
