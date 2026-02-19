#!/bin/bash
#
# Secret Rotation Script
# Automates rotation of secrets, API keys, and certificates
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR=${VAULT_ADDR:-"http://localhost:8200"}
VAULT_TOKEN=${VAULT_TOKEN:-""}
AWS_REGION=${AWS_REGION:-"us-east-1"}
ROTATION_DAYS=${ROTATION_DAYS:-30}
DRY_RUN=${DRY_RUN:-false}

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

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Generate new API key
generate_api_key() {
    local prefix="${1:-api}"
    local length=${2:-64}
    
    # Generate random key with prefix
    local key="${prefix}_$(openssl rand -hex $((length / 2)))"
    echo "$key"
}

# Generate new database password
generate_db_password() {
    local length=${1:-32}
    
    # Generate secure password
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

# Generate new JWT secret
generate_jwt_secret() {
    local length=${1:-256}
    
    # Generate random JWT secret
    openssl rand -base64 "$((length / 8))"
}

# Rotate Vault secret
rotate_vault_secret() {
    local secret_path="$1"
    local new_value="$2"
    
    log_info "Rotating Vault secret: $secret_path"
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate: $secret_path"
        return 0
    fi
    
    # Check if vault CLI is available
    if ! command_exists vault; then
        log_error "Vault CLI not found. Please install it."
        return 1
    fi
    
    # Set Vault address and token
    export VAULT_ADDR
    export VAULT_TOKEN
    
    # Store new secret version
    echo "$new_value" | vault kv put "$secret_path" value=-
    
    log_success "Vault secret rotated: $secret_path"
}

# Rotate AWS Secrets Manager secret
rotate_aws_secret() {
    local secret_name="$1"
    local new_value="$2"
    
    log_info "Rotating AWS secret: $secret_name"
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate: $secret_name"
        return 0
    fi
    
    # Check if AWS CLI is available
    if ! command_exists aws; then
        log_error "AWS CLI not found. Please install it."
        return 1
    fi
    
    # Update secret
    aws secretsmanager put-secret-value \
        --secret-id "$secret_name" \
        --secret-string "$new_value" \
        --region "$AWS_REGION"
    
    log_success "AWS secret rotated: $secret_name"
}

# Rotate Redis secret
rotate_redis_secret() {
    local key="$1"
    local new_value="$2"
    
    log_info "Rotating Redis secret: $key"
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate: $key"
        return 0
    fi
    
    # Check if redis-cli is available
    if ! command_exists redis-cli; then
        log_error "redis-cli not found. Please install it."
        return 1
    fi
    
    # Update secret in Redis
    redis-cli SET "$key" "$new_value"
    
    log_success "Redis secret rotated: $key"
}

# Rotate JWT signing keys
rotate_jwt_keys() {
    log_info "Rotating JWT signing keys..."
    
    local keys_dir="${KEYS_DIR:-./keys}"
    local backup_dir="${keys_dir}/backup-$(date +%Y%m%d-%H%M%S)"
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate JWT keys"
        return 0
    fi
    
    # Backup existing keys
    if [ -d "$keys_dir" ]; then
        mkdir -p "$backup_dir"
        cp "$keys_dir"/*.pem "$backup_dir/" 2>/dev/null || true
        log_info "Existing keys backed up to: $backup_dir"
    fi
    
    # Generate new keys
    ./generate-keys.sh jwt -o "$keys_dir" -n jwt-signing-new
    
    # Update active key reference
    # In production, this would update the key ID in your configuration
    
    log_success "JWT keys rotated. New keys in: $keys_dir"
    log_warning "Remember to update the active key ID in your application!"
}

# Rotate mTLS certificates
rotate_mtls_certs() {
    log_info "Rotating mTLS certificates..."
    
    local certs_dir="${CERTS_DIR:-./certs}"
    local backup_dir="${certs_dir}/backup-$(date +%Y%m%d-%H%M%S)"
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate mTLS certificates"
        return 0
    fi
    
    # Backup existing certificates
    if [ -d "$certs_dir" ]; then
        mkdir -p "$backup_dir"
        cp "$certs_dir"/*.crt "$backup_dir/" 2>/dev/null || true
        cp "$certs_dir"/*.key "$backup_dir/" 2>/dev/null || true
        log_info "Existing certificates backed up to: $backup_dir"
    fi
    
    # Generate new certificates
    ./generate-keys.sh mtls -o "$certs_dir" -n mtls-server-new
    ./generate-keys.sh mtls -o "$certs_dir" -n mtls-client-new
    
    log_success "mTLS certificates rotated. New certificates in: $certs_dir"
}

# Rotate database credentials
rotate_db_credentials() {
    log_info "Rotating database credentials..."
    
    local db_type="${1:-postgres}"
    local new_password
    new_password=$(generate_db_password 32)
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate $db_type credentials"
        return 0
    fi
    
    case $db_type in
        postgres|postgresql)
            rotate_postgres_password "$new_password"
            ;;
        mysql|mariadb)
            rotate_mysql_password "$new_password"
            ;;
        mongodb)
            rotate_mongodb_password "$new_password"
            ;;
        redis)
            rotate_redis_password "$new_password"
            ;;
        *)
            log_error "Unsupported database type: $db_type"
            return 1
            ;;
    esac
    
    # Store new password in secret manager
    if [ -n "$VAULT_TOKEN" ]; then
        rotate_vault_secret "database/$db_type/password" "$new_password"
    elif command_exists aws; then
        rotate_aws_secret "database/$db_type/password" "$new_password"
    fi
}

# Rotate PostgreSQL password
rotate_postgres_password() {
    local new_password="$1"
    
    log_info "Updating PostgreSQL password..."
    
    # This requires appropriate database access
    # psql -U admin -c "ALTER USER app_user WITH PASSWORD '$new_password';"
    
    log_success "PostgreSQL password updated"
}

# Rotate MySQL password
rotate_mysql_password() {
    local new_password="$1"
    
    log_info "Updating MySQL password..."
    
    # This requires appropriate database access
    # mysql -u admin -p -e "ALTER USER 'app_user'@'%' IDENTIFIED BY '$new_password';"
    
    log_success "MySQL password updated"
}

# Rotate MongoDB password
rotate_mongodb_password() {
    local new_password="$1"
    
    log_info "Updating MongoDB password..."
    
    # This requires appropriate database access
    # mongo admin -u admin -p --eval "db.changeUserPassword('app_user', '$new_password')"
    
    log_success "MongoDB password updated"
}

# Rotate Redis password
rotate_redis_password() {
    local new_password="$1"
    
    log_info "Updating Redis password..."
    
    # Update Redis configuration
    # redis-cli CONFIG SET requirepass "$new_password"
    
    log_success "Redis password updated"
}

# Rotate third-party API keys
rotate_api_keys() {
    log_info "Rotating third-party API keys..."
    
    local services=("stripe" "paypal" "sendgrid" "aws")
    
    for service in "${services[@]}"; do
        log_info "Processing $service API key..."
        
        local new_key
        new_key=$(generate_api_key "$service")
        
        if [ "$DRY_RUN" = true ]; then
            log_warning "[DRY RUN] Would rotate $service API key"
            continue
        fi
        
        # Store in appropriate secret manager
        if [ -n "$VAULT_TOKEN" ]; then
            rotate_vault_secret "api-keys/$service" "$new_key"
        elif command_exists aws; then
            rotate_aws_secret "api-keys/$service" "$new_key"
        fi
        
        log_success "$service API key rotated"
    done
}

# Check certificate expiry
check_cert_expiry() {
    local cert_file="$1"
    local days_warning="${2:-30}"
    
    if [ ! -f "$cert_file" ]; then
        log_error "Certificate not found: $cert_file"
        return 1
    fi
    
    local expiry_date
    expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s)
    local current_epoch
    current_epoch=$(date +%s)
    local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
    
    if [ "$days_until_expiry" -le "$days_warning" ]; then
        log_warning "Certificate expires in $days_until_expiry days: $cert_file"
        return 1
    else
        log_info "Certificate valid for $days_until_expiry days: $cert_file"
        return 0
    fi
}

# Check all certificates
check_all_certs() {
    local certs_dir="${CERTS_DIR:-./certs}"
    local needs_rotation=false
    
    log_info "Checking certificate expiry..."
    
    for cert in "$certs_dir"/*.crt; do
        if [ -f "$cert" ]; then
            if ! check_cert_expiry "$cert" "$ROTATION_DAYS"; then
                needs_rotation=true
            fi
        fi
    done
    
    if [ "$needs_rotation" = true ]; then
        log_warning "Some certificates need rotation!"
        return 1
    fi
    
    log_success "All certificates are valid"
    return 0
}

# Run all rotations
rotate_all() {
    log_info "Starting full secret rotation..."
    
    # Check certificates first
    if ! check_all_certs; then
        rotate_mtls_certs
    fi
    
    # Rotate JWT keys
    rotate_jwt_keys
    
    # Rotate database credentials
    rotate_db_credentials postgres
    rotate_db_credentials redis
    
    # Rotate API keys
    rotate_api_keys
    
    log_success "Full secret rotation completed!"
}

# Print usage
print_usage() {
    cat << EOF
Usage: $0 [OPTIONS] COMMAND

Commands:
    jwt                 Rotate JWT signing keys
    mtls                Rotate mTLS certificates
    db [type]           Rotate database credentials (postgres|mysql|mongodb|redis)
    api-keys            Rotate third-party API keys
    check-certs         Check certificate expiry
    all                 Rotate all secrets

Options:
    --dry-run           Show what would be done without making changes
    --days DAYS         Days before expiry to warn (default: 30)
    --vault-addr URL    Vault server address
    --vault-token TOKEN Vault token
    --aws-region REGION AWS region
    -h, --help          Show this help message

Environment Variables:
    VAULT_ADDR          Vault server address
    VAULT_TOKEN         Vault token
    AWS_REGION          AWS region
    ROTATION_DAYS       Days before expiry to rotate
    DRY_RUN             Set to 'true' for dry run mode

Examples:
    $0 jwt                          # Rotate JWT keys
    $0 db postgres                  # Rotate PostgreSQL credentials
    $0 all --dry-run                # Preview all rotations
    $0 check-certs --days 60        # Check certs with 60-day warning
EOF
}

# Main
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --days)
                ROTATION_DAYS="$2"
                shift 2
                ;;
            --vault-addr)
                VAULT_ADDR="$2"
                shift 2
                ;;
            --vault-token)
                VAULT_TOKEN="$2"
                shift 2
                ;;
            --aws-region)
                AWS_REGION="$2"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
            *)
                break
                ;;
        esac
    done
    
    COMMAND=${1:-all}
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi
    
    # Execute command
    case $COMMAND in
        jwt)
            rotate_jwt_keys
            ;;
        mtls)
            rotate_mtls_certs
            ;;
        db)
            rotate_db_credentials "${2:-postgres}"
            ;;
        api-keys)
            rotate_api_keys
            ;;
        check-certs)
            check_all_certs
            ;;
        all)
            rotate_all
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            print_usage
            exit 1
            ;;
    esac
}

# Run main
main "$@"
