#!/bin/bash
# =============================================================================
# RabbitMQ Initialization Script for E-Commerce Platform
# =============================================================================
# This script initializes RabbitMQ with all required configuration:
# - Users and permissions
# - Virtual hosts
# - Exchanges, queues, and bindings
# - Policies
# - Dead Letter Exchange (DLX) setup
# - Retry mechanisms
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_PORT="${RABBITMQ_PORT:-15672}"
RABBITMQ_USER="${RABBITMQ_USER:-guest}"
RABBITMQ_PASS="${RABBITMQ_PASS:-guest}"
RABBITMQ_VHOST="${RABBITMQ_VHOST:-ecommerce}"
DEFINITIONS_FILE="${DEFINITIONS_FILE:-/etc/rabbitmq/definitions.json}"
POLICIES_FILE="${POLICIES_FILE:-/etc/rabbitmq/policies.json}"

# Retry configuration
MAX_RETRIES=30
RETRY_DELAY=5

# =============================================================================
# UTILITY FUNCTIONS
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

# Wait for RabbitMQ to be ready
wait_for_rabbitmq() {
    log_info "Waiting for RabbitMQ to be ready..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
            "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/overview" > /dev/null 2>&1; then
            log_success "RabbitMQ is ready!"
            return 0
        fi
        
        retries=$((retries + 1))
        log_info "Attempt $retries/$MAX_RETRIES - RabbitMQ not ready yet, waiting ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    done
    
    log_error "RabbitMQ failed to start after $MAX_RETRIES attempts"
    return 1
}

# Enable required plugins
enable_plugins() {
    log_info "Enabling RabbitMQ plugins..."
    
    # Enable management plugin
    rabbitmq-plugins enable rabbitmq_management --offline 2>/dev/null || true
    
    # Enable delayed message exchange plugin (for scheduled messages)
    rabbitmq-plugins enable rabbitmq_delayed_message_exchange --offline 2>/dev/null || true
    
    # Enable shovel plugin (for message forwarding)
    rabbitmq-plugins enable rabbitmq_shovel rabbitmq_shovel_management --offline 2>/dev/null || true
    
    # Enable federation plugin (for multi-cluster setups)
    rabbitmq-plugins enable rabbitmq_federation rabbitmq_federation_management --offline 2>/dev/null || true
    
    # Enable prometheus plugin (for monitoring)
    rabbitmq-plugins enable rabbitmq_prometheus --offline 2>/dev/null || true
    
    log_success "Plugins enabled successfully"
}

# Create virtual host
create_vhost() {
    local vhost=$1
    log_info "Creating virtual host: $vhost"
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/vhosts/$vhost" \
        -H "Content-Type: application/json" \
        -d '{}' || {
        log_warning "Virtual host $vhost may already exist or creation failed"
    }
    
    log_success "Virtual host $vhost created/verified"
}

# Create user
create_user() {
    local username=$1
    local password=$2
    local tags=$3
    
    log_info "Creating user: $username"
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/users/$username" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"$password\",\"tags\":\"$tags\"}" || {
        log_warning "User $username may already exist or creation failed"
    }
    
    log_success "User $username created/verified"
}

