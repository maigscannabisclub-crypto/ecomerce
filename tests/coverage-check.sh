#!/bin/bash

################################################################################
# Coverage Check Script for E-commerce Platform
# Verifica cobertura mínima del 70% y genera reportes
################################################################################

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COVERAGE_DIR="${PROJECT_ROOT}/tests/coverage-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${COVERAGE_DIR}/coverage-report-${TIMESTAMP}.txt"
JSON_REPORT="${COVERAGE_DIR}/coverage-report-${TIMESTAMP}.json"
HTML_REPORT_DIR="${COVERAGE_DIR}/html-report-${TIMESTAMP}"
MERGED_REPORT="${COVERAGE_DIR}/merged-coverage.json"

# Umbrales de cobertura
MIN_COVERAGE=70
MIN_BRANCHES=70
MIN_FUNCTIONS=70
MIN_LINES=70
MIN_STATEMENTS=70

# Variables de estado
COVERAGE_PASSED=true
TOTAL_COVERAGE=0
BRANCHES_COVERAGE=0
FUNCTIONS_COVERAGE=0
LINES_COVERAGE=0
STATEMENTS_COVERAGE=0

################################################################################
# Funciones de utilidad
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$REPORT_FILE"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$REPORT_FILE"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$REPORT_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$REPORT_FILE"
}

log_section() {
    echo -e "${CYAN}$1${NC}" | tee -a "$REPORT_FILE"
}

# Crear directorio de reportes
mkdir -p "$COVERAGE_DIR"
mkdir -p "$HTML_REPORT_DIR"

print_header() {
    echo "" | tee -a "$REPORT_FILE"
    echo "================================================================" | tee -a "$REPORT_FILE"
    echo "$1" | tee -a "$REPORT_FILE"
    echo "================================================================" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
}

print_banner() {
    echo "" | tee -a "$REPORT_FILE"
    echo "╔══════════════════════════════════════════════════════════════╗" | tee -a "$REPORT_FILE"
    echo "║         COVERAGE CHECK - E-COMMERCE PLATFORM                 ║" | tee -a "$REPORT_FILE"
    echo "╚══════════════════════════════════════════════════════════════╝" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
}

# Verificar si Node.js y npm están disponibles
check_node() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    local node_version=$(node --version)
    local npm_version=$(npm --version)
    log_info "Node.js version: $node_version"
    log_info "npm version: $npm_version"
}

# Verificar si Jest está instalado
check_jest() {
    if ! npm list jest --depth=0 > /dev/null 2>&1; then
        if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
            log_info "Installing Jest..."
            cd "$PROJECT_ROOT"
            npm install --save-dev jest @types/jest ts-jest 2>&1 | tee -a "$REPORT_FILE" || true
        else
            log_warn "package.json not found - Jest may not be available"
        fi
    fi
}

################################################################################
# Funciones de cobertura
################################################################################

# Ejecutar tests con cobertura
run_tests_with_coverage() {
    local test_type=$1
    local config_file=$2
    local output_dir="${COVERAGE_DIR}/${test_type}-${TIMESTAMP}"
    
    log_info "Running $test_type tests with coverage..."
    
    mkdir -p "$output_dir"
    
    cd "$PROJECT_ROOT"
    
    if [[ -f "$config_file" ]]; then
        npx jest --config "$config_file" --coverage --coverageDirectory="$output_dir" --silent 2>&1 | tee -a "$REPORT_FILE" || {
            log_warn "$test_type tests completed with some failures"
        }
    else
        log_warn "Config file $config_file not found - skipping $test_type tests"
        return 1
    fi
    
    echo "$output_dir"
}

# Extraer cobertura de reporte JSON
extract_coverage() {
    local coverage_file=$1
    
    if [[ ! -f "$coverage_file" ]]; then
        log_warn "Coverage file not found: $coverage_file"
        return 1
    fi
    
    local total=$(jq -r '.total // empty' "$coverage_file" 2>/dev/null || echo "")
    
    if [[ -n "$total" ]]; then
        BRANCHES_COVERAGE=$(echo "$total" | jq -r '.branches.pct // 0')
        FUNCTIONS_COVERAGE=$(echo "$total" | jq -r '.functions.pct // 0')
        LINES_COVERAGE=$(echo "$total" | jq -r '.lines.pct // 0')
        STATEMENTS_COVERAGE=$(echo "$total" | jq -r '.statements.pct // 0')
        
        # Calcular promedio
        TOTAL_COVERAGE=$(echo "scale=2; ($BRANCHES_COVERAGE + $FUNCTIONS_COVERAGE + $LINES_COVERAGE + $STATEMENTS_COVERAGE) / 4" | bc)
        
        return 0
    fi
    
    return 1
}

