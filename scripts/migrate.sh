#!/bin/bash

# =============================================================================
# E-Commerce Platform - Migration Script
# =============================================================================
# Script para gestionar migraciones de base de datos
# Soporta PostgreSQL y MongoDB
# =============================================================================

set -euo pipefail

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Configuración
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly ENV_FILE="$PROJECT_ROOT/.env"
readonly MIGRATIONS_DIR="$PROJECT_ROOT/migrations"

# Variables
ACTION="status"
DATABASE="all"
VERSION=""
DRY_RUN=false
FORCE=false
VERBOSE=false

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

log_migrate() {
    echo -e "${PURPLE}[MIGRATE]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🗄️  E-COMMERCE PLATFORM - MIGRATE                   ║
    ║                                                               ║
    ║           Gestión de migraciones de base de datos             ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [COMANDO] [OPCIONES]

Comandos:
    up                   Ejecutar migraciones pendientes (default)
    down                 Revertir última migración
    redo                 Revertir y re-ejecutar última migración
    status               Ver estado de migraciones
    create NAME          Crear nueva migración
    reset                Revertir todas las migraciones
    version              Mostrar versión actual
    validate             Validar migraciones

Opciones:
    -d, --database DB    Base de datos: postgres|mongodb|all (default: all)
    -v, --version VER    Versión específica para migrar
    --dry-run            Simular ejecución sin aplicar cambios
    -f, --force          Forzar ejecución sin confirmación
    --verbose            Modo verbose
    -h, --help           Mostrar esta ayuda

Ejemplos:
    $0 status                      # Ver estado de migraciones
    $0 up                          # Ejecutar todas las migraciones pendientes
    $0 up -d postgres              # Ejecutar migraciones solo en PostgreSQL
    $0 down                        # Revertir última migración
    $0 down -v 20240101120000      # Revertir a versión específica
    $0 create add_users_table      # Crear nueva migración
    $0 redo                        # Rehacer última migración
    $0 reset                       # Revertir todas las migraciones

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    # Primer argumento es el comando
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        ACTION="$1"
        shift
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--database)
                DATABASE="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Opción desconocida: $1"
                print_usage
                exit 1
                ;;
            *)
                # Para comando create, el argumento es el nombre
                if [[ "$ACTION" == "create" && -z "${NAME:-}" ]]; then
                    NAME="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Validar comando
    case $ACTION in
        up|down|redo|status|create|reset|version|validate)
            ;;
        *)
            log_error "Comando inválido: $ACTION"
            print_usage
            exit 1
            ;;
    esac
    
    # Validar base de datos
    case $DATABASE in
        postgres|mongodb|all)
            ;;
        *)
            log_error "Base de datos inválida: $DATABASE"
            print_usage
            exit 1
            ;;
    esac
}

# =============================================================================
# Cargar variables de entorno
# =============================================================================

load_env() {
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
        log_info "Variables de entorno cargadas"
    else
        log_warning "Archivo .env no encontrado"
    fi
}

# =============================================================================
# Confirmación para acciones destructivas
# =============================================================================

confirm_destructive() {
    if [[ "$FORCE" == true ]]; then
        return 0
    fi
    
    local action=$1
    
    echo
    log_warning "⚠️  Acción destructiva: $action"
    echo -e "  ${RED}• Esta acción puede modificar datos en la base de datos${NC}"
    echo
    read -p "¿Estás seguro? Escribe 'yes' para continuar: " -r
    echo
    
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Operación cancelada"
        exit 0
    fi
}

# =============================================================================
# Verificar contenedores
# =============================================================================

check_containers() {
    local db_type=$1
    local container_name=""
    
    case $db_type in
        postgres)
            container_name="postgres"
            ;;
        mongodb)
            container_name="mongodb"
            ;;
    esac
    
    if [[ -n "$container_name" ]]; then
        if ! docker ps --format '{{.Names}}' | grep -q "$container_name"; then
            log_error "Contenedor $container_name no está corriendo"
            log_info "Inicia la plataforma primero: ./start.sh"
            return 1
        fi
    fi
    
    return 0
}

# =============================================================================
# Migraciones PostgreSQL
# =============================================================================

