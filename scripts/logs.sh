#!/bin/bash

# =============================================================================
# E-Commerce Platform - Logs Script
# =============================================================================
# Script para ver y gestionar logs de la plataforma
# =============================================================================

set -euo pipefail

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly GRAY='\033[0;90m'
readonly NC='\033[0m'

# Configuración
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly LOGS_DIR="$PROJECT_ROOT/logs"

# Variables
SERVICE=""
FOLLOW=false
TAIL=100
SINCE=""
UNTIL=""
FILTER=""
TIMESTAMPS=true
EXPORT=false
EXPORT_FILE=""
JSON=false

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

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           📋 E-COMMERCE PLATFORM - LOGS                       ║
    ║                                                               ║
    ║           Visualización de logs del sistema                   ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES] [SERVICIO]

Opciones:
    -f, --follow         Seguir logs en tiempo real
    -n, --tail NUM       Mostrar últimas NUM líneas (default: 100)
    --since TIME         Mostrar logs desde TIME (ej: 2024-01-01, 1h, 30m)
    --until TIME         Mostrar logs hasta TIME
    --filter PATTERN     Filtrar por patrón
    --no-timestamps      Ocultar timestamps
    --export FILE        Exportar logs a archivo
    --json               Formato JSON
    -h, --help           Mostrar esta ayuda

Servicios:
    api-gateway, auth-service, product-service, order-service
    payment-service, inventory-service, notification-service, web
    postgres, mongodb, redis, rabbitmq, elasticsearch
    all                  Todos los servicios (default)

Ejemplos:
    $0                              # Logs de todos los servicios
    $0 api-gateway                  # Logs del api-gateway
    $0 -f web                       # Seguir logs del web en tiempo real
    $0 -n 50 postgres               # Últimas 50 líneas de postgres
    $0 --since 1h --filter ERROR    # Logs de la última hora con ERROR
    $0 --export logs.txt all        # Exportar todos los logs

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--follow)
                FOLLOW=true
                shift
                ;;
            -n|--tail)
                TAIL="$2"
                shift 2
                ;;
            --since)
                SINCE="$2"
                shift 2
                ;;
            --until)
                UNTIL="$2"
                shift 2
                ;;
            --filter)
                FILTER="$2"
                shift 2
                ;;
            --no-timestamps)
                TIMESTAMPS=false
                shift
                ;;
            --export)
                EXPORT=true
                EXPORT_FILE="$2"
                shift 2
                ;;
            --json)
                JSON=true
                shift
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
                SERVICE="$1"
                shift
                ;;
        esac
    done
    
    # Si no se especificó servicio, usar "all"
    if [[ -z "$SERVICE" ]]; then
        SERVICE="all"
    fi
}

# =============================================================================
# Determinar comando de Docker Compose
# =============================================================================

get_docker_compose_cmd() {
    if docker compose version &>/dev/null; then
        echo "docker compose"
    elif command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    else
        echo ""
    fi
}

# =============================================================================
# Listar servicios disponibles
# =============================================================================

list_services() {
    log_info "Servicios disponibles:"
    
    local containers
    containers=$(docker ps --format '{{.Names}}' | grep -E 'ecommerce|api|web|postgres|mongo|redis|rabbitmq' | sort || true)
    
    if [[ -z "$containers" ]]; then
        log_warning "No hay servicios corriendo"
        return 1
    fi
    
    echo "$containers" | while read -r container; do
        local status
        status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "N/A")
        
        if [[ "$status" == "running" ]]; then
            echo -e "  ${GREEN}●${NC} $container (status: $status, health: $health)"
        else
            echo -e "  ${RED}●${NC} $container (status: $status)"
        fi
    done
    
    return 0
}

# =============================================================================
# Ver logs con Docker Compose
# =============================================================================

view_logs_compose() {
    local compose_cmd=$1
    local compose_file=$2
    
    local log_args=""
    
    if [[ "$FOLLOW" == true ]]; then
        log_args="$log_args -f"
    fi
    
    if [[ "$TAIL" -gt 0 ]]; then
        log_args="$log_args --tail=$TAIL"
    fi
    
    if [[ -n "$SINCE" ]]; then
        log_args="$log_args --since=$SINCE"
    fi
    
    if [[ -n "$UNTIL" ]]; then
        log_args="$log_args --until=$UNTIL"
    fi
    
    if [[ "$TIMESTAMPS" == false ]]; then
        log_args="$log_args -t"
    fi
    
    local target_service=""
    if [[ "$SERVICE" != "all" ]]; then
        target_service="$SERVICE"
    fi
    
    if [[ "$EXPORT" == true ]]; then
        $compose_cmd -f "$compose_file" logs $log_args $target_service > "$EXPORT_FILE" 2>&1
        log_success "Logs exportados a: $EXPORT_FILE"
    else
        $compose_cmd -f "$compose_file" logs $log_args $target_service 2>&1 | {
            if [[ -n "$FILTER" ]]; then
                grep --color=always -E "$FILTER|$"
            else
                cat
            fi
        }
    fi
}

# =============================================================================
# Ver logs con Docker directamente
# =============================================================================

