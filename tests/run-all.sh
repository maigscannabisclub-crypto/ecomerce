#!/bin/bash

################################################################################
# Master Test Runner - E-commerce Platform
# Ejecuta todos los tests en orden: unit → integration → contract → e2e → validation
# Genera reporte consolidado
################################################################################

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TESTS_DIR="${PROJECT_ROOT}/tests"
REPORTS_DIR="${TESTS_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONSOLIDATED_REPORT="${REPORTS_DIR}/consolidated-report-${TIMESTAMP}.txt"
JSON_REPORT="${REPORTS_DIR}/consolidated-report-${TIMESTAMP}.json"
HTML_REPORT="${REPORTS_DIR}/consolidated-report-${TIMESTAMP}.html"

# Flags
CI_MODE=false
COVERAGE_MODE=false
PARALLEL=false
SKIP_CHAOS=false
SKIP_E2E=false

# Contadores
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
START_TIME=0
END_TIME=0

# Resultados por categoría
declare -A TEST_RESULTS

################################################################################
# Funciones de utilidad
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$CONSOLIDATED_REPORT"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$CONSOLIDATED_REPORT"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$CONSOLIDATED_REPORT"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$CONSOLIDATED_REPORT"
}

log_section() {
    echo -e "${CYAN}$1${NC}" | tee -a "$CONSOLIDATED_REPORT"
}

log_stage() {
    echo -e "${MAGENTA}[STAGE]${NC} $1" | tee -a "$CONSOLIDATED_REPORT"
}

# Crear directorio de reportes
mkdir -p "$REPORTS_DIR"

print_banner() {
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    echo "╔══════════════════════════════════════════════════════════════╗" | tee -a "$CONSOLIDATED_REPORT"
    echo "║           E-COMMERCE PLATFORM - TEST SUITE                   ║" | tee -a "$CONSOLIDATED_REPORT"
    echo "║                                                              ║" | tee -a "$CONSOLIDATED_REPORT"
    echo "║     Unit → Integration → Contract → E2E → Validation         ║" | tee -a "$CONSOLIDATED_REPORT"
    echo "╚══════════════════════════════════════════════════════════════╝" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
}

print_stage_header() {
    local stage=$1
    local stage_num=$2
    local total_stages=$3
    
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    echo "╔══════════════════════════════════════════════════════════════╗" | tee -a "$CONSOLIDATED_REPORT"
    printf "║  STAGE %d/%d: %-47s ║\n" "$stage_num" "$total_stages" "$stage" | tee -a "$CONSOLIDATED_REPORT"
    echo "╚══════════════════════════════════════════════════════════════╝" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
}

# Formatear tiempo
format_duration() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local remaining_seconds=$((seconds % 60))
    
    if [[ $minutes -gt 0 ]]; then
        echo "${minutes}m ${remaining_seconds}s"
    else
        echo "${seconds}s"
    fi
}

################################################################################
# Funciones de ejecución de tests
################################################################################