postgres_migrate() {
    local action=$1
    
    log_migrate "PostgreSQL: $action"
    
    if ! check_containers "postgres"; then
        return 1
    fi
    
    local container="postgres"
    local database="${POSTGRES_DB:-ecommerce}"
    local user="${POSTGRES_USER:-ecommerce_user}"
    
    case $action in
        status)
            log_info "Estado de migraciones PostgreSQL:"
            docker exec "$container" psql -U "$user" -d "$database" -c "
                SELECT 
                    version,
                    name,
                    applied_at,
                    CASE 
                        WHEN applied_at IS NOT NULL THEN '✓ Aplicada'
                        ELSE '○ Pendiente'
                    END as status
                FROM schema_migrations 
                ORDER BY version;
            " 2>/dev/null || {
                log_info "Tabla de migraciones no existe. Creando..."
                docker exec "$container" psql -U "$user" -d "$database" -c "
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version VARCHAR(255) PRIMARY KEY,
                        name VARCHAR(255),
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        checksum VARCHAR(64)
                    );
                "
            }
            ;;
            
        up)
            log_info "Ejecutando migraciones pendientes..."
            
            # Verificar/crear tabla de migraciones
            docker exec "$container" psql -U "$user" -d "$database" -c "
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255),
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    checksum VARCHAR(64)
                );
            " 2>/dev/null
            
            # Buscar y ejecutar migraciones
            if [[ -d "$MIGRATIONS_DIR/postgres" ]]; then
                for migration in "$MIGRATIONS_DIR"/postgres/*.up.sql; do
                    if [[ -f "$migration" ]]; then
                        local filename
                        filename=$(basename "$migration")
                        local version
                        version=$(echo "$filename" | grep -oE '^[0-9]+')
                        local name
                        name=$(echo "$filename" | sed 's/^[0-9]*_//;s/\.up\.sql$//')
                        
                        # Verificar si ya está aplicada
                        local applied
                        applied=$(docker exec "$container" psql -U "$user" -d "$database" -t -c "
                            SELECT COUNT(*) FROM schema_migrations WHERE version = '$version';
                        " 2>/dev/null | tr -d ' ')
                        
                        if [[ "$applied" == "0" ]]; then
                            log_info "Aplicando migración: $filename"
                            
                            if [[ "$DRY_RUN" == false ]]; then
                                if docker exec -i "$container" psql -U "$user" -d "$database" < "$migration"; then
                                    docker exec "$container" psql -U "$user" -d "$database" -c "
                                        INSERT INTO schema_migrations (version, name, checksum)
                                        VALUES ('$version', '$name', '$(md5sum "$migration" | cut -d' ' -f1)');
                                    "
                                    log_success "Migración aplicada: $filename"
                                else
                                    log_error "Error aplicando migración: $filename"
                                    return 1
                                fi
                            else
                                log_info "[DRY-RUN] Se aplicaría: $filename"
                            fi
                        else
                            log_verbose "Migración ya aplicada: $filename"
                        fi
                    fi
                done
            else
                log_warning "Directorio de migraciones no encontrado: $MIGRATIONS_DIR/postgres"
            fi
            ;;
            
        down)
            confirm_destructive "Revertir migración PostgreSQL"
            
            log_info "Revirtiendo última migración..."
            
            if [[ -n "$VERSION" ]]; then
                # Revertir a versión específica
                local migration_file="$MIGRATIONS_DIR/postgres/${VERSION}_*.down.sql"
                if ls $migration_file 1> /dev/null 2>&1; then
                    for file in $migration_file; do
                        log_info "Revirtiendo: $(basename "$file")"
                        if [[ "$DRY_RUN" == false ]]; then
                            docker exec -i "$container" psql -U "$user" -d "$database" < "$file"
                            docker exec "$container" psql -U "$user" -d "$database" -c "
                                DELETE FROM schema_migrations WHERE version = '$VERSION';
                            "
                        fi
                    done
                fi
            else
                # Revertir última migración
                local last_version
                last_version=$(docker exec "$container" psql -U "$user" -d "$database" -t -c "
                    SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1;
                " 2>/dev/null | tr -d ' ')
                
                if [[ -n "$last_version" ]]; then
                    local down_file="$MIGRATIONS_DIR/postgres/${last_version}_*.down.sql"
                    if ls $down_file 1> /dev/null 2>&1; then
                        for file in $down_file; do
                            log_info "Revirtiendo: $(basename "$file")"
                            if [[ "$DRY_RUN" == false ]]; then
                                docker exec -i "$container" psql -U "$user" -d "$database" < "$file"
                                docker exec "$container" psql -U "$user" -d "$database" -c "
                                    DELETE FROM schema_migrations WHERE version = '$last_version';
                                "
                            fi
                        done
                    fi
                fi
            fi
            ;;
            
        create)
            local migration_name="${NAME:-migration}"
            local timestamp
            timestamp=$(date +%Y%m%d%H%M%S)
            
            mkdir -p "$MIGRATIONS_DIR/postgres"
            
            local up_file="$MIGRATIONS_DIR/postgres/${timestamp}_${migration_name}.up.sql"
            local down_file="$MIGRATIONS_DIR/postgres/${timestamp}_${migration_name}.down.sql"
            
            cat > "$up_file" << EOF
-- Migration: $migration_name
-- Created: $(date)
-- Up Migration

-- Add your migration here

EOF

            cat > "$down_file" << EOF
-- Migration: $migration_name
-- Created: $(date)
-- Down Migration (Rollback)

-- Add rollback statements here

EOF

            log_success "Migración creada:"
            log_info "  Up: $up_file"
            log_info "  Down: $down_file"
            ;;
            
        reset)
            confirm_destructive "Resetear todas las migraciones PostgreSQL"
            
            log_warning "Revirtiendo TODAS las migraciones..."
            
            # Obtener todas las migraciones aplicadas en orden inverso
            local versions
            versions=$(docker exec "$container" psql -U "$user" -d "$database" -t -c "
                SELECT version FROM schema_migrations ORDER BY applied_at DESC;
            " 2>/dev/null | tr -d ' ')
            
            for version in $versions; do
                local down_file="$MIGRATIONS_DIR/postgres/${version}_*.down.sql"
                if ls $down_file 1> /dev/null 2>&1; then
                    for file in $down_file; do
                        log_info "Revirtiendo: $(basename "$file")"
                        if [[ "$DRY_RUN" == false ]]; then
                            docker exec -i "$container" psql -U "$user" -d "$database" < "$file"
                        fi
                    done
                fi
            done
            
            if [[ "$DRY_RUN" == false ]]; then
                docker exec "$container" psql -U "$user" -d "$database" -c "DROP TABLE IF EXISTS schema_migrations;"
            fi
            
            log_success "Todas las migraciones revertidas"
            ;;
    esac
}

# =============================================================================
# Migraciones MongoDB
# =============================================================================

mongodb_migrate() {
    local action=$1
    
    log_migrate "MongoDB: $action"
    
    if ! check_containers "mongodb"; then
        return 1
    fi
    
    local container="mongodb"
    local database="${MONGODB_DB:-ecommerce_analytics}"
    
    case $action in
        status)
            log_info "Estado de migraciones MongoDB:"
            docker exec "$container" mongosh "$database" --eval "
                db.schema_migrations.find().sort({version: 1}).forEach(function(m) {
                    print(m.version + ' | ' + m.name + ' | ' + m.appliedAt + ' | ' + (m.applied ? '✓' : '○'));
                });
            " 2>/dev/null || log_info "No hay migraciones registradas"
            ;;
            
        up)
            log_info "Ejecutando migraciones MongoDB..."
            
            # Crear colección de migraciones si no existe
            docker exec "$container" mongosh "$database" --eval "
                db.createCollection('schema_migrations', { capped: false });
            " 2>/dev/null || true
            
            if [[ -d "$MIGRATIONS_DIR/mongodb" ]]; then
                for migration in "$MIGRATIONS_DIR"/mongodb/*.js; do
                    if [[ -f "$migration" ]]; then
                        local filename
                        filename=$(basename "$migration")
                        local version
                        version=$(echo "$filename" | grep -oE '^[0-9]+')
                        
                        # Verificar si ya está aplicada
                        local applied
                        applied=$(docker exec "$container" mongosh "$database" --eval "
                            db.schema_migrations.countDocuments({version: '$version'});
                        " 2>/dev/null | tail -n1)
                        
                        if [[ "$applied" == "0" ]]; then
                            log_info "Aplicando migración: $filename"
                            
                            if [[ "$DRY_RUN" == false ]]; then
                                if docker exec -i "$container" mongosh "$database" < "$migration"; then
                                    docker exec "$container" mongosh "$database" --eval "
                                        db.schema_migrations.insertOne({
                                            version: '$version',
                                            name: '$filename',
                                            appliedAt: new Date(),
                                            applied: true
                                        });
                                    "
                                    log_success "Migración aplicada: $filename"
                                else
                                    log_error "Error aplicando migración: $filename"
                                fi
                            else
                                log_info "[DRY-RUN] Se aplicaría: $filename"
                            fi
                        fi
                    fi
                done
            fi
            ;;
            
        down)
            confirm_destructive "Revertir migración MongoDB"
            log_info "Revirtiendo migración MongoDB..."
            # Implementación similar a PostgreSQL
            ;;
            
        create)
            local migration_name="${NAME:-migration}"
            local timestamp
            timestamp=$(date +%Y%m%d%H%M%S)
            
            mkdir -p "$MIGRATIONS_DIR/mongodb"
            
            local migration_file="$MIGRATIONS_DIR/mongodb/${timestamp}_${migration_name}.js"
            
            cat > "$migration_file" << EOF
// Migration: $migration_name
// Created: $(date)
// MongoDB Migration

db = db.getSiblingDB('$database');

// Add your migration here

// Example:
// db.collection('users').createIndex({ email: 1 }, { unique: true });

EOF

            log_success "Migración MongoDB creada: $migration_file"
            ;;
    esac
}

# =============================================================================
# Función verbose
# =============================================================================

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        log_info "$1"
    fi
}

# =============================================================================
# Función principal
# =============================================================================

main() {
    parse_args "$@"
    print_banner
    
    cd "$PROJECT_ROOT"
    
    load_env
    
    case $DATABASE in
        postgres)
            postgres_migrate "$ACTION"
            ;;
        mongodb)
            mongodb_migrate "$ACTION"
            ;;
        all)
            if [[ "$ACTION" != "create" ]]; then
                postgres_migrate "$ACTION"
                echo
                mongodb_migrate "$ACTION"
            else
                # Para create, crear en ambas bases de datos
                postgres_migrate "$ACTION"
                mongodb_migrate "$ACTION"
            fi
            ;;
    esac
    
    echo
    log_success "Operación completada: $ACTION"
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
