#!/bin/bash

# =============================================================================
# E-Commerce Platform - Stop Script
# =============================================================================
# Script para detener la plataforma e-commerce de forma graceful
# =============================================================================

set -euo pipefail

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuración
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Variables
REMOVE_VOLUMES=false
REMOVE_ORPHANS=false
TIMEOUT=30
SERVICES=""
FORCE=false

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
    echo -e "${YELLOW}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🛑 E-COMMERCE PLATFORM - STOP                       ║
    ║                                                               ║
    ║           Deteniendo servicios...                             ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES] [SERVICIOS]

Opciones:
    -v, --volumes        Eliminar volúmenes asociados
    -o, --orphans        Eliminar contenedores huérfanos
    -t, --timeout SEC    Timeout para graceful shutdown (default: 30)
    -f, --force          Forzar detención sin confirmación
    -h, --help           Mostrar esta ayuda

Servicios:
    Especifica uno o más servicios para detener (opcional)
    Si no se especifica, se detienen todos los servicios

Ejemplos:
    $0                      # Detener todos los servicios
    $0 -v                   # Detener y eliminar volúmenes
    $0 api-gateway web      # Detener solo api-gateway y web
    $0 -f -v                # Forzar detención y eliminar volúmenes

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--volumes)
                REMOVE_VOLUMES=true
                shift
                ;;
            -o|--orphans)
                REMOVE_ORPHANS=true
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
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
                SERVICES="$SERVICES $1"
                shift
                ;;
        esac
    done
}

# =============================================================================
# Confirmación de acciones destructivas
# =============================================================================

confirm_destructive() {
    if [[ "$FORCE" == true ]]; then
        return 0
    fi
    
    echo
    log_warning "⚠️  Esta acción eliminará datos persistentes:"
    
    if [[ "$REMOVE_VOLUMES" == true ]]; then
        echo -e "  ${RED}• Todos los volúmenes Docker serán eliminados${NC}"
        echo -e "  ${RED}• Los datos de base de datos se perderán${NC}"
    fi
    
    echo
    read -p "¿Estás seguro? Escribe 'yes' para continuar: " -r
    echo
    
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Operación cancelada"
        exit 0
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
        log_error "Docker Compose no encontrado"
        exit 1
    fi
}

# =============================================================================
# Detener servicios
# =============================================================================

stop_services() {
    local compose_cmd=$1
    local compose_file=$2
    
    log_info "Deteniendo servicios..."
    
    local stop_args="-t $TIMEOUT"
    
    if [[ -n "$SERVICES" ]]; then
        log_info "Deteniendo servicios específicos:$SERVICES"
        $compose_cmd -f "$compose_file" stop $stop_args $SERVICES
    else
        log_info "Deteniendo todos los servicios..."
        $compose_cmd -f "$compose_file" stop $stop_args
    fi
    
    log_success "Servicios detenidos"
}

# =============================================================================
# Eliminar contenedores
# =============================================================================

remove_containers() {
    local compose_cmd=$1
    local compose_file=$2
    
    log_info "Eliminando contenedores..."
    
    local down_args=""
    
    if [[ "$REMOVE_VOLUMES" == true ]]; then
        down_args="$down_args -v"
        log_warning "Se eliminarán los volúmenes"
    fi
    
    if [[ "$REMOVE_ORPHANS" == true ]]; then
        down_args="$down_args --remove-orphans"
        log_info "Se eliminarán contenedores huérfanos"
    fi
    
    if [[ -n "$SERVICES" ]]; then
        # Para servicios específicos, solo hacemos rm
        $compose_cmd -f "$compose_file" rm -f $SERVICES
    else
        $compose_cmd -f "$compose_file" down $down_args
    fi
    
    log_success "Contenedores eliminados"
}

# =============================================================================
# Mostrar resumen
# =============================================================================

show_summary() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  ✅ PLATAFORMA DETENIDA                        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    local running_containers
    running_containers=$(docker ps --filter "name=ecommerce" --format '{{.Names}}' | wc -l)
    
    if [[ $running_containers -eq 0 ]]; then
        log_success "Todos los contenedores de la plataforma han sido detenidos"
    else
        log_warning "Aún hay $running_containers contenedores relacionados corriendo"
        docker ps --filter "name=ecommerce" --format '  - {{.Names}} ({{.Status}})'
    fi
    
    echo
    log_info "Para iniciar nuevamente: ${CYAN}./start.sh${NC}"
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    print_banner
    
    cd "$PROJECT_ROOT"
    
    # Verificar si hay servicios corriendo
    local compose_cmd
    compose_cmd=$(get_docker_compose_cmd)
    
    local compose_file="$PROJECT_ROOT/docker-compose.yml"
    
    # Detectar si hay docker-compose.override.yml
    if [[ -f "$PROJECT_ROOT/docker-compose.override.yml" ]]; then
        compose_file="$compose_file -f $PROJECT_ROOT/docker-compose.override.yml"
    fi
    
    # Verificar si hay servicios activos
    local ps_output
    ps_output=$($compose_cmd -f "$compose_file" ps -q 2>/dev/null || true)
    
    if [[ -z "$ps_output" ]]; then
        log_warning "No hay servicios activos de la plataforma"
        exit 0
    fi
    
    # Confirmar acciones destructivas
    if [[ "$REMOVE_VOLUMES" == true ]]; then
        confirm_destructive
    fi
    
    # Detener servicios
    stop_services "$compose_cmd" "$compose_file"
    
    # Eliminar contenedores
    remove_containers "$compose_cmd" "$compose_file"
    
    # Mostrar resumen
    show_summary
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