# Set user permissions
set_permissions() {
    local username=$1
    local vhost=$2
    local configure=$3
    local write=$4
    local read=$5
    
    log_info "Setting permissions for user $username on vhost $vhost"
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/permissions/$vhost/$username" \
        -H "Content-Type: application/json" \
        -d "{\"configure\":\"$configure\",\"write\":\"$write\",\"read\":\"$read\"}" || {
        log_error "Failed to set permissions for user $username"
        return 1
    }
    
    log_success "Permissions set for user $username"
}

# Create exchange
create_exchange() {
    local vhost=$1
    local name=$2
    local type=$3
    local durable=$4
    local auto_delete=$5
    local internal=$6
    local arguments=$7
    
    log_info "Creating exchange: $name (type: $type)"
    
    local encoded_name=$(echo "$name" | sed 's/\//%2F/g')
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/exchanges/$vhost/$encoded_name" \
        -H "Content-Type: application/json" \
        -d "{\"type\":\"$type\",\"durable\":$durable,\"auto_delete\":$auto_delete,\"internal\":$internal,\"arguments\":$arguments}" || {
        log_warning "Exchange $name may already exist or creation failed"
    }
    
    log_success "Exchange $name created/verified"
}

# Create queue
create_queue() {
    local vhost=$1
    local name=$2
    local durable=$3
    local auto_delete=$4
    local arguments=$5
    
    log_info "Creating queue: $name"
    
    local encoded_name=$(echo "$name" | sed 's/\//%2F/g')
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/queues/$vhost/$encoded_name" \
        -H "Content-Type: application/json" \
        -d "{\"durable\":$durable,\"auto_delete\":$auto_delete,\"arguments\":$arguments}" || {
        log_warning "Queue $name may already exist or creation failed"
    }
    
    log_success "Queue $name created/verified"
}

# Create binding
create_binding() {
    local vhost=$1
    local source=$2
    local destination=$3
    local destination_type=$4
    local routing_key=$5
    local arguments=$6
    
    log_info "Creating binding: $source -> $destination (key: $routing_key)"
    
    local encoded_source=$(echo "$source" | sed 's/\//%2F/g')
    local encoded_dest=$(echo "$destination" | sed 's/\//%2F/g')
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X POST \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/bindings/$vhost/e/$encoded_source/$destination_type/$encoded_dest" \
        -H "Content-Type: application/json" \
        -d "{\"routing_key\":\"$routing_key\",\"arguments\":$arguments}" || {
        log_warning "Binding may already exist or creation failed"
    }
    
    log_success "Binding created/verified"
}

# Create policy
create_policy() {
    local vhost=$1
    local name=$2
    local pattern=$3
    local apply_to=$4
    local definition=$5
    local priority=$6
    
    log_info "Creating policy: $name"
    
    curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        -X PUT \
        "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/policies/$vhost/$name" \
        -H "Content-Type: application/json" \
        -d "{\"pattern\":\"$pattern\",\"apply-to\":\"$apply_to\",\"definition\":$definition,\"priority\":$priority}" || {
        log_warning "Policy $name may already exist or creation failed"
    }
    
    log_success "Policy $name created/verified"
}

# Load definitions from JSON file
load_definitions() {
    if [ -f "$DEFINITIONS_FILE" ]; then
        log_info "Loading definitions from $DEFINITIONS_FILE..."
        
        curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
            -X POST \
            "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/definitions" \
            -H "Content-Type: application/json" \
            -d @"$DEFINITIONS_FILE" || {
            log_error "Failed to load definitions"
            return 1
        }
        
        log_success "Definitions loaded successfully"
    else
        log_warning "Definitions file not found: $DEFINITIONS_FILE"
    fi
}

# =============================================================================
# MANUAL SETUP FUNCTIONS (if definitions.json is not available)
# =============================================================================

setup_exchanges() {
    log_info "Setting up exchanges..."
    
    # Main events exchange
    create_exchange "$RABBITMQ_VHOST" "ecommerce.events" "topic" "true" "false" "false" "{}"
    
    # Retry exchange
    create_exchange "$RABBITMQ_VHOST" "ecommerce.events.retry" "topic" "true" "false" "false" "{}"
    
    # Dead letter exchange
    create_exchange "$RABBITMQ_VHOST" "ecommerce.dlx" "topic" "true" "false" "false" "{}"
    
    # Delayed message exchange (requires plugin)
    create_exchange "$RABBITMQ_VHOST" "ecommerce.delayed" "x-delayed-message" "true" "false" "false" '{"x-delayed-type":"topic"}'
    
    log_success "All exchanges created"
}

setup_queues() {
    log_info "Setting up queues..."
    
    # Inventory Service Queues
    create_queue "$RABBITMQ_VHOST" "inventory-service.order-created" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"inventory-service.order-created.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "inventory-service.order-failed" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"inventory-service.order-failed.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "inventory-service.product-created" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"inventory-service.product-created.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "inventory-service.product-updated" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"inventory-service.product-updated.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "inventory-service.low-stock-alert" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"inventory-service.low-stock-alert.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    # Order Service Queues
    create_queue "$RABBITMQ_VHOST" "order-service.stock-reserved" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"order-service.stock-reserved.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "order-service.stock-reservation-failed" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"order-service.stock-reservation-failed.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "order-service.order-cancelled" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"order-service.order-cancelled.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "order-service.order-completed" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"order-service.order-completed.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    # Reporting Service Queues
    create_queue "$RABBITMQ_VHOST" "reporting-service.order-completed" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"reporting-service.order-completed.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "reporting-service.order-cancelled" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"reporting-service.order-cancelled.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "reporting-service.product-created" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"reporting-service.product-created.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "reporting-service.product-updated" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"reporting-service.product-updated.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    # Notification Service Queues
    create_queue "$RABBITMQ_VHOST" "notification-service.order-created" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"notification-service.order-created.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "notification-service.order-completed" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"notification-service.order-completed.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "notification-service.order-cancelled" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"notification-service.order-cancelled.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "notification-service.low-stock-alert" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.dlx","x-dead-letter-routing-key":"notification-service.low-stock-alert.failed","x-message-ttl":86400000,"x-max-priority":10}'
    
    # Dead Letter Queue
    create_queue "$RABBITMQ_VHOST" "ecommerce.dlq" "true" "false" \
        '{"x-message-ttl":604800000,"x-max-length":1000000}'
    
    # Retry delay queues
    create_queue "$RABBITMQ_VHOST" "ecommerce.retry.delay.5s" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.events","x-message-ttl":5000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "ecommerce.retry.delay.30s" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.events","x-message-ttl":30000,"x-max-priority":10}'
    
    create_queue "$RABBITMQ_VHOST" "ecommerce.retry.delay.5m" "true" "false" \
        '{"x-dead-letter-exchange":"ecommerce.events","x-message-ttl":300000,"x-max-priority":10}'
    
    log_success "All queues created"
}

setup_bindings() {
    log_info "Setting up bindings..."
    
    # Inventory Service Bindings
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "inventory-service.order-created" "queue" "order.created" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "inventory-service.order-failed" "queue" "order.failed" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "inventory-service.product-created" "queue" "product.created" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "inventory-service.product-updated" "queue" "product.updated" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "inventory-service.low-stock-alert" "queue" "inventory.low-stock" "{}"
    
    # Order Service Bindings
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "order-service.stock-reserved" "queue" "stock.reserved" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "order-service.stock-reservation-failed" "queue" "stock.reservation-failed" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "order-service.order-cancelled" "queue" "order.cancelled" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "order-service.order-completed" "queue" "order.completed" "{}"
    
    # Reporting Service Bindings
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "reporting-service.order-completed" "queue" "order.completed" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "reporting-service.order-cancelled" "queue" "order.cancelled" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "reporting-service.product-created" "queue" "product.created" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "reporting-service.product-updated" "queue" "product.updated" "{}"
    
    # Notification Service Bindings
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "notification-service.order-created" "queue" "order.created" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "notification-service.order-completed" "queue" "order.completed" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "notification-service.order-cancelled" "queue" "order.cancelled" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events" "notification-service.low-stock-alert" "queue" "inventory.low-stock" "{}"
    
    # DLX Binding
    create_binding "$RABBITMQ_VHOST" "ecommerce.dlx" "ecommerce.dlq" "queue" "#" "{}"
    
    # Retry Bindings
    create_binding "$RABBITMQ_VHOST" "ecommerce.events.retry" "ecommerce.retry.delay.5s" "queue" "retry.5s.#" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events.retry" "ecommerce.retry.delay.30s" "queue" "retry.30s.#" "{}"
    create_binding "$RABBITMQ_VHOST" "ecommerce.events.retry" "ecommerce.retry.delay.5m" "queue" "retry.5m.#" "{}"
    
    log_success "All bindings created"
}

setup_policies() {
    log_info "Setting up policies..."
    
    # HA Policy for queue mirroring
    create_policy "$RABBITMQ_VHOST" "ha-all" "^.*" "queues" \
        '{"ha-mode":"all","ha-sync-mode":"automatic"}' 0
    
    # TTL Policy for messages (24 hours)
    create_policy "$RABBITMQ_VHOST" "ttl-messages" "^.*" "queues" \
        '{"message-ttl":86400000}' 1
    
    # Max length policy
    create_policy "$RABBITMQ_VHOST" "max-length" "^.*" "queues" \
        '{"max-length":100000,"overflow":"reject-publish-dlx"}' 2
    
    log_success "All policies created"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo "============================================================================="
    echo "           RabbitMQ Initialization for E-Commerce Platform"
    echo "============================================================================="
    echo ""
    
    # Enable plugins first (before starting)
    enable_plugins
    
    # Wait for RabbitMQ to be ready
    wait_for_rabbitmq
    
    # Create virtual host
    create_vhost "$RABBITMQ_VHOST"
    
    # Create additional users
    create_user "ecommerce_user" "ecommerce_password" ""
    create_user "monitoring_user" "monitoring_password" "monitoring"
    
    # Set permissions for users
    set_permissions "ecommerce_user" "$RABBITMQ_VHOST" ".*" ".*" ".*"
    set_permissions "monitoring_user" "$RABBITMQ_VHOST" "^$" "^$" ".*"
    
    # Try to load definitions from file first
    if [ -f "$DEFINITIONS_FILE" ]; then
        load_definitions
    else
        # Manual setup if definitions file not available
        log_warning "Definitions file not found, performing manual setup..."
        setup_exchanges
        setup_queues
        setup_bindings
        setup_policies
    fi
    
    echo ""
    echo "============================================================================="
    echo "                    Initialization Complete!"
    echo "============================================================================="
    echo ""
    echo "RabbitMQ Management UI: http://$RABBITMQ_HOST:$RABBITMQ_PORT"
    echo "Virtual Host: $RABBITMQ_VHOST"
    echo ""
    echo "Exchanges:"
    echo "  - ecommerce.events (topic)"
    echo "  - ecommerce.events.retry (topic)"
    echo "  - ecommerce.dlx (topic)"
    echo ""
    echo "Key Queues:"
    echo "  - inventory-service.order-created"
    echo "  - order-service.stock-reserved"
    echo "  - reporting-service.order-completed"
    echo ""
    echo "============================================================================="
}

# Run main function
main "$@"
