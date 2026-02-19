#!/bin/bash

# =============================================================================
# E-Commerce Platform - Test Script
# =============================================================================
# Script para ejecutar tests unitarios, de integración y e2e
# Genera reportes de cobertura
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
readonly TEST_RESULTS_DIR="$PROJECT_ROOT/test-results"
readonly COVERAGE_DIR="$PROJECT_ROOT/coverage"

# Variables
TEST_TYPE="all"
SERVICE=""
VERBOSE=false
WATCH=false
COVERAGE=true
PARALLEL=false

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

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🧪 E-COMMERCE PLATFORM - TEST                       ║
    ║                                                               ║
    ║           Ejecutando suite de pruebas...                      ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [OPCIONES]

Opciones:
    -t, --type TYPE      Tipo de test: unit|integration|e2e|all (default: all)
    -s, --service NAME   Ejecutar tests solo para un servicio específico
    -v, --verbose        Modo verbose
    -w, --watch          Modo watch (re-ejecutar al cambiar archivos)
    --no-coverage        No generar reporte de cobertura
    -p, --parallel       Ejecutar tests en paralelo
    -h, --help           Mostrar esta ayuda

Tipos de tests:
    unit         Tests unitarios de cada servicio
    integration  Tests de integración entre servicios
    e2e          Tests end-to-end de la aplicación completa
    all          Todos los tipos de tests (default)

Servicios disponibles:
    api-gateway, auth-service, product-service, order-service
    payment-service, inventory-service, notification-service, web

Ejemplos:
    $0                              # Ejecutar todos los tests
    $0 -t unit                      # Solo tests unitarios
    $0 -t integration -s api-gateway # Tests de integración del api-gateway
    $0 -t e2e -v                    # Tests e2e con verbose
    $0 -t unit -w                   # Tests unitarios en modo watch

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--type)
                TEST_TYPE="$2"
                shift 2
                ;;
            -s|--service)
                SERVICE="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            --no-coverage)
                COVERAGE=false
                shift
                ;;
            -p|--parallel)
                PARALLEL=true
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
    
    # Validar tipo de test
    case $TEST_TYPE in
        unit|integration|e2e|all)
            ;;
        *)
            log_error "Tipo de test inválido: $TEST_TYPE"
            print_usage
            exit 1
            ;;
    esac
}

# =============================================================================
# Preparar directorios
# =============================================================================

