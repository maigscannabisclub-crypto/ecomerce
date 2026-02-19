#!/bin/bash

# =============================================================================
# E-Commerce Platform - Setup Script
# =============================================================================
# Script de inicialización completa para la plataforma e-commerce
# Verifica dependencias, crea infraestructura e inicializa servicios
# =============================================================================

set -euo pipefail

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuración
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly ENV_FILE="$PROJECT_ROOT/.env"
readonly SSL_DIR="$PROJECT_ROOT/ssl"
readonly LOGS_DIR="$PROJECT_ROOT/logs"
readonly DATA_DIR="$PROJECT_ROOT/data"

# Variables de entorno por defecto
readonly DEFAULT_ENVIRONMENT="development"
readonly DEFAULT_DOMAIN="localhost"
readonly DEFAULT_API_PORT="3000"
readonly DEFAULT_WEB_PORT="8080"

# =============================================================================
# Funciones de utilidad
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

print_banner() {
    echo -e "${BLUE}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🛒 E-COMMERCE PLATFORM - SETUP                      ║
    ║                                                               ║
    ║           Inicialización completa del sistema                 ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# =============================================================================
# Verificación de dependencias
# =============================================================================

check_dependency() {
    local cmd=$1
    local name=$2
    local min_version=$3
    
    if ! command -v "$cmd" &> /dev/null; then
        log_error "$name no está instalado. Por favor instálalo primero."
        return 1
    fi
    
    local version
    version=$($cmd --version 2>&1 | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
    
    if [[ -n "$min_version" && -n "$version" ]]; then
        if [[ "$(printf '%s\n' "$min_version" "$version" | sort -V | head -n1)" != "$min_version" ]]; then
            log_success "$name versión $version encontrado (mínimo: $min_version)"
        else
            log_warning "$name versión $version (se recomienda >= $min_version)"
        fi
    else
        log_success "$name encontrado"
    fi
    return 0
}

check_dependencies() {
    log_info "Verificando dependencias..."
    
    local deps_ok=true
    
    # Docker
    if ! check_dependency "docker" "Docker" "20.10.0"; then
        deps_ok=false
    fi
    
    # Docker Compose
    if command -v docker-compose &> /dev/null; then
        check_dependency "docker-compose" "Docker Compose" "2.0.0"
    elif docker compose version &> /dev/null; then
        log_success "Docker Compose plugin encontrado"
    else
        log_error "Docker Compose no encontrado"
        deps_ok=false
    fi
    
    # kubectl (opcional)
    if check_dependency "kubectl" "kubectl" "1.25.0"; then
        log_info "kubectl disponible para despliegues en Kubernetes"
    else
        log_warning "kubectl no encontrado (opcional para K8s deployments)"
    fi
    
    # Helm (opcional)
    if check_dependency "helm" "Helm" "3.10.0"; then
        log_info "Helm disponible para charts de Kubernetes"
    else
        log_warning "Helm no encontrado (opcional para K8s deployments)"
    fi
    
    # Node.js (para scripts de utilidad)
    if check_dependency "node" "Node.js" "18.0.0"; then
        log_info "Node.js disponible para scripts de utilidad"
    else
        log_warning "Node.js no encontrado (requerido para algunos scripts)"
    fi
    
    # OpenSSL (para certificados)
    if check_dependency "openssl" "OpenSSL" "1.1.0"; then
        log_info "OpenSSL disponible para generación de certificados"
    else
        log_warning "OpenSSL no encontrado (requerido para certificados SSL)"
    fi
    
    if [[ "$deps_ok" == false ]]; then
        log_error "Faltan dependencias críticas. Por favor instálalas e intenta de nuevo."
        exit 1
    fi
    
    log_success "Todas las dependencias críticas están instaladas"
}

# =============================================================================
# Creación de directorios
# =============================================================================

create_directories() {
    log_info "Creando estructura de directorios..."
    
    local directories=(
        "$SSL_DIR"
        "$LOGS_DIR"
        "$DATA_DIR"
        "$DATA_DIR/postgres"
        "$DATA_DIR/mongodb"
        "$DATA_DIR/redis"
        "$DATA_DIR/rabbitmq"
        "$DATA_DIR/elasticsearch"
        "$PROJECT_ROOT/backups"
        "$PROJECT_ROOT/tmp"
    )
    
    for dir in "${directories[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_info "Creado: $dir"
        fi
    done
    
    log_success "Estructura de directorios creada"
}

# =============================================================================
# Creación de redes Docker
# =============================================================================

create_docker_networks() {
    log_info "Creando redes Docker..."
    
    local networks=(
        "ecommerce-network"
        "ecommerce-monitoring"
        "ecommerce-database"
    )
    
    for network in "${networks[@]}"; do
        if ! docker network ls | grep -q "$network"; then
            docker network create "$network" --driver bridge 2>/dev/null || true
            log_info "Red creada: $network"
        else
            log_info "Red ya existe: $network"
        fi
    done
    
    log_success "Redes Docker configuradas"
}

# =============================================================================
# Creación de volúmenes Docker
# =============================================================================

create_docker_volumes() {
    log_info "Creando volúmenes Docker..."
    
    local volumes=(
        "ecommerce-postgres-data"
        "ecommerce-mongodb-data"
        "ecommerce-redis-data"
        "ecommerce-rabbitmq-data"
        "ecommerce-elasticsearch-data"
        "ecommerce-grafana-data"
        "ecommerce-prometheus-data"
    )
    
    for volume in "${volumes[@]}"; do
        if ! docker volume ls | grep -q "$volume"; then
            docker volume create "$volume"
            log_info "Volumen creado: $volume"
        else
            log_info "Volumen ya existe: $volume"
        fi
    done
    
    log_success "Volúmenes Docker configurados"
}

# =============================================================================
# Generación de archivos .env
# =============================================================================

generate_env_file() {
    log_info "Generando archivo de configuración .env..."
    
    if [[ -f "$ENV_FILE" ]]; then
        log_warning "El archivo .env ya existe"
        read -p "¿Deseas sobrescribirlo? (s/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Ss]$ ]]; then
            log_info "Conservando archivo .env existente"
            return 0
        fi
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
        log_info "Backup creado: $ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
    fi
    
    # Generar contraseñas aleatorias
    local postgres_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    local mongodb_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    local redis_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    local rabbitmq_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    local jwt_secret=$(openssl rand -base64 64)
    local session_secret=$(openssl rand -base64 64)
    local api_key=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    
    cat > "$ENV_FILE" << EOF
# =============================================================================
# E-Commerce Platform - Environment Configuration
# =============================================================================
# Generado: $(date)
# Script: setup.sh
# =============================================================================

# -----------------------------------------------------------------------------
# Configuración General
# -----------------------------------------------------------------------------
ENVIRONMENT=${DEFAULT_ENVIRONMENT}
DOMAIN=${DEFAULT_DOMAIN}
DEBUG=true
LOG_LEVEL=info

# -----------------------------------------------------------------------------
# API Gateway
# -----------------------------------------------------------------------------
API_GATEWAY_PORT=${DEFAULT_API_PORT}
API_GATEWAY_HOST=0.0.0.0
API_RATE_LIMIT=1000
API_TIMEOUT=30000

# -----------------------------------------------------------------------------
# Frontend Web
# -----------------------------------------------------------------------------
WEB_PORT=${DEFAULT_WEB_PORT}
WEB_HOST=0.0.0.0
WEB_API_URL=http://localhost:${DEFAULT_API_PORT}

# -----------------------------------------------------------------------------
# Base de Datos - PostgreSQL
# -----------------------------------------------------------------------------
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=ecommerce
POSTGRES_USER=ecommerce_user
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_POOL_MIN=5
POSTGRES_POOL_MAX=20
DATABASE_URL=postgresql://ecommerce_user:${postgres_password}@postgres:5432/ecommerce

# -----------------------------------------------------------------------------
# Base de Datos - MongoDB
# -----------------------------------------------------------------------------
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DB=ecommerce_analytics
MONGODB_USER=ecommerce_mongo
MONGODB_PASSWORD=${mongodb_password}
MONGODB_URI=mongodb://ecommerce_mongo:${mongodb_password}@mongodb:27017/ecommerce_analytics

# -----------------------------------------------------------------------------
# Cache - Redis
# -----------------------------------------------------------------------------
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
REDIS_DB=0
REDIS_POOL_SIZE=10
REDIS_URL=redis://:${redis_password}@redis:6379/0

# -----------------------------------------------------------------------------
# Message Broker - RabbitMQ
# -----------------------------------------------------------------------------
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_USER=ecommerce
RABBITMQ_PASSWORD=${rabbitmq_password}
RABBITMQ_VHOST=/
RABBITMQ_URL=amqp://ecommerce:${rabbitmq_password}@rabbitmq:5672/

# -----------------------------------------------------------------------------
# Seguridad
# -----------------------------------------------------------------------------
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
SESSION_SECRET=${session_secret}
BCRYPT_ROUNDS=12
API_KEY=${api_key}
CORS_ORIGIN=http://localhost:${DEFAULT_WEB_PORT},http://localhost:3000

# -----------------------------------------------------------------------------
# Servicios de Búsqueda
# -----------------------------------------------------------------------------
ELASTICSEARCH_HOST=elasticsearch
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=changeme

# -----------------------------------------------------------------------------
# Almacenamiento
# -----------------------------------------------------------------------------
MINIO_HOST=minio
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET_NAME=ecommerce-storage

# -----------------------------------------------------------------------------
# Monitoreo
# -----------------------------------------------------------------------------
GRAFANA_PORT=3001
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin123
PROMETHEUS_PORT=9090
JAEGER_PORT=16686

# -----------------------------------------------------------------------------
# Configuración de Email
# -----------------------------------------------------------------------------
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@ecommerce.local

# -----------------------------------------------------------------------------
# Configuración de Pagos
# -----------------------------------------------------------------------------
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

# -----------------------------------------------------------------------------
# Feature Flags
# -----------------------------------------------------------------------------
ENABLE_ANALYTICS=true
ENABLE_NOTIFICATIONS=true
ENABLE_RECOMMENDATIONS=true
ENABLE_REALTIME_INVENTORY=true
EOF

    chmod 600 "$ENV_FILE"
    log_success "Archivo .env generado: $ENV_FILE"
}

# =============================================================================
# Generación de certificados SSL
# =============================================================================

generate_ssl_certificates() {
    log_info "Generando certificados SSL para desarrollo..."
    
    if [[ ! -d "$SSL_DIR" ]]; then
        mkdir -p "$SSL_DIR"
    fi
    
    local cert_file="$SSL_DIR/localhost.crt"
    local key_file="$SSL_DIR/localhost.key"
    local ca_key="$SSL_DIR/ca.key"
    local ca_cert="$SSL_DIR/ca.crt"
    
    # Generar CA privada
    if [[ ! -f "$ca_key" ]]; then
        openssl genrsa -out "$ca_key" 4096 2>/dev/null
        log_info "CA key generada"
    fi
    
    # Generar certificado CA
    if [[ ! -f "$ca_cert" ]]; then
        openssl req -new -x509 -days 365 -key "$ca_key" \
            -out "$ca_cert" \
            -subj "/C=US/ST=State/L=City/O=E-Commerce Platform/OU=Development/CN=E-Commerce CA" 2>/dev/null
        log_info "CA certificado generado"
    fi
    
    # Generar clave privada para localhost
    if [[ ! -f "$key_file" ]]; then
        openssl genrsa -out "$key_file" 2048 2>/dev/null
        log_info "Private key generada"
    fi
    
    # Generar CSR
    local csr_file="$SSL_DIR/localhost.csr"
    openssl req -new -key "$key_file" \
        -out "$csr_file" \
        -subj "/C=US/ST=State/L=City/O=E-Commerce Platform/OU=Development/CN=localhost" 2>/dev/null
    
    # Crear archivo de configuración para SAN
    local ext_file="$SSL_DIR/localhost.ext"
    cat > "$ext_file" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
    
    # Firmar certificado con CA
    openssl x509 -req -in "$csr_file" \
        -CA "$ca_cert" -CAkey "$ca_key" \
        -CAcreateserial -out "$cert_file" \
        -days 365 -sha256 -extfile "$ext_file" 2>/dev/null
    
    # Limpiar archivos temporales
    rm -f "$csr_file" "$ext_file" "$SSL_DIR/localhost.srl"
    
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
    
    log_success "Certificados SSL generados:"
    log_info "  Certificado: $cert_file"
    log_info "  Clave privada: $key_file"
    log_info "  CA Certificado: $ca_cert"
    log_warning "Importa $ca_cert en tu navegador/navegadores para confiar en los certificados"
}

# =============================================================================
# Inicialización de bases de datos
# =============================================================================

init_databases() {
    log_info "Inicializando bases de datos..."
    
    # Cargar variables de entorno
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
    
    # Iniciar solo servicios de base de datos
    log_info "Iniciando servicios de base de datos..."
    
    cd "$PROJECT_ROOT"
    
    if [[ -f "docker-compose.yml" ]]; then
        docker-compose up -d postgres mongodb redis rabbitmq 2>/dev/null || \
        docker compose up -d postgres mongodb redis rabbitmq 2>/dev/null || {
            log_warning "No se pudieron iniciar los servicios de base de datos"
            log_info "Se inicializarán cuando se ejecute 'start.sh'"
            return 0
        }
        
        log_info "Esperando a que los servicios estén listos..."
        sleep 10
        
        # Verificar PostgreSQL
        log_info "Verificando PostgreSQL..."
        local retries=30
        while [[ $retries -gt 0 ]]; do
            if docker exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" &>/dev/null; then
                log_success "PostgreSQL está listo"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        # Verificar MongoDB
        log_info "Verificando MongoDB..."
        retries=30
        while [[ $retries -gt 0 ]]; do
            if docker exec mongodb mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
                log_success "MongoDB está listo"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        # Verificar Redis
        log_info "Verificando Redis..."
        retries=30
        while [[ $retries -gt 0 ]]; do
            if docker exec redis redis-cli ping | grep -q "PONG"; then
                log_success "Redis está listo"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        # Verificar RabbitMQ
        log_info "Verificando RabbitMQ..."
        retries=30
        while [[ $retries -gt 0 ]]; do
            if curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASSWORD" http://localhost:15672/api/overview &>/dev/null; then
                log_success "RabbitMQ está listo"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        log_success "Bases de datos inicializadas correctamente"
    else
        log_warning "docker-compose.yml no encontrado"
        log_info "Las bases de datos se inicializarán manualmente"
    fi
}

# =============================================================================
# Carga de datos de seed
# =============================================================================

load_seed_data() {
    log_info "Cargando datos de seed..."
    
    if [[ -f "$SCRIPT_DIR/seed.sh" ]]; then
        bash "$SCRIPT_DIR/seed.sh"
    else
        log_warning "Script seed.sh no encontrado"
        log_info "Ejecuta './seed.sh' después de iniciar los servicios"
    fi
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    print_banner
    
    log_info "Iniciando configuración de E-Commerce Platform..."
    log_info "Directorio del proyecto: $PROJECT_ROOT"
    
    # Verificar dependencias
    check_dependencies
    
    # Crear estructura de directorios
    create_directories
    
    # Crear redes Docker
    create_docker_networks
    
    # Crear volúmenes Docker
    create_docker_volumes
    
    # Generar archivo .env
    generate_env_file
    
    # Generar certificados SSL
    generate_ssl_certificates
    
    # Inicializar bases de datos
    init_databases
    
    # Cargar datos de seed
    load_seed_data
    
    # Resumen final
    echo
    log_success "✅ Configuración completada exitosamente!"
    echo
    echo -e "${GREEN}Próximos pasos:${NC}"
    echo -e "  1. Revisa el archivo ${YELLOW}.env${NC} y ajusta las configuraciones según sea necesario"
    echo -e "  2. Importa el certificado CA: ${YELLOW}$SSL_DIR/ca.crt${NC} en tu navegador"
    echo -e "  3. Inicia la plataforma: ${YELLOW}./start.sh${NC}"
    echo -e "  4. Accede a la aplicación: ${BLUE}http://localhost:${DEFAULT_WEB_PORT}${NC}"
    echo -e "  5. Panel de administración RabbitMQ: ${BLUE}http://localhost:15672${NC}"
    echo
    log_info "Para más información, consulta la documentación en docs/"
}

# Manejo de señales
trap 'log_error "Script interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
