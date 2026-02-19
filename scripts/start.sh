#!/bin/bash

# =============================================================================
# E-Commerce Platform - Start Script
# =============================================================================
# Script para iniciar la plataforma e-commerce
# Soporta modo desarrollo y producción
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

# Variables por defecto
MODE="development"
BUILD=false
DETACH=false
SERVICES=""
VERBOSE=false

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

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${CYAN}[VERBOSE]${NC} $1"
    fi
}

print_banner() {
    echo -e "${GREEN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🚀 E-COMMERCE PLATFORM - START                      ║
    ║                                                               ║
    ║           Iniciando servicios...                              ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES] [SERVICIOS]

Opciones:
    -m, --mode MODE      Modo de ejecución: development|production (default: development)
    -b, --build          Reconstruir imágenes antes de iniciar
    -d, --detach         Ejecutar en background (modo detached)
    -v, --verbose        Modo verbose con más información
    -h, --help           Mostrar esta ayuda

Servicios:
    Especifica uno o más servicios para iniciar (opcional)
    Ejemplos: api-gateway, web, postgres, redis, etc.

Ejemplos:
    $0                              # Iniciar en modo desarrollo
    $0 -m production                # Iniciar en modo producción
    $0 -m development -b            # Reconstruir e iniciar en desarrollo
    $0 -d api-gateway web           # Iniciar solo api-gateway y web en background
    $0 -m production -b -d          # Producción con rebuild, detached

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -b|--build)
                BUILD=true
                shift
                ;;
            -d|--detach)
                DETACH=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
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
    
    # Validar modo
    if [[ "$MODE" != "development" && "$MODE" != "production" ]]; then
        log_error "Modo inválido: $MODE. Use 'development' o 'production'"
        exit 1
    fi
    
    # En producción, siempre detached
    if [[ "$MODE" == "production" ]]; then
        DETACH=true
    fi
}

# =============================================================================
# Verificar entorno
# =============================================================================

