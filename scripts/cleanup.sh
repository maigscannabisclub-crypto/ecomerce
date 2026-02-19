#!/bin/bash

# =============================================================================
# E-Commerce Platform - Cleanup Script
# =============================================================================
# Script para limpiar recursos Docker y archivos temporales
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
readonly ENV_FILE="$PROJECT_ROOT/.env"

# Variables
REMOVE_CONTAINERS=true
REMOVE_VOLUMES=false
REMOVE_IMAGES=false
REMOVE_NETWORKS=false
REMOVE_LOGS=false
CLEAN_TEMP=false
FORCE=false
ALL=false
DRY_RUN=false

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

log_cleanup() {
    echo -e "${CYAN}[CLEANUP]${NC} $1"
}

print_banner() {
    echo -e "${YELLOW}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🧹 E-COMMERCE PLATFORM - CLEANUP                    ║
    ║                                                               ║
    ║           Limpieza de recursos...                             ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES]

Opciones:
    -c, --containers     Eliminar contenedores (default: true)
    -v, --volumes        Eliminar volúmenes
    -i, --images         Eliminar imágenes
    -n, --networks       Eliminar redes
    -l, --logs           Limpiar archivos de logs
    -t, --temp           Limpiar archivos temporales
    -a, --all            Limpiar todo (equivalente a -c -v -i -n -l -t)
    -f, --force          Forzar sin confirmación
    --dry-run            Simular limpieza sin eliminar
    -h, --help           Mostrar esta ayuda

Ejemplos:
    $0                              # Eliminar solo contenedores
    $0 -c -v                        # Eliminar contenedores y volúmenes
    $0 -a                           # Limpiar todo
    $0 -a -f                        # Limpiar todo sin confirmar
    $0 --dry-run -a                 # Simular limpieza completa

⚠️  ADVERTENCIA: Esta acción puede eliminar datos permanentemente.

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--containers)
                REMOVE_CONTAINERS=true
                shift
                ;;
            -v|--volumes)
                REMOVE_VOLUMES=true
                shift
                ;;
            -i|--images)
                REMOVE_IMAGES=true
                shift
                ;;
            -n|--networks)
                REMOVE_NETWORKS=true
                shift
                ;;
            -l|--logs)
                REMOVE_LOGS=true
                shift
                ;;
            -t|--temp)
                CLEAN_TEMP=true
                shift
                ;;
            -a|--all)
                ALL=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
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
                log_error "Argumento no reconocido: $1"
                print_usage
                exit 1
                ;;
        esac
    done
    
    # Si --all está activo, activar todas las opciones
    if [[ "$ALL" == true ]]; then
        REMOVE_CONTAINERS=true
        REMOVE_VOLUMES=true
        REMOVE_IMAGES=true
        REMOVE_NETWORKS=true
        REMOVE_LOGS=true
        CLEAN_TEMP=true
    fi
}

# =============================================================================
# Confirmación de acciones destructivas
# =============================================================================

