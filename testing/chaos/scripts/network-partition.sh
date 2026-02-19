#!/bin/bash
#
# Network Partition Script for Chaos Engineering
# Script para simular partición de red entre servicios
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="${NAMESPACE:-ecommerce}"
DURATION="${DURATION:-120}"
DIRECTION="${DIRECTION:-both}"

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

# Show usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] <service-a> <service-b>

Simulate network partition between two services in Kubernetes.

OPTIONS:
    -n, --namespace     Kubernetes namespace (default: ecommerce)
    -d, --duration      Duration of partition in seconds (default: 120)
    --direction         Direction of partition: both, ingress, egress (default: both)
    -h, --help          Show this help message

EXAMPLES:
    # Partition between order-service and inventory-service
    $0 order-service inventory-service

    # Partition for 60 seconds
    $0 -d 60 order-service inventory-service

    # One-way partition (only block from A to B)
    $0 --direction egress order-service inventory-service

EOF
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -d|--duration)
                DURATION="$2"
                shift 2
                ;;
            --direction)
                DIRECTION="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                break
                ;;
        esac
    done

    if [[ $# -lt 2 ]]; then
        log_error "Two service names are required"
        usage
        exit 1
    fi

    SERVICE_A="$1"
    SERVICE_B="$2"
}

# Verify prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get pod IPs
get_pod_ips() {
    local service="$1"
    
    kubectl get pods -n "$NAMESPACE" -l app="$service" \
        -o jsonpath='{.items[*].status.podIP}' 2>/dev/null || echo ""
}

# Get service cluster IP
get_service_ip() {
    local service="$1"
    
    kubectl get service "$service" -n "$NAMESPACE" \
        -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo ""
}

# Apply network policy for partition
apply_partition() {
    local from_service="$1"
    local to_service="$2"
    local policy_name="chaos-partition-${from_service}-${to_service}"

    log_info "Creating network partition from $from_service to $to_service"

    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: $policy_name
  namespace: $NAMESPACE
  labels:
    chaos-experiment: network-partition
    from-service: $from_service
    to-service: $to_service
spec:
  podSelector:
    matchLabels:
      app: $to_service
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: $from_service
      action: Deny
EOF

    log_success "Network partition applied: $policy_name"
}

# Apply egress partition
apply_egress_partition() {
    local from_service="$1"
    local to_service="$2"
    local policy_name="chaos-partition-egress-${from_service}-${to_service}"

    log_info "Creating egress partition from $from_service to $to_service"

    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: $policy_name
  namespace: $NAMESPACE
  labels:
    chaos-experiment: network-partition
    from-service: $from_service
    to-service: $to_service
    direction: egress
spec:
  podSelector:
    matchLabels:
      app: $from_service
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: $to_service
      action: Deny
EOF

    log_success "Egress partition applied: $policy_name"
}

# Remove network partition
remove_partition() {
    local from_service="$1"
    local to_service="$2"
    
    log_info "Removing network partition..."

    # Remove ingress policy
    kubectl delete networkpolicy -n "$NAMESPACE" \
        -l chaos-experiment=network-partition \
        --ignore-not-found=true

    log_success "Network partition removed"
}

# Verify partition is working
verify_partition() {
    local service_a="$1"
    local service_b="$2"

    log_info "Verifying network partition..."

    # Get a pod from service A
    local pod_a=$(kubectl get pods -n "$NAMESPACE" -l app="$service_a" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [[ -z "$pod_a" ]]; then
        log_warning "Could not find pod for service $service_a"
        return 1
    fi

    # Get service B cluster IP
    local service_b_ip=$(get_service_ip "$service_b")

    if [[ -z "$service_b_ip" ]]; then
        log_warning "Could not get IP for service $service_b"
        return 1
    fi

    log_info "Testing connectivity from $pod_a to $service_b ($service_b_ip)"

    # Try to connect
    if kubectl exec "$pod_a" -n "$NAMESPACE" -- \\
        wget -q --timeout=5 "http://$service_b_ip:3000/health" -O - 2>/dev/null; then
        log_error "Partition is NOT working - connection succeeded"
        return 1
    else
        log_success "Partition is working - connection blocked"
        return 0
    fi
}

# Monitor system during partition
monitor_system() {
    local duration="$1"
    
    log_info "Monitoring system for ${duration} seconds..."
    log_info "Press Ctrl+C to stop early"

    local end_time=$(($(date +%s) + duration))

    while [[ $(date +%s) -lt $end_time ]]; do
        local remaining=$((end_time - $(date +%s)))
        echo -ne "\r${BLUE}[MONITOR]${NC} Time remaining: ${remaining}s    "
        
        # Check pod status
        kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | while read line; do
            local status=$(echo "$line" | awk '{print $3}')
            if [[ "$status" != "Running" && "$status" != "Completed" ]]; then
                echo -e "\n${YELLOW}[WARNING]${NC} Pod not running: $line"
            fi
        done

        sleep 5
    done

    echo -e "\n"
}

# Main execution
main() {
    parse_args "$@"
    
    log_info "Starting network partition experiment"
    log_info "Namespace: $NAMESPACE"
    log_info "Services: $SERVICE_A <-> $SERVICE_B"
    log_info "Duration: ${DURATION}s"
    log_info "Direction: $DIRECTION"

    check_prerequisites

    # Show current state
    log_info "Current pod status:"
    kubectl get pods -n "$NAMESPACE" -l "app in ($SERVICE_A, $SERVICE_B)"

    # Apply partition based on direction
    case "$DIRECTION" in
        both)
            apply_partition "$SERVICE_A" "$SERVICE_B"
            apply_partition "$SERVICE_B" "$SERVICE_A"
            ;;
        ingress)
            apply_partition "$SERVICE_B" "$SERVICE_A"
            ;;
        egress)
            apply_egress_partition "$SERVICE_A" "$SERVICE_B"
            ;;
        *)
            log_error "Invalid direction: $DIRECTION"
            exit 1
            ;;
    esac

    # Wait for partition to take effect
    log_info "Waiting for partition to take effect..."
    sleep 5

    # Verify partition
    if ! verify_partition "$SERVICE_A" "$SERVICE_B"; then
        log_warning "Partition verification failed, but continuing..."
    fi

    # Monitor during partition
    monitor_system "$DURATION"

    # Cleanup
    log_info "Cleaning up..."
    remove_partition "$SERVICE_A" "$SERVICE_B"

    # Wait for recovery
    log_info "Waiting for network recovery..."
    sleep 10

    # Verify recovery
    log_info "Verifying recovery..."
    if verify_partition "$SERVICE_A" "$SERVICE_B"; then
        log_error "Partition still active after cleanup!"
        exit 1
    else
        log_success "Network partition removed successfully"
    fi

    # Show final state
    log_info "Final pod status:"
    kubectl get pods -n "$NAMESPACE" -l "app in ($SERVICE_A, $SERVICE_B)"

    log_success "Network partition experiment completed"
}

# Run main function
trap 'log_info "Interrupted by user"; remove_partition "$SERVICE_A" "$SERVICE_B" 2>/dev/null; exit 130' INT TERM
main "$@"