check_environment() {
    log_info "Verificando entorno..."
    
    # Verificar archivo .env
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warning "Archivo .env no encontrado"
        log_info "Ejecuta './setup.sh' primero para generar la configuración"
        exit 1
    fi
    
    # Cargar variables de entorno
    set -a
    source "$ENV_FILE"
    set +a
    
    # Verificar docker-compose.yml
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        log_error "docker-compose.yml no encontrado en $PROJECT_ROOT"
        exit 1
    fi
    
    # Verificar Docker
    if ! docker info &>/dev/null; then
        log_error "Docker no está corriendo. Por favor inicia Docker primero."
        exit 1
    fi
    
    log_success "Entorno verificado"
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
# Construir servicios
# =============================================================================

build_services() {
    local compose_cmd=$1
    local compose_file=$2
    
    log_info "Construyendo imágenes Docker..."
    
    if [[ "$MODE" == "production" ]]; then
        log_info "Usando optimizaciones de producción..."
        export DOCKER_BUILDKIT=1
        export COMPOSE_DOCKER_CLI_BUILD=1
        $compose_cmd -f "$compose_file" build --parallel --compress
    else
        $compose_cmd -f "$compose_file" build
    fi
    
    log_success "Imágenes construidas correctamente"
}

# =============================================================================
# Iniciar servicios
# =============================================================================

start_services() {
    local compose_cmd=$1
    local compose_file=$2
    
    log_info "Iniciando servicios en modo: ${CYAN}$MODE${NC}"
    
    local up_args=""
    
    if [[ "$DETACH" == true ]]; then
        up_args="$up_args -d"
    fi
    
    if [[ "$MODE" == "development" ]]; then
        # En desarrollo, no recrear contenedores si existen
        up_args="$up_args --remove-orphans"
    else
        # En producción, siempre recrear
        up_args="$up_args --force-recreate --remove-orphans"
    fi
    
    # Iniciar servicios
    if [[ -n "$SERVICES" ]]; then
        log_info "Iniciando servicios específicos:$SERVICES"
        $compose_cmd -f "$compose_file" up $up_args $SERVICES
    else
        log_info "Iniciando todos los servicios..."
        $compose_cmd -f "$compose_file" up $up_args
    fi
    
    log_success "Servicios iniciados"
}

# =============================================================================
# Health checks
# =============================================================================

run_health_checks() {
    log_info "Ejecutando health checks..."
    
    local services=(
        "api-gateway:$API_GATEWAY_PORT"
        "web:$WEB_PORT"
        "postgres:5432"
        "mongodb:27017"
        "redis:6379"
        "rabbitmq:5672"
    )
    
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local name=${service%%:*}
        local port=${service##*:}
        
        log_verbose "Verificando $name en puerto $port..."
        
        # Verificar si el contenedor está corriendo
        if ! docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
            # Intentar con prefijo de directorio
            local container_name
            container_name=$(docker ps --format '{{.Names}}' | grep "$name" | head -n1)
            if [[ -z "$container_name" ]]; then
                log_warning "$name no está corriendo"
                all_healthy=false
                continue
            fi
        fi
        
        log_success "$name está corriendo"
    done
    
    if [[ "$all_healthy" == true ]]; then
        log_success "Todos los servicios están saludables"
    else
        log_warning "Algunos servicios no están disponibles"
    fi
}

# =============================================================================
# Mostrar información de acceso
# =============================================================================

show_access_info() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  🌐 ACCESO A LA PLATAFORMA                    ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Cargar puertos del .env
    local web_port=${WEB_PORT:-8080}
    local api_port=${API_GATEWAY_PORT:-3000}
    local grafana_port=${GRAFANA_PORT:-3001}
    local rabbitmq_mgmt_port=${RABBITMQ_MANAGEMENT_PORT:-15672}
    local prometheus_port=${PROMETHEUS_PORT:-9090}
    local jaeger_port=${JAEGER_PORT:-16686}
    local minio_console_port=${MINIO_CONSOLE_PORT:-9001}
    
    echo -e "${CYAN}Aplicación Principal:${NC}"
    echo -e "  🌐 Web App:        ${GREEN}http://localhost:$web_port${NC}"
    echo -e "  🔌 API Gateway:    ${GREEN}http://localhost:$api_port${NC}"
    echo -e "  📚 API Docs:       ${GREEN}http://localhost:$api_port/api/docs${NC}"
    echo
    
    echo -e "${CYAN}Monitoreo y Observabilidad:${NC}"
    echo -e "  📊 Grafana:        ${GREEN}http://localhost:$grafana_port${NC}"
    echo -e "  📈 Prometheus:     ${GREEN}http://localhost:$prometheus_port${NC}"
    echo -e "  🔍 Jaeger:         ${GREEN}http://localhost:$jaeger_port${NC}"
    echo
    
    echo -e "${CYAN}Servicios de Infraestructura:${NC}"
    echo -e "  🐰 RabbitMQ Mgmt:  ${GREEN}http://localhost:$rabbitmq_mgmt_port${NC}"
    echo -e "  💾 MinIO Console:  ${GREEN}http://localhost:$minio_console_port${NC}"
    echo
    
    if [[ "$MODE" == "development" ]]; then
        echo -e "${YELLOW}Modo Desarrollo:${NC}"
        echo -e "  - Hot reload habilitado"
        echo -e "  - Logs en tiempo real"
        echo -e "  - Para detener: ${CYAN}Ctrl+C${NC} o ejecuta ${CYAN}./stop.sh${NC}"
    else
        echo -e "${YELLOW}Modo Producción:${NC}"
        echo -e "  - Servicios ejecutándose en background"
        echo -e "  - Para ver logs: ${CYAN}./logs.sh${NC}"
        echo -e "  - Para detener: ${CYAN}./stop.sh${NC}"
    fi
    echo
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    print_banner
    
    cd "$PROJECT_ROOT"
    
    check_environment
    
    local compose_cmd
    compose_cmd=$(get_docker_compose_cmd)
    
    local compose_file="$PROJECT_ROOT/docker-compose.yml"
    
    # Si hay docker-compose.override.yml en desarrollo, usarlo
    if [[ "$MODE" == "development" && -f "$PROJECT_ROOT/docker-compose.override.yml" ]]; then
        compose_file="$compose_file -f $PROJECT_ROOT/docker-compose.override.yml"
        log_info "Usando configuración de desarrollo con override"
    fi
    
    # Si hay docker-compose.prod.yml en producción, usarlo
    if [[ "$MODE" == "production" && -f "$PROJECT_ROOT/docker-compose.prod.yml" ]]; then
        compose_file="$compose_file -f $PROJECT_ROOT/docker-compose.prod.yml"
        log_info "Usando configuración de producción"
    fi
    
    # Construir si es necesario
    if [[ "$BUILD" == true ]]; then
        build_services "$compose_cmd" "$compose_file"
    fi
    
    # Iniciar servicios
    start_services "$compose_cmd" "$compose_file"
    
    # Esperar un momento para que los servicios se inicien
    if [[ "$DETACH" == true ]]; then
        log_info "Esperando a que los servicios estén listos..."
        sleep 5
        run_health_checks
    fi
    
    # Mostrar información de acceso
    show_access_info
    
    # Si no es detached, mostrar logs
    if [[ "$DETACH" == false ]]; then
        log_info "Mostrando logs (Ctrl+C para detener)..."
        $compose_cmd -f "$compose_file" logs -f
    fi
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
