#!/bin/bash
# Health Check Aggregator Script
# Checks the health of all observability services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service endpoints
PROMETHEUS_URL="http://prometheus:9090"
GRAFANA_URL="http://grafana:3000"
LOKI_URL="http://loki:3100"
JAEGER_URL="http://jaeger:16686"
ALERTMANAGER_URL="http://alertmanager:9093"

# Health check functions
check_prometheus() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${PROMETHEUS_URL}/-/healthy" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓${NC} Prometheus: Healthy"
        return 0
    else
        echo -e "${RED}✗${NC} Prometheus: Unhealthy (HTTP $status)"
        return 1
    fi
}

check_grafana() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${GRAFANA_URL}/api/health" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓${NC} Grafana: Healthy"
        return 0
    else
        echo -e "${RED}✗${NC} Grafana: Unhealthy (HTTP $status)"
        return 1
    fi
}

check_loki() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${LOKI_URL}/ready" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓${NC} Loki: Healthy"
        return 0
    else
        echo -e "${RED}✗${NC} Loki: Unhealthy (HTTP $status)"
        return 1
    fi
}

check_jaeger() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${JAEGER_URL}/" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓${NC} Jaeger: Healthy"
        return 0
    else
        echo -e "${RED}✗${NC} Jaeger: Unhealthy (HTTP $status)"
        return 1
    fi
}

check_alertmanager() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${ALERTMANAGER_URL}/-/healthy" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓${NC} Alertmanager: Healthy"
        return 0
    else
        echo -e "${RED}✗${NC} Alertmanager: Unhealthy (HTTP $status)"
        return 1
    fi
}

# Get detailed metrics
detailed_check() {
    echo ""
    echo "=== Detailed Health Check ==="
    echo ""
    
    # Prometheus targets
    echo "Prometheus Targets:"
    curl -s "${PROMETHEUS_URL}/api/v1/targets" 2>/dev/null | jq -r '.data.activeTargets[] | "  - \(.labels.job): \(.health)"' 2>/dev/null || echo "  Unable to fetch targets"
    
    echo ""
    
    # Alertmanager status
    echo "Alertmanager Status:"
    curl -s "${ALERTMANAGER_URL}/api/v2/status" 2>/dev/null | jq -r '.cluster.status // "  Unknown"' 2>/dev/null || echo "  Unable to fetch status"
    
    echo ""
    
    # Loki ready status
    echo "Loki Ready Status:"
    curl -s "${LOKI_URL}/ready" 2>/dev/null || echo "  Not ready"
}

# Main execution
main() {
    local failed=0
    
    echo "========================================"
    echo "  Observability Health Check"
    echo "  $(date)"
    echo "========================================"
    echo ""
    
    # Check all services
    check_prometheus || ((failed++))
    check_grafana || ((failed++))
    check_loki || ((failed++))
    check_jaeger || ((failed++))
    check_alertmanager || ((failed++))
    
    echo ""
    
    # Show detailed info if requested
    if [ "$1" = "--detailed" ] || [ "$1" = "-d" ]; then
        detailed_check
    fi
    
    # Summary
    echo "========================================"
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}All services are healthy!${NC}"
        exit 0
    else
        echo -e "${RED}$failed service(s) are unhealthy${NC}"
        exit 1
    fi
}

# Run main function
main "$@"
