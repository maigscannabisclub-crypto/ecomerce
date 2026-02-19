#!/bin/bash
#
# JWT Key Generation Script
# Generates RSA key pairs for JWT signing (RS256)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEY_SIZE=${KEY_SIZE:-2048}
OUTPUT_DIR=${OUTPUT_DIR:-"./keys"}
KEY_NAME=${KEY_NAME:-"jwt-signing"}
ALGORITHM=${ALGORITHM:-"RSA"}  # RSA or EC

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

# Check if openssl is installed
check_openssl() {
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is not installed. Please install it first."
        exit 1
    fi
    log_info "OpenSSL version: $(openssl version)"
}

# Create output directory
setup_directory() {
    if [ ! -d "$OUTPUT_DIR" ]; then
        log_info "Creating output directory: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
    fi
    
    # Set restrictive permissions
    chmod 700 "$OUTPUT_DIR"
    log_info "Output directory permissions set to 700"
}

# Generate RSA key pair
generate_rsa_keys() {
    local private_key="$OUTPUT_DIR/${KEY_NAME}-private.pem"
    local public_key="$OUTPUT_DIR/${KEY_NAME}-public.pem"
    
    log_info "Generating RSA ${KEY_SIZE}-bit key pair..."
    
    # Generate private key
    openssl genrsa -out "$private_key" "$KEY_SIZE"
    chmod 600 "$private_key"
    log_success "Private key generated: $private_key"
    
    # Extract public key
    openssl rsa -in "$private_key" -pubout -out "$public_key"
    chmod 644 "$public_key"
    log_success "Public key generated: $public_key"
    
    # Display key info
    log_info "Key information:"
    openssl rsa -in "$private_key" -text -noout | head -5
}

# Generate EC key pair
generate_ec_keys() {
    local private_key="$OUTPUT_DIR/${KEY_NAME}-private.pem"
    local public_key="$OUTPUT_DIR/${KEY_NAME}-public.pem"
    local curve="${EC_CURVE:-prime256v1}"
    
    log_info "Generating EC key pair with curve $curve..."
    
    # Generate private key
    openssl ecparam -genkey -name "$curve" -noout -out "$private_key"
    chmod 600 "$private_key"
    log_success "Private key generated: $private_key"
    
    # Extract public key
    openssl ec -in "$private_key" -pubout -out "$public_key"
    chmod 644 "$public_key"
    log_success "Public key generated: $public_key"
    
    # Display key info
    log_info "Key information:"
    openssl ec -in "$private_key" -text -noout | head -10
}

# Generate certificate for mTLS
generate_mtls_cert() {
    local cert_name="${1:-mtls-server}"
    local days=${2:-365}
    local cert_file="$OUTPUT_DIR/${cert_name}.crt"
    local key_file="$OUTPUT_DIR/${cert_name}.key"
    local csr_file="$OUTPUT_DIR/${cert_name}.csr"
    
    log_info "Generating mTLS certificate: $cert_name"
    
    # Generate private key
    openssl genrsa -out "$key_file" 2048
    chmod 600 "$key_file"
    
    # Generate CSR
    openssl req -new -key "$key_file" -out "$csr_file" \
        -subj "/C=US/ST=California/L=San Francisco/O=Ecommerce Platform/OU=Security/CN=$cert_name"
    
    # Generate self-signed certificate
    openssl x509 -req -days "$days" -in "$csr_file" \
        -signkey "$key_file" -out "$cert_file" \
        -sha256
    
    chmod 644 "$cert_file"
    rm "$csr_file"
    
    log_success "mTLS certificate generated: $cert_file"
}