# Verificar cobertura mínima
check_minimum_coverage() {
    local metric=$1
    local value=$2
    local minimum=$3
    
    log_info "Checking $metric coverage: ${value}% (minimum: ${minimum}%)"
    
    # Comparar usando bc para decimales
    if (( $(echo "$value >= $minimum" | bc -l) )); then
        log_success "$metric coverage PASSED: ${value}% >= ${minimum}%"
        return 0
    else
        log_error "$metric coverage FAILED: ${value}% < ${minimum}%"
        COVERAGE_PASSED=false
        return 1
    fi
}

# Generar reporte de cobertura por servicio
generate_service_coverage() {
    log_section "Service Coverage Report"
    echo "" | tee -a "$REPORT_FILE"
    
    local services_dir="${PROJECT_ROOT}/services"
    
    if [[ ! -d "$services_dir" ]]; then
        log_warn "Services directory not found"
        return 1
    fi
    
    printf "%-30s %10s %10s %10s %10s\n" "Service" "Branches" "Functions" "Lines" "Statements" | tee -a "$REPORT_FILE"
    printf "%-30s %10s %10s %10s %10s\n" "-------" "--------" "---------" "-----" "----------" | tee -a "$REPORT_FILE"
    
    for service_dir in "$services_dir"/*; do
        if [[ -d "$service_dir" ]]; then
            local service_name=$(basename "$service_dir")
            local coverage_file="${service_dir}/coverage/coverage-summary.json"
            
            if [[ -f "$coverage_file" ]]; then
                local branches=$(jq -r '.total.branches.pct // 0' "$coverage_file")
                local functions=$(jq -r '.total.functions.pct // 0' "$coverage_file")
                local lines=$(jq -r '.total.lines.pct // 0' "$coverage_file")
                local statements=$(jq -r '.total.statements.pct // 0' "$coverage_file")
                
                printf "%-30s %9s%% %9s%% %9s%% %9s%%\n" "$service_name" "$branches" "$functions" "$lines" "$statements" | tee -a "$REPORT_FILE"
            else
                printf "%-30s %10s\n" "$service_name" "No coverage data" | tee -a "$REPORT_FILE"
            fi
        fi
    done
    
    echo "" | tee -a "$REPORT_FILE"
}

# Generar reporte HTML
generate_html_report() {
    log_info "Generating HTML coverage report..."
    
    local html_content="<!DOCTYPE html>
<html>
<head>
    <title>Coverage Report - E-commerce Platform</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .metric { flex: 1; min-width: 200px; padding: 15px; border-radius: 8px; text-align: center; }
        .metric.pass { background: #d4edda; border: 1px solid #c3e6cb; }
        .metric.fail { background: #f8d7da; border: 1px solid #f5c6cb; }
        .metric-value { font-size: 36px; font-weight: bold; margin: 10px 0; }
        .metric-label { font-size: 14px; color: #666; }
        .threshold { font-size: 12px; color: #888; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #4CAF50; color: white; }
        tr:hover { background: #f5f5f5; }
        .status-pass { color: #28a745; font-weight: bold; }
        .status-fail { color: #dc3545; font-weight: bold; }
        .timestamp { color: #888; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class=\"container\">
        <h1>📊 Coverage Report - E-commerce Platform</h1>
        <p class=\"timestamp\">Generated: $(date)</p>
        
        <h2>Overall Coverage Summary</h2>
        <div class=\"summary\">"
    
    # Añadir métricas
    local total_class="pass"
    [[ $(echo "$TOTAL_COVERAGE < $MIN_COVERAGE" | bc) -eq 1 ]] && total_class="fail"
    
    html_content+="
            <div class=\"metric $total_class\">
                <div class=\"metric-label\">Total Coverage</div>
                <div class=\"metric-value\">${TOTAL_COVERAGE}%</div>
                <div class=\"threshold\">Threshold: ${MIN_COVERAGE}%</div>
            </div>"
    
    local branches_class="pass"
    [[ $(echo "$BRANCHES_COVERAGE < $MIN_BRANCHES" | bc) -eq 1 ]] && branches_class="fail"
    
    html_content+="
            <div class=\"metric $branches_class\">
                <div class=\"metric-label\">Branches</div>
                <div class=\"metric-value\">${BRANCHES_COVERAGE}%</div>
                <div class=\"threshold\">Threshold: ${MIN_BRANCHES}%</div>
            </div>"
    
    local functions_class="pass"
    [[ $(echo "$FUNCTIONS_COVERAGE < $MIN_FUNCTIONS" | bc) -eq 1 ]] && functions_class="fail"
    
    html_content+="
            <div class=\"metric $functions_class\">
                <div class=\"metric-label\">Functions</div>
                <div class=\"metric-value\">${FUNCTIONS_COVERAGE}%</div>
                <div class=\"threshold\">Threshold: ${MIN_FUNCTIONS}%</div>
            </div>"
    
    local lines_class="pass"
    [[ $(echo "$LINES_COVERAGE < $MIN_LINES" | bc) -eq 1 ]] && lines_class="fail"
    
    html_content+="
            <div class=\"metric $lines_class\">
                <div class=\"metric-label\">Lines</div>
                <div class=\"metric-value\">${LINES_COVERAGE}%</div>
                <div class=\"threshold\">Threshold: ${MIN_LINES}%</div>
            </div>"
    
    html_content+="
        </div>
        
        <h2>Service Coverage Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Service</th>
                    <th>Branches</th>
                    <th>Functions</th>
                    <th>Lines</th>
                    <th>Statements</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>"
    
    # Añadir filas de servicios
    local services_dir="${PROJECT_ROOT}/services"
    if [[ -d "$services_dir" ]]; then
        for service_dir in "$services_dir"/*; do
            if [[ -d "$service_dir" ]]; then
                local service_name=$(basename "$service_dir")
                local coverage_file="${service_dir}/coverage/coverage-summary.json"
                
                if [[ -f "$coverage_file" ]]; then
                    local branches=$(jq -r '.total.branches.pct // 0' "$coverage_file")
                    local functions=$(jq -r '.total.functions.pct // 0' "$coverage_file")
                    local lines=$(jq -r '.total.lines.pct // 0' "$coverage_file")
                    local statements=$(jq -r '.total.statements.pct // 0' "$coverage_file")
                    
                    local service_avg=$(echo "scale=2; ($branches + $functions + $lines + $statements) / 4" | bc)
                    local status_class="status-pass"
                    local status_text="PASS"
                    
                    if (( $(echo "$service_avg < $MIN_COVERAGE" | bc -l) )); then
                        status_class="status-fail"
                        status_text="FAIL"
                    fi
                    
                    html_content+="
                <tr>
                    <td>$service_name</td>
                    <td>${branches}%</td>
                    <td>${functions}%</td>
                    <td>${lines}%</td>
                    <td>${statements}%</td>
                    <td class=\"$status_class\">$status_text</td>
                </tr>"
                fi
            fi
        done
    fi
    
    html_content+="
            </tbody>
        </table>
    </div>
</body>
</html>"
    
    echo "$html_content" > "${HTML_REPORT_DIR}/index.html"
    log_success "HTML report generated: ${HTML_REPORT_DIR}/index.html"
}

# Generar reporte JSON
generate_json_report() {
    log_info "Generating JSON coverage report..."
    
    local json_content="{
  \"timestamp\": \"$(date -Iseconds)\",
  \"summary\": {
    \"totalCoverage\": $TOTAL_COVERAGE,
    \"branches\": $BRANCHES_COVERAGE,
    \"functions\": $FUNCTIONS_COVERAGE,
    \"lines\": $LINES_COVERAGE,
    \"statements\": $STATEMENTS_COVERAGE
  },
  \"thresholds\": {
    \"minimum\": $MIN_COVERAGE,
    \"branches\": $MIN_BRANCHES,
    \"functions\": $MIN_FUNCTIONS,
    \"lines\": $MIN_LINES,
    \"statements\": $MIN_STATEMENTS
  },
  \"passed\": $([[ "$COVERAGE_PASSED" == true ]] && echo "true" || echo "false"),
  \"services\": ["
    
    local first=true
    local services_dir="${PROJECT_ROOT}/services"
    
    if [[ -d "$services_dir" ]]; then
        for service_dir in "$services_dir"/*; do
            if [[ -d "$service_dir" ]]; then
                local service_name=$(basename "$service_dir")
                local coverage_file="${service_dir}/coverage/coverage-summary.json"
                
                if [[ -f "$coverage_file" ]]; then
                    [[ "$first" == true ]] || json_content+=","
                    first=false
                    
                    local branches=$(jq -r '.total.branches.pct // 0' "$coverage_file")
                    local functions=$(jq -r '.total.functions.pct // 0' "$coverage_file")
                    local lines=$(jq -r '.total.lines.pct // 0' "$coverage_file")
                    local statements=$(jq -r '.total.statements.pct // 0' "$coverage_file")
                    
                    json_content+="
    {
      \"name\": \"$service_name\",
      \"branches\": $branches,
      \"functions\": $functions,
      \"lines\": $lines,
      \"statements\": $statements
    }"
                fi
            fi
        done
    fi
    
    json_content+="
  ]
}"
    
    echo "$json_content" > "$JSON_REPORT"
    log_success "JSON report generated: $JSON_REPORT"
}

################################################################################
# Función principal
################################################################################

main() {
    print_banner
    
    echo "Timestamp: $(date)" | tee -a "$REPORT_FILE"
    echo "Minimum Coverage Threshold: ${MIN_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    
    # Verificar dependencias
    check_node
    check_jest
    
    echo "" | tee -a "$REPORT_FILE"
    
    # Buscar reportes de cobertura existentes
    log_info "Searching for existing coverage reports..."
    
    local found_coverage=false
    local coverage_files=()
    
    # Buscar en directorios de servicios
    for service_dir in "${PROJECT_ROOT}/services"/*; do
        if [[ -d "$service_dir" ]]; then
            local coverage_file="${service_dir}/coverage/coverage-summary.json"
            if [[ -f "$coverage_file" ]]; then
                coverage_files+=("$coverage_file")
                found_coverage=true
            fi
        fi
    done
    
    # Buscar en directorio de testing
    if [[ -d "${PROJECT_ROOT}/testing/coverage" ]]; then
        for coverage_file in "${PROJECT_ROOT}/testing/coverage"/*/coverage-summary.json; do
            if [[ -f "$coverage_file" ]]; then
                coverage_files+=("$coverage_file")
                found_coverage=true
            fi
        done
    fi
    
    if [[ "$found_coverage" == true ]]; then
        log_success "Found ${#coverage_files[@]} coverage report(s)"
        
        # Extraer cobertura del primer reporte (o combinar múltiples)
        if [[ ${#coverage_files[@]} -gt 0 ]]; then
            extract_coverage "${coverage_files[0]}"
        fi
        
        # Si hay múltiples reportes, calcular promedio
        if [[ ${#coverage_files[@]} -gt 1 ]]; then
            log_info "Combining coverage from multiple sources..."
            
            local total_branches=0
            local total_functions=0
            local total_lines=0
            local total_statements=0
            
            for file in "${coverage_files[@]}"; do
                total_branches=$(echo "$total_branches + $(jq -r '.total.branches.pct // 0' "$file")" | bc)
                total_functions=$(echo "$total_functions + $(jq -r '.total.functions.pct // 0' "$file")" | bc)
                total_lines=$(echo "$total_lines + $(jq -r '.total.lines.pct // 0' "$file")" | bc)
                total_statements=$(echo "$total_statements + $(jq -r '.total.statements.pct // 0' "$file")" | bc)
            done
            
            local count=${#coverage_files[@]}
            BRANCHES_COVERAGE=$(echo "scale=2; $total_branches / $count" | bc)
            FUNCTIONS_COVERAGE=$(echo "scale=2; $total_functions / $count" | bc)
            LINES_COVERAGE=$(echo "scale=2; $total_lines / $count" | bc)
            STATEMENTS_COVERAGE=$(echo "scale=2; $total_statements / $count" | bc)
            TOTAL_COVERAGE=$(echo "scale=2; ($BRANCHES_COVERAGE + $FUNCTIONS_COVERAGE + $LINES_COVERAGE + $STATEMENTS_COVERAGE) / 4" | bc)
        fi
    else
        log_warn "No coverage reports found. Run tests with --coverage first."
        
        # Intentar ejecutar tests con cobertura
        log_info "Attempting to run tests with coverage..."
        
        # Unit tests
        if [[ -f "${PROJECT_ROOT}/testing/jest.config.unit.js" ]]; then
            run_tests_with_coverage "unit" "${PROJECT_ROOT}/testing/jest.config.unit.js"
        fi
        
        # Integration tests
        if [[ -f "${PROJECT_ROOT}/testing/jest.config.integration.js" ]]; then
            run_tests_with_coverage "integration" "${PROJECT_ROOT}/testing/jest.config.integration.js"
        fi
        
        # Rebuscar reportes
        for service_dir in "${PROJECT_ROOT}/services"/*; do
            if [[ -d "$service_dir" ]]; then
                local coverage_file="${service_dir}/coverage/coverage-summary.json"
                if [[ -f "$coverage_file" ]]; then
                    extract_coverage "$coverage_file"
                    break
                fi
            fi
        done
    fi
    
    echo "" | tee -a "$REPORT_FILE"
    
    # Verificar cobertura mínima
    print_header "COVERAGE VERIFICATION"
    
    check_minimum_coverage "Branches" "$BRANCHES_COVERAGE" "$MIN_BRANCHES"
    check_minimum_coverage "Functions" "$FUNCTIONS_COVERAGE" "$MIN_FUNCTIONS"
    check_minimum_coverage "Lines" "$LINES_COVERAGE" "$MIN_LINES"
    check_minimum_coverage "Statements" "$STATEMENTS_COVERAGE" "$MIN_STATEMENTS"
    check_minimum_coverage "Total" "$TOTAL_COVERAGE" "$MIN_COVERAGE"
    
    echo "" | tee -a "$REPORT_FILE"
    
    # Generar reporte por servicio
    generate_service_coverage
    
    # Generar reportes
    generate_html_report
    generate_json_report
    
    # Reporte final
    print_header "COVERAGE SUMMARY"
    
    log_section "Overall Coverage Metrics:"
    echo "  Total Coverage: ${TOTAL_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "  Branches:       ${BRANCHES_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "  Functions:      ${FUNCTIONS_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "  Lines:          ${LINES_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "  Statements:     ${STATEMENTS_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    
    log_section "Minimum Thresholds:"
    echo "  Total:      ${MIN_COVERAGE}%" | tee -a "$REPORT_FILE"
    echo "  Branches:   ${MIN_BRANCHES}%" | tee -a "$REPORT_FILE"
    echo "  Functions:  ${MIN_FUNCTIONS}%" | tee -a "$REPORT_FILE"
    echo "  Lines:      ${MIN_LINES}%" | tee -a "$REPORT_FILE"
    echo "  Statements: ${MIN_STATEMENTS}%" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    
    log_section "Generated Reports:"
    echo "  Text Report:  $REPORT_FILE" | tee -a "$REPORT_FILE"
    echo "  JSON Report:  $JSON_REPORT" | tee -a "$REPORT_FILE"
    echo "  HTML Report:  ${HTML_REPORT_DIR}/index.html" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    
    if [[ "$COVERAGE_PASSED" == true ]]; then
        log_success "✅ COVERAGE CHECK PASSED - All metrics meet minimum threshold of ${MIN_COVERAGE}%"
        exit 0
    else
        log_error "❌ COVERAGE CHECK FAILED - Some metrics are below minimum threshold of ${MIN_COVERAGE}%"
        exit 1
    fi
}

# Manejar argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --threshold)
            MIN_COVERAGE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --threshold N    Set minimum coverage threshold (default: 70)"
            echo "  --help, -h       Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  MIN_COVERAGE     Minimum coverage percentage (default: 70)"
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
