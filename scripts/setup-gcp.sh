#!/bin/bash
# =============================================================================
# SETUP SCRIPT - GOOGLE CLOUD PLATFORM
# E-Commerce Platform
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# CONFIGURATION
# =============================================================================
PROJECT_ID=""
REGION="us-central1"
ZONE="us-central1-a"
ENVIRONMENT="dev"
DB_PASSWORD=""

# =============================================================================
# FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          E-COMMERCE PLATFORM - GCP SETUP                       ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing=()
    
    if ! command -v gcloud &> /dev/null; then
        missing+=("gcloud")
    fi
    
    if ! command -v terraform &> /dev/null; then
        missing+=("terraform")
    fi
    
    if ! command -v kubectl &> /dev/null; then
        missing+=("kubectl")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing tools: ${missing[*]}"
        log_info "Please install missing tools and try again."
        exit 1
    fi
    
    log_success "All prerequisites installed"
}

get_user_input() {
    log_info "Please provide the following information:"
    
    read -p "GCP Project ID: " PROJECT_ID
    
    if [ -z "$PROJECT_ID" ]; then
        log_error "Project ID is required"
        exit 1
    fi
    
    read -p "Region [us-central1]: " input_region
    REGION=${input_region:-$REGION}
    
    read -p "Environment [dev]: " input_env
    ENVIRONMENT=${input_env:-$ENVIRONMENT}
    
    # Generate random password if not provided
    DB_PASSWORD=$(openssl rand -base64 32)
    log_info "Generated database password"
}

setup_gcloud() {
    log_info "Setting up gcloud..."
    
    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
        log_info "Please authenticate with Google Cloud"
        gcloud auth login
    fi
    
    # Set project
    gcloud config set project "$PROJECT_ID"
    log_success "Project set to: $PROJECT_ID"
    
    # Enable APIs
    log_info "Enabling required APIs..."
    gcloud services enable compute.googleapis.com \
        container.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        secretmanager.googleapis.com \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        monitoring.googleapis.com \
        logging.googleapis.com \
        cloudtrace.googleapis.com \
        servicenetworking.googleapis.com
    
    log_success "APIs enabled"
}

setup_terraform() {
    log_info "Setting up Terraform..."
    
    cd infra/terraform
    
    # Create terraform.tfvars
    cat > terraform.tfvars <<EOF
project_id = "$PROJECT_ID"
region     = "$REGION"
zone       = "$ZONE"
environment = "$ENVIRONMENT"
db_tier     = "db-f1-micro"
db_password = "$DB_PASSWORD"
redis_tier = "BASIC"
gke_node_count   = 3
gke_machine_type = "e2-medium"
EOF
    
    log_success "Created terraform.tfvars"
    
    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init
    
    # Plan
    log_info "Planning Terraform changes..."
    terraform plan -out=tfplan
    
    # Apply
    log_info "Applying Terraform changes..."
    terraform apply tfplan
    
    cd ../..
    log_success "Terraform infrastructure created"
}

setup_kubernetes() {
    log_info "Setting up Kubernetes..."
    
    # Get cluster credentials
    gcloud container clusters get-credentials "ecommerce-cluster-$ENVIRONMENT" \
        --region="$REGION"
    
    log_success "kubectl configured"
    
    # Create namespace
    kubectl create namespace ecommerce --dry-run=client -o yaml | kubectl apply -f -
    
    # Get IPs
    local sql_ip redis_ip
    sql_ip=$(gcloud sql instances describe "ecommerce-postgres-$ENVIRONMENT" \
        --format='value(ipAddresses[0].ipAddress)')
    redis_ip=$(gcloud redis instances describe "ecommerce-redis-$ENVIRONMENT" \
        --region="$REGION" --format='value(host)')
    
    log_info "Cloud SQL IP: $sql_ip"
    log_info "Redis IP: $redis_ip"
    
    # Update ConfigMaps
    kubectl create configmap db-config \
        --from-literal=DB_HOST="$sql_ip" \
        --from-literal=DB_PORT="5432" \
        --from-literal=AUTH_DB="auth_db" \
        --from-literal=PRODUCT_DB="product_db" \
        --from-literal=CART_DB="cart_db" \
        --from-literal=ORDER_DB="order_db" \
        --from-literal=INVENTORY_DB="inventory_db" \
        --from-literal=REPORTING_DB="reporting_db" \
        -n ecommerce --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap redis-config \
        --from-literal=REDIS_HOST="$redis_ip" \
        --from-literal=REDIS_PORT="6379" \
        --from-literal=REDIS_DB="0" \
        -n ecommerce --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap ecommerce-config \
        --from-literal=NODE_ENV="production" \
        --from-literal=LOG_LEVEL="info" \
        --from-literal=JWT_EXPIRES_IN="15m" \
        --from-literal=JWT_REFRESH_EXPIRES_IN="7d" \
        --from-literal=BCRYPT_ROUNDS="12" \
        --from-literal=RATE_LIMIT_WINDOW_MS="900000" \
        --from-literal=RATE_LIMIT_MAX_REQUESTS="100" \
        -n ecommerce --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "ConfigMaps created"
    
    # Create secrets
    local jwt_secret refresh_secret rabbitmq_password
    jwt_secret=$(openssl rand -base64 48)
    refresh_secret=$(openssl rand -base64 48)
    rabbitmq_password=$(openssl rand -base64 24)
    
    kubectl create secret generic ecommerce-secrets \
        --from-literal=JWT_SECRET="$jwt_secret" \
        --from-literal=JWT_REFRESH_SECRET="$refresh_secret" \
        --from-literal=DB_PASSWORD="$DB_PASSWORD" \
        --from-literal=RABBITMQ_USER="admin" \
        --from-literal=RABBITMQ_PASSWORD="$rabbitmq_password" \
        -n ecommerce --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Secrets created"
}