prepare_directories() {
    log_info "Preparando directorios de resultados..."
    
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "$COVERAGE_DIR"
    
    # Limpiar resultados anteriores
    rm -rf "$TEST_RESULTS_DIR"/*
    
    if [[ "$COVERAGE" == true ]]; then
        rm -rf "$COVERAGE_DIR"/*
    fi
    
    log_success "Directorios preparados"
}

# =============================================================================
# Verificar entorno
# =============================================================================

check_environment() {
    log_info "Verificando entorno de pruebas..."
    
    # Verificar Docker
    if ! docker info &>/dev/null; then
        log_error "Docker no está corriendo"
        exit 1
    fi
    
    # Verificar que los servicios estén disponibles
    local services_dir="$PROJECT_ROOT/services"
    if [[ ! -d "$services_dir" ]]; then
        log_warning "Directorio de servicios no encontrado: $services_dir"
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
# Tests Unitarios
# =============================================================================

run_unit_tests() {
    log_test "Ejecutando tests unitarios..."
    
    local services=("api-gateway" "auth-service" "product-service" "order-service" "payment-service" "inventory-service" "notification-service")
    local exit_code=0
    
    # Si se especificó un servicio, solo testear ese
    if [[ -n "$SERVICE" ]]; then
        services=("$SERVICE")
    fi
    
    for service in "${services[@]}"; do
        local service_dir="$PROJECT_ROOT/services/$service"
        
        if [[ ! -d "$service_dir" ]]; then
            log_warning "Servicio no encontrado: $service"
            continue
        fi
        
        log_info "Testing: $service"
        
        # Verificar si tiene tests
        if [[ ! -d "$service_dir/tests" && ! -d "$service_dir/__tests__" && ! -f "$service_dir/jest.config.js" && ! -f "$service_dir/package.json" ]]; then
            log_warning "No se encontraron tests para $service"
            continue
        fi
        
        # Ejecutar tests en contenedor
        local test_cmd="npm test"
        
        if [[ "$VERBOSE" == true ]]; then
            test_cmd="$test_cmd --verbose"
        fi
        
        if [[ "$WATCH" == true ]]; then
            test_cmd="$test_cmd --watch"
        fi
        
        if [[ "$COVERAGE" == true ]]; then
            test_cmd="$test_cmd --coverage"
        fi
        
        # Ejecutar tests en el contenedor del servicio
        if docker ps --format '{{.Names}}' | grep -q "$service"; then
            if ! docker exec "$service" sh -c "$test_cmd" 2>&1 | tee "$TEST_RESULTS_DIR/${service}-unit.log"; then
                log_error "Tests unitarios fallaron para: $service"
                exit_code=1
            else
                log_success "Tests unitarios pasaron: $service"
            fi
        else
            log_warning "Contenedor no corriendo para: $service"
            log_info "Intentando ejecutar tests localmente..."
            
            cd "$service_dir"
            if [[ -f "package.json" ]]; then
                if ! npm test 2>&1 | tee "$TEST_RESULTS_DIR/${service}-unit.log"; then
                    log_error "Tests unitarios fallaron para: $service"
                    exit_code=1
                else
                    log_success "Tests unitarios pasaron: $service"
                fi
            fi
        fi
    done
    
    return $exit_code
}

# =============================================================================
# Tests de Integración
# =============================================================================

run_integration_tests() {
    log_test "Ejecutando tests de integración..."
    
    local compose_cmd
    compose_cmd=$(get_docker_compose_cmd)
    
    # Iniciar servicios de test si no están corriendo
    log_info "Iniciando servicios de integración..."
    
    local compose_file="$PROJECT_ROOT/docker-compose.test.yml"
    
    if [[ ! -f "$compose_file" ]]; then
        log_warning "docker-compose.test.yml no encontrado, usando docker-compose.yml"
        compose_file="$PROJECT_ROOT/docker-compose.yml"
    fi
    
    # Iniciar servicios
    $compose_cmd -f "$compose_file" -p ecommerce-test up -d 2>/dev/null || true
    
    # Esperar a que los servicios estén listos
    log_info "Esperando a que los servicios estén listos..."
    sleep 10
    
    # Ejecutar tests de integración
    local exit_code=0
    
    if [[ -d "$PROJECT_ROOT/tests/integration" ]]; then
        cd "$PROJECT_ROOT/tests/integration"
        
        if [[ -f "package.json" ]]; then
            log_info "Ejecutando tests de integración..."
            
            local test_cmd="npm test"
            
            if [[ "$VERBOSE" == true ]]; then
                test_cmd="$test_cmd --verbose"
            fi
            
            if [[ "$COVERAGE" == true ]]; then
                test_cmd="$test_cmd --coverage"
            fi
            
            if ! $test_cmd 2>&1 | tee "$TEST_RESULTS_DIR/integration.log"; then
                log_error "Tests de integración fallaron"
                exit_code=1
            else
                log_success "Tests de integración pasaron"
            fi
        fi
    else
        log_warning "No se encontraron tests de integración"
    fi
    
    # Detener servicios de test
    log_info "Deteniendo servicios de integración..."
    $compose_cmd -f "$compose_file" -p ecommerce-test down 2>/dev/null || true
    
    return $exit_code
}

# =============================================================================
# Tests E2E
# =============================================================================

run_e2e_tests() {
    log_test "Ejecutando tests end-to-end..."
    
    local compose_cmd
    compose_cmd=$(get_docker_compose_cmd)
    
    # Verificar si la plataforma está corriendo
    local platform_running=false
    if docker ps --format '{{.Names}}' | grep -q "api-gateway"; then
        platform_running=true
    fi
    
    # Iniciar plataforma si no está corriendo
    if [[ "$platform_running" == false ]]; then
        log_info "Iniciando plataforma para tests e2e..."
        bash "$SCRIPT_DIR/start.sh" -d
        sleep 15
    fi
    
    # Ejecutar tests e2e
    local exit_code=0
    
    if [[ -d "$PROJECT_ROOT/tests/e2e" ]]; then
        cd "$PROJECT_ROOT/tests/e2e"
        
        if [[ -f "package.json" ]]; then
            log_info "Ejecutando tests e2e..."
            
            local test_cmd="npm test"
            
            if [[ "$VERBOSE" == true ]]; then
                test_cmd="$test_cmd --verbose"
            fi
            
            if [[ "$WATCH" == true ]]; then
                test_cmd="$test_cmd --watch"
            fi
            
            if ! $test_cmd 2>&1 | tee "$TEST_RESULTS_DIR/e2e.log"; then
                log_error "Tests e2e fallaron"
                exit_code=1
            else
                log_success "Tests e2e pasaron"
            fi
        elif [[ -f "cypress.config.js" || -f "cypress.json" ]]; then
            log_info "Ejecutando tests con Cypress..."
            
            if [[ "$WATCH" == true ]]; then
                npx cypress open 2>&1 | tee "$TEST_RESULTS_DIR/e2e.log" || exit_code=1
            else
                npx cypress run 2>&1 | tee "$TEST_RESULTS_DIR/e2e.log" || exit_code=1
            fi
        elif [[ -f "playwright.config.js" ]]; then
            log_info "Ejecutando tests con Playwright..."
            npx playwright test 2>&1 | tee "$TEST_RESULTS_DIR/e2e.log" || exit_code=1
        fi
    else
        log_warning "No se encontraron tests e2e"
    fi
    
    return $exit_code
}

# =============================================================================
# Generar reporte de cobertura
# =============================================================================

generate_coverage_report() {
    if [[ "$COVERAGE" == false ]]; then
        return 0
    fi
    
    log_info "Generando reporte de cobertura..."
    
    # Consolidar reportes de cobertura
    if command -v nyc &>/dev/null; then
        nyc merge "$COVERAGE_DIR" "$COVERAGE_DIR/coverage-final.json" 2>/dev/null || true
    fi
    
    # Generar reporte HTML
    local coverage_report="$COVERAGE_DIR/index.html"
    
    if [[ -f "$coverage_report" ]]; then
        log_success "Reporte de cobertura generado: $coverage_report"
    fi
    
    # Mostrar resumen
    echo
    echo -e "${CYAN}Resumen de Cobertura:${NC}"
    
    for coverage_file in "$COVERAGE_DIR"/*/coverage-summary.json; do
        if [[ -f "$coverage_file" ]]; then
            local service_name
            service_name=$(basename "$(dirname "$coverage_file")")
            echo -e "  ${GREEN}• $service_name${NC}"
        fi
    done
}

