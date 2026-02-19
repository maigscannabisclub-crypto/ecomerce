# E-Commerce Platform - Kubernetes Manifests

Este repositorio contiene los manifiestos de Kubernetes para desplegar la plataforma e-commerce completa, incluyendo microservicios, infraestructura de datos, monitoreo y configuraciones de red.

## 📋 Tabla de Contenidos

- [Arquitectura](#arquitectura)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Requisitos Previos](#requisitos-previos)
- [Configuración Inicial](#configuración-inicial)
- [Despliegue](#despliegue)
- [Monitoreo](#monitoreo)
- [Operaciones](#operaciones)
- [Troubleshooting](#troubleshooting)

## 🏗️ Arquitectura

### Microservicios

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| API Gateway | 8080 | Punto de entrada único, routing, rate limiting |
| Auth Service | 8081 | Autenticación y autorización JWT |
| Product Service | 8082 | Gestión de catálogo de productos |
| Cart Service | 8083 | Gestión de carritos de compra |
| Order Service | 8084 | Procesamiento de órdenes |
| Inventory Service | 8085 | Gestión de inventario y stock |
| Reporting Service | 8086 | Reportes y análisis |

### Infraestructura de Datos

| Componente | Puerto | Uso |
|------------|--------|-----|
| PostgreSQL | 5432 | Base de datos principal |
| Redis | 6379 | Caché y sesiones |
| RabbitMQ | 5672 | Mensajería asíncrona |

### Monitoreo

| Componente | Puerto | Descripción |
|------------|--------|-------------|
| Prometheus | 9090 | Métricas y alertas |
| Grafana | 3000 | Dashboards y visualización |

## 📁 Estructura del Proyecto

```
k8s/
├── base/                          # Manifiestos base (Kustomize)
│   ├── namespaces/                # Definición de namespaces
│   ├── configmaps/                # Configuración de la aplicación
│   ├── secrets/                   # Secrets (templates)
│   ├── services/                  # Services de cada microservicio
│   ├── deployments/               # Deployments de cada microservicio
│   ├── hpa/                       # Horizontal Pod Autoscalers
│   ├── ingress/                   # Configuración de Ingress
│   └── kustomization.yaml         # Configuración base de Kustomize
│
├── overlays/                      # Configuraciones por ambiente
│   ├── development/               # Desarrollo
│   ├── staging/                   # Staging
│   └── production/                # Producción
│
├── infrastructure/                # Infraestructura de datos
│   ├── postgres/                  # PostgreSQL StatefulSet
│   ├── redis/                     # Redis Deployment
│   ├── rabbitmq/                  # RabbitMQ StatefulSet
│   └── monitoring/                # Prometheus y Grafana
│
├── scripts/                       # Scripts de automatización
│   ├── deploy.sh                  # Script de despliegue
│   ├── rollback.sh                # Script de rollback
│   └── setup-cluster.sh           # Setup inicial del cluster
│
└── README.md                      # Este archivo
```

## 🔧 Requisitos Previos

### Herramientas Requeridas

- **kubectl** v1.28+
- **kustomize** v5.0+
- **Helm** v3.12+ (opcional, para componentes adicionales)

### Cluster de Kubernetes

- Kubernetes v1.28+
- Mínimo 3 nodos (para producción)
- 8GB RAM mínimo por nodo
- 50GB storage disponible

### Componentes del Cluster

Los siguientes componentes se instalarán automáticamente:

- NGINX Ingress Controller
- Cert-Manager (para TLS)
- Metrics Server (para HPA)

## 🚀 Configuración Inicial

### 1. Configurar el Cluster

```bash
# Ejecutar script de setup inicial
./scripts/setup-cluster.sh
```

Este script instalará:
- Metrics Server
- NGINX Ingress Controller
- Cert-Manager
- ClusterIssuers para Let's Encrypt
- RBAC y Network Policies

### 2. Crear Secrets

Los secrets deben crearse manualmente antes del primer despliegue:

```bash
# Secrets de la aplicación
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=db-password=$(openssl rand -base64 32) \
  --from-literal=redis-password=$(openssl rand -base64 32) \
  --from-literal=rabbitmq-password=$(openssl rand -base64 32) \
  -n ecommerce

# Secrets de base de datos
kubectl create secret generic db-secrets \
  --from-literal=POSTGRES_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=AUTH_DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=PRODUCT_DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=ORDER_DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=INVENTORY_DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=REPORTING_DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=REDIS_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=RABBITMQ_DEFAULT_PASS=$(openssl rand -base64 32) \
  -n ecommerce-data

# Secret para Grafana
kubectl create secret generic grafana-secret \
  --from-literal=admin-user=admin \
  --from-literal=admin-password=$(openssl rand -base64 32) \
  -n ecommerce-monitoring
```

### 3. Crear TLS Secret (para producción)

```bash
# Opción 1: Usar Let's Encrypt (automático con cert-manager)
# Ya configurado en los manifiestos de ingress

# Opción 2: Usar certificado propio
kubectl create secret tls ecommerce-tls \
  --cert=path/to/cert.crt \
  --key=path/to/cert.key \
  -n ecommerce
```

## 📦 Despliegue

### Despliegue en Desarrollo

```bash
# Despliegue completo
./scripts/deploy.sh development

# Despliegue sin infraestructura
./scripts/deploy.sh development --skip-infra

# Despliegue sin monitoreo
./scripts/deploy.sh development --skip-monitoring

# Simulación (dry-run)
./scripts/deploy.sh development --dry-run
```

### Despliegue en Staging

```bash
./scripts/deploy.sh staging
```

### Despliegue en Producción

```bash
# Requiere confirmación explícita
./scripts/deploy.sh production

# Forzar sin confirmación (no recomendado)
./scripts/deploy.sh production --force
```

### Despliegue Manual con Kustomize

```bash
# Desarrollo
kustomize build overlays/development | kubectl apply -f -

# Staging
kustomize build overlays/staging | kubectl apply -f -

# Producción
kustomize build overlays/production | kubectl apply -f -
```

## 📊 Monitoreo

### Acceso a Dashboards

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| Grafana | https://grafana.ecommerce.com | admin / [secret] |
| Prometheus | https://prometheus.ecommerce.com | N/A |

### Métricas Principales

- **Request Rate**: Solicitudes por segundo por servicio
- **Error Rate**: Porcentaje de errores HTTP 5xx
- **Latency**: P99, P95, P50 de tiempos de respuesta
- **Resource Usage**: CPU y memoria por pod
- **HPA Status**: Réplicas actuales vs deseadas

### Alertas Configuradas

| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| HighErrorRate | Error rate > 5% | Critical |
| HighLatency | P99 > 2s | Warning |
| ServiceDown | Pod no disponible | Critical |
| PodCrashLooping | Restart frecuente | Warning |

## 🔧 Operaciones

### Escalar Servicios

```bash
# Escalar manualmente
kubectl scale deployment api-gateway --replicas=5 -n ecommerce

# Ver HPA
kubectl get hpa -n ecommerce

# Ver métricas
kubectl top pods -n ecommerce
```

### Rollback

```bash
# Rollback a versión anterior
./scripts/rollback.sh production

# Rollback a revisión específica
./scripts/rollback.sh production 5

# Ver historial
kubectl rollout history deployment/api-gateway -n ecommerce
```

### Logs

```bash
# Logs de un servicio
kubectl logs -f deployment/api-gateway -n ecommerce

# Logs de todos los pods de un servicio
kubectl logs -f -l app.kubernetes.io/name=api-gateway -n ecommerce

# Logs con stern (requiere instalación)
stern -l app.kubernetes.io/component=service -n ecommerce
```

### Debug

```bash
# Port-forward a un servicio
kubectl port-forward svc/api-gateway 8080:8080 -n ecommerce

# Ejecutar comando en un pod
kubectl exec -it deployment/api-gateway -- /bin/sh

# Describir recursos
kubectl describe pod <pod-name> -n ecommerce
kubectl describe deployment api-gateway -n ecommerce
kubectl describe hpa api-gateway-hpa -n ecommerce
```

## 🛠️ Troubleshooting

### Pods en estado Pending

```bash
# Ver eventos
kubectl get events -n ecommerce --sort-by='.lastTimestamp'

# Ver recursos del nodo
kubectl describe node <node-name>

# Verificar PVCs
kubectl get pvc -n ecommerce-data
```

### Problemas de HPA

```bash
# Verificar metrics-server
kubectl get pods -n kube-system | grep metrics-server

# Ver métricas disponibles
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods

# Describir HPA
kubectl describe hpa <hpa-name> -n ecommerce
```

### Problemas de Ingress

```bash
# Verificar ingress controller
kubectl get pods -n ingress-nginx

# Ver logs del controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Describir ingress
kubectl describe ingress ecommerce-ingress -n ecommerce
```

### Problemas de Certificados TLS

```bash
# Verificar cert-manager
kubectl get pods -n cert-manager

# Ver certificados
kubectl get certificates -n ecommerce
kubectl get certificaterequests -n ecommerce

# Describir certificado
kubectl describe certificate ecommerce-tls -n ecommerce
```

## 🔒 Seguridad

### Network Policies

Las Network Policies están configuradas para:
- Denegar todo el tráfico por defecto
- Permitir tráfico solo desde el Ingress Controller al API Gateway
- Permitir comunicación interna entre servicios

### RBAC

- ServiceAccount dedicado para la aplicación
- Roles mínimos necesarios
- RoleBindings específicos por namespace

### Secrets

- Secrets gestionados fuera del repositorio
- Rotación periódica recomendada
- Considerar usar External Secrets Operator o Vault para producción

## 📈 Configuración de Recursos

### Límites por Ambiente

| Ambiente | CPU Request | CPU Limit | Memory Request | Memory Limit |
|----------|-------------|-----------|----------------|--------------|
| Development | 100m | 300m | 128Mi | 256Mi |
| Staging | 200m | 500m | 256Mi | 512Mi |
| Production | 500m | 1000m | 512Mi | 1Gi |

### HPA Configuration

```yaml
minReplicas: 2
maxReplicas: 10
targetCPU: 70%
targetMemory: 80%
scaleUpStabilization: 60s
scaleDownStabilization: 300s
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to Kubernetes

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure kubectl
        uses: azure/setup-kubectl@v3
        
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name ecommerce-cluster
        
      - name: Deploy to EKS
        run: |
          kustomize build overlays/production | kubectl apply -f -
          kubectl rollout status deployment/api-gateway -n ecommerce
```

## 📝 Mantenimiento

### Backup de Base de Datos

```bash
# Backup PostgreSQL
kubectl exec -it postgres-0 -n ecommerce-data -- pg_dump -U postgres ecommerce > backup.sql

# Backup Redis
kubectl exec -it redis-0 -n ecommerce-data -- redis-cli BGSAVE
```

### Actualización de Imágenes

```bash
# Actualizar imagen
kubectl set image deployment/api-gateway api-gateway=ecommerce/api-gateway:1.1.0 -n ecommerce

# Ver rollout
kubectl rollout status deployment/api-gateway -n ecommerce
```

## 📚 Referencias

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kustomize Documentation](https://kustomize.io/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [Cert-Manager Documentation](https://cert-manager.io/docs/)

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT.

---

**Nota**: Este es un template de manifiestos de Kubernetes. Asegúrate de revisar y ajustar todas las configuraciones según tus requisitos específicos antes de desplegar en producción.