view_logs_docker() {
    local containers=()
    
    if [[ "$SERVICE" == "all" ]]; then
        # Obtener todos los contenedores relacionados
        while IFS= read -r container; do
            containers+=("$container")
        done < <(docker ps --format '{{.Names}}' | grep -E 'ecommerce|api|web|postgres|mongo|redis|rabbitmq' | sort || true)
    else
        # Buscar contenedor específico
        local container
        container=$(docker ps --format '{{.Names}}' | grep "$SERVICE" | head -n1)
        if [[ -n "$container" ]]; then
            containers+=("$container")
        fi
    fi
    
    if [[ ${#containers[@]} -eq 0 ]]; then
        log_error "No se encontraron contenedores para: $SERVICE"
        return 1
    fi
    
    for container in "${containers[@]}"; do
        log_info "Logs de: $container"
        
        local log_args=""
        
        if [[ "$FOLLOW" == true ]]; then
            log_args="$log_args -f"
        fi
        
        if [[ "$TAIL" -gt 0 ]]; then
            log_args="$log_args --tail=$TAIL"
        fi
        
        if [[ -n "$SINCE" ]]; then
            log_args="$log_args --since=$SINCE"
        fi
        
        if [[ -n "$UNTIL" ]]; then
            log_args="$log_args --until=$UNTIL"
        fi
        
        if [[ "$TIMESTAMPS" == false ]]; then
            log_args="$log_args -t"
        fi
        
        if [[ "$JSON" == true ]]; then
            log_args="$log_args --format json"
        fi
        
        if [[ "$EXPORT" == true ]]; then
            echo "=== $container ===" >> "$EXPORT_FILE"
            docker logs $log_args "$container" >> "$EXPORT_FILE" 2>&1
            echo "" >> "$EXPORT_FILE"
        else
            docker logs $log_args "$container" 2>&1 | {
                if [[ -n "$FILTER" ]]; then
                    grep --color=always -E "$FILTER|$"
                else
                    cat
                fi
            }
        fi
    done
    
    if [[ "$EXPORT" == true ]]; then
        log_success "Logs exportados a: $EXPORT_FILE"
    fi
}

# =============================================================================
# Exportar logs
# =============================================================================

export_logs() {
    local output_file=$1
    
    log_info "Exportando logs a: $output_file"
    
    mkdir -p "$(dirname "$output_file")"
    
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    
    {
        echo "# E-Commerce Platform Logs Export"
        echo "# Generated: $timestamp"
        echo "# Service: $SERVICE"
        echo ""
    } > "$output_file"
    
    # Obtener logs de todos los servicios
    local containers
    containers=$(docker ps -a --format '{{.Names}}' | grep -E 'ecommerce|api|web|postgres|mongo|redis|rabbitmq' | sort || true)
    
    for container in $containers; do
        {
            echo ""
            echo "========================================"
            echo "Container: $container"
            echo "Status: $(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo 'unknown')"
            echo "Started: $(docker inspect --format='{{.State.StartedAt}}' "$container" 2>/dev/null || echo 'unknown')"
            echo "========================================"
            echo ""
            docker logs --tail=1000 "$container" 2>&1 || echo "[No logs available]"
            echo ""
        } >> "$output_file"
    done
    
    log_success "Logs exportados exitosamente"
    log_info "Archivo: $output_file"
    log_info "Tamaño: $(du -h "$output_file" | cut -f1)"
}

# =============================================================================
# Limpiar logs antiguos
# =============================================================================

cleanup_old_logs() {
    local days=${1:-7}
    
    log_info "Limpiando logs antiguos (más de $days días)..."
    
    if [[ -d "$LOGS_DIR" ]]; then
        find "$LOGS_DIR" -name "*.log" -type f -mtime +$days -delete
        log_success "Logs antiguos eliminados"
    fi
    
    # Limpiar logs de Docker
    docker system prune -f --volumes 2>/dev/null || true
    
    log_success "Limpieza completada"
}

# =============================================================================
# Mostrar estadísticas de logs
# =============================================================================

show_log_stats() {
    log_info "Estadísticas de logs:"
    
    local containers
    containers=$(docker ps --format '{{.Names}}' | grep -E 'ecommerce|api|web|postgres|mongo|redis|rabbitmq' || true)
    
    if [[ -z "$containers" ]]; then
        log_warning "No hay contenedores corriendo"
        return 1
    fi
    
    echo
    printf "%-30s %15s %15s\n" "CONTAINER" "LOG SIZE" "LINES"
    echo "-------------------------------------------------------------------"
    
    for container in $containers; do
        local log_size
        log_size=$(docker inspect --format='{{.LogPath}}' "$container" 2>/dev/null | xargs ls -lh 2>/dev/null | awk '{print $5}' || echo "N/A")
        local log_lines
        log_lines=$(docker logs "$container" 2>&1 | wc -l || echo "0")
        
        printf "%-30s %15s %15s\n" "$container" "$log_size" "$log_lines"
    done
    
    echo
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    
    # Si es modo follow, mostrar banner
    if [[ "$FOLLOW" == false && "$EXPORT" == false ]]; then
        print_banner
    fi
    
    cd "$PROJECT_ROOT"
    
    # Verificar si hay servicios corriendo
    local compose_cmd
    compose_cmd=$(get_docker_compose_cmd)
    
    if [[ -n "$compose_cmd" && -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        # Usar Docker Compose
        local compose_file="$PROJECT_ROOT/docker-compose.yml"
        
        if [[ -f "$PROJECT_ROOT/docker-compose.override.yml" ]]; then
            compose_file="$compose_file -f $PROJECT_ROOT/docker-compose.override.yml"
        fi
        
        view_logs_compose "$compose_cmd" "$compose_file"
    else
        # Usar Docker directamente
        view_logs_docker
    fi
}

# Manejo de señales
trap 'echo; log_info "Deteniendo visualización de logs"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
