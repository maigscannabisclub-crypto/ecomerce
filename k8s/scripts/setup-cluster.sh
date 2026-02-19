#!/bin/bash
###############################################################################
# Script de configuración inicial del cluster de Kubernetes
# Uso: ./setup-cluster.sh
###############################################################################

set -euo pipefail

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Verificar kubectl
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl no está instalado"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "No se puede conectar al cluster de Kubernetes"
        exit 1
    fi
    
    log_success "Conexión al cluster verificada"
}

# Instalar NGINX Ingress Controller
install_ingress_controller() {
    log_info "Instalando NGINX Ingress Controller..."
    
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
    
    log_info "Esperando a que el Ingress Controller esté listo..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=120s
    
    log_success "NGINX Ingress Controller instalado"
}

# Instalar Cert-Manager
install_cert_manager() {
    log_info "Instalando Cert-Manager..."
    
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    
    log_info "Esperando a que Cert-Manager esté listo..."
    kubectl wait --namespace cert-manager \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/instance=cert-manager \
        --timeout=120s
    
    log_success "Cert-Manager instalado"
}

# Instalar Metrics Server
install_metrics_server() {
    log_info "Instalando Metrics Server..."
    
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    
    log_info "Esperando a que Metrics Server esté listo..."
    kubectl wait --namespace kube-system \
        --for=condition=ready pod \
        --selector=k8s-app=metrics-server \
        --timeout=120s
    
    log_success "Metrics Server instalado"
}

# Crear ClusterIssuer para Let's Encrypt
create_cluster_issuer() {
    log_info "Creando ClusterIssuer para Let's Encrypt..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: admin@ecommerce.com
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
    - http01:
        ingress:
          class: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@ecommerce.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    log_success "ClusterIssuers creados"
}

# Crear ServiceAccount para la aplicación
create_service_account() {
    log_info "Creando ServiceAccount para la aplicación..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ecommerce-sa
  namespace: ecommerce
  labels:
    app.kubernetes.io/name: ecommerce
    app.kubernetes.io/component: service-account
EOF
    
    log_success "ServiceAccount creado"
}

# Configurar RBAC
setup_rbac() {
    log_info "Configurando RBAC..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ecommerce-role
  namespace: ecommerce
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ecommerce-rolebinding
  namespace: ecommerce
subjects:
- kind: ServiceAccount
  name: ecommerce-sa
  namespace: ecommerce
roleRef:
  kind: Role
  name: ecommerce-role
  apiGroup: rbac.authorization.k8s.io
EOF
    
    log_success "RBAC configurado"
}

# Configurar Network Policies
setup_network_policies() {
    log_info "Configurando Network Policies..."
    
    cat <<EOF | kubectl apply -f -
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
      app.kubernetes.io/name: api-gateway
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-internal-services
  namespace: ecommerce
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/component: service
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app.kubernetes.io/component: gateway
    - podSelector:
        matchLabels:
          app.kubernetes.io/component: service
    ports:
    - protocol: TCP
      port: 8081
    - protocol: TCP
      port: 8082
    - protocol: TCP
      port: 8083
    - protocol: TCP
      port: 8084
    - protocol: TCP
      port: 8085
    - protocol: TCP
      port: 8086
EOF
    
    log_success "Network Policies configuradas"
}

# Función principal
main() {
    log_info "Configurando cluster de Kubernetes para E-Commerce Platform"
    
    check_kubectl
    install_metrics_server
    install_ingress_controller
    install_cert_manager
    create_cluster_issuer
    create_service_account
    setup_rbac
    setup_network_policies
    
    log_success "Configuración del cluster completada!"
    
    echo ""
    echo "=== Próximos pasos ==="
    echo "1. Configurar secrets: kubectl create secret generic ..."
    echo "2. Desplegar infraestructura: ./deploy.sh development --skip-monitoring"
    echo "3. Verificar despliegue: kubectl get pods -n ecommerce"
}

main "$@"
