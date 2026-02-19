#!/bin/bash
#
# Main Test Runner Script
# Script principal para ejecutar todos los tests
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$TEST_DIR")"
COVERAGE_DIR="$TEST_DIR/coverage"
REPORTS_DIR="$TEST_DIR/reports"

# Test results
TESTS_FAILED=0
TESTS_PASSED=0
TESTS_SKIPPED=0

# Functions
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

log_section() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

# Show usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] [TEST_TYPES]

Run tests for the e-commerce platform.

TEST_TYPES:
    unit            Run unit tests
    integration     Run integration tests
    contract        Run contract tests
    e2e             Run end-to-end tests
    load            Run load tests
    chaos           Run chaos tests
    coverage        Generate coverage report
    all             Run all tests (default)

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -c, --coverage          Generate coverage report
    -w, --watch             Run tests in watch mode
    -f, --fail-fast         Stop on first failure
    --ci                    CI mode (no interactive prompts)
    --parallel              Run tests in parallel
    --report                Generate HTML report

EXAMPLES:
    # Run all tests
    $0

    # Run only unit tests
    $0 unit

    # Run unit and integration tests with coverage
    $0 -c unit integration

    # Run all tests in CI mode
    $0 --ci all

EOF
}

# Parse arguments
parse_args() {
    VERBOSE=false
    COVERAGE=false
    WATCH=false
    FAIL_FAST=false
    CI_MODE=false
    PARALLEL=false
    GENERATE_REPORT=false
    TEST_TYPES=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -f|--fail-fast)
                FAIL_FAST=true
                shift
                ;;
            --ci)
                CI_MODE=true
                shift
                ;;
            --parallel)
                PARALLEL=true
                shift
                ;;
            --report)
                GENERATE_REPORT=true
                shift
                ;;
            unit|integration|contract|e2e|load|chaos|coverage|all)
                TEST_TYPES+=("$1")
                shift
                ;;
            *)
                log_error "Unknown option or test type: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Default to all tests if none specified
    if [[ ${#TEST_TYPES[@]} -eq 0 ]]; then
        TEST_TYPES=("all")
    fi
}

# Setup environment
setup_environment() {
    log_section "Setting up test environment"

    # Create directories
    mkdir -p "$COVERAGE_DIR"
    mkdir -p "$REPORTS_DIR"

    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_VERSION" -lt 18 ]]; then
        log_error "Node.js 18+ is required"
        exit 1
    fi

    log_info "Node.js version: $(node -v)"
    log_info "NPM version: $(npm -v)"

    # Install dependencies if needed
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_info "Installing dependencies..."
        cd "$PROJECT_ROOT" && npm ci
    fi

    log_success "Environment setup complete"
}

# Run unit tests
run_unit_tests() {
    log_section "Running Unit Tests"

    cd "$PROJECT_ROOT"

    local cmd="npm run test:unit"
    
    if [[ "$COVERAGE" == true ]]; then
        cmd="$cmd -- --coverage"
    fi

    if [[ "$WATCH" == true ]]; then
        cmd="$cmd -- --watch"
    fi

    if [[ "$VERBOSE" == true ]]; then
        cmd="$cmd -- --verbose"
    fi

    log_info "Command: $cmd"

    if eval "$cmd"; then
        log_success "Unit tests passed"
        ((TESTS_PASSED++))
    else
        log_error "Unit tests failed"
        ((TESTS_FAILED++))
        if [[ "$FAIL_FAST" == true ]]; then
            exit 1
        fi
    fi
}

# Run integration tests
run_integration_tests() {
    log_section "Running Integration Tests"

    cd "$PROJECT_ROOT"

    # Start test infrastructure
    log_info "Starting test infrastructure..."
    docker-compose -f "$TEST_DIR/docker-compose.test.yml" up -d postgres-test redis-test rabbitmq-test

    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10

    local cmd="npm run test:integration"
    
    if [[ "$COVERAGE" == true ]]; then
        cmd="$cmd -- --coverage"
    fi

    if [[ "$VERBOSE" == true ]]; then
        cmd="$cmd -- --verbose"
    fi

    log_info "Command: $cmd"

    if eval "$cmd"; then
        log_success "Integration tests passed"
        ((TESTS_PASSED++))
    else
        log_error "Integration tests failed"
        ((TESTS_FAILED++))
        if [[ "$FAIL_FAST" == true ]]; then
            docker-compose -f "$TEST_DIR/docker-compose.test.yml" down
            exit 1
        fi
    fi

    # Stop test infrastructure
    docker-compose -f "$TEST_DIR/docker-compose.test.yml" down
}

# Run contract tests
run_contract_tests() {
    log_section "Running Contract Tests"

    cd "$PROJECT_ROOT"

    # Start Pact Broker if not running
    if ! docker ps | grep -q "pact-broker"; then
        log_info "Starting Pact Broker..."
        docker-compose -f "$TEST_DIR/docker-compose.test.yml" up -d pact-broker
        sleep 5
    fi

    local cmd="npm run test:contract"
    
    if [[ "$VERBOSE" == true ]]; then
        cmd="$cmd -- --verbose"
    fi

    log_info "Command: $cmd"

    if eval "$cmd"; then
        log_success "Contract tests passed"
        ((TESTS_PASSED++))
    else
        log_error "Contract tests failed"
        ((TESTS_FAILED++))
        if [[ "$FAIL_FAST" == true ]]; then
            exit 1
        fi
    fi
}

# Run E2E tests
run_e2e_tests() {
    log_section "Running E2E Tests"

    cd "$PROJECT_ROOT"

    # Check if Cypress is installed
    if ! command -v npx &> /dev/null || ! npx cypress verify &> /dev/null; then
        log_warning "Cypress not installed, skipping E2E tests"
        ((TESTS_SKIPPED++))
        return 0
    fi

    local cmd="npm run test:e2e"
    
    if [[ "$CI_MODE" == true ]]; then
        cmd="$cmd -- --headless"
    fi

    log_info "Command: $cmd"

    if eval "$cmd"; then
        log_success "E2E tests passed"
        ((TESTS_PASSED++))
    else
        log_error "E2E tests failed"
        ((TESTS_FAILED++))
        if [[ "$FAIL_FAST" == true ]]; then
            exit 1
        fi
    fi
}

# Run load tests
run_load_tests() {
    log_section "Running Load Tests"

    # Check if Artillery is installed
    if ! command -v artillery &> /dev/null; then
        log_warning "Artillery not installed, skipping load tests"
        ((TESTS_SKIPPED++))
        return 0
    fi

    cd "$TEST_DIR/load"

    log_info "Running browse products scenario..."
    if artillery run scenarios/browse-products.yml; then
        log_success "Browse products load test passed"
    else
        log_error "Browse products load test failed"
        ((TESTS_FAILED++))
    fi

    log_info "Running create order scenario..."
    if artillery run scenarios/create-order.yml; then
        log_success "Create order load test passed"
    else
        log_error "Create order load test failed"
        ((TESTS_FAILED++))
    fi

    ((TESTS_PASSED++))
}

# Run chaos tests
run_chaos_tests() {
    log_section "Running Chaos Tests"

    # Check if Chaos Mesh or similar is available
    if ! command -v kubectl &> /dev/null; then
        log_warning "kubectl not installed, skipping chaos tests"
        ((TESTS_SKIPPED++))
        return 0
    fi

    cd "$TEST_DIR/chaos"

    log_info "Running network partition experiment..."
    if bash scripts/network-partition.sh order-service inventory-service -d 60; then
        log_success "Network partition test passed"
    else
        log_error "Network partition test failed"
        ((TESTS_FAILED++))
    fi

    ((TESTS_PASSED++))
}

# Generate coverage report
generate_coverage_report() {
    log_section "Generating Coverage Report"

    cd "$PROJECT_ROOT"

    # Merge coverage reports
    log_info "Merging coverage reports..."
    node "$TEST_DIR/coverage/merge-reports.js"

    # Generate HTML report
    log_info "Generating HTML report..."
    npx nyc report --reporter=html --reporter=text-summary --reporter=lcov

    # Check coverage thresholds
    log_info "Checking coverage thresholds..."
    
    local coverage_file="$COVERAGE_DIR/coverage-summary.json"
    
    if [[ -f "$coverage_file" ]]; then
        local lines=$(cat "$coverage_file" | grep -o '"lines":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' | grep -o '"pct":[0-9.]*' | cut -d':' -f2)
        local functions=$(cat "$coverage_file" | grep -o '"functions":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' | grep -o '"pct":[0-9.]*' | cut -d':' -f2)
        local branches=$(cat "$coverage_file" | grep -o '"branches":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' | grep -o '"pct":[0-9.]*' | cut -d':' -f2)
        local statements=$(cat "$coverage_file" | grep -o '"statements":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' | grep -o '"pct":[0-9.]*' | cut -d':' -f2)

        log_info "Coverage Results:"
        echo "  Lines:      ${lines}%"
        echo "  Functions:  ${functions}%"
        echo "  Branches:   ${branches}%"
        echo "  Statements: ${statements}%"

        # Check if coverage meets threshold (70%)
        local threshold=70
        local failed=false

        if (( $(echo "$lines < $threshold" | bc -l) )); then
            log_error "Lines coverage ($lines%) is below threshold ($threshold%)"
            failed=true
        fi

        if (( $(echo "$functions < $threshold" | bc -l) )); then
            log_error "Functions coverage ($functions%) is below threshold ($threshold%)"
            failed=true
        fi

        if [[ "$failed" == true ]]; then
            exit 1
        fi

        log_success "Coverage meets minimum threshold of $threshold%"
    else
        log_warning "Coverage summary not found"
    fi

    log_success "Coverage report generated at $COVERAGE_DIR"
}

# Generate HTML report
generate_html_report() {
    log_section "Generating HTML Test Report"

    local report_file="$REPORTS_DIR/test-report-$(date +%Y%m%d-%H%M%S).html"

    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Test Report - E-Commerce Platform</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        .summary { margin: 20px 0; padding: 20px; background: #f5f5f5; border-radius: 5px; }
        .passed { color: green; }
        .failed { color: red; }
        .skipped { color: orange; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #4CAF50; color: white; }
    </style>
</head>
<body>
    <h1>Test Report - E-Commerce Platform</h1>
    <p>Generated: $(date)</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <p class="passed">Passed: $TESTS_PASSED</p>
        <p class="failed">Failed: $TESTS_FAILED</p>
        <p class="skipped">Skipped: $TESTS_SKIPPED</p>
    </div>
</body>
</html>
EOF

    log_success "HTML report generated: $report_file"
}

# Print final summary
print_summary() {
    log_section "Test Summary"

    echo -e "${GREEN}Passed:  $TESTS_PASSED${NC}"
    echo -e "${RED}Failed:  $TESTS_FAILED${NC}"
    echo -e "${YELLOW}Skipped: $TESTS_SKIPPED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Some tests failed!"
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

# Main execution
main() {
    parse_args "$@"

    log_section "E-Commerce Platform Test Runner"

    setup_environment

    # Run requested tests
    for test_type in "${TEST_TYPES[@]}"; do
        case "$test_type" in
            unit)
                run_unit_tests
                ;;
            integration)
                run_integration_tests
                ;;
            contract)
                run_contract_tests
                ;;
            e2e)
                run_e2e_tests
                ;;
            load)
                run_load_tests
                ;;
            chaos)
                run_chaos_tests
                ;;
            coverage)
                generate_coverage_report
                ;;
            all)
                run_unit_tests
                run_integration_tests
                run_contract_tests
                run_e2e_tests
                if [[ "$COVERAGE" == true ]]; then
                    generate_coverage_report
                fi
                ;;
        esac
    done

    if [[ "$GENERATE_REPORT" == true ]]; then
        generate_html_report
    fi

    print_summary
}

# Run main function
trap 'log_error "Test runner interrupted"; exit 130' INT TERM
main "$@"
