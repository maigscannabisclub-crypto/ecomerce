# Arquitectura de Despliegue

## Índice
1. [Visión General](#visión-general)
2. [Entornos](#entornos)
3. [Container Strategy](#container-strategy)
4. [Kubernetes Architecture](#kubernetes-architecture)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Infrastructure as Code](#infrastructure-as-code)
7. [Observability](#observability)
8. [Disaster Recovery](#disaster-recovery)

---

## Visión General

### Deployment Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CLOUD PROVIDER                               │   │
│  │                    (AWS/Azure/GCP)                                   │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                     VPC / Virtual Network                    │   │   │
│  │  │                                                              │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │   │
│  │  │  │   Public    │  │   Private   │  │      Database       │  │   │   │
│  │  │  │  Subnets    │  │  Subnets    │  │      Subnets        │  │   │   │
│  │  │  │             │  │             │  │                     │  │   │   │
│  │  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────────────┐ │  │   │   │
│  │  │  │ │   ALB   │ │  │ │  EKS    │ │  │ │   RDS Primary   │ │  │   │   │
│  │  │  │ │ (WAF)   │ │  │ │(K8s)    │ │  │ │   PostgreSQL    │ │  │   │   │
│  │  │  │ └────┬────┘ │  │ └────┬────┘ │  │ └─────────────────┘ │  │   │   │
│  │  │  │      │      │  │      │      │  │ ┌─────────────────┐ │  │   │   │
│  │  │  │ ┌────┴────┐ │  │ ┌────┴────┐ │  │ │   RDS Replica   │ │  │   │   │
│  │  │  │ │  NAT    │ │  │ │  Pods   │ │  │ │   PostgreSQL    │ │  │   │   │
│  │  │  │ │ Gateway │ │  │ │         │ │  │ └─────────────────┘ │  │   │   │
│  │  │  │ └─────────┘ │  │ │ ┌─────┐ │ │  │ ┌─────────────────┐ │  │   │   │
│  │  │  └─────────────┘  │ │ │App  │ │ │  │ │     ElastiCache │ │  │   │   │
│  │  │                   │ │ │Pods │ │ │  │ │     (Redis)     │ │  │   │   │
│  │  │                   │ │ └─────┘ │ │  │ └─────────────────┘ │  │   │   │
│  │  │                   │ │ ┌─────┐ │ │  └─────────────────────┘  │   │   │
│  │  │                   │ │ │MQ   │ │ │                           │   │   │
│  │  │                   │ │ │Pods │ │ │                           │   │   │
│  │  │                   │ │ └─────┘ │ │                           │   │   │
│  │  │                   │ └─────────┘ │                           │   │   │
│  │  │                   └─────────────┘                           │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Entornos

### Environment Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT STRATEGY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ DEVELOPMENT │───►│   STAGING   │───►│  PRODUCTION │    │     DR      │  │
│  │             │    │             │    │             │    │             │  │
│  │ • Local     │    │ • Pre-prod  │    │ • Live      │    │ • Failover  │  │
│  │ • Docker    │    │ • E2E tests │    │ • High Avail│    │ • Backup    │  │
│  │ • Hot reload│    │ • Load tests│    │ • Monitored │    │ • Region 2  │  │
│  │ • Debug     │    │ • Approval  │    │ • Scaled    │    │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                              │
│  Promotion Flow:                                                             │
│  ═══════════════                                                             │
│                                                                              │
│  Feature Branch ──► PR ──► Merge ──► Dev ──► Staging ──► Prod               │
│                              │        │         │          │                 │
│                              │        │         │          │                 │
│                              ▼        ▼         ▼          ▼                 │
│                            Unit    Integration E2E      Smoke               │
│                            Tests   Tests       Tests    Tests               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Environment Configuration

| Aspecto | Development | Staging | Production |
|---------|-------------|---------|------------|
| **Instancias** | 1 por servicio | 2 por servicio | 3+ por servicio |
| **DB** | Docker container | RDS small | RDS multi-AZ |
| **Cache** | Docker Redis | ElastiCache small | ElastiCache cluster |
| **MQ** | Docker RabbitMQ | Managed MQ | Managed MQ cluster |
| **SSL** | Self-signed | Let's Encrypt | Commercial cert |
| **Logs** | Console | Centralized | Centralized + SIEM |
| **Backup** | None | Daily | Continuous |
| **Cost** | $ | $$ | $$$ |

---

## Container Strategy

### Docker Architecture

```dockerfile
# Multi-stage build for production
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production
WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Security: Remove unnecessary packages
RUN apk del curl wget 2>/dev/null || true

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start application
CMD ["node", "dist/main.js"]
```

### Image Registry

```yaml
# Registry structure
registry.ecommerce.com/
├── ecommerce/
│   ├── gateway/           # API Gateway
│   │   ├── v1.0.0
│   │   ├── v1.0.1
│   │   └── latest
│   ├── auth-service/
│   ├── product-service/
│   ├── cart-service/
│   ├── order-service/
│   ├── inventory-service/
│   └── reporting-service/
└── base-images/
    ├── node-18-alpine
    └── node-18-slim

# Tagging strategy
# - latest: última versión estable
# - v{major}.{minor}.{patch}: versiones específicas
# - {git-sha}: para trazabilidad
# - staging: para ambiente de staging
```

### Container Security

```yaml
# Security scanning in CI
security_scan:
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $IMAGE_NAME
  
# Container signing
cosign_sign:
  image: sigstore/cosign:latest
  script:
    - cosign sign --key $COSIGN_KEY $IMAGE_NAME
```

---

## Kubernetes Architecture

### Cluster Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KUBERNETES CLUSTER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CONTROL PLANE                                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ API     │  │ etcd    │  │Scheduler│  │Controller│  │ CCM     │  │   │
│  │  │ Server  │  │         │  │         │  │ Manager  │  │         │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         WORKER NODES                                 │   │
│  │                                                                      │   │
│  │  Node Group: general-purpose (t3.medium)                            │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │   │
│  │  │  │ Gateway │  │  Auth   │  │ Product │  │  Cart   │        │   │   │
│  │  │  │  Pod    │  │  Pod    │  │  Pod    │  │  Pod    │        │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  Node Group: compute-optimized (c5.large)                           │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │   │   │
│  │  │  │  Order  │  │Inventory│  │Reporting│                     │   │   │
│  │  │  │  Pod    │  │  Pod    │  │  Pod    │                     │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘                     │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  Node Group: memory-optimized (r5.large) - Databases                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │   │   │
│  │  │  │  Redis  │  │RabbitMQ │  │PostgreSQL                     │   │   │
│  │  │  │  Pod    │  │  Pod    │  │  Pod    │                     │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘                     │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Namespace Structure

```yaml
# Kubernetes namespaces
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-production
  labels:
    environment: production
    team: platform
---
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-staging
  labels:
    environment: staging
    team: platform
---
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-monitoring
  labels:
    purpose: monitoring
    team: platform
---
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-ingress
  labels:
    purpose: ingress
    team: platform
```

### Deployment Configuration

```yaml
# Microservice deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
  namespace: ecommerce-production
  labels:
    app: product-service
    version: v1.0.0
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
  selector:
    matchLabels:
      app: product-service
  template:
    metadata:
      labels:
        app: product-service
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
    spec:
      serviceAccountName: product-service
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: product-service
          image: registry.ecommerce.com/ecommerce/product-service:v1.0.0
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            - name: NODE_ENV
              value: "production"
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: product-service-db
                  key: host
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: product-service-db
                  key: password
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - product-service
                topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: product-service
  namespace: ecommerce-production
spec:
  type: ClusterIP
  selector:
    app: product-service
  ports:
    - name: http
      port: 80
      targetPort: 3000
      protocol: TCP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: product-service-hpa
  namespace: ecommerce-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: product-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

### Ingress Configuration

```yaml
# NGINX Ingress Controller
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-ingress
  namespace: ecommerce-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/rate-limit: "1000"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://ecommerce.com"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
spec:
  tls:
    - hosts:
        - api.ecommerce.com
      secretName: ecommerce-tls
  rules:
    - host: api.ecommerce.com
      http:
        paths:
          - path: /api/v1/auth
            pathType: Prefix
            backend:
              service:
                name: auth-service
                port:
                  number: 80
          - path: /api/v1/products
            pathType: Prefix
            backend:
              service:
                name: product-service
                port:
                  number: 80
          - path: /api/v1/cart
            pathType: Prefix
            backend:
              service:
                name: cart-service
                port:
                  number: 80
          - path: /api/v1/orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80
          - path: /api/v1/inventory
            pathType: Prefix
            backend:
              service:
                name: inventory-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: gateway
                port:
                  number: 80
```

---

## CI/CD Pipeline

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │
│  │  Code   │──►│  Build  │──►│  Test   │──►│ Security│──►│  Deploy │      │
│  │ Commit  │   │ & Lint  │   │         │   │  Scan   │   │         │      │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘      │
│       │            │            │            │            │                 │
│       │            │            │            │            │                 │
│       ▼            ▼            ▼            ▼            ▼                 │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │
│  │ GitHub  │   │ Docker  │   │  Unit   │   │ SAST    │   │ Staging │      │
│  │  Push   │   │  Build  │   │  Tests  │   │ (Sonar) │   │         │      │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘      │
│       │            │            │            │            │                 │
│       │            │            │            │            │                 │
│       │            │            │            │            ▼                 │
│       │            │            │            │       ┌─────────┐            │
│       │            │            │            │       │  E2E    │            │
│       │            │            │            │       │  Tests  │            │
│       │            │            │            │       └────┬────┘            │
│       │            │            │            │            │                 │
│       │            │            │            │            ▼                 │
│       │            │            │            │       ┌─────────┐            │
│       │            │            │            │       │ Manual  │            │
│       │            │            │            │       │Approval │            │
│       │            │            │            │       └────┬────┘            │
│       │            │            │            │            │                 │
│       │            │            │            │            ▼                 │
│       │            │            │            │       ┌─────────┐            │
│       │            │            │            │       │Production│            │
│       │            │            │            │       │ Deploy  │            │
│       │            │            │            │       └─────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ecommerce

jobs:
  # Stage 1: Build & Test
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Unit tests
        run: npm run test:unit -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  # Stage 2: Security Scan
  security:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      
      - name: Run SAST (SonarCloud)
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
      
      - name: Run dependency check
        run: npm audit --audit-level=moderate
      
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          format: 'sarif'
          output: 'trivy-results.sarif'

  # Stage 3: Build & Push Images
  docker:
    runs-on: ubuntu-latest
    needs: [build, security]
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        service: [gateway, auth-service, product-service, cart-service, order-service, inventory-service]
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.service }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Sign image
        uses: sigstore/cosign-installer@v3
      - run: cosign sign --yes ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/${{ matrix.service }}:${{ github.sha }}

  # Stage 4: Deploy to Staging
  deploy-staging:
    runs-on: ubuntu-latest
    needs: docker
    environment: staging
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name ecommerce-staging
      
      - name: Deploy to staging
        run: |
          kubectl set image deployment/gateway gateway=$REGISTRY/ecommerce/gateway:$GITHUB_SHA -n ecommerce-staging
          kubectl rollout status deployment/gateway -n ecommerce-staging
      
      - name: Run smoke tests
        run: |
          npm run test:smoke -- --env staging

  # Stage 5: Deploy to Production
  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name ecommerce-production
      
      - name: Deploy to production (canary)
        run: |
          # Deploy canary (10% traffic)
          kubectl apply -f k8s/production/canary/
          kubectl set image deployment/gateway-canary gateway=$REGISTRY/ecommerce/gateway:$GITHUB_SHA -n ecommerce-production
          
          # Wait and verify
          sleep 300
          
          # Promote to full deployment if healthy
          kubectl set image deployment/gateway gateway=$REGISTRY/ecommerce/gateway:$GITHUB_SHA -n ecommerce-production
          kubectl rollout status deployment/gateway -n ecommerce-production
```

---

## Infrastructure as Code

### Terraform Structure

```
infrastructure/terraform/
├── modules/
│   ├── vpc/                 # VPC and networking
│   ├── eks/                 # Kubernetes cluster
│   ├── rds/                 # PostgreSQL databases
│   ├── elasticache/         # Redis cluster
│   ├── mq/                  # RabbitMQ
│   ├── alb/                 # Load balancer
│   └── monitoring/          # Prometheus/Grafana
├── environments/
│   ├── development/
│   ├── staging/
│   └── production/
└── global/
    └── iam/                 # IAM roles and policies
```

### Terraform Example

```hcl
# infrastructure/terraform/modules/eks/main.tf
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.0.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.28"

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  eks_managed_node_groups = {
    general = {
      desired_size = 3
      min_size     = 2
      max_size     = 10

      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"

      labels = {
        workload = "general"
      }

      taints = []

      update_config = {
        max_unavailable_percentage = 25
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 50
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 125
            encrypted             = true
            kms_key_id            = var.ebs_kms_key_id
            delete_on_termination = true
          }
        }
      }
    }

    compute = {
      desired_size = 2
      min_size     = 1
      max_size     = 5

      instance_types = ["c5.large"]
      capacity_type  = "SPOT"

      labels = {
        workload = "compute"
      }

      taints = [{
        key    = "dedicated"
        value  = "compute"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  # Enable OIDC provider for IRSA
  enable_irsa = true

  tags = var.tags
}

# Kubernetes provider configuration
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}
```

---

## Observability

### Monitoring Stack

```yaml
# Prometheus + Grafana deployment
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: kube-prometheus-stack
  namespace: ecommerce-monitoring
spec:
  interval: 5m
  chart:
    spec:
      chart: kube-prometheus-stack
      version: "51.x"
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: flux-system
  values:
    prometheus:
      prometheusSpec:
        retention: 30d
        retentionSize: "50GB"
        storageSpec:
          volumeClaimTemplate:
            spec:
              storageClassName: gp3
              resources:
                requests:
                  storage: 100Gi
        additionalScrapeConfigs:
          - job_name: 'ecommerce-services'
            kubernetes_sd_configs:
              - role: pod
                namespaces:
                  names:
                    - ecommerce-production
            relabel_configs:
              - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
                action: keep
                regex: true
    grafana:
      enabled: true
      adminPassword: ${GRAFANA_ADMIN_PASSWORD}
      persistence:
        enabled: true
        size: 10Gi
      dashboards:
        default:
          ecommerce-dashboard:
            url: https://raw.githubusercontent.com/company/ecommerce-platform/main/monitoring/dashboards/ecommerce.json
```

### Logging with Loki

```yaml
# Loki + Promtail for log aggregation
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: loki-stack
  namespace: ecommerce-monitoring
spec:
  interval: 5m
  chart:
    spec:
      chart: loki-stack
      version: "2.x"
      sourceRef:
        kind: HelmRepository
        name: grafana
        namespace: flux-system
  values:
    loki:
      persistence:
        enabled: true
        size: 50Gi
      config:
        limits_config:
          retention_period: 720h  # 30 days
    promtail:
      config:
        snippets:
          scrape_configs:
            - job_name: kubernetes-pods
              kubernetes_sd_configs:
                - role: pod
              relabel_configs:
                - source_labels:
                    - __meta_kubernetes_pod_annotation_kubernetes_io_config_mirror
                  target_label: __host__
                - source_labels:
                    - __meta_kubernetes_pod_container_name
                  target_label: container
                - source_labels:
                    - __meta_kubernetes_pod_name
                  target_label: pod
                - source_labels:
                    - __meta_kubernetes_namespace
                  target_label: namespace
```

### Distributed Tracing with Jaeger

```yaml
# Jaeger deployment
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: ecommerce-jaeger
  namespace: ecommerce-monitoring
spec:
  strategy: production
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: http://elasticsearch:9200
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: nginx
  resources:
    requests:
      memory: "512Mi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
```

---

## Disaster Recovery

### Backup Strategy

```yaml
# Velero backup configuration
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: ecommerce-daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  template:
    includedNamespaces:
      - ecommerce-production
    excludedResources:
      - events
      - pods
    labelSelector:
      matchExpressions:
        - key: backup.velero.io/exclude
          operator: DoesNotExist
    ttl: 720h0m0s  # 30 days
    storageLocation: aws-s3
    volumeSnapshotLocations:
      - aws-ebs
```

### DR Plan

| Component | RTO | RPO | Strategy |
|-----------|-----|-----|----------|
| Application | 15 min | 0 | Multi-AZ deployment |
| Database | 30 min | 5 min | Multi-AZ + read replicas |
| Cache | 5 min | 0 | Redis Cluster |
| Files | 1 hour | 1 hour | S3 cross-region replication |

### Failover Procedure

```bash
#!/bin/bash
# disaster-recovery.sh

# 1. Verify primary region failure
aws eks describe-cluster --name ecommerce-production --region us-east-1

# 2. Promote read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier ecommerce-db-replica \
  --region us-west-2

# 3. Update DNS to point to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://dr-dns-update.json

# 4. Scale up DR environment
kubectl scale deployment --all --replicas=3 -n ecommerce-production --context dr-cluster

# 5. Verify health
curl -f https://api.ecommerce.com/health || exit 1

echo "Failover completed successfully"
```

---

## Referencias

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Security Architecture](SECURITY_ARCHITECTURE.md)
- [Development Guide](../guides/DEVELOPMENT_GUIDE.md)
- [Deployment Guide](../guides/DEPLOYMENT_GUIDE.md)
