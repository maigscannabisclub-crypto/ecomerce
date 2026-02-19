# 🛒 E-Commerce Platform - Microservices Architecture

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-GKE-blue.svg)](https://cloud.google.com/kubernetes-engine)
[![Terraform](https://img.shields.io/badge/Terraform-1.5+-purple.svg)](https://www.terraform.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Plataforma de e-commerce empresarial basada en microservicios, diseñada para alto tráfico y escalabilidad horizontal. Lista para desplegar en **Google Cloud Platform**.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTES                                 │
│                     (Web, Mobile, API)                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (3000)                          │
│              • Routing • Auth • Rate Limit • Cache              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Auth      │  │   Product   │  │    Cart     │
│  (3001)     │  │  (3002)     │  │  (3003)     │
└─────────────┘  └─────────────┘  └─────────────┘
       │                │                │
       │         ┌──────┴──────┐         │
       │         │             │         │
       ▼         ▼             ▼         ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Order     │  │  Inventory  │  │  Reporting  │
│  (3004)     │  │  (3005)     │  │  (3006)     │
└─────────────┘  └─────────────┘  └─────────────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  PostgreSQL │  │    Redis    │  │   RabbitMQ  │
│  (7 DBs)    │  │   (Cache)   │  │  (Events)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## 📦 Microservicios

| Servicio | Puerto | Descripción | Tecnologías |
|----------|--------|-------------|-------------|
| **API Gateway** | 3000 | Entry point, routing, rate limiting | Express, http-proxy-middleware |
| **Auth Service** | 3001 | Autenticación JWT, refresh tokens | Prisma, bcrypt, JWT |
| **Product Service** | 3002 | Catálogo, categorías, búsqueda | Prisma, Redis cache |
| **Cart Service** | 3003 | Carrito de compras | Prisma, Redis |
| **Order Service** | 3004 | Órdenes, SAGA pattern, Outbox | Prisma, RabbitMQ |
| **Inventory Service** | 3005 | Stock, reservas, movimientos | Prisma, RabbitMQ |
| **Reporting Service** | 3006 | Dashboard, métricas, reportes | Prisma, Redis, RabbitMQ |

---

## 🚀 Inicio Rápido

### Opción 1: Desarrollo Local (Docker Compose)

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd ecommerce-platform

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Iniciar servicios
docker-compose up --build

# 4. Verificar salud
curl http://localhost:3000/health
```

### Opción 2: Google Cloud Platform (Producción)

```bash
# 1. Ejecutar setup automatizado
./scripts/setup-gcp.sh

# 2. Seguir instrucciones interactivas

# 3. Verificar despliegue
kubectl get pods -n ecommerce
```

**📖 Guía completa de despliegue en GCP:** [DEPLOY_GCP.md](DEPLOY_GCP.md)

---

## 📁 Estructura del Proyecto

```
ecommerce-platform/
├── 📁 services/                    # Microservicios
│   ├── api-gateway/               # API Gateway
│   ├── auth-service/              # Autenticación
│   ├── product-service/           # Productos
│   ├── cart-service/              # Carrito
│   ├── order-service/             # Órdenes
│   ├── inventory-service/         # Inventario
│   └── reporting-service/         # Reportes
│
├── 📁 infra/                       # Infraestructura
│   ├── terraform/                 # IaC (VPC, GKE, Cloud SQL, Redis)
│   ├── k8s/                       # Manifiestos Kubernetes
│   └── cloud-build/               # CI/CD Pipeline
│
├── 📁 scripts/                     # Scripts de automatización
│   ├── setup.sh                   # Setup local
│   ├── setup-gcp.sh              # Setup GCP
│   ├── start.sh                   # Iniciar servicios
│   ├── test.sh                    # Ejecutar tests
│   └── health-check.sh           # Verificar salud
│
├── 📁 init-scripts/                # Scripts de inicialización DB
├── 📁 rabbitmq/                    # Configuración RabbitMQ
├── 📁 docs/                        # Documentación
│
├── docker-compose.yml              # Desarrollo local
├── docker-compose.prod.yml         # Producción local
├── .env.example                    # Variables de entorno
├── DEPLOY_GCP.md                  # Guía de despliegue GCP
└── README.md                       # Este archivo
```

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js 20** LTS
- **TypeScript 5.3**
- **Express.js 4.18**
- **Prisma ORM** 5.7

### Infraestructura
- **Docker** & Docker Compose
- **Kubernetes** (GKE)
- **Terraform** 1.5+
- **Google Cloud Platform**
  - Cloud SQL (PostgreSQL)
  - Memorystore (Redis)
  - GKE (Kubernetes)
  - Cloud Build (CI/CD)
  - Artifact Registry

### Mensajería y Cache
- **RabbitMQ** 3.12 (Eventos)
- **Redis** 7 (Cache)

### Observabilidad
- **Winston** (Logging)
- **Prometheus** (Métricas)
- **Grafana** (Dashboards)
- **Jaeger** (Tracing)
- **Google Cloud Monitoring**

---

## 📖 Documentación

| Documento | Descripción |
|-----------|-------------|
| [DEPLOY_GCP.md](DEPLOY_GCP.md) | Guía completa de despliegue en GCP |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | Reporte de auditoría técnica |
| `docs/architecture/` | Documentación de arquitectura |
| `docs/guides/` | Guías de desarrollo |

---

## 🧪 Testing

```bash
# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Tests e2e
npm run test:e2e

# Cobertura
npm run test:coverage

# Todos los tests
make test
```

---

## 🔒 Seguridad

- ✅ **JWT** con RS256 (asimétrico)
- ✅ **Refresh tokens** con rotación
- ✅ **Rate limiting** por IP/usuario
- ✅ **Helmet** headers de seguridad
- ✅ **CORS** configurado
- ✅ **Input validation** con Joi/Zod
- ✅ **SQL Injection** protección (Prisma)
- ✅ **XSS** protección
- ✅ **mTLS** ready
- ✅ **Network Policies** (K8s)
- ✅ **Secret Manager** (GCP)

---

## 📊 Escalabilidad

- ✅ **Horizontal Pod Autoscaler** (HPA)
- ✅ **Cluster Autoscaler** (GKE)
- ✅ **Circuit Breaker** pattern
- ✅ **Retry con backoff** exponencial
- ✅ **Redis cache** distribuido
- ✅ **Database per service**
- ✅ **Stateless services**
- ✅ **Event-driven** architecture

---

## 🔄 CI/CD

Pipeline de **Cloud Build**:

1. **Lint** + **Test** unitarios
2. **Build** de imágenes Docker
3. **Push** a Artifact Registry
4. **Deploy** a GKE (solo main branch)
5. **Smoke tests** post-deploy

```yaml
# Trigger en cloudbuild.yaml
gcloud builds triggers create github \
    --repo-name=ecommerce-platform \
    --branch-pattern="^main$" \
    --build-config=infra/cloud-build/cloudbuild.yaml
```

---

## 💰 Costos Estimados (GCP)

| Componente | Tier | Costo Mensual (aprox) |
|------------|------|----------------------|
| GKE | 3 nodos e2-medium | ~$150 |
| Cloud SQL | db-f1-micro | ~$25 |
| Memorystore | 2GB Basic | ~$50 |
| Load Balancer | 1 regla | ~$20 |
| **Total** | | **~$245/mes** |

*Para producción, considerar db-n1-standard-1 y más nodos.*

---

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver [LICENSE](LICENSE) para más detalles.

---

## 🆘 Soporte

- 📧 Email: soporte@ecommerce.com
- 💬 Slack: #ecommerce-platform
- 📖 Docs: [Wiki](https://github.com/your-org/ecommerce-platform/wiki)

---

**🎉 ¡Listo para escalar!**