confirm_destructive() {
    if [[ "$FORCE" == true ]]; then
        return 0
    fi
    
    echo
    log_warning "⚠️  Esta acción eliminará los siguientes recursos:"
    
    [[ "$REMOVE_CONTAINERS" == true ]] && echo -e "  ${RED}• Contenedores Docker${NC}"
    [[ "$REMOVE_VOLUMES" == true ]] && echo -e "  ${RED}• Volúmenes Docker (DATOS PERSISTENTES)${NC}"
    [[ "$REMOVE_IMAGES" == true ]] && echo -e "  ${RED}• Imágenes Docker${NC}"
    [[ "$REMOVE_NETWORKS" == true ]] && echo -e "  ${RED}• Redes Docker${NC}"
    [[ "$REMOVE_LOGS" == true ]] && echo -e "  ${RED}• Archivos de logs${NC}"
    [[ "$CLEAN_TEMP" == true ]] && echo -e "  ${RED}• Archivos temporales${NC}"
    
    if [[ "$DRY_RUN" == true ]]; then
        echo
        log_info "Modo DRY-RUN: No se eliminará nada realmente"
        return 0
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
# Detener contenedores
# =============================================================================

stop_containers() {
    log_cleanup "Deteniendo contenedores..."
    
    # Obtener contenedores relacionados con el proyecto
    local containers
    containers=$(docker ps -q --filter "name=ecommerce" 2>/dev/null || true)
    containers="$containers $(docker ps -q --filter "name=api-gateway" 2>/dev/null || true)"
    containers="$containers $(docker ps -q --filter "name=postgres" 2>/dev/null || true)"
    containers="$containers $(docker ps -q --filter "name=mongodb" 2>/dev/null || true)"
    containers="$containers $(docker ps -q --filter "name=redis" 2>/dev/null || true)"
    containers="$containers $(docker ps -q --filter "name=rabbitmq" 2>/dev/null || true)"
    
    containers=$(echo "$containers" | tr ' ' '\n' | sort -u | tr '\n' ' ')
    
    if [[ -n "$containers" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se detendrían los contenedores:"
            docker ps --filter "name=ecommerce" --format '  - {{.Names}}' 2>/dev/null || true
        else
            log_info "Deteniendo contenedores..."
            echo "$containers" | xargs -r docker stop -t 30 2>/dev/null || true
            log_success "Contenedores detenidos"
        fi
    else
        log_info "No hay contenedores corriendo"
    fi
}

# =============================================================================
# Eliminar contenedores
# =============================================================================

remove_containers() {
    if [[ "$REMOVE_CONTAINERS" == false ]]; then
        return 0
    fi
    
    log_cleanup "Eliminando contenedores..."
    
    # Obtener contenedores detenidos relacionados
    local containers
    containers=$(docker ps -aq --filter "name=ecommerce" 2>/dev/null || true)
    containers="$containers $(docker ps -aq --filter "name=api-gateway" 2>/dev/null || true)"
    containers="$containers $(docker ps -aq --filter "name=postgres" 2>/dev/null || true)"
    containers="$containers $(docker ps -aq --filter "name=mongodb" 2>/dev/null || true)"
    containers="$containers $(docker ps -aq --filter "name=redis" 2>/dev/null || true)"
    containers="$containers $(docker ps -aq --filter "name=rabbitmq" 2>/dev/null || true)"
    
    containers=$(echo "$containers" | tr ' ' '\n' | sort -u | tr '\n' ' ')
    
    if [[ -n "$containers" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se eliminarían los contenedores:"
            echo "$containers" | xargs -r docker inspect --format '  - {{.Name}}' 2>/dev/null || true
        else
            local count
            count=$(echo "$containers" | wc -w)
            echo "$containers" | xargs -r docker rm -f 2>/dev/null || true
            log_success "Contenedores eliminados: $count"
        fi
    else
        log_info "No hay contenedores para eliminar"
    fi
}

# =============================================================================
# Eliminar volúmenes
# =============================================================================

remove_volumes() {
    if [[ "$REMOVE_VOLUMES" == false ]]; then
        return 0
    fi
    
    log_cleanup "Eliminando volúmenes..."
    
    # Obtener volúmenes relacionados
    local volumes
    volumes=$(docker volume ls -q --filter "name=ecommerce" 2>/dev/null || true)
    volumes="$volumes $(docker volume ls -q --filter "name=postgres" 2>/dev/null || true)"
    volumes="$volumes $(docker volume ls -q --filter "name=mongodb" 2>/dev/null || true)"
    volumes="$volumes $(docker volume ls -q --filter "name=redis" 2>/dev/null || true)"
    volumes="$volumes $(docker volume ls -q --filter "name=rabbitmq" 2>/dev/null || true)"
    
    volumes=$(echo "$volumes" | tr ' ' '\n' | sort -u | tr '\n' ' ')
    
    if [[ -n "$volumes" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se eliminarían los volúmenes:"
            echo "$volumes" | xargs -r docker volume inspect --format '  - {{.Name}} ({{.Driver}})' 2>/dev/null || true
        else
            local count
            count=$(echo "$volumes" | wc -w)
            echo "$volumes" | xargs -r docker volume rm -f 2>/dev/null || true
            log_success "Volúmenes eliminados: $count"
        fi
    else
        log_info "No hay volúmenes para eliminar"
    fi
}

# =============================================================================
# Eliminar imágenes
# =============================================================================

remove_images() {
    if [[ "$REMOVE_IMAGES" == false ]]; then
        return 0
    fi
    
    log_cleanup "Eliminando imágenes..."
    
    # Obtener imágenes relacionadas
    local images
    images=$(docker images -q --filter "reference=*ecommerce*" 2>/dev/null || true)
    images="$images $(docker images -q --filter "reference=*api-gateway*" 2>/dev/null || true)"
    images="$images $(docker images -q --filter "dangling=true" 2>/dev/null || true)"
    
    images=$(echo "$images" | tr ' ' '\n' | sort -u | tr '\n' ' ')
    
    if [[ -n "$images" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se eliminarían las imágenes:"
            docker images --filter "reference=*ecommerce*" --format '  - {{.Repository}}:{{.Tag}} ({{.Size}})' 2>/dev/null || true
        else
            local count
            count=$(echo "$images" | wc -w)
            echo "$images" | xargs -r docker rmi -f 2>/dev/null || true
            log_success "Imágenes eliminadas: $count"
        fi
    else
        log_info "No hay imágenes para eliminar"
    fi
}

# =============================================================================
# Eliminar redes
# =============================================================================

remove_networks() {
    if [[ "$REMOVE_NETWORKS" == false ]]; then
        return 0
    fi
    
    log_cleanup "Eliminando redes..."
    
    # Obtener redes relacionadas (excluyendo redes por defecto)
    local networks
    networks=$(docker network ls -q --filter "name=ecommerce" 2>/dev/null || true)
    
    if [[ -n "$networks" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se eliminarían las redes:"
            docker network ls --filter "name=ecommerce" --format '  - {{.Name}} ({{.Driver}})' 2>/dev/null || true
        else
            local count
            count=$(echo "$networks" | wc -w)
            echo "$networks" | xargs -r docker network rm 2>/dev/null || true
            log_success "Redes eliminadas: $count"
        fi
    else
        log_info "No hay redes para eliminar"
    fi
}

# =============================================================================
# Limpiar logs
# =============================================================================

clean_logs() {
    if [[ "$REMOVE_LOGS" == false ]]; then
        return 0
    fi
    
    log_cleanup "Limpiando archivos de logs..."
    
    local logs_dir="$PROJECT_ROOT/logs"
    
    if [[ -d "$logs_dir" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Se eliminarían los logs en: $logs_dir"
            find "$logs_dir" -type f -name "*.log" 2>/dev/null | head -10 | while read -r file; do
                echo "  - $(basename "$file")"
            done
        else
            local count
            count=$(find "$logs_dir" -type f -name "*.log" 2>/dev/null | wc -l)
            find "$logs_dir" -type f -name "*.log" -delete 2>/dev/null || true
            log_success "Archivos de logs eliminados: $count"
        fi
    else
        log_info "No hay directorio de logs"
    fi
    
    # Limpiar logs de Docker
    if [[ "$DRY_RUN" == false ]]; then
        docker system prune -f --volumes 2>/dev/null || true
        log_success "Logs de Docker limpiados"
    fi
}

# =============================================================================
# Limpiar archivos temporales
# =============================================================================

clean_temp_files() {
    if [[ "$CLEAN_TEMP" == false ]]; then
        return 0
    fi
    
    log_cleanup "Limpiando archivos temporales..."
    
    local temp_dirs=(
        "$PROJECT_ROOT/tmp"
        "$PROJECT_ROOT/.cache"
        "$PROJECT_ROOT/node_modules/.cache"
    )
    
    for dir in "${temp_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            if [[ "$DRY_RUN" == true ]]; then
                log_info "[DRY-RUN] Se eliminaría: $dir"
            else
                rm -rf "${dir:?}"/*
                log_info "Limpiado: $dir"
            fi
        fi
    done
    
    # Limpiar archivos de coverage y test results
    if [[ "$DRY_RUN" == false ]]; then
        rm -rf "$PROJECT_ROOT/coverage"/* 2>/dev/null || true
        rm -rf "$PROJECT_ROOT/test-results"/* 2>/dev/null || true
        log_success "Archivos temporales limpiados"
    fi
}

# =============================================================================
# Mostrar resumen
# =============================================================================

show_summary() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  🧹 LIMPIEZA COMPLETADA                        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "Modo DRY-RUN: No se eliminó ningún recurso"
        log_info "Ejecuta sin --dry-run para aplicar los cambios"
    else
        log_success "Recursos liberados correctamente"
    fi
    
    echo
    log_info "Estado actual de Docker:"
    echo -e "  Contenedores: $(docker ps -q 2>/dev/null | wc -l) corriendo, $(docker ps -aq 2>/dev/null | wc -l) total"
    echo -e "  Imágenes: $(docker images -q 2>/dev/null | wc -l)"
    echo -e "  Volúmenes: $(docker volume ls -q 2>/dev/null | wc -l)"
    echo -e "  Redes: $(docker network ls -q 2>/dev/null | wc -l)"
    echo
    log_info "Espacio en disco liberado:"
    docker system df 2>/dev/null || true
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    print_banner
    
    cd "$PROJECT_ROOT"
    
    confirm_destructive
    
    # Detener contenedores primero
    stop_containers
    
    # Ejecutar limpieza
    remove_containers
    remove_volumes
    remove_images
    remove_networks
    clean_logs
    clean_temp_files
    
    # Mostrar resumen
    show_summary
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
