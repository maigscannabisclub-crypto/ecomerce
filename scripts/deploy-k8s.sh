#!/bin/bash

# =============================================================================
# E-Commerce Platform - Kubernetes Deploy Script
# =============================================================================
# Script para desplegar la plataforma en Kubernetes
# Soporta despliegues con kubectl y Helm
# =============================================================================

set -euo pipefail

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Configuración
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly K8S_DIR="$PROJECT_ROOT/k8s"
readonly HELM_DIR="$PROJECT_ROOT/helm"

# Variables
NAMESPACE="ecommerce"
ENVIRONMENT="development"
USE_HELM=false
DRY_RUN=false
WAIT=true
TIMEOUT=300
SKIP_TESTS=false
ACTION="deploy"
IMAGE_TAG="latest"

# =============================================================================
# Funciones de utilidad
# =============================================================================

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

log_k8s() {
    echo -e "${PURPLE}[K8S]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           ☸️  E-COMMERCE PLATFORM - K8S DEPLOY                ║
    ║                                                               ║
    ║           Desplegando en Kubernetes...                        ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [COMANDO] [OPCIONES]

Comandos:
    deploy               Desplegar la plataforma (default)
    destroy              Eliminar todos los recursos
    status               Ver estado del despliegue
    logs                 Ver logs de los pods
    rollback             Hacer rollback al despliegue anterior
    scale                Escalar servicios

Opciones:
    -n, --namespace NS   Namespace de Kubernetes (default: ecommerce)
    -e, --env ENV        Entorno: development|staging|production (default: development)
    --helm               Usar Helm para el despliegue
    --dry-run            Simular despliegue sin aplicar cambios
    --no-wait            No esperar a que los pods estén listos
    -t, --timeout SEC    Timeout en segundos (default: 300)
    --skip-tests         Saltar tests post-despliegue
    --tag TAG            Tag de imagen Docker (default: latest)
    -h, --help           Mostrar esta ayuda

Ejemplos:
    $0                              # Desplegar en development
    $0 -e production                # Desplegar en producción
    $0 -n ecommerce-prod --helm     # Desplegar con Helm
    $0 destroy                      # Eliminar todos los recursos
    $0 status                       # Ver estado
    $0 logs api-gateway             # Ver logs del api-gateway
    $0 scale --replicas 5 web       # Escalar web a 5 réplicas

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    # Primer argumento puede ser el comando
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        ACTION="$1"
        shift
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --helm)
                USE_HELM=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-wait)
                WAIT=false
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --replicas)
                REPLICAS="$2"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Opción desconocida: $1"
                print_usage
                exit 1
                ;;
            *)
                SERVICE_NAME="$1"
                shift
                ;;
        esac
    done
    
    # Validar comando
    case $ACTION in
        deploy|destroy|status|logs|rollback|scale)
            ;;
        *)
            log_error "Comando inválido: $ACTION"
            print_usage
            exit 1
            ;;
    esac
    
    # Validar entorno
    case $ENVIRONMENT in
        development|staging|production)
            ;;
        *)
            log_error "Entorno inválido: $ENVIRONMENT"
            print_usage
            exit 1
            ;;
    esac
}

# =============================================================================
# Verificar dependencias
# =============================================================================

check_dependencies() {
    log_info "Verificando dependencias de Kubernetes..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl no está instalado"
        exit 1
    fi
    
    if ! kubectl cluster-info &>/dev/null; then
        log_error "No se puede conectar al cluster de Kubernetes"
        log_info "Verifica tu configuración de kubectl"
        exit 1
    fi
    
    log_success "kubectl conectado al cluster"
    
    if [[ "$USE_HELM" == true ]]; then
        if ! command -v helm &> /dev/null; then
            log_error "Helm no está instalado"
            exit 1
        fi
        log_success "Helm disponible"
    fi
}

# =============================================================================
# Crear namespace
# =============================================================================

