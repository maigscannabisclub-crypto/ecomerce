# E-Commerce Platform Testing Suite

Suite completa de testing para la plataforma e-commerce con tests unitarios, integración, contratos, E2E, carga y caos.

## 📋 Tabla de Contenidos

- [Estructura](#estructura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Tests Unitarios](#tests-unitarios)
- [Tests de Integración](#tests-de-integración)
- [Contract Tests](#contract-tests)
- [Tests E2E](#tests-e2e)
- [Tests de Carga](#tests-de-carga)
- [Tests de Caos](#tests-de-caos)
- [Cobertura](#cobertura)
- [CI/CD](#cicd)

## 📁 Estructura

```
testing/
├── unit/                          # Tests unitarios por servicio
├── integration/                   # Tests de integración
│   ├── setup.ts                  # Configuración de testcontainers
│   ├── database.test.ts          # Tests de base de datos
│   ├── api.test.ts               # Tests de APIs HTTP
│   └── events.test.ts            # Tests de eventos RabbitMQ
├── contract/                      # Contract tests con Pact
│   ├── consumer/                 # Tests del consumidor
│   └── provider/                 # Verificación del provider
├── e2e/                          # End-to-end tests con Cypress
│   ├── cypress.config.ts
│   ├── fixtures/                 # Datos de prueba
│   ├── support/                  # Comandos personalizados
│   └── specs/                    # Specs de tests
├── load/                         # Tests de carga con Artillery
│   ├── artillery.config.yml
│   └── scenarios/                # Escenarios de carga
├── chaos/                        # Chaos engineering
│   ├── chaos-experiments.yml
│   └── scripts/                  # Scripts de caos
├── coverage/                     # Reportes de cobertura
├── jest.config.*.js             # Configuraciones de Jest
├── docker-compose.test.yml      # Infraestructura de tests
├── run-tests.sh                 # Script principal
└── README.md                    # Este archivo
```

## 🔧 Requisitos

- Node.js 18+
- Docker y Docker Compose
- Kubernetes (para chaos tests)
- kubectl

### Dependencias

```bash
# Instalar dependencias de testing
npm install --save-dev \
  jest \
  @types/jest \
  ts-jest \
  supertest \
  @types/supertest \
  testcontainers \
  @pact-foundation/pact \
  artillery \
  cypress
```

## 📦 Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd ecommerce-platform

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.test.example .env.test
```

## 🧪 Tests Unitarios

Cobertura mínima: **70%** en branches, functions, lines y statements.

### Ejecutar tests unitarios

```bash
# Todos los tests unitarios
npm run test:unit

# Con cobertura
npm run test:unit -- --coverage

# Modo watch
npm run test:unit -- --watch

# Un archivo específico
npm run test:unit -- services/order-service/src/order.service.test.ts
```

### Estructura de tests unitarios

```
services/
├── order-service/
│   └── src/
│       ├── order.service.ts
│       ├── order.service.test.ts      # Test del servicio
│       ├── order.controller.test.ts   # Test del controller
│       └── order.repository.test.ts   # Test del repositorio
```

## 🔗 Tests de Integración

Tests de integración con bases de datos reales usando testcontainers.

### Ejecutar tests de integración

```bash
# Iniciar infraestructura
docker-compose -f testing/docker-compose.test.yml up -d

# Ejecutar tests
npm run test:integration

# Con cobertura
npm run test:integration -- --coverage
```

### Componentes testeados

- **Database**: PostgreSQL con transacciones, índices, constraints
- **API**: Endpoints HTTP con Supertest
- **Events**: RabbitMQ con exchanges, queues, routing keys

## 📜 Contract Tests

Consumer-driven contract testing con Pact.

### Ejecutar contract tests

```bash
# Tests del consumidor
npm run test:contract:consumer

# Verificación del provider
npm run test:contract:provider

# Publicar contratos
npm run test:contract:publish
```

### Servicios con contratos

| Consumidor | Provider | Estado |
|------------|----------|--------|
| web-frontend | order-service | ✅ |
| web-frontend | product-service | ✅ |
| order-service | inventory-service | ✅ |
| order-service | payment-service | ✅ |

## 🎭 Tests E2E

End-to-end tests con Cypress.

### Ejecutar tests E2E

```bash
# Modo interactivo
npm run test:e2e

# Modo headless (CI)
npm run test:e2e -- --headless

# Un spec específico
npm run test:e2e -- --spec "testing/e2e/specs/auth.spec.ts"

# Con grabación de video
npm run test:e2e -- --record
```

### Flujos testeados

1. **Usuario completo**: Registro → Login → Navegación → Compra
2. **Admin**: Crear producto → Actualizar stock → Ver reportes
3. **Resiliencia**: Caída de servicio → Circuit breaker → Retry

## ⚡ Tests de Carga

Performance testing con Artillery.

### Escenarios

| Escenario | Descripción | Target |
|-----------|-------------|--------|
| browse-products | 1000 usuarios navegando | 200ms p95 |
| create-order | 100 órdenes/minuto | 1000ms p95 |
| mixed-traffic | Pico 5000 RPS | 500ms p95 |

### Ejecutar tests de carga

```bash
# Escenario de navegación
artillery run testing/load/scenarios/browse-products.yml

# Escenario de órdenes
artillery run testing/load/scenarios/create-order.yml

# Tráfico mixto
artillery run testing/load/scenarios/mixed-traffic.yml

# Todos los escenarios
npm run test:load
```

### Métricas reportadas

- Response time (p50, p95, p99)
- Requests per second
- Error rate
- Throughput

## 🔥 Tests de Caos

Chaos engineering para validar resiliencia.

### Experimentos

| Experimento | Descripción | Hipótesis |
|-------------|-------------|-----------|
| pod-failure | Matar pods de inventory-service | Circuit breaker activado |
| network-delay | Delay de 5s en payment-service | Timeouts y retries |
| network-partition | Aislar order de inventory | Fallback graceful |
| cpu-stress | 80% CPU en product-service | HPA escala automáticamente |
| memory-stress | OOM en user-service | Pod reinicia, sesiones persisten |

### Ejecutar tests de caos

```bash
# Partición de red
bash testing/chaos/scripts/network-partition.sh order-service inventory-service

# Todos los experimentos
npm run test:chaos
```

## 📊 Cobertura

### Generar reporte de cobertura

```bash
# Merge de todos los reportes
node testing/coverage/merge-reports.js

# O usar el script principal
./testing/run-tests.sh --coverage all
```

### Umbrales de cobertura

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70
  }
}
```

### Reportes generados

- HTML: `testing/coverage/reports/index.html`
- LCOV: `testing/coverage/reports/lcov.info`
- JSON: `testing/coverage/reports/coverage-summary.json`

## 🚀 CI/CD

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
      
      - name: Run unit tests
        run: npm run test:unit -- --coverage
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Run contract tests
        run: npm run test:contract
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 🛠️ Script Principal

### Uso

```bash
./testing/run-tests.sh [OPTIONS] [TEST_TYPES]

# Ejemplos
./testing/run-tests.sh                    # Todos los tests
./testing/run-tests.sh unit               # Solo unit tests
./testing/run-tests.sh -c unit integration # Unit + integration con cobertura
./testing/run-tests.sh --ci all           # Modo CI
./testing/run-tests.sh --parallel all     # Ejecución paralela
```

### Opciones

| Opción | Descripción |
|--------|-------------|
| `-h, --help` | Mostrar ayuda |
| `-v, --verbose` | Modo verbose |
| `-c, --coverage` | Generar cobertura |
| `-w, --watch` | Modo watch |
| `-f, --fail-fast` | Detener en primer fallo |
| `--ci` | Modo CI |
| `--parallel` | Ejecución paralela |
| `--report` | Generar reporte HTML |

## 📈 Dashboards

### Grafana

- URL: http://localhost:3001
- User: admin
- Password: admin

### Prometheus

- URL: http://localhost:9091

### Pact Broker

- URL: http://localhost:9292

## 🔍 Debugging

### Logs

```bash
# Ver logs de tests
tail -f testing/logs/test.log

# Ver logs de servicios
docker-compose -f testing/docker-compose.test.yml logs -f
```

### Modo debug

```bash
# Jest con debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Cypress con debugger
npm run test:e2e -- --headed --no-exit
```

## 📝 Buenas Prácticas

### Tests Unitarios

- Un test por comportamiento
- Usar mocks para dependencias
- Nombre descriptivo: `should [behavior] when [condition]`
- AAA: Arrange, Act, Assert

### Tests de Integración

- Usar testcontainers para infraestructura
- Limpiar datos entre tests
- Testear flujos completos

### Contract Tests

- Definir contratos desde el consumidor
- Versionar contratos
- Verificar en CI antes de deploy

### Tests E2E

- Usar `data-testid` para selectores
- No depender de datos específicos
- Testear flujos de usuario, no implementación

### Tests de Carga

- Establecer SLAs claros
- Usar datos realistas
- Monitorear recursos durante tests

### Tests de Caos

- Ejecutar en ambiente de staging
- Tener rollback automático
- Documentar hipótesis y resultados

## 📚 Recursos

- [Jest Documentation](https://jestjs.io/)
- [Cypress Documentation](https://docs.cypress.io/)
- [Artillery Documentation](https://www.artillery.io/docs)
- [Pact Documentation](https://docs.pact.io/)
- [Chaos Engineering Principles](https://principlesofchaos.org/)

## 🤝 Contribución

1. Crear rama feature: `git checkout -b feature/new-tests`
2. Agregar tests con cobertura > 70%
3. Ejecutar `./testing/run-tests.sh --ci all`
4. Crear PR con descripción de tests

## 📄 Licencia

MIT License - Ver LICENSE para detalles

---

**Mantenido por**: Equipo de QA
**Última actualización**: 2024
