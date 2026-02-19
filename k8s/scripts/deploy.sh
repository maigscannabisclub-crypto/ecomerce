#!/bin/bash
###############################################################################
# Script de despliegue para la plataforma e-commerce en Kubernetes
# Uso: ./deploy.sh [environment] [options]
# 
# Environments: development, staging, production
# Options:
#   --dry-run       : Simula el despliegue sin aplicar cambios
#   --skip-secrets  : Omite la creación de secrets
#   --skip-infra    : Omite el despliegue de infraestructura
#   --skip-monitoring: Omite el despliegue de monitoreo
#   --force         : Fuerza el despliegue sin confirmación
###############################################################################

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables globales
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=""
DRY_RUN=false
SKIP_SECRETS=false
SKIP_INFRA=false
SKIP_MONITORING=false
FORCE=false

# Funciones de utilidad
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Función de ayuda
show_help() {
    cat << EOF
Uso: $(basename "$0") [ENVIRONMENT] [OPTIONS]

Despliega la plataforma e-commerce en Kubernetes.

ENVIRONMENT:
    development     Despliega en ambiente de desarrollo
    staging         Despliega en ambiente de staging
    production      Despliega en ambiente de producción

OPTIONS:
    --dry-run           Simula el despliegue sin aplicar cambios
    --skip-secrets      Omite la creación de secrets
    --skip-infra        Omite el despliegue de infraestructura
    --skip-monitoring   Omite el despliegue de monitoreo
    --force             Fuerza el despliegue sin confirmación
    -h, --help          Muestra esta ayuda

EJEMPLOS:
    $(basename "$0") development
    $(basename "$0") staging --dry-run
    $(basename "$0") production --force
    $(basename "$0") development --skip-secrets --skip-monitoring

EOF
}

# Verificar dependencias
check_dependencies() {
    local deps=("kubectl" "kustomize")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Dependencia no encontrada: $dep"
            exit 1
        fi
    done
    
    # Verificar conexión al cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "No se puede conectar al cluster de Kubernetes"
        exit 1
    fi
    
    log_success "Todas las dependencias están disponibles"
}

# Parsear argumentos
parse_args() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            development|staging|production)
                ENVIRONMENT="$1"
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-secrets)
                SKIP_SECRETS=true
                shift
                ;;
            --skip-infra)
                SKIP_INFRA=true
                shift
                ;;
            --skip-monitoring)
                SKIP_MONITORING=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Opción desconocida: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Debe especificar un ambiente (development, staging, production)"
        exit 1
    fi
}

# Confirmar despliegue en producción
confirm_production() {
    if [[ "$ENVIRONMENT" == "production" && "$FORCE" == false ]]; then
        log_warning "Está a punto de desplegar en PRODUCCIÓN"
        echo -n "¿Está seguro? Escriba 'PRODUCCION' para confirmar: "
        read -r confirmation
        
        if [[ "$confirmation" != "PRODUCCION" ]]; then
            log_info "Despliegue cancelado"
            exit 0
        fi
    fi
}

# Crear namespaces
create_namespaces() {
    log_info "Creando namespaces..."
    
    local namespaces=("ecommerce" "ecommerce-data" "ecommerce-monitoring")
    
    for ns in "${namespaces[@]}"; do
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Crear namespace: $ns"
        else
            kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
            log_success "Namespace creado/actualizado: $ns"
        fi
    done
}

# Crear secrets
create_secrets() {
    if [[ "$SKIP_SECRETS" == true ]]; then
        log_info "Omitiendo creación de secrets"
        return
    fi
    
    log_info "Creando secrets..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Crear secrets desde templates"
        return
    fi
    
    # Verificar si los secrets ya existen
    if kubectl get secret app-secrets -n ecommerce &> /dev/null; then
        log_warning "Secret 'app-secrets' ya existe. Use kubectl para actualizarlo manualmente."
    else
        log_warning "Secret 'app-secrets' no encontrado. Debe crearlo manualmente:"
        log_info "kubectl create secret generic app-secrets \\"
        log_info "  --from-literal=jwt-secret=YOUR_JWT_SECRET \\"
        log_info "  --from-literal=db-password=YOUR_DB_PASSWORD \\"
        log_info "  --from-literal=redis-password=YOUR_REDIS_PASSWORD \\"
        log_info "  -n ecommerce"
    fi
    
    if kubectl get secret db-secrets -n ecommerce-data &> /dev/null; then
        log_warning "Secret 'db-secrets' ya existe. Use kubectl para actualizarlo manualmente."
    else
        log_warning "Secret 'db-secrets' no encontrado. Debe crearlo manualmente."
    fi
}