create_namespace() {
    log_k8s "Configurando namespace: $NAMESPACE"
    
    if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
        kubectl create namespace "$NAMESPACE"
        log_success "Namespace creado: $NAMESPACE"
    else
        log_info "Namespace ya existe: $NAMESPACE"
    fi
    
    # Etiquetar namespace
    kubectl label namespace "$NAMESPACE" environment="$ENVIRONMENT" --overwrite 2>/dev/null || true
}

# =============================================================================
# Aplicar manifiestos con kubectl
# =============================================================================

apply_manifests() {
    log_k8s "Aplicando manifiestos de Kubernetes..."
    
    local env_dir="$K8S_DIR/overlays/$ENVIRONMENT"
    local base_dir="$K8S_DIR/base"
    
    if [[ ! -d "$base_dir" ]]; then
        log_error "Directorio base de manifiestos no encontrado: $base_dir"
        exit 1
    fi
    
    local apply_args=""
    if [[ "$DRY_RUN" == true ]]; then
        apply_args="--dry-run=client"
        log_warning "Modo dry-run: no se aplicarán cambios"
    fi
    
    # Aplicar ConfigMaps y Secrets primero
    log_info "Aplicando ConfigMaps y Secrets..."
    kubectl apply -f "$base_dir/configmaps" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    kubectl apply -f "$base_dir/secrets" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    
    # Aplicar Persistent Volumes
    log_info "Aplicando Persistent Volumes..."
    kubectl apply -f "$base_dir/volumes" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    
    # Aplicar servicios de base de datos
    log_info "Aplicando servicios de base de datos..."
    kubectl apply -f "$base_dir/databases" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    
    # Aplicar deployments de aplicación
    log_info "Aplicando deployments de aplicación..."
    
    # Actualizar tag de imagen si se especificó
    if [[ "$IMAGE_TAG" != "latest" ]]; then
        log_info "Usando imagen tag: $IMAGE_TAG"
        export IMAGE_TAG
    fi
    
    kubectl apply -f "$base_dir/deployments" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    kubectl apply -f "$base_dir/services" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    
    # Aplicar ingress
    log_info "Aplicando Ingress..."
    kubectl apply -f "$base_dir/ingress" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    
    # Aplicar configuraciones específicas del entorno
    if [[ -d "$env_dir" ]]; then
        log_info "Aplicando configuraciones de entorno: $ENVIRONMENT"
        kubectl apply -k "$env_dir" -n "$NAMESPACE" $apply_args 2>/dev/null || true
    fi
    
    log_success "Manifiestos aplicados"
}

# =============================================================================
# Desplegar con Helm
# =============================================================================

deploy_helm() {
    log_k8s "Desplegando con Helm..."
    
    local chart_dir="$HELM_DIR/ecommerce-platform"
    
    if [[ ! -d "$chart_dir" ]]; then
        log_error "Chart de Helm no encontrado: $chart_dir"
        exit 1
    fi
    
    local values_file="$chart_dir/values-$ENVIRONMENT.yaml"
    if [[ ! -f "$values_file" ]]; then
        values_file="$chart_dir/values.yaml"
    fi
    
    local helm_args=""
    
    if [[ "$DRY_RUN" == true ]]; then
        helm_args="$helm_args --dry-run"
        log_warning "Modo dry-run: no se aplicarán cambios"
    fi
    
    if [[ "$WAIT" == true ]]; then
        helm_args="$helm_args --wait --timeout ${TIMEOUT}s"
    fi
    
    # Verificar si el release ya existe
    if helm list -n "$NAMESPACE" | grep -q "^ecommerce-platform"; then
        log_info "Actualizando release existente..."
        helm upgrade ecommerce-platform "$chart_dir" \
            -n "$NAMESPACE" \
            -f "$values_file" \
            --set image.tag="$IMAGE_TAG" \
            --set environment="$ENVIRONMENT" \
            $helm_args
    else
        log_info "Instalando nuevo release..."
        helm install ecommerce-platform "$chart_dir" \
            -n "$NAMESPACE" \
            -f "$values_file" \
            --set image.tag="$IMAGE_TAG" \
            --set environment="$ENVIRONMENT" \
            --create-namespace \
            $helm_args
    fi
    
    log_success "Despliegue con Helm completado"
}

# =============================================================================
# Esperar a que los pods estén listos
# =============================================================================

