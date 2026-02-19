# 🚀 GUÍA DE DESPLIEGUE - GOOGLE CLOUD PLATFORM

## E-Commerce Platform - Microservices Architecture

---

## 📋 PREREQUISITOS

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) instalado
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5.0
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configurado
- [Docker](https://docs.docker.com/get-docker/) instalado
- Cuenta de GCP con permisos de Owner o Editor

---

## 🏗️ ARQUITECTURA EN GCP

```
┌─────────────────────────────────────────────────────────────────┐
│                        GOOGLE CLOUD PLATFORM                     │
│                                                                  │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │ Cloud DNS   │────▶│  Cloud Load Balancer (Ingress)      │   │
│  └─────────────┘     └─────────────┬───────────────────────┘   │
│                                    │                            │
│                                    ▼                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              GKE (Google Kubernetes Engine)               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ API Gateway │  │  Services   │  │   RabbitMQ  │      │  │
│  │  │  (Ingress)  │  │  (Pods)     │  │  (Stateful) │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      DATA LAYER                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │  Cloud SQL   │  │ Memorystore  │  │ Cloud Storage│   │  │
│  │  │ (PostgreSQL) │  │   (Redis)    │  │  (Backups)   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              OBSERVABILITY                                │  │
│  │  Cloud Monitoring │ Cloud Logging │ Cloud Trace          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
ecommerce-platform/
├── infra/
│   ├── terraform/          # Infraestructura como código
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── databases.tf
│   │   ├── gke.tf
│   │   ├── artifacts.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars.example
│   ├── k8s/                # Manifiestos Kubernetes
│   │   └── base/
│   │       ├── namespace.yaml
│   │       ├── configmap.yaml
│   │       ├── secrets.yaml
│   │       ├── serviceaccount.yaml
│   │       ├── ingress.yaml
│   │       ├── deployments/
│   │       │   ├── api-gateway.yaml
│   │       │   ├── auth-service.yaml
│   │       │   ├── product-service.yaml
│   │       │   ├── cart-service.yaml
│   │       │   ├── order-service.yaml
│   │       │   ├── inventory-service.yaml
│   │       │   └── reporting-service.yaml
│   │       └── kustomization.yaml
│   └── cloud-build/
│       └── cloudbuild.yaml  # Pipeline CI/CD
├── services/               # Microservicios
└── docker-compose.yml      # Desarrollo local
```

---

## 🚀 DESPLIEGUE PASO A PASO

### PASO 1: Configurar Proyecto GCP

```bash
# Autenticar con GCP
gcloud auth login

# Configurar proyecto
gcloud config set project YOUR_PROJECT_ID

# Habilitar APIs necesarias
gcloud services enable compute.googleapis.com \
    container.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com
```

### PASO 2: Configurar Terraform

```bash
cd infra/terraform

# Copiar y editar variables
cp terraform.tfvars.example terraform.tfvars
# Editar terraform.tfvars con tus valores

# Inicializar Terraform
terraform init

# Planificar cambios
terraform plan

# Aplicar infraestructura
terraform apply
```

**Variables importantes en `terraform.tfvars`:**
```hcl
project_id = "your-project-id"
region     = "us-central1"
zone       = "us-central1-a"
environment = "dev"

db_tier     = "db-f1-micro"
db_password = "your-secure-password"

redis_tier = "BASIC"

gke_node_count   = 3
gke_machine_type = "e2-medium"
```

### PASO 3: Configurar kubectl

```bash
# Obtener credenciales del cluster
gcloud container clusters get-credentials ecommerce-cluster-dev \
    --region=us-central1

# Verificar conexión
kubectl get nodes
```

### PASO 4: Configurar Secrets

```bash
# Crear secrets en Kubernetes
kubectl create secret generic ecommerce-secrets \
  --from-literal=JWT_SECRET="your-jwt-secret-$(openssl rand -base64 32)" \
  --from-literal=JWT_REFRESH_SECRET="your-refresh-secret-$(openssl rand -base64 32)" \
  --from-literal=DB_PASSWORD="your-db-password" \
  --from-literal=RABBITMQ_USER="admin" \
  --from-literal=RABBITMQ_PASSWORD="$(openssl rand -base64 24)" \
  -n ecommerce
```

### PASO 5: Desplegar RabbitMQ

```bash
# Desplegar RabbitMQ en el cluster
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: ecommerce
spec:
  serviceName: rabbitmq
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      containers:
      - name: rabbitmq
        image: rabbitmq:3.12-management-alpine
        ports:
        - containerPort: 5672
        - containerPort: 15672
        env:
        - name: RABBITMQ_DEFAULT_USER
          valueFrom:
            secretKeyRef:
              name: ecommerce-secrets
              key: RABBITMQ_USER
        - name: RABBITMQ_DEFAULT_PASS
          valueFrom:
            secretKeyRef:
              name: ecommerce-secrets
              key: RABBITMQ_PASSWORD
---
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: ecommerce
spec:
  selector:
    app: rabbitmq
  ports:
  - port: 5672
    targetPort: 5672
  - port: 15672
    targetPort: 15672
EOF
```

### PASO 6: Actualizar ConfigMaps con IPs Privadas

```bash
# Obtener IP privada de Cloud SQL
SQL_IP=$(gcloud sql instances describe ecommerce-postgres-dev \
    --format='value(ipAddresses[0].ipAddress)')

# Obtener IP de Redis
REDIS_IP=$(gcloud redis instances describe ecommerce-redis-dev \
    --region=us-central1 \
    --format='value(host)')

# Actualizar ConfigMap
kubectl patch configmap db-config -n ecommerce --type merge \
  -p "{\"data\":{\"DB_HOST\":\"${SQL_IP}\"}}"

kubectl patch configmap redis-config -n ecommerce --type merge \
  -p "{\"data\":{\"REDIS_HOST\":\"${REDIS_IP}\"}}"
```

### PASO 7: Desplegar Microservicios

```bash
cd infra/k8s/base

# Usar kustomize para desplegar
kustomize build . | kubectl apply -f -

# O aplicar archivos individualmente
kubectl apply -k .
```

### PASO 8: Verificar Despliegue

```bash
# Verificar pods
kubectl get pods -n ecommerce

# Verificar servicios
kubectl get svc -n ecommerce

# Verificar ingress
kubectl get ingress -n ecommerce

# Ver logs
kubectl logs -l app=api-gateway -n ecommerce --tail=100

# Verificar health checks
curl http://$(kubectl get svc api-gateway -n ecommerce -o jsonpath='{.status.loadBalancer.ingress[0].ip}')/health
```

---

## 🔄 CI/CD CON CLOUD BUILD

### Configurar Trigger

```bash
# Crear trigger de Cloud Build
gcloud builds triggers create github \
    --repo-name=ecommerce-platform \
    --repo-owner=your-github-username \
    --branch-pattern="^main$" \
    --build-config=infra/cloud-build/cloudbuild.yaml
```

### Ejecutar Build Manual

```bash
gcloud builds submit --config=infra/cloud-build/cloudbuild.yaml
```

---

## 📊 MONITOREO

### Cloud Monitoring

```bash
# Crear dashboard
gcloud monitoring dashboards create --config-json='{
  "displayName": "E-Commerce Platform",
  "gridLayout": {
    "columns": "2",
    "widgets": [
      {
        "title": "CPU Usage",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"k8s_container\" AND metric.type=\"kubernetes.io/container/cpu/core_usage_time\""
              }
            }
          }]
        }
      }
    ]
  }
}'
```

### Logs

```bash
# Ver logs de todos los servicios
gcloud logging read "resource.type=k8s_container AND resource.labels.namespace_name=ecommerce" --limit=50

# Ver logs de un servicio específico
gcloud logging read "resource.labels.container_name=api-gateway AND resource.labels.namespace_name=ecommerce" --limit=50
```

---

## 🧪 COMANDOS ÚTILES

```bash
# Escalar servicio
kubectl scale deployment api-gateway --replicas=5 -n ecommerce

# Reiniciar servicio
kubectl rollout restart deployment/api-gateway -n ecommerce

# Ver historial de despliegues
kubectl rollout history deployment/api-gateway -n ecommerce

# Rollback
kubectl rollout undo deployment/api-gateway -n ecommerce

# Port forwarding para desarrollo
kubectl port-forward svc/api-gateway 3000:80 -n ecommerce

# Ejecutar comando en pod
kubectl exec -it deployment/auth-service -n ecommerce -- /bin/sh

# Ver recursos utilizados
kubectl top pods -n ecommerce
```

---

## 🛡️ SEGURIDAD

### Network Policies

```bash
# Aplicar network policies restrictivas
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: ecommerce
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-gateway
  namespace: ecommerce
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  ingress:
  - from: []
    ports:
    - protocol: TCP
      port: 3000
EOF
```

---

## 💰 LIMPIEZA (EVITAR COSTOS)

```bash
# Destruir infraestructura
cd infra/terraform
terraform destroy

# O eliminar recursos individuales
# Eliminar GKE
gcloud container clusters delete ecommerce-cluster-dev --region=us-central1 --quiet

# Eliminar Cloud SQL
gcloud sql instances delete ecommerce-postgres-dev --quiet

# Eliminar Redis
gcloud redis instances delete ecommerce-redis-dev --region=us-central1 --quiet
```

---

## 📞 TROUBLESHOOTING

### Problema: Pods en estado Pending
```bash
# Verificar recursos
kubectl describe node

# Verificar eventos
kubectl get events -n ecommerce --sort-by='.lastTimestamp'
```

### Problema: ImagePullBackOff
```bash
# Verificar permisos de Artifact Registry
gcloud artifacts repositories add-iam-policy-binding ecommerce-repo \
    --location=us-central1 \
    --member="serviceAccount:YOUR_PROJECT_ID@appspot.gserviceaccount.com" \
    --role="roles/artifactregistry.reader"
```

### Problema: Conexión a Cloud SQL falla
```bash
# Verificar IP privada
kubectl get configmap db-config -n ecommerce -o yaml

# Verificar conectividad
kubectl run debug --rm -it --image=busybox --restart=Never -- nc -zv <SQL_IP> 5432
```

---

## 📚 RECURSOS ADICIONALES

- [GKE Documentation](https://cloud.google.com/kubernetes-engine/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)

---

**¡Listo para producción!** 🎉