# Ejecutar tests unitarios
run_unit_tests() {
    log_stage "Running Unit Tests..."
    
    local start=$(date +%s)
    local exit_code=0
    
    cd "$PROJECT_ROOT"
    
    # Buscar configuración de Jest para unit tests
    local jest_config=""
    
    if [[ -f "${PROJECT_ROOT}/testing/jest.config.unit.js" ]]; then
        jest_config="${PROJECT_ROOT}/testing/jest.config.unit.js"
    elif [[ -f "${PROJECT_ROOT}/jest.config.js" ]]; then
        jest_config="${PROJECT_ROOT}/jest.config.js"
    fi
    
    if [[ -n "$jest_config" ]]; then
        local coverage_flag=""
        [[ "$COVERAGE_MODE" == true ]] && coverage_flag="--coverage"
        
        if npx jest --config "$jest_config" $coverage_flag --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Unit tests completed successfully"
            TEST_RESULTS["unit"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Unit tests failed"
            TEST_RESULTS["unit"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "No Jest configuration found for unit tests"
        TEST_RESULTS["unit"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "Unit tests duration: $(format_duration $duration)"
    
    return $exit_code
}

# Ejecutar tests de integración
run_integration_tests() {
    log_stage "Running Integration Tests..."
    
    local start=$(date +%s)
    local exit_code=0
    
    cd "$PROJECT_ROOT"
    
    local jest_config="${PROJECT_ROOT}/testing/jest.config.integration.js"
    
    if [[ -f "$jest_config" ]]; then
        local coverage_flag=""
        [[ "$COVERAGE_MODE" == true ]] && coverage_flag="--coverage"
        
        if npx jest --config "$jest_config" $coverage_flag --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Integration tests completed successfully"
            TEST_RESULTS["integration"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Integration tests failed"
            TEST_RESULTS["integration"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "No Jest configuration found for integration tests"
        TEST_RESULTS["integration"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "Integration tests duration: $(format_duration $duration)"
    
    return $exit_code
}

# Ejecutar tests de contrato
run_contract_tests() {
    log_stage "Running Contract Tests..."
    
    local start=$(date +%s)
    local exit_code=0
    
    cd "$PROJECT_ROOT"
    
    # Ejecutar tests de contrato con Pact
    local jest_config="${PROJECT_ROOT}/testing/jest.config.contract.js"
    
    if [[ -f "$jest_config" ]]; then
        if npx jest --config "$jest_config" --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Contract tests completed successfully"
            TEST_RESULTS["contract"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Contract tests failed"
            TEST_RESULTS["contract"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        # Ejecutar tests de validación de contrato manualmente
        if [[ -f "${TESTS_DIR}/validation/contract-validation.test.js" ]]; then
            if npx jest "${TESTS_DIR}/validation/contract-validation.test.js" --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
                log_success "Contract validation tests completed successfully"
                TEST_RESULTS["contract"]="PASSED"
                ((PASSED_TESTS++))
            else
                log_error "Contract validation tests failed"
                TEST_RESULTS["contract"]="FAILED"
                ((FAILED_TESTS++))
                exit_code=1
            fi
        else
            log_warn "No contract tests found"
            TEST_RESULTS["contract"]="SKIPPED"
            ((SKIPPED_TESTS++))
        fi
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "Contract tests duration: $(format_duration $duration)"
    
    return $exit_code
}

# Ejecutar tests E2E
run_e2e_tests() {
    log_stage "Running E2E Tests..."
    
    if [[ "$SKIP_E2E" == true ]]; then
        log_warn "E2E tests skipped (--skip-e2e flag)"
        TEST_RESULTS["e2e"]="SKIPPED"
        ((SKIPPED_TESTS++))
        return 0
    fi
    
    local start=$(date +%s)
    local exit_code=0
    
    cd "$PROJECT_ROOT"
    
    # Verificar si Cypress está configurado
    if [[ -f "${PROJECT_ROOT}/testing/e2e/cypress.config.ts" ]]; then
        if npx cypress run --config-file "${PROJECT_ROOT}/testing/e2e/cypress.config.ts" 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "E2E tests completed successfully"
            TEST_RESULTS["e2e"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "E2E tests failed"
            TEST_RESULTS["e2e"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "No Cypress configuration found"
        TEST_RESULTS["e2e"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "E2E tests duration: $(format_duration $duration)"
    
    return $exit_code
}

# Ejecutar tests de validación
run_validation_tests() {
    log_stage "Running Validation Tests..."
    
    local start=$(date +%s)
    local exit_code=0
    
    cd "$PROJECT_ROOT"
    
    # Health Check Tests
    log_info "Running Health Check Tests..."
    if [[ -f "${TESTS_DIR}/validation/health-check.test.js" ]]; then
        if npx jest "${TESTS_DIR}/validation/health-check.test.js" --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Health check tests passed"
            TEST_RESULTS["health-check"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Health check tests failed"
            TEST_RESULTS["health-check"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "Health check tests not found"
        TEST_RESULTS["health-check"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    # Smoke Tests
    log_info "Running Smoke Tests..."
    if [[ -f "${TESTS_DIR}/validation/smoke-test.test.js" ]]; then
        if npx jest "${TESTS_DIR}/validation/smoke-test.test.js" --silent 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Smoke tests passed"
            TEST_RESULTS["smoke"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Smoke tests failed"
            TEST_RESULTS["smoke"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "Smoke tests not found"
        TEST_RESULTS["smoke"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    # Chaos Tests (si no se saltan)
    if [[ "$SKIP_CHAOS" == false ]]; then
        log_info "Running Chaos Tests..."
        if [[ -f "${TESTS_DIR}/validation/chaos-test.sh" ]]; then
            chmod +x "${TESTS_DIR}/validation/chaos-test.sh"
            if bash "${TESTS_DIR}/validation/chaos-test.sh" 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
                log_success "Chaos tests passed"
                TEST_RESULTS["chaos"]="PASSED"
                ((PASSED_TESTS++))
            else
                log_error "Chaos tests failed"
                TEST_RESULTS["chaos"]="FAILED"
                ((FAILED_TESTS++))
                exit_code=1
            fi
        else
            log_warn "Chaos tests not found"
            TEST_RESULTS["chaos"]="SKIPPED"
            ((SKIPPED_TESTS++))
        fi
    else
        log_warn "Chaos tests skipped (--skip-chaos flag)"
        TEST_RESULTS["chaos"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "Validation tests duration: $(format_duration $duration)"
    
    return $exit_code
}

# Verificar cobertura
run_coverage_check() {
    log_stage "Running Coverage Check..."
    
    local start=$(date +%s)
    local exit_code=0
    
    if [[ -f "${TESTS_DIR}/coverage-check.sh" ]]; then
        chmod +x "${TESTS_DIR}/coverage-check.sh"
        if bash "${TESTS_DIR}/coverage-check.sh" 2>&1 | tee -a "$CONSOLIDATED_REPORT"; then
            log_success "Coverage check passed"
            TEST_RESULTS["coverage"]="PASSED"
            ((PASSED_TESTS++))
        else
            log_error "Coverage check failed"
            TEST_RESULTS["coverage"]="FAILED"
            ((FAILED_TESTS++))
            exit_code=1
        fi
    else
        log_warn "Coverage check script not found"
        TEST_RESULTS["coverage"]="SKIPPED"
        ((SKIPPED_TESTS++))
    fi
    
    local end=$(date +%s)
    local duration=$((end - start))
    log_info "Coverage check duration: $(format_duration $duration)"
    
    return $exit_code
}

################################################################################
# Generación de reportes
################################################################################

generate_json_report() {
    log_info "Generating JSON report..."
    
    local json_content="{
  \"timestamp\": \"$(date -Iseconds)\",
  \"duration\": $((END_TIME - START_TIME)),
  \"summary\": {
    \"total\": $TOTAL_TESTS,
    \"passed\": $PASSED_TESTS,
    \"failed\": $FAILED_TESTS,
    \"skipped\": $SKIPPED_TESTS,
    \"success_rate\": $(echo "scale=2; ($PASSED_TESTS * 100) / ($TOTAL_TESTS - $SKIPPED_TESTS)" | bc 2>/dev/null || echo "0")
  },
  \"results\": {"
    
    local first=true
    for key in "${!TEST_RESULTS[@]}"; do
        [[ "$first" == true ]] || json_content+=","
        first=false
        json_content+="
    \"$key\": \"${TEST_RESULTS[$key]}\""
    done
    
    json_content+="
  },
  \"configuration\": {
    \"ci_mode\": $([[ "$CI_MODE" == true ]] && echo "true" || echo "false"),
    \"coverage_mode\": $([[ "$COVERAGE_MODE" == true ]] && echo "true" || echo "false"),
    \"parallel\": $([[ "$PARALLEL" == true ]] && echo "true" || echo "false")
  }
}"
    
    echo "$json_content" > "$JSON_REPORT"
    log_success "JSON report generated: $JSON_REPORT"
}

generate_html_report() {
    log_info "Generating HTML report..."
    
    local success_rate=$(echo "scale=1; ($PASSED_TESTS * 100) / ($TOTAL_TESTS - $SKIPPED_TESTS)" | bc 2>/dev/null || echo "0")
    local overall_status="PASSED"
    local status_color="#28a745"
    
    if [[ $FAILED_TESTS -gt 0 ]]; then
        overall_status="FAILED"
        status_color="#dc3545"
    fi
    
    local html_content="<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>Test Report - E-commerce Platform</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 16px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header .timestamp { opacity: 0.9; font-size: 0.9em; }
        .summary { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 40px;
            background: #f8f9fa;
        }
        .metric-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }
        .metric-card:hover { transform: translateY(-4px); }
        .metric-value { 
            font-size: 3em; 
            font-weight: bold; 
            margin: 10px 0;
        }
        .metric-value.pass { color: #28a745; }
        .metric-value.fail { color: #dc3545; }
        .metric-value.skip { color: #ffc107; }
        .metric-label { color: #6c757d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }
        .overall-status {
            grid-column: 1 / -1;
            background: $status_color;
            color: white;
        }
        .overall-status .metric-value { color: white; }
        .overall-status .metric-label { color: rgba(255,255,255,0.8); }
        .results { padding: 40px; }
        .results h2 { margin-bottom: 20px; color: #333; }
        table { 
            width: 100%; 
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        th { 
            background: #667eea; 
            color: white; 
            padding: 16px;
            text-align: left;
            font-weight: 600;
        }
        td { 
            padding: 16px; 
            border-bottom: 1px solid #e9ecef;
        }
        tr:hover { background: #f8f9fa; }
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .status-pass { background: #d4edda; color: #155724; }
        .status-fail { background: #f8d7da; color: #721c24; }
        .status-skip { background: #fff3cd; color: #856404; }
        .footer {
            padding: 20px 40px;
            background: #f8f9fa;
            text-align: center;
            color: #6c757d;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class=\"container\">
        <div class=\"header\">
            <h1>🧪 Test Execution Report</h1>
            <p class=\"timestamp\">Generated: $(date)</p>
            <p class=\"timestamp\">Duration: $(format_duration $((END_TIME - START_TIME)))</p>
        </div>
        
        <div class=\"summary\">
            <div class=\"metric-card overall-status\">
                <div class=\"metric-label\">Overall Status</div>
                <div class=\"metric-value\">$overall_status</div>
            </div>
            <div class=\"metric-card\">
                <div class=\"metric-label\">Total Tests</div>
                <div class=\"metric-value\">$TOTAL_TESTS</div>
            </div>
            <div class=\"metric-card\">
                <div class=\"metric-label\">Passed</div>
                <div class=\"metric-value pass\">$PASSED_TESTS</div>
            </div>
            <div class=\"metric-card\">
                <div class=\"metric-label\">Failed</div>
                <div class=\"metric-value fail\">$FAILED_TESTS</div>
            </div>
            <div class=\"metric-card\">
                <div class=\"metric-label\">Skipped</div>
                <div class=\"metric-value skip\">$SKIPPED_TESTS</div>
            </div>
            <div class=\"metric-card\">
                <div class=\"metric-label\">Success Rate</div>
                <div class=\"metric-value\">${success_rate}%</div>
            </div>
        </div>
        
        <div class=\"results\">
            <h2>Detailed Results</h2>
            <table>
                <thead>
                    <tr>
                        <th>Test Suite</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>"
    
    for key in "${!TEST_RESULTS[@]}"; do
        local status_class="status-${TEST_RESULTS[$key],,}"
        html_content+="
                    <tr>
                        <td>${key}</td>
                        <td><span class=\"status-badge $status_class\">${TEST_RESULTS[$key]}</span></td>
                    </tr>"
    done
    
    html_content+="
                </tbody>
            </table>
        </div>
        
        <div class=\"footer\">
            <p>E-commerce Platform Test Suite | Generated by run-all.sh</p>
        </div>
    </div>
</body>
</html>"
    
    echo "$html_content" > "$HTML_REPORT"
    log_success "HTML report generated: $HTML_REPORT"
}

################################################################################
# Función principal
################################################################################

main() {
    START_TIME=$(date +%s)
    
    print_banner
    
    echo "Timestamp: $(date)" | tee -a "$CONSOLIDATED_REPORT"
    echo "Working Directory: $PROJECT_ROOT" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    # Verificar dependencias
    log_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    log_success "Dependencies OK (Node.js $(node --version), npm $(npm --version))"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    # Ejecutar tests en orden
    local stage=1
    local total_stages=6
    
    # 1. Unit Tests
    print_stage_header "UNIT TESTS" $stage $total_stages
    run_unit_tests || true
    ((stage++))
    
    # 2. Integration Tests
    print_stage_header "INTEGRATION TESTS" $stage $total_stages
    run_integration_tests || true
    ((stage++))
    
    # 3. Contract Tests
    print_stage_header "CONTRACT TESTS" $stage $total_stages
    run_contract_tests || true
    ((stage++))
    
    # 4. E2E Tests
    print_stage_header "E2E TESTS" $stage $total_stages
    run_e2e_tests || true
    ((stage++))
    
    # 5. Validation Tests
    print_stage_header "VALIDATION TESTS" $stage $total_stages
    run_validation_tests || true
    ((stage++))
    
    # 6. Coverage Check
    print_stage_header "COVERAGE CHECK" $stage $total_stages
    run_coverage_check || true
    
    END_TIME=$(date +%s)
    TOTAL_TESTS=$((PASSED_TESTS + FAILED_TESTS + SKIPPED_TESTS))
    
    # Generar reportes
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    log_info "Generating reports..."
    generate_json_report
    generate_html_report
    
    # Reporte final
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    echo "╔══════════════════════════════════════════════════════════════╗" | tee -a "$CONSOLIDATED_REPORT"
    echo "║                     FINAL SUMMARY                            ║" | tee -a "$CONSOLIDATED_REPORT"
    echo "╚══════════════════════════════════════════════════════════════╝" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    log_section "Test Results:"
    printf "  %-20s %d\n" "Total Tests:" "$TOTAL_TESTS" | tee -a "$CONSOLIDATED_REPORT"
    printf "  %-20s %d\n" "Passed:" "$PASSED_TESTS" | tee -a "$CONSOLIDATED_REPORT"
    printf "  %-20s %d\n" "Failed:" "$FAILED_TESTS" | tee -a "$CONSOLIDATED_REPORT"
    printf "  %-20s %d\n" "Skipped:" "$SKIPPED_TESTS" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    log_section "Execution Time:"
    printf "  Duration: %s\n" "$(format_duration $((END_TIME - START_TIME)))" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    log_section "Generated Reports:"
    echo "  Text Report:  $CONSOLIDATED_REPORT" | tee -a "$CONSOLIDATED_REPORT"
    echo "  JSON Report:  $JSON_REPORT" | tee -a "$CONSOLIDATED_REPORT"
    echo "  HTML Report:  $HTML_REPORT" | tee -a "$CONSOLIDATED_REPORT"
    echo "" | tee -a "$CONSOLIDATED_REPORT"
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "✅ ALL TESTS PASSED!"
        exit 0
    else
        log_error "❌ SOME TESTS FAILED!"
        exit 1
    fi
}

################################################################################
# Parsear argumentos
################################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --ci)
            CI_MODE=true
            shift
            ;;
        --coverage)
            COVERAGE_MODE=true
            shift
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --skip-chaos)
            SKIP_CHAOS=true
            shift
            ;;
        --skip-e2e)
            SKIP_E2E=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --ci           Run in CI mode (non-interactive)"
            echo "  --coverage     Enable coverage reporting"
            echo "  --parallel     Run tests in parallel (experimental)"
            echo "  --skip-chaos   Skip chaos engineering tests"
            echo "  --skip-e2e     Skip E2E tests"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "Test Execution Order:"
            echo "  1. Unit Tests"
            echo "  2. Integration Tests"
            echo "  3. Contract Tests"
            echo "  4. E2E Tests"
            echo "  5. Validation Tests"
            echo "  6. Coverage Check"
            exit 0
            ;;
        *)
            log_warn "Unknown option: $1"
            shift
            ;;
    esac
done

# Ejecutar función principal
main "$@"