wait_for_pods() {
    if [[ "$WAIT" == false ]]; then
        return 0
    fi
    
    log_k8s "Esperando a que los pods estén listos..."
    
    local deployments
    deployments=$(kubectl get deployments -n "$NAMESPACE" -o name 2>/dev/null || true)
    
    if [[ -z "$deployments" ]]; then
        log_warning "No se encontraron deployments"
        return 0
    fi
    
    for deployment in $deployments; do
        local name
        name=$(echo "$deployment" | cut -d'/' -f2)
        log_info "Esperando: $name"
        
        if ! kubectl rollout status "$deployment" -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
            log_error "Timeout esperando: $name"
            return 1
        fi
    done
    
    log_success "Todos los pods están listos"
}

# =============================================================================
# Ejecutar tests post-despliegue
# =============================================================================

run_post_deploy_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_info "Tests post-despliegue omitidos"
        return 0
    fi
    
    log_k8s "Ejecutando tests post-despliegue..."
    
    # Test de conectividad básica
    log_info "Test de conectividad..."
    
    # Obtener IP del ingress o servicio
    local ingress_ip
    ingress_ip=$(kubectl get ingress -n "$NAMESPACE" -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    
    if [[ -n "$ingress_ip" ]]; then
        if curl -s "http://$ingress_ip/health" &>/dev/null; then
            log_success "Health check pasó"
        else
            log_warning "Health check falló"
        fi
    fi
    
    # Verificar servicios
    log_info "Verificando servicios..."
    kubectl get services -n "$NAMESPACE"
    
    log_success "Tests post-despliegue completados"
}

# =============================================================================
# Mostrar estado del despliegue
# =============================================================================

show_status() {
    log_k8s "Estado del despliegue en namespace: $NAMESPACE"
    
    echo
    echo -e "${CYAN}Pods:${NC}"
    kubectl get pods -n "$NAMESPACE" -o wide
    
    echo
    echo -e "${CYAN}Services:${NC}"
    kubectl get services -n "$NAMESPACE"
    
    echo
    echo -e "${CYAN}Deployments:${NC}"
    kubectl get deployments -n "$NAMESPACE"
    
    echo
    echo -e "${CYAN}Ingress:${NC}"
    kubectl get ingress -n "$NAMESPACE" 2>/dev/null || echo "No hay ingress configurados"
    
    echo
    echo -e "${CYAN}Persistent Volumes:${NC}"
    kubectl get pvc -n "$NAMESPACE" 2>/dev/null || echo "No hay PVCs"
}

# =============================================================================
# Mostrar información de acceso
# =============================================================================

show_access_info() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  🌐 ACCESO AL DESPLIEGUE                      ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Obtener información del ingress
    local ingress_host
    ingress_host=$(kubectl get ingress -n "$NAMESPACE" -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || true)
    
    local ingress_ip
    ingress_ip=$(kubectl get ingress -n "$NAMESPACE" -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    
    if [[ -n "$ingress_host" ]]; then
        echo -e "${CYAN}URL de acceso:${NC}"
        echo -e "  🌐 https://$ingress_host"
    fi
    
    if [[ -n "$ingress_ip" ]]; then
        echo -e "  🔌 IP: $ingress_ip"
    fi
    
    # Port forwarding para desarrollo
    echo
    echo -e "${CYAN}Port Forwarding (para desarrollo local):${NC}"
    echo -e "  API Gateway: ${GREEN}kubectl port-forward svc/api-gateway 3000:3000 -n $NAMESPACE${NC}"
    echo -e "  Web:         ${GREEN}kubectl port-forward svc/web 8080:8080 -n $NAMESPACE${NC}"
    
    echo
    echo -e "${CYAN}Comandos útiles:${NC}"
    echo -e "  Ver logs:    ${GREEN}kubectl logs -f deployment/api-gateway -n $NAMESPACE${NC}"
    echo -e "  Escalar:     ${GREEN}kubectl scale deployment web --replicas=3 -n $NAMESPACE${NC}"
    echo -e "  Shell:       ${GREEN}kubectl exec -it deployment/api-gateway -- /bin/sh -n $NAMESPACE${NC}"
}

