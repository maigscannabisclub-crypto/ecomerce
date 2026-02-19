#!/bin/bash

# =============================================================================
# E-Commerce Platform - Health Check Script
# =============================================================================
# Script para verificar el estado de salud de la plataforma
# Comprueba todos los servicios, bases de datos y componentes
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
readonly ENV_FILE="$PROJECT_ROOT/.env"

# Variables
VERBOSE=false
JSON=false
WATCH=false
INTERVAL=5
TIMEOUT=10
OUTPUT_FILE=""

# Arrays para tracking
declare -a HEALTHY_SERVICES=()
declare -a UNHEALTHY_SERVICES=()
declare -a CHECK_RESULTS=()

# =============================================================================
# Funciones de utilidad
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_detail() {
    echo -e "${GRAY}    $1${NC}"
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🏥 E-COMMERCE PLATFORM - HEALTH CHECK               ║
    ║                                                               ║
    ║           Verificando estado de la plataforma...              ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES]

Opciones:
    -v, --verbose        Modo verbose con información detallada
    -j, --json           Salida en formato JSON
    -w, --watch          Monitoreo continuo
    -i, --interval SEC   Intervalo para watch en segundos (default: 5)
    -t, --timeout SEC    Timeout para checks en segundos (default: 10)
    -o, --output FILE    Guardar resultado en archivo
    -h, --help           Mostrar esta ayuda

Ejemplos:
    $0                              # Health check básico
    $0 -v                           # Health check verbose
    $0 -j                           # Salida JSON
    $0 -w -i 10                     # Monitoreo cada 10 segundos
    $0 -o health-report.json        # Guardar reporte

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -j|--json)
                JSON=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -i|--interval)
                INTERVAL="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
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
                log_error "Argumento no reconocido: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# =============================================================================
# Cargar variables de entorno
# =============================================================================

load_env() {
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
}

# =============================================================================
# Funciones de check
# =============================================================================

check_container_running() {
    local container=$1
    local name=$2
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        return 0
    fi
    
    # Intentar buscar con prefijo
    if docker ps --format '{{.Names}}' | grep -q "$container"; then
        return 0
    fi
    
    return 1
}

check_container_health() {
    local container=$1
    
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
    
    if [[ "$health" == "healthy" ]]; then
        return 0
    elif [[ "$health" == "none" ]]; then
        # Si no tiene health check, verificar que esté corriendo
        local status
        status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
        if [[ "$status" == "running" ]]; then
            return 0
        fi
    fi
    
    return 1
}

check_http_endpoint() {
    local url=$1
    local expected_code=${2:-200}
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
    
    if [[ "$response" == "$expected_code" ]]; then
        return 0
    fi
    
    return 1
}

check_tcp_port() {
    local host=$1
    local port=$2
    
    if timeout "$TIMEOUT" bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        return 0
    fi
    
    return 1
}

# =============================================================================
# Check de servicios de aplicación
# =============================================================================