# Desplegar infraestructura
deploy_infrastructure() {
    if [[ "$SKIP_INFRA" == true ]]; then
        log_info "Omitiendo despliegue de infraestructura"
        return
    fi
    
    log_info "Desplegando infraestructura de datos..."
    
    local infra_files=(
        "postgres/statefulset.yaml"
        "redis/deployment.yaml"
        "rabbitmq/statefulset.yaml"
    )
    
    for file in "${infra_files[@]}"; do
        local filepath="$K8S_DIR/infrastructure/$file"
        if [[ -f "$filepath" ]]; then
            if [[ "$DRY_RUN" == true ]]; then
                log_info "[DRY-RUN] Aplicar: $file"
                kubectl apply -f "$filepath" --dry-run=client
            else
                kubectl apply -f "$filepath"
                log_success "Aplicado: $file"
            fi
        else
            log_warning "Archivo no encontrado: $filepath"
        fi
    done
    
    if [[ "$DRY_RUN" == false ]]; then
        log_info "Esperando a que PostgreSQL esté listo..."
        kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgres -n ecommerce-data --timeout=120s || true
        
        log_info "Esperando a que Redis esté listo..."
        kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=redis -n ecommerce-data --timeout=120s || true
        
        log_info "Esperando a que RabbitMQ esté listo..."
        kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=rabbitmq -n ecommerce-data --timeout=120s || true
    fi
}

# Desplegar monitoreo
deploy_monitoring() {
    if [[ "$SKIP_MONITORING" == true ]]; then
        log_info "Omitiendo despliegue de monitoreo"
        return
    fi
    
    log_info "Desplegando stack de monitoreo..."
    
    local monitoring_files=(
        "prometheus.yaml"
        "grafana.yaml"
    )
    
    for file in "${monitoring_files[@]}"; do
        local filepath="$K8S_DIR/infrastructure/monitoring/$file"
        if [[ -f "$filepath" ]]; then
            if [[ "$DRY_RUN" == true ]]; then
                log_info "[DRY-RUN] Aplicar: $file"
                kubectl apply -f "$filepath" --dry-run=client
            else
                kubectl apply -f "$filepath"
                log_success "Aplicado: $file"
            fi
        else
            log_warning "Archivo no encontrado: $filepath"
        fi
    done
}

# Desplegar aplicación
deploy_application() {
    log_info "Desplegando aplicación e-commerce ($ENVIRONMENT)..."
    
    local overlay_dir="$K8S_DIR/overlays/$ENVIRONMENT"
    
    if [[ ! -d "$overlay_dir" ]]; then
        log_error "Directorio de overlay no encontrado: $overlay_dir"
        exit 1
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] kustomize build $overlay_dir"
        kustomize build "$overlay_dir" | kubectl apply --dry-run=client -f -
    else
        log_info "Aplicando configuración de Kustomize..."
        kustomize build "$overlay_dir" | kubectl apply -f -
        log_success "Aplicación desplegada exitosamente"
    fi
}

# Verificar despliegue
verify_deployment() {
    if [[ "$DRY_RUN" == true ]]; then
        return
    fi
    
    log_info "Verificando despliegue..."
    
    local namespace="ecommerce"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        namespace="ecommerce-dev"
    elif [[ "$ENVIRONMENT" == "staging" ]]; then
        namespace="ecommerce-staging"
    fi
    
    echo ""
    echo "=== Pods ==="
    kubectl get pods -n "$namespace"
    
    echo ""
    echo "=== Services ==="
    kubectl get services -n "$namespace"
    
    echo ""
    echo "=== HPA ==="
    kubectl get hpa -n "$namespace" || true
    
    echo ""
    echo "=== Ingress ==="
    kubectl get ingress -n "$namespace" || true
    
    log_success "Verificación completada"
}

# Función principal
main() {
    log_info "Iniciando despliegue de E-Commerce Platform"
    log_info "Ambiente: $ENVIRONMENT"
    
    check_dependencies
    parse_args "$@"
    confirm_production
    create_namespaces
    create_secrets
    deploy_infrastructure
    deploy_monitoring
    deploy_application
    verify_deployment
    
    log_success "Despliegue completado exitosamente!"
    
    echo ""
    echo "=== URLs de acceso ==="
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo "API Gateway: https://api.ecommerce.com"
        echo "Admin Panel: https://admin.ecommerce.com"
        echo "Grafana: https://grafana.ecommerce.com"
        echo "Prometheus: https://prometheus.ecommerce.com"
    elif [[ "$ENVIRONMENT" == "staging" ]]; then
        echo "Namespace: ecommerce-staging"
        echo "Usar: kubectl port-forward para acceder a los servicios"
    else
        echo "Namespace: ecommerce-dev"
        echo "Usar: kubectl port-forward para acceder a los servicios"
    fi
}

# Ejecutar función principal
main "$@"
