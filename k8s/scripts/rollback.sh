#!/bin/bash
###############################################################################
# Script de rollback para la plataforma e-commerce en Kubernetes
# Uso: ./rollback.sh [environment] [revision]
###############################################################################

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT=""
REVISION=""

# Funciones de utilidad
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Función de ayuda
show_help() {
    cat << EOF
Uso: $(basename "$0") [ENVIRONMENT] [REVISION]

Realiza rollback de la plataforma e-commerce.

ENVIRONMENT:
    development     Rollback en desarrollo
    staging         Rollback en staging
    production      Rollback en producción

REVISION:
    Número de revisión a restaurar (opcional)
    Si no se especifica, se revierte a la versión anterior

EJEMPLOS:
    $(basename "$0") development
    $(basename "$0") staging 3
    $(basename "$0") production 5

EOF
}

# Obtener namespace
get_namespace() {
    case "$ENVIRONMENT" in
        development)
            echo "ecommerce-dev"
            ;;
        staging)
            echo "ecommerce-staging"
            ;;
        production)
            echo "ecommerce"
            ;;
        *)
            echo "ecommerce"
            ;;
    esac
}

# Mostrar historial de revisiones
show_history() {
    local namespace=$(get_namespace)
    
    log_info "Historial de revisiones para el namespace: $namespace"
    echo ""
    
    kubectl get deployments -n "$namespace" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | while read -r deployment; do
        echo "=== $deployment ==="
        kubectl rollout history deployment/"$deployment" -n "$namespace" || true
        echo ""
    done
}

# Realizar rollback
perform_rollback() {
    local namespace=$(get_namespace)
    
    log_info "Realizando rollback en ambiente: $ENVIRONMENT"
    
    if [[ -n "$REVISION" ]]; then
        log_info "Revirtiendo a revisión: $REVISION"
    else
        log_info "Revirtiendo a versión anterior"
    fi
    
    kubectl get deployments -n "$namespace" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | while read -r deployment; do
        if [[ -n "$REVISION" ]]; then
            kubectl rollout undo deployment/"$deployment" -n "$namespace" --to-revision="$REVISION" || true
        else
            kubectl rollout undo deployment/"$deployment" -n "$namespace" || true
        fi
    done
    
    log_success "Rollback completado"
    
    # Verificar estado
    echo ""
    log_info "Verificando estado de los pods..."
    kubectl get pods -n "$namespace"
}

# Función principal
main() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    ENVIRONMENT="$1"
    REVISION="${2:-}"
    
    case "$ENVIRONMENT" in
        development|staging|production)
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Ambiente no válido: $ENVIRONMENT"
            show_help
            exit 1
            ;;
    esac
    
    # Confirmación para producción
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warning "Está a punto de realizar ROLLBACK en PRODUCCIÓN"
        echo -n "¿Está seguro? (si/no): "
        read -r confirmation
        
        if [[ "$confirmation" != "si" ]]; then
            log_info "Rollback cancelado"
            exit 0
        fi
    fi
    
    show_history
    perform_rollback
}

main "$@"
