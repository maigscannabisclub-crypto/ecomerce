#!/bin/bash
# =============================================================================
# VERIFICATION SCRIPT - E-COMMERCE PLATFORM
# Verifica que todo esté listo para despliegue
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# =============================================================================
# FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

print_header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     E-COMMERCE PLATFORM - DEPLOYMENT VERIFICATION              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
}

print_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    if [ $ERRORS -eq 0 ]; then
        echo -e "║  ${GREEN}✅ ALL CHECKS PASSED - READY FOR DEPLOYMENT${NC}              ║"
    else
        echo -e "║  ${RED}❌ SOME CHECKS FAILED - FIX BEFORE DEPLOYING${NC}             ║"
    fi
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Summary:"
    echo "  Errors: $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""
    
    if [ $ERRORS -eq 0 ]; then
        echo "Next steps:"
        echo "  1. Run: ./scripts/setup-gcp.sh"
        echo "  2. Or follow manual steps in DEPLOY_GCP.md"
        echo ""
        exit 0
    else
        echo "Please fix the errors above before deploying."
        echo ""
        exit 1
    fi
}

# =============================================================================
# CHECKS
# =============================================================================

check_dockerfiles() {
    log_info "Checking Dockerfiles..."
    
    local services=("api-gateway" "auth-service" "product-service" "cart-service" "order-service" "inventory-service" "reporting-service")
    
    for svc in "${services[@]}"; do
        local dockerfile="services/$svc/Dockerfile"
        if [ ! -f "$dockerfile" ]; then
            log_error "Dockerfile not found: $dockerfile"
            continue
        fi
        
        # Check Node.js 20
        if grep -q "FROM node:20" "$dockerfile"; then
            log_success "$svc uses Node.js 20"
        else
            log_error "$svc does not use Node.js 20"
        fi
        
        # Check health check
        if grep -q "HEALTHCHECK" "$dockerfile"; then
            log_success "$svc has HEALTHCHECK"
        else
            log_warn "$svc missing HEALTHCHECK"
        fi
        
        # Check dumb-init
        if grep -q "dumb-init" "$dockerfile"; then
            log_success "$svc uses dumb-init"
        else
            log_warn "$svc missing dumb-init"
        fi
    done
}

check_docker_compose() {
    log_info "Checking docker-compose.yml..."
    
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml not found"
        return
    fi
    
    # Check services defined
    local services_count
    services_count=$(grep -c "^  [a-z-]*:$" docker-compose.yml || true)
    
    if [ "$services_count" -ge 10 ]; then
        log_success "docker-compose.yml has $services_count services defined"
    else
        log_warn "docker-compose.yml may be missing services (found $services_count)"
    fi
    
    # Check health checks
    if grep -q "healthcheck:" docker-compose.yml; then
        log_success "docker-compose.yml has health checks"
    else
        log_warn "docker-compose.yml missing health checks"
    fi
}

check_terraform() {
    log_info "Checking Terraform configuration..."
    
    if [ ! -d "infra/terraform" ]; then
        log_error "infra/terraform directory not found"
        return
    fi
    
    local tf_files=("main.tf" "variables.tf" "databases.tf" "gke.tf" "artifacts.tf" "outputs.tf")
    
    for file in "${tf_files[@]}"; do
        if [ -f "infra/terraform/$file" ]; then
            log_success "Terraform file exists: $file"
        else
            log_error "Terraform file missing: $file"
        fi
    done
    
    # Check terraform.tfvars.example
    if [ -f "infra/terraform/terraform.tfvars.example" ]; then
        log_success "terraform.tfvars.example exists"
    else
        log_warn "terraform.tfvars.example missing"
    fi
}

check_kubernetes() {
    log_info "Checking Kubernetes manifests..."
    
    if [ ! -d "infra/k8s/base" ]; then
        log_error "infra/k8s/base directory not found"
        return
    fi
    
    local k8s_files=("namespace.yaml" "serviceaccount.yaml" "configmap.yaml" "secrets.yaml" "ingress.yaml" "kustomization.yaml")
    
    for file in "${k8s_files[@]}"; do
        if [ -f "infra/k8s/base/$file" ]; then
            log_success "K8s manifest exists: $file"
        else
            log_error "K8s manifest missing: $file"
        fi
    done
    
    # Check deployments
    local deployments=("api-gateway" "auth-service" "product-service" "cart-service" "order-service" "inventory-service" "reporting-service")
    
    for dep in "${deployments[@]}"; do
        if [ -f "infra/k8s/base/deployments/$dep.yaml" ]; then
            log_success "Deployment manifest exists: $dep.yaml"
        else
            log_error "Deployment manifest missing: $dep.yaml"
        fi
    done
}

check_cloud_build() {
    log_info "Checking Cloud Build configuration..."
    
    if [ -f "infra/cloud-build/cloudbuild.yaml" ]; then
        log_success "cloudbuild.yaml exists"
    else
        log_error "cloudbuild.yaml not found"
        return
    fi
    
    # Check for key stages
    if grep -q "install-and-test" infra/cloud-build/cloudbuild.yaml; then
        log_success "Cloud Build has test stages"
    else
        log_warn "Cloud Build may be missing test stages"
    fi
    
    if grep -q "docker push" infra/cloud-build/cloudbuild.yaml; then
        log_success "Cloud Build has push stage"
    else
        log_warn "Cloud Build may be missing push stage"
    fi
}

check_scripts() {
    log_info "Checking utility scripts..."
    
    local scripts=("setup.sh" "start.sh" "test.sh" "health-check.sh" "setup-gcp.sh" "verify-deployment.sh")
    
    for script in "${scripts[@]}"; do
        if [ -f "scripts/$script" ]; then
            if [ -x "scripts/$script" ]; then
                log_success "Script exists and is executable: $script"
            else
                log_warn "Script exists but not executable: $script"
            fi
        else
            log_warn "Script missing: $script"
        fi
    done
}

check_documentation() {
    log_info "Checking documentation..."
    
    local docs=("README.md" "DEPLOY_GCP.md" "AUDIT_REPORT.md" "OPTIMIZATION_SUMMARY.md" ".env.example")
    
    for doc in "${docs[@]}"; do
        if [ -f "$doc" ]; then
            log_success "Documentation exists: $doc"
        else
            log_warn "Documentation missing: $doc"
        fi
    done
}

check_init_scripts() {
    log_info "Checking database init scripts..."
    
    if [ -d "init-scripts/postgres-auth" ] && [ -f "init-scripts/postgres-auth/01-init.sql" ]; then
        log_success "PostgreSQL auth init script exists"
    else
        log_warn "PostgreSQL auth init script missing"
    fi
    
    if [ -d "init-scripts/postgres-product" ] && [ -f "init-scripts/postgres-product/01-init.sql" ]; then
        log_success "PostgreSQL product init script exists"
    else
        log_warn "PostgreSQL product init script missing"
    fi
}

check_rabbitmq_config() {
    log_info "Checking RabbitMQ configuration..."
    
    if [ -f "rabbitmq/rabbitmq.conf" ]; then
        log_success "rabbitmq.conf exists"
    else
        log_warn "rabbitmq.conf missing"
    fi
    
    if [ -f "rabbitmq/definitions.json" ]; then
        log_success "definitions.json exists"
    else
        log_warn "definitions.json missing"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    print_header
    
    cd "$(dirname "$0")/.." || exit 1
    
    check_dockerfiles
    check_docker_compose
    check_terraform
    check_kubernetes
    check_cloud_build
    check_scripts
    check_documentation
    check_init_scripts
    check_rabbitmq_config
    
    print_summary
}

main "$@"