# =============================================================================
# Eliminar recursos
# =============================================================================

destroy_resources() {
    log_warning "⚠️  Esta acción eliminará TODOS los recursos del namespace: $NAMESPACE"
    echo
    read -p "¿Estás seguro? Escribe 'destroy' para confirmar: " -r
    echo
    
    if [[ ! $REPLY =~ ^destroy$ ]]; then
        log_info "Operación cancelada"
        exit 0
    fi
    
    if [[ "$USE_HELM" == true ]]; then
        log_k8s "Eliminando release de Helm..."
        helm uninstall ecommerce-platform -n "$NAMESPACE" 2>/dev/null || true
    fi
    
    log_k8s "Eliminando recursos de Kubernetes..."
    kubectl delete all --all -n "$NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete pvc --all -n "$NAMESPACE" 2>/dev/null || true
    kubectl delete configmap --all -n "$NAMESPACE" 2>/dev/null || true
    kubectl delete secret --all -n "$NAMESPACE" 2>/dev/null || true
    kubectl delete ingress --all -n "$NAMESPACE" 2>/dev/null || true
    
    # Opcionalmente eliminar namespace
    read -p "¿Eliminar el namespace '$NAMESPACE'? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        kubectl delete namespace "$NAMESPACE"
        log_success "Namespace eliminado: $NAMESPACE"
    fi
    
    log_success "Recursos eliminados"
}

# =============================================================================
# Ver logs
# =============================================================================

show_logs() {
    local service=${SERVICE_NAME:-}
    
    if [[ -n "$service" ]]; then
        log_k8s "Mostrando logs de: $service"
        kubectl logs -f deployment/"$service" -n "$NAMESPACE" --tail=100
    else
        log_k8s "Mostrando logs de todos los pods..."
        kubectl logs -f --all-containers=true --prefix=true -n "$NAMESPACE" --tail=100
    fi
}

# =============================================================================
# Hacer rollback
# =============================================================================

rollback_deployment() {
    local service=${SERVICE_NAME:-}
    
    if [[ -n "$service" ]]; then
        log_k8s "Haciendo rollback de: $service"
        kubectl rollout undo deployment/"$service" -n "$NAMESPACE"
        kubectl rollout status deployment/"$service" -n "$NAMESPACE"
    else
        log_k8s "Haciendo rollback de todos los deployments..."
        local deployments
        deployments=$(kubectl get deployments -n "$NAMESPACE" -o name)
        
        for deployment in $deployments; do
            log_info "Rollback: $(echo "$deployment" | cut -d'/' -f2)"
            kubectl rollout undo "$deployment" -n "$NAMESPACE"
        done
    fi
    
    log_success "Rollback completado"
}

# =============================================================================
# Escalar servicios
# =============================================================================

scale_service() {
    local service=${SERVICE_NAME:-}
    local replicas=${REPLICAS:-1}
    
    if [[ -z "$service" ]]; then
        log_error "Debes especificar un servicio para escalar"
        exit 1
    fi
    
    log_k8s "Escalando $service a $replicas réplicas..."
    kubectl scale deployment/"$service" --replicas="$replicas" -n "$NAMESPACE"
    
    kubectl rollout status deployment/"$service" -n "$NAMESPACE"
    log_success "Servicio escalado: $service -> $replicas réplicas"
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    
    if [[ "$JSON" != true ]]; then
        print_banner
    fi
    
    case $ACTION in
        deploy)
            check_dependencies
            create_namespace
            
            if [[ "$USE_HELM" == true ]]; then
                deploy_helm
            else
                apply_manifests
            fi
            
            wait_for_pods
            run_post_deploy_tests
            show_status
            show_access_info
            ;;
            
        destroy)
            check_dependencies
            destroy_resources
            ;;
            
        status)
            check_dependencies
            show_status
            ;;
            
        logs)
            check_dependencies
            show_logs
            ;;
            
        rollback)
            check_dependencies
            rollback_deployment
            ;;
            
        scale)
            check_dependencies
            scale_service
            ;;
    esac
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
