# Guía de Despliegue

## Índice
1. [Visión General](#visión-general)
2. [Despliegue Local](#despliegue-local)
3. [Despliegue en Staging](#despliegue-en-staging)
4. [Despliegue en Producción](#despliegue-en-producción)
5. [Rollback](#rollback)
6. [Monitoreo Post-Deploy](#monitoreo-post-deploy)

---

## Visión General

### Estrategias de Despliegue

| Estrategia | Descripción | Uso |
|------------|-------------|-----|
| **Rolling Update** | Reemplaza pods gradualmente | Default para todos los servicios |
| **Blue-Green** | Dos entornos idénticos, switch instantáneo | Critical services |
| **Canary** | 5% → 25% → 100% tráfico | High-risk changes |

### Flujo de Despliegue

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Build     │───►│   Test      │───►│   Deploy    │───►│  Verify     │
│   Image     │    │   Image     │    │   Staging   │    │  Staging    │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                 │
                                                                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Monitor   │◄───│   Promote   │◄───│   Approve   │◄───│   E2E       │
│   Prod      │    │   to Prod   │    │   Manual    │    │   Tests     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Despliegue Local

### Docker Compose

```bash
# Iniciar todos los servicios
make start

# O manualmente:
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Ver logs
docker-compose logs -f [service-name]

# Escalar un servicio
docker-compose up -d --scale product-service=3

# Reconstruir imágenes
docker-compose up -d --build
```

### Docker Compose File

```yaml
# docker-compose.yml
version: '3.8'

services:
  gateway:
    build:
      context: ./apps/gateway
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - AUTH_SERVICE_URL=http://auth-service:3001
      - PRODUCT_SERVICE_URL=http://product-service:3002
    depends_on:
      - auth-service
      - product-service
    networks:
      - ecommerce-network

  auth-service:
    build:
      context: ./apps/auth-service
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    networks:
      - ecommerce-network

  product-service:
    build:
      context: ./apps/product-service
      dockerfile: Dockerfile
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=development
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    networks:
      - ecommerce-network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: ecommerce_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - ecommerce-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - ecommerce-network

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - ecommerce-network

volumes:
  postgres-data:
  redis-data:
  rabbitmq-data:

networks:
  ecommerce-network:
    driver: bridge
```

---

## Despliegue en Staging

### Prerrequisitos

- Acceso al cluster de Kubernetes
- kubectl configurado
- Helm instalado

### Comandos de Despliegue

```bash
# 1. Configurar contexto de kubectl
kubectl config use-context ecommerce-staging

# 2. Aplicar configuraciones
kubectl apply -k k8s/staging/

# 3. Actualizar imagen de un servicio
kubectl set image deployment/product-service \
  product-service=ghcr.io/company/ecommerce/product-service:v1.2.0 \
  -n ecommerce-staging

# 4. Verificar rollout
kubectl rollout status deployment/product-service -n ecommerce-staging

# 5. Verificar pods
kubectl get pods -n ecommerce-staging

# 6. Ver logs
kubectl logs -f deployment/product-service -n ecommerce-staging
```

### Kustomize Configuration

```yaml
# k8s/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ecommerce-staging

resources:
  - ../base

images:
  - name: gateway
    newName: ghcr.io/company/ecommerce/gateway
    newTag: staging
  - name: auth-service
    newName: ghcr.io/company/ecommerce/auth-service
    newTag: staging
  - name: product-service
    newName: ghcr.io/company/ecommerce/product-service
    newTag: staging

replicas:
  - name: gateway
    count: 2
  - name: auth-service
    count: 2
  - name: product-service
    count: 2

configMapGenerator:
  - name: app-config
    literals:
      - NODE_ENV=staging
      - LOG_LEVEL=info

patchesStrategicMerge:
  - hpa-patch.yaml
```

---

## Despliegue en Producción

### Checklist Pre-Deploy

```
□ Código
  □ PR aprobado y mergeado
  □ Tests pasando en CI
  □ Security scan limpio
  □ Imagen firmada

□ Preparación
  □ Backup de base de datos
  □ Plan de rollback listo
  □ Equipo de soporte disponible
  □ Ventana de mantenimiento (si aplica)

□ Monitoreo
  □ Dashboards abiertos
  □ Alertas configuradas
  □ Runbook a mano
```

### Despliegue Canary

```bash
#!/bin/bash
# deploy-canary.sh

SERVICE=$1
VERSION=$2
NAMESPACE=ecommerce-production

# 1. Deploy canary (10% traffic)
echo "Deploying canary version..."
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE}-canary
  namespace: ${NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${SERVICE}
      version: canary
  template:
    metadata:
      labels:
        app: ${SERVICE}
        version: canary
    spec:
      containers:
      - name: ${SERVICE}
        image: ghcr.io/company/ecommerce/${SERVICE}:${VERSION}
        ports:
        - containerPort: 3000
EOF

# 2. Wait for canary to be ready
echo "Waiting for canary to be ready..."
kubectl rollout status deployment/${SERVICE}-canary -n ${NAMESPACE} --timeout=5m

# 3. Run smoke tests
echo "Running smoke tests..."
./scripts/smoke-tests.sh ${SERVICE}

if [ $? -ne 0 ]; then
  echo "Smoke tests failed! Rolling back canary..."
  kubectl delete deployment ${SERVICE}-canary -n ${NAMESPACE}
  exit 1
fi

# 4. Promote to production
echo "Promoting to production..."
kubectl set image deployment/${SERVICE} \
  ${SERVICE}=ghcr.io/company/ecommerce/${SERVICE}:${VERSION} \
  -n ${NAMESPACE}

kubectl rollout status deployment/${SERVICE} -n ${NAMESPACE}

# 5. Remove canary
echo "Removing canary..."
kubectl delete deployment ${SERVICE}-canary -n ${NAMESPACE}

echo "Deployment complete!"
```

### GitHub Actions Production Deploy

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      service:
        description: 'Service to deploy'
        required: true
        type: choice
        options:
          - gateway
          - auth-service
          - product-service
          - cart-service
          - order-service
          - inventory-service
      version:
        description: 'Version to deploy'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name ecommerce-production

      - name: Deploy canary
        run: |
          kubectl apply -f - <<EOF
          apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: ${{ github.event.inputs.service }}-canary
            namespace: ecommerce-production
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: ${{ github.event.inputs.service }}
                version: canary
            template:
              metadata:
                labels:
                  app: ${{ github.event.inputs.service }}
                  version: canary
              spec:
                containers:
                - name: ${{ github.event.inputs.service }}
                  image: ghcr.io/company/ecommerce/${{ github.event.inputs.service }}:${{ github.event.inputs.version }}
                  ports:
                  - containerPort: 3000
          EOF

      - name: Wait for canary
        run: |
          kubectl rollout status deployment/${{ github.event.inputs.service }}-canary \
            -n ecommerce-production --timeout=5m

      - name: Run smoke tests
        run: |
          npm run test:smoke -- --env production --service ${{ github.event.inputs.service }}

      - name: Promote to production
        if: success()
        run: |
          kubectl set image deployment/${{ github.event.inputs.service }} \
            ${{ github.event.inputs.service }}=ghcr.io/company/ecommerce/${{ github.event.inputs.service }}:${{ github.event.inputs.version }} \
            -n ecommerce-production
          kubectl rollout status deployment/${{ github.event.inputs.service }} -n ecommerce-production

      - name: Cleanup canary
        if: always()
        run: |
          kubectl delete deployment ${{ github.event.inputs.service }}-canary \
            -n ecommerce-production --ignore-not-found=true
```

---

## Rollback

### Rollback Automático

```bash
# Rollback a versión anterior
kubectl rollout undo deployment/product-service -n ecommerce-production

# Ver historial de rollouts
kubectl rollout history deployment/product-service -n ecommerce-production

# Rollback a revisión específica
kubectl rollout undo deployment/product-service -n ecommerce-production --to-revision=3
```

### Rollback Manual

```bash
#!/bin/bash
# rollback.sh

SERVICE=$1
PREVIOUS_VERSION=$2
NAMESPACE=ecommerce-production

echo "Rolling back ${SERVICE} to ${PREVIOUS_VERSION}..."

# 1. Update image to previous version
kubectl set image deployment/${SERVICE} \
  ${SERVICE}=ghcr.io/company/ecommerce/${SERVICE}:${PREVIOUS_VERSION} \
  -n ${NAMESPACE}

# 2. Wait for rollback
kubectl rollout status deployment/${SERVICE} -n ${NAMESPACE}

# 3. Verify health
kubectl get pods -n ${NAMESPACE} -l app=${SERVICE}

# 4. Run smoke tests
./scripts/smoke-tests.sh ${SERVICE}

echo "Rollback complete!"
```

---

## Monitoreo Post-Deploy

### Métricas a Verificar

| Métrica | Umbral | Acción |
|---------|--------|--------|
| Error Rate | < 1% | Rollback if > 5% |
| P95 Latency | < 500ms | Rollback if > 1s |
| CPU Usage | < 70% | Scale if > 80% |
| Memory Usage | < 80% | Scale if > 90% |
| Pod Restarts | 0 | Investigate if > 0 |

### Comandos de Monitoreo

```bash
# Ver métricas de pods
kubectl top pods -n ecommerce-production

# Ver logs de errores
kubectl logs -n ecommerce-production -l app=product-service --tail=100 | grep ERROR

# Ver eventos del cluster
kubectl get events -n ecommerce-production --sort-by='.lastTimestamp'

# Ver estado de deployments
kubectl get deployments -n ecommerce-production

# Ver estado de servicios
kubectl get svc -n ecommerce-production

# Ver estado de ingress
kubectl get ingress -n ecommerce-production
```

### Dashboards

- **Grafana**: https://grafana.ecommerce.com/d/ecommerce-overview
- **Jaeger**: https://tracing.ecommerce.com
- **Kibana**: https://logs.ecommerce.com

---

## Referencias

- [Architecture Overview](../architecture/ARCHITECTURE_OVERVIEW.md)
- [Deployment Architecture](../architecture/DEPLOYMENT_ARCHITECTURE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