# =============================================================================
# Mostrar resumen
# =============================================================================

show_summary() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  📊 RESUMEN DE TESTS                          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Contar resultados
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    for log_file in "$TEST_RESULTS_DIR"/*.log; do
        if [[ -f "$log_file" ]]; then
            total_tests=$((total_tests + 1))
            
            if grep -q "PASS\|passed\|✓" "$log_file" 2>/dev/null; then
                passed_tests=$((passed_tests + 1))
            elif grep -q "FAIL\|failed\|✗" "$log_file" 2>/dev/null; then
                failed_tests=$((failed_tests + 1))
            fi
        fi
    done
    
    echo -e "${CYAN}Resultados:${NC}"
    echo -e "  Total de suites: $total_tests"
    echo -e "  ${GREEN}✓ Pasadas: $passed_tests${NC}"
    echo -e "  ${RED}✗ Fallidas: $failed_tests${NC}"
    echo
    
    echo -e "${CYAN}Archivos de resultados:${NC}"
    echo -e "  Logs: $TEST_RESULTS_DIR"
    if [[ "$COVERAGE" == true ]]; then
        echo -e "  Cobertura: $COVERAGE_DIR"
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
    
    prepare_directories
    check_environment
    
    local exit_code=0
    
    case $TEST_TYPE in
        unit)
            run_unit_tests || exit_code=1
            ;;
        integration)
            run_integration_tests || exit_code=1
            ;;
        e2e)
            run_e2e_tests || exit_code=1
            ;;
        all)
            run_unit_tests || exit_code=1
            run_integration_tests || exit_code=1
            run_e2e_tests || exit_code=1
            ;;
    esac
    
    generate_coverage_report
    show_summary
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "✅ Todos los tests pasaron correctamente!"
    else
        log_error "❌ Algunos tests fallaron"
    fi
    
    exit $exit_code
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