# Generate CA certificate
generate_ca_cert() {
    local ca_name="${1:-ca-root}"
    local days=${2:-3650}
    local ca_key="$OUTPUT_DIR/${ca_name}.key"
    local ca_cert="$OUTPUT_DIR/${ca_name}.crt"
    
    log_info "Generating CA certificate: $ca_name"
    
    # Generate CA private key
    openssl genrsa -out "$ca_key" 4096
    chmod 600 "$ca_key"
    
    # Generate self-signed CA certificate
    openssl req -new -x509 -days "$days" -key "$ca_key" -out "$ca_cert" \
        -subj "/C=US/ST=California/L=San Francisco/O=Ecommerce Platform/OU=Security/CN=$ca_name CA" \
        -sha256
    
    chmod 644 "$ca_cert"
    
    log_success "CA certificate generated: $ca_cert"
    log_warning "Keep the CA private key secure!"
}

# Generate Diffie-Hellman parameters
generate_dh_params() {
    local dh_file="$OUTPUT_DIR/dhparam.pem"
    local bits=${1:-2048}
    
    log_info "Generating DH parameters (${bits} bits)..."
    log_info "This may take a while..."
    
    openssl dhparam -out "$dh_file" "$bits"
    chmod 644 "$dh_file"
    
    log_success "DH parameters generated: $dh_file"
}

# Generate all keys for the platform
generate_all() {
    log_info "Generating all keys for the e-commerce platform..."
    
    # JWT signing keys
    generate_rsa_keys
    
    # CA certificate
    generate_ca_cert "platform-ca" 3650
    
    # Server mTLS certificate
    generate_mtls_cert "mtls-server" 365
    
    # Client mTLS certificate
    generate_mtls_cert "mtls-client" 365
    
    # DH parameters
    generate_dh_params 2048
    
    log_success "All keys generated successfully!"
    log_warning "Remember to store private keys securely!"
}

# Print usage
print_usage() {
    cat << EOF
Usage: $0 [OPTIONS] COMMAND

Commands:
    jwt         Generate JWT signing keys (RSA)
    ec          Generate JWT signing keys (EC)
    mtls        Generate mTLS certificates
    ca          Generate CA certificate
    dh          Generate Diffie-Hellman parameters
    all         Generate all keys

Options:
    -o DIR      Output directory (default: ./keys)
    -n NAME     Key name (default: jwt-signing)
    -s SIZE     RSA key size (default: 2048)
    -c CURVE    EC curve (default: prime256v1)
    -d DAYS     Certificate validity in days
    -h          Show this help message

Environment Variables:
    KEY_SIZE        RSA key size
    OUTPUT_DIR      Output directory
    KEY_NAME        Key name
    ALGORITHM       Algorithm (RSA or EC)
    EC_CURVE        Elliptic curve for EC keys

Examples:
    $0 jwt                    # Generate JWT RSA keys
    $0 ec -c secp384r1        # Generate JWT EC keys with secp384r1
    $0 mtls -n api-server     # Generate mTLS cert for api-server
    $0 ca -d 3650             # Generate CA cert valid for 10 years
    $0 all -o /secure/keys    # Generate all keys in /secure/keys
EOF
}

# Main
main() {
    # Parse options
    while getopts "o:n:s:c:d:h" opt; do
        case $opt in
            o) OUTPUT_DIR="$OPTARG" ;;
            n) KEY_NAME="$OPTARG" ;;
            s) KEY_SIZE="$OPTARG" ;;
            c) EC_CURVE="$OPTARG" ;;
            d) DAYS="$OPTARG" ;;
            h) print_usage; exit 0 ;;
            *) print_usage; exit 1 ;;
        esac
    done
    
    shift $((OPTIND - 1))
    
    COMMAND=${1:-all}
    
    # Check prerequisites
    check_openssl
    setup_directory
    
    # Execute command
    case $COMMAND in
        jwt)
            generate_rsa_keys
            ;;
        ec)
            generate_ec_keys
            ;;
        mtls)
            generate_mtls_cert "${2:-mtls-server}" "${DAYS:-365}"
            ;;
        ca)
            generate_ca_cert "${2:-ca-root}" "${DAYS:-3650}"
            ;;
        dh)
            generate_dh_params "${2:-2048}"
            ;;
        all)
            generate_all
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            print_usage
            exit 1
            ;;
    esac
    
    log_success "Key generation completed!"
    log_info "Keys stored in: $OUTPUT_DIR"
}

# Run main
main "$@"