check_api_gateway() {
    local service="api-gateway"
    local port=${API_GATEWAY_PORT:-3000}
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_container_health "$service"; then
            if check_http_endpoint "http://localhost:$port/health"; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="unhealthy"
                details="Health endpoint no responde"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Container health check fallando"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
            [[ "$VERBOSE" == true ]] && log_detail "Port: $port, Status: Running"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

check_web() {
    local service="web"
    local port=${WEB_PORT:-8080}
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_container_health "$service"; then
            if check_http_endpoint "http://localhost:$port"; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="unhealthy"
                details="Web no responde"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Container health check fallando"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

# =============================================================================
# Check de bases de datos
# =============================================================================

check_postgres() {
    local service="postgres"
    local port=5432
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_tcp_port "localhost" "$port"; then
            # Verificar que acepte conexiones
            local pg_user=${POSTGRES_USER:-ecommerce_user}
            local pg_db=${POSTGRES_DB:-ecommerce}
            
            if docker exec "$service" pg_isready -U "$pg_user" -d "$pg_db" &>/dev/null; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="degraded"
                details="No acepta conexiones"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Puerto no accesible"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
            [[ "$VERBOSE" == true ]] && log_detail "Database: ${POSTGRES_DB:-ecommerce}, User: ${POSTGRES_USER:-ecommerce_user}"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

check_mongodb() {
    local service="mongodb"
    local port=27017
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_tcp_port "localhost" "$port"; then
            if docker exec "$service" mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="degraded"
                details="No responde a ping"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Puerto no accesible"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

check_redis() {
    local service="redis"
    local port=6379
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_tcp_port "localhost" "$port"; then
            local redis_response
            redis_response=$(docker exec "$service" redis-cli ping 2>/dev/null || echo "")
            if [[ "$redis_response" == "PONG" ]]; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="degraded"
                details="No responde PONG"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Puerto no accesible"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
            [[ "$VERBOSE" == true ]] && log_detail "Connected clients: $(docker exec redis redis-cli INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

# =============================================================================
# Check de RabbitMQ
# =============================================================================

check_rabbitmq() {
    local service="rabbitmq"
    local port=5672
    local mgmt_port=${RABBITMQ_MANAGEMENT_PORT:-15672}
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_tcp_port "localhost" "$port"; then
            local rmq_user=${RABBITMQ_USER:-ecommerce}
            local rmq_pass=${RABBITMQ_PASSWORD:-}
            
            if curl -s -u "$rmq_user:$rmq_pass" "http://localhost:$mgmt_port/api/overview" &>/dev/null; then
                result="healthy"
                HEALTHY_SERVICES+=("$service")
            else
                result="degraded"
                details="Management API no responde"
                UNHEALTHY_SERVICES+=("$service")
            fi
        else
            result="unhealthy"
            details="Puerto AMQP no accesible"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
            [[ "$VERBOSE" == true ]] && log_detail "Management: http://localhost:$mgmt_port"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

# =============================================================================
# Check de servicios adicionales
# =============================================================================

check_elasticsearch() {
    local service="elasticsearch"
    local port=9200
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_http_endpoint "http://localhost:$port/_cluster/health" 200; then
            result="healthy"
            HEALTHY_SERVICES+=("$service")
        else
            result="degraded"
            details="Cluster health no disponible"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

check_minio() {
    local service="minio"
    local port=9000
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_http_endpoint "http://localhost:$port/minio/health/live" 200; then
            result="healthy"
            HEALTHY_SERVICES+=("$service")
        else
            result="degraded"
            details="Health endpoint no responde"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

# =============================================================================
# Check de monitoreo
# =============================================================================

check_grafana() {
    local service="grafana"
    local port=${GRAFANA_PORT:-3001}
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_http_endpoint "http://localhost:$port/api/health" 200; then
            result="healthy"
            HEALTHY_SERVICES+=("$service")
        else
            result="degraded"
            details="Health endpoint no responde"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

check_prometheus() {
    local service="prometheus"
    local port=${PROMETHEUS_PORT:-9090}
    local result="unknown"
    local details=""
    
    if check_container_running "$service"; then
        if check_http_endpoint "http://localhost:$port/-/healthy" 200; then
            result="healthy"
            HEALTHY_SERVICES+=("$service")
        else
            result="degraded"
            details="Health endpoint no responde"
            UNHEALTHY_SERVICES+=("$service")
        fi
    else
        result="down"
        details="Container no está corriendo"
        UNHEALTHY_SERVICES+=("$service")
    fi
    
    CHECK_RESULTS+=("{\"service\":\"$service\",\"status\":\"$result\",\"details\":\"$details\",\"port\":$port}")
    
    if [[ "$JSON" == false ]]; then
        if [[ "$result" == "healthy" ]]; then
            log_success "$service"
        else
            log_error "$service"
            [[ -n "$details" ]] && log_detail "$details"
        fi
    fi
}

# =============================================================================
# Ejecutar todos los checks
# =============================================================================

run_all_checks() {
    HEALTHY_SERVICES=()
    UNHEALTHY_SERVICES=()
    CHECK_RESULTS=()
    
    if [[ "$JSON" == false ]]; then
        echo -e "${CYAN}Servicios de Aplicación:${NC}"
    fi
    check_api_gateway
    check_web
    
    if [[ "$JSON" == false ]]; then
        echo
        echo -e "${CYAN}Bases de Datos:${NC}"
    fi
    check_postgres
    check_mongodb
    check_redis
    
    if [[ "$JSON" == false ]]; then
        echo
        echo -e "${CYAN}Message Broker:${NC}"
    fi
    check_rabbitmq
    
    if [[ "$JSON" == false ]]; then
        echo
        echo -e "${CYAN}Servicios Adicionales:${NC}"
    fi
    check_elasticsearch
    check_minio
    
    if [[ "$JSON" == false ]]; then
        echo
        echo -e "${CYAN}Monitoreo:${NC}"
    fi
    check_grafana
    check_prometheus
}

# =============================================================================
# Mostrar resumen
# =============================================================================

show_summary() {
    if [[ "$JSON" == true ]]; then
        return 0
    fi
    
    echo
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo
    
    local total=$(( ${#HEALTHY_SERVICES[@]} + ${#UNHEALTHY_SERVICES[@]} ))
    local healthy=${#HEALTHY_SERVICES[@]}
    local unhealthy=${#UNHEALTHY_SERVICES[@]}
    
    echo -e "${CYAN}Resumen:${NC}"
    echo -e "  Total de servicios: $total"
    echo -e "  ${GREEN}✓ Saludables: $healthy${NC}"
    echo -e "  ${RED}✗ Problemas: $unhealthy${NC}"
    
    if [[ $unhealthy -gt 0 ]]; then
        echo
        log_warning "Servicios con problemas:"
        for service in "${UNHEALTHY_SERVICES[@]}"; do
            echo -e "  ${RED}• $service${NC}"
        done
    fi
    
    echo
    
    if [[ $unhealthy -eq 0 ]]; then
        echo -e "${GREEN}✅ Todos los servicios están saludables!${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Algunos servicios requieren atención${NC}"
        return 1
    fi
}

# =============================================================================
# Generar salida JSON
# =============================================================================

output_json() {
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    local services_json=""
    for result in "${CHECK_RESULTS[@]}"; do
        if [[ -n "$services_json" ]]; then
            services_json="$services_json,"
        fi
        services_json="$services_json$result"
    done
    
    local overall_status="healthy"
    if [[ ${#UNHEALTHY_SERVICES[@]} -gt 0 ]]; then
        overall_status="unhealthy"
    fi
    
    local json_output="{"
    json_output="$json_output\"timestamp\":\"$timestamp\","
    json_output="$json_output\"status\":\"$overall_status\","
    json_output="$json_output\"summary\":{"
    json_output="$json_output\"total\":$(( ${#HEALTHY_SERVICES[@]} + ${#UNHEALTHY_SERVICES[@]} )),"
    json_output="$json_output\"healthy\":${#HEALTHY_SERVICES[@]},"
    json_output="$json_output\"unhealthy\":${#UNHEALTHY_SERVICES[@]}"
    json_output="$json_output},"
    json_output="$json_output\"services\":[$services_json]"
    json_output="$json_output}"
    
    echo "$json_output"
    
    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$json_output" > "$OUTPUT_FILE"
    fi
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    load_env
    
    if [[ "$WATCH" == true ]]; then
        while true; do
            clear
            print_banner
            run_all_checks
            show_summary
            echo
            log_info "Actualizando en $INTERVAL segundos... (Ctrl+C para salir)"
            sleep "$INTERVAL"
        done
    else
        if [[ "$JSON" == false ]]; then
            print_banner
        fi
        
        run_all_checks
        
        if [[ "$JSON" == true ]]; then
            output_json
        else
            show_summary
        fi
    fi
}

# Manejo de señales
trap 'echo; log_info "Health check detenido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