deploy_rabbitmq() {
    log_info "Deploying RabbitMQ..."
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: ecommerce
spec:
  serviceName: rabbitmq
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      containers:
      - name: rabbitmq
        image: rabbitmq:3.12-management-alpine
        ports:
        - containerPort: 5672
          name: amqp
        - containerPort: 15672
          name: management
        env:
        - name: RABBITMQ_DEFAULT_USER
          valueFrom:
            secretKeyRef:
              name: ecommerce-secrets
              key: RABBITMQ_USER
        - name: RABBITMQ_DEFAULT_PASS
          valueFrom:
            secretKeyRef:
              name: ecommerce-secrets
              key: RABBITMQ_PASSWORD
        volumeMounts:
        - name: config
          mountPath: /etc/rabbitmq/rabbitmq.conf
          subPath: rabbitmq.conf
        - name: definitions
          mountPath: /etc/rabbitmq/definitions.json
          subPath: definitions.json
      volumes:
      - name: config
        configMap:
          name: rabbitmq-config
      - name: definitions
        configMap:
          name: rabbitmq-definitions
---
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: ecommerce
spec:
  selector:
    app: rabbitmq
  ports:
  - port: 5672
    targetPort: 5672
    name: amqp
  - port: 15672
    targetPort: 15672
    name: management
EOF
    
    log_success "RabbitMQ deployed"
}

deploy_services() {
    log_info "Deploying microservices..."
    
    cd infra/k8s/base
    
    # Update image references with project ID
    sed -i "s/PROJECT_ID/${PROJECT_ID}/g" deployments/*.yaml
    
    # Apply all manifests
    kubectl apply -k .
    
    cd ../../..
    
    log_success "Microservices deployed"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    echo ""
    echo "Pods status:"
    kubectl get pods -n ecommerce
    
    echo ""
    echo "Services status:"
    kubectl get svc -n ecommerce
    
    echo ""
    echo "Ingress status:"
    kubectl get ingress -n ecommerce
    
    log_info "Waiting for pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=api-gateway -n ecommerce --timeout=120s || true
    kubectl wait --for=condition=ready pod -l app=auth-service -n ecommerce --timeout=120s || true
    
    log_success "Deployment verification complete"
}

print_summary() {
    local gateway_ip
    gateway_ip=$(kubectl get svc api-gateway -n ecommerce -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "PENDING")
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    SETUP COMPLETE!                             ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Project: $PROJECT_ID"
    echo "Region: $REGION"
    echo "Environment: $ENVIRONMENT"
    echo ""
    echo "API Gateway IP: $gateway_ip"
    echo ""
    echo "Useful commands:"
    echo "  kubectl get pods -n ecommerce"
    echo "  kubectl logs -l app=api-gateway -n ecommerce"
    echo "  gcloud builds submit --config=infra/cloud-build/cloudbuild.yaml"
    echo ""
    echo "RabbitMQ Management: http://<cluster-ip>:15672"
    echo "  User: admin"
    echo "  Password: (in secret ecommerce-secrets)"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    print_banner
    
    check_prerequisites
    get_user_input
    setup_gcloud
    setup_terraform
    setup_kubernetes
    deploy_rabbitmq
    deploy_services
    verify_deployment
    print_summary
}

# Run main function
main "$@"
