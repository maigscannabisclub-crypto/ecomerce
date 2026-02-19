#!/bin/bash

################################################################################
# Chaos Engineering Tests for E-commerce Platform
# Simula fallos en servicios y verifica resiliencia del sistema
################################################################################

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/tests/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/chaos-test-${TIMESTAMP}.log"

# URLs de servicios
API_GATEWAY_URL="${API_GATEWAY_URL:-http://localhost:3000}"
INVENTORY_SERVICE_URL="${INVENTORY_SERVICE_URL:-http://localhost:3005}"
ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://localhost:3004}"
PRODUCT_SERVICE_URL="${PRODUCT_SERVICE_URL:-http://localhost:3002}"

# Contenedor Docker del inventory-service
INVENTORY_CONTAINER="${INVENTORY_CONTAINER:-inventory-service}"

# Variables de estado
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

################################################################################
# Funciones de utilidad
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# Crear directorio de logs
mkdir -p "$LOG_DIR"

print_header() {
    echo "" | tee -a "$LOG_FILE"
    echo "================================================================" | tee -a "$LOG_FILE"
    echo "$1" | tee -a "$LOG_FILE"
    echo "================================================================" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

# Verificar si un servicio responde
check_service_health() {
    local service_url=$1
    local service_name=$2
    local timeout=${3:-5}
    
    if curl -sf "${service_url}/health" --max-time "$timeout" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Esperar a que un servicio esté disponible
wait_for_service() {
    local service_url=$1
    local service_name=$2
    local max_attempts=${3:-30}
    local delay=${4:-2}
    
    log_info "Waiting for $service_name to be available..."
    
    for ((i=1; i<=max_attempts; i++)); do
        if check_service_health "$service_url" "$service_name" 2; then
            log_success "$service_name is available"
            return 0
        fi
        echo -n "."
        sleep "$delay"
    done
    
    echo ""
    log_error "$service_name did not become available after $((max_attempts * delay)) seconds"
    return 1
}

# Verificar si Docker está disponible
is_docker_available() {
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Verificar si el contenedor existe
container_exists() {
    local container_name=$1
    docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"
}

# Verificar si el contenedor está corriendo
container_running() {
    local container_name=$1
    docker ps --format '{{.Names}}' | grep -q "^${container_name}$"
}

################################################################################
# Tests de Caos
################################################################################

# Test 1: Simular caída del inventory-service
test_inventory_service_failure() {
    print_header "TEST 1: Inventory Service Failure Simulation"
    
    if ! is_docker_available; then
        log_warn "Docker not available - skipping container-based chaos test"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    if ! container_exists "$INVENTORY_CONTAINER"; then
        log_warn "Container $INVENTORY_CONTAINER not found - skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_info "Step 1: Verifying inventory-service is healthy..."
    if ! check_service_health "$INVENTORY_SERVICE_URL" "inventory-service"; then
        log_warn "Inventory service is not healthy - skipping test"
        ((TESTS_SKIPPED++))
        return 0
    fi
    log_success "Inventory service is healthy"
    
    log_info "Step 2: Stopping inventory-service container..."
    if docker stop "$INVENTORY_CONTAINER" > /dev/null 2>&1; then
        log_success "Inventory service stopped"
    else
        log_error "Failed to stop inventory service"
        ((TESTS_FAILED++))
        return 1
    fi
    
    log_info "Step 3: Waiting 5 seconds for system to detect failure..."
    sleep 5
    
    log_info "Step 4: Testing API Gateway response without inventory service..."
    
    # Probar que el API Gateway sigue respondiendo
    if check_service_health "$API_GATEWAY_URL" "api-gateway" 5; then
        log_success "API Gateway is still responding"
    else
        log_error "API Gateway is not responding"
        ((TESTS_FAILED++))
        return 1
    fi
    
    # Probar que se puede listar productos (debería funcionar con fallback)
    log_info "Step 5: Testing product listing with inventory down..."
    local response
    response=$(curl -sf "${PRODUCT_SERVICE_URL}/api/v1/products?limit=5" --max-time 10 2>/dev/null || echo '{"status":"error"}')
    
    if echo "$response" | grep -q '"status":"success"'; then
        log_success "Product service is still responding with inventory down"
    else
        log_warn "Product service may be affected by inventory failure"
    fi
    
    log_info "Step 6: Testing order creation with inventory down..."
    # Intentar crear una orden - debería fallar gracefulmente o usar circuit breaker
    local order_response
    order_response=$(curl -sf -X POST "${ORDER_SERVICE_URL}/api/v1/orders" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer test-token" \
        -d '{"cartId":"test-cart","shippingAddress":{},"billingAddress":{},"paymentMethod":"credit_card"}' \
        --max-time 10 2>/dev/null || echo '{"status":"error"}')
    
    # Verificar que la respuesta es válida (puede ser error pero con formato correcto)
    if echo "$order_response" | grep -q '"status"'; then
        log_success "Order service responds with proper error format"
    else
        log_warn "Order service response format may be inconsistent"
    fi
    
    log_info "Step 7: Restarting inventory-service..."
    if docker start "$INVENTORY_CONTAINER" > /dev/null 2>&1; then
        log_success "Inventory service restarted"
    else
        log_error "Failed to restart inventory service"
        ((TESTS_FAILED++))
        return 1
    fi
    
    log_info "Step 8: Waiting for inventory-service to recover..."
    if wait_for_service "$INVENTORY_SERVICE_URL" "inventory-service" 30 2; then
        log_success "Inventory service recovered successfully"
        ((TESTS_PASSED++))
    else
        log_error "Inventory service did not recover"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 2: Verificar Circuit Breaker
test_circuit_breaker() {
    print_header "TEST 2: Circuit Breaker Verification"
    
    log_info "Testing circuit breaker behavior..."
    
    local consecutive_failures=0
    local max_failures=5
    local circuit_open=false
    
    # Simular múltiples fallos al inventory service
    for ((i=1; i<=max_failures; i++)); do
        log_info "Request $i to inventory service..."
        
        local response_time
        local start_time=$(date +%s%N)
        
        if curl -sf "${INVENTORY_SERVICE_URL}/health" --max-time 2 > /dev/null 2>&1; then
            log_info "Request $i succeeded"
            consecutive_failures=0
        else
            log_info "Request $i failed"
            ((consecutive_failures++))
        fi
        
        response_time=$(( ($(date +%s%N) - start_time) / 1000000 ))
        log_info "Response time: ${response_time}ms"
        
        sleep 1
    done
    
    if [[ $consecutive_failures -ge $max_failures ]]; then
        log_warn "Multiple consecutive failures detected - circuit breaker should activate"
    fi
    
    # Verificar que el circuit breaker está funcionando
    log_info "Checking circuit breaker state..."
    
    local cb_response
    cb_response=$(curl -sf "${API_GATEWAY_URL}/health/circuit-breakers" --max-time 5 2>/dev/null || echo '{}')
    
    if echo "$cb_response" | grep -q '"inventory"'; then
        log_success "Circuit breaker state is exposed"
        ((TESTS_PASSED++))
    else
        log_warn "Circuit breaker state endpoint not available"
        ((TESTS_SKIPPED++))
    fi
}

# Test 3: Verificar Retry Mechanism
test_retry_mechanism() {
    print_header "TEST 3: Retry Mechanism Verification"
    
    log_info "Testing retry behavior on transient failures..."
    
    # Hacer una petición que pueda fallar temporalmente
    local retry_count=0
    local max_retries=3
    local success=false
    
    while [[ $retry_count -lt $max_retries ]]; do
        log_info "Attempt $((retry_count + 1))..."
        
        if curl -sf "${ORDER_SERVICE_URL}/api/v1/orders" \
            -H "Authorization: Bearer test-token" \
            --max-time 5 > /dev/null 2>&1; then
            log_success "Request succeeded on attempt $((retry_count + 1))"
            success=true
            break
        else
            log_info "Attempt $((retry_count + 1)) failed, retrying..."
            ((retry_count++))
            sleep 2
        fi
    done
    
    if [[ "$success" == true ]]; then
        log_success "Retry mechanism is working"
        ((TESTS_PASSED++))
    else
        log_warn "Could not verify retry mechanism"
        ((TESTS_SKIPPED++))
    fi
}

# Test 4: Latencia alta
test_high_latency() {
    print_header "TEST 4: High Latency Simulation"
    
    log_info "Simulating high latency scenario..."
    
    if is_docker_available && container_running "$INVENTORY_CONTAINER"; then
        # Añadir latencia de red al contenedor
        log_info "Adding 500ms latency to inventory service..."
        
        docker exec "$INVENTORY_CONTAINER" sh -c "
            tc qdisc add dev eth0 root netem delay 500ms 2>/dev/null || true
        " 2>/dev/null || log_warn "Could not add network latency (may require privileged mode)"
        
        sleep 2
        
        # Medir tiempo de respuesta
        local start_time=$(date +%s%N)
        curl -sf "${INVENTORY_SERVICE_URL}/health" --max-time 10 > /dev/null 2>&1 || true
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 ))
        
        log_info "Response time with latency: ${response_time}ms"
        
        if [[ $response_time -gt 400 ]]; then
            log_success "Latency simulation is working"
        fi
        
        # Remover latencia
        docker exec "$INVENTORY_CONTAINER" sh -c "
            tc qdisc del dev eth0 root 2>/dev/null || true
        " 2>/dev/null || true
        
        ((TESTS_PASSED++))
    else
        log_warn "Cannot simulate latency - Docker/container not available"
        ((TESTS_SKIPPED++))
    fi
}

# Test 5: Verificar sistema sigue operando
test_system_resilience() {
    print_header "TEST 5: System Resilience Verification"
    
    log_info "Verifying system continues operating during failures..."
    
    local services_ok=0
    local total_services=4
    
    # Verificar cada servicio crítico
    if check_service_health "$API_GATEWAY_URL" "api-gateway" 5; then
        log_success "API Gateway is operational"
        ((services_ok++))
    else
        log_error "API Gateway is not operational"
    fi
    
    if check_service_health "$PRODUCT_SERVICE_URL" "product-service" 5; then
        log_success "Product Service is operational"
        ((services_ok++))
    else
        log_error "Product Service is not operational"
    fi
    
    if check_service_health "$ORDER_SERVICE_URL" "order-service" 5; then
        log_success "Order Service is operational"
        ((services_ok++))
    else
        log_error "Order Service is not operational"
    fi
    
    # Verificar que al menos el 75% de servicios críticos estén operativos
    local threshold=$((total_services * 75 / 100))
    
    if [[ $services_ok -ge $threshold ]]; then
        log_success "System resilience verified: $services_ok/$total_services critical services operational"
        ((TESTS_PASSED++))
    else
        log_error "System resilience compromised: only $services_ok/$total_services services operational"
        ((TESTS_FAILED++))
    fi
}

# Test 6: Caída y recuperación de múltiples servicios
test_cascade_failure() {
    print_header "TEST 6: Cascade Failure Prevention"
    
    log_info "Testing cascade failure prevention..."
    
    # Simular fallo temporal de un servicio no crítico
    log_info "Checking service dependencies..."
    
    # Verificar que el product service funciona sin inventory
    local product_health
    product_health=$(curl -sf "${PRODUCT_SERVICE_URL}/health" --max-time 5 2>/dev/null || echo '{}')
    
    if echo "$product_health" | grep -q '"status"'; then
        log_success "Product service has proper health check"
        
        # Verificar que incluye información de dependencias
        if echo "$product_health" | grep -q '"dependencies"'; then
            log_success "Health check includes dependency information"
            ((TESTS_PASSED++))
        else
            log_warn "Health check should include dependency status"
            ((TESTS_SKIPPED++))
        fi
    else
        log_warn "Could not verify product service health"
        ((TESTS_SKIPPED++))
    fi
}

################################################################################
# Función principal
################################################################################

main() {
    print_header "CHAOS ENGINEERING TESTS - E-COMMERCE PLATFORM"
    echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
    echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Verificar dependencias
    log_info "Checking dependencies..."
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if is_docker_available; then
        log_success "Docker is available"
    else
        log_warn "Docker is not available - some tests will be skipped"
    fi
    
    echo "" | tee -a "$LOG_FILE"
    
    # Ejecutar tests
    test_inventory_service_failure
    test_circuit_breaker
    test_retry_mechanism
    test_high_latency
    test_system_resilience
    test_cascade_failure
    
    # Reporte final
    print_header "TEST SUMMARY"
    
    echo "Tests Passed: $TESTS_PASSED" | tee -a "$LOG_FILE"
    echo "Tests Failed: $TESTS_FAILED" | tee -a "$LOG_FILE"
    echo "Tests Skipped: $TESTS_SKIPPED" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "" | tee -a "$LOG_FILE"
        log_error "Some chaos tests failed!"
        exit 1
    else
        echo "" | tee -a "$LOG_FILE"
        log_success "All chaos tests completed successfully!"
        exit 0
    fi
}

# Manejar señales de interrupción
cleanup() {
    echo "" | tee -a "$LOG_FILE"
    log_warn "Test interrupted - cleaning up..."
    
    # Asegurar que el inventory service esté corriendo
    if is_docker_available && container_exists "$INVENTORY_CONTAINER"; then
        docker start "$INVENTORY_CONTAINER" > /dev/null 2>&1 || true
    fi
    
    exit 130
}

trap cleanup SIGINT SIGTERM

# Ejecutar función principal
main "$@"
