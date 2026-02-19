#!/bin/bash

# =============================================================================
# E-Commerce Platform - Seed Script
# =============================================================================
# Script para cargar datos de prueba en la plataforma
# Incluye usuarios, productos, categorías, inventario y órdenes
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
readonly SEED_DIR="$PROJECT_ROOT/seeds"

# Variables
DATASET="all"
CLEAN=false
FORCE=false
VERBOSE=false
COUNT_USERS=10
COUNT_PRODUCTS=50
COUNT_ORDERS=20

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

log_seed() {
    echo -e "${PURPLE}[SEED]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║           🌱 E-COMMERCE PLATFORM - SEED                       ║
    ║                                                               ║
    ║           Cargando datos de prueba...                         ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Uso: $0 [DATASET] [OPCIONES]

Datasets:
    all                  Cargar todos los datos (default)
    users                Solo usuarios de prueba
    categories           Solo categorías de productos
    products             Solo productos
    inventory            Solo inventario
    orders               Solo órdenes de ejemplo

Opciones:
    -c, --clean          Limpiar datos existentes antes de cargar
    -f, --force          Forzar sin confirmación
    -n, --count NUM      Cantidad de registros a crear
    -v, --verbose        Modo verbose
    -h, --help           Mostrar esta ayuda

Ejemplos:
    $0                              # Cargar todos los datos
    $0 users                        # Solo usuarios
    $0 products -n 100              # 100 productos
    $0 all -c                       # Limpiar y cargar todo
    $0 orders -n 50 -v              # 50 órdenes con verbose

EOF
}

# =============================================================================
# Parseo de argumentos
# =============================================================================

parse_args() {
    # Primer argumento puede ser el dataset
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        DATASET="$1"
        shift
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--clean)
                CLEAN=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -n|--count)
                COUNT_USERS="$2"
                COUNT_PRODUCTS="$2"
                COUNT_ORDERS="$2"
                shift 2
                ;;
            -v|--verbose)
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
                log_error "Argumento no reconocido: $1"
                print_usage
                exit 1
                ;;
        esac
    done
    
    # Validar dataset
    case $DATASET in
        all|users|categories|products|inventory|orders)
            ;;
        *)
            log_error "Dataset inválido: $DATASET"
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
# Confirmación para limpiar datos
# =============================================================================

confirm_clean() {
    if [[ "$FORCE" == true ]]; then
        return 0
    fi
    
    echo
    log_warning "⚠️  Esta acción ELIMINARÁ todos los datos existentes"
    echo -e "  ${RED}• Los datos actuales se perderán permanentemente${NC}"
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
    local required_containers=("postgres" "mongodb" "redis")
    local missing=()
    
    for container in "${required_containers[@]}"; do
        if ! docker ps --format '{{.Names}}' | grep -q "$container"; then
            missing+=("$container")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Contenedores no disponibles: ${missing[*]}"
        log_info "Inicia la plataforma primero: ./start.sh"
        return 1
    fi
    
    return 0
}

# =============================================================================
# Limpiar datos existentes
# =============================================================================

clean_data() {
    log_warning "Limpiando datos existentes..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    local mongo_db="${MONGODB_DB:-ecommerce_analytics}"
    
    # Limpiar PostgreSQL
    log_info "Limpiando PostgreSQL..."
    docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
        TRUNCATE TABLE users, categories, products, orders, order_items, 
        inventory, reviews, carts, cart_items, wishlists CASCADE;
    " 2>/dev/null || true
    
    # Limpiar MongoDB
    log_info "Limpiando MongoDB..."
    docker exec mongodb mongosh "$mongo_db" --eval "
        db.getCollectionNames().forEach(function(c) {
            if (c !== 'schema_migrations') {
                db[c].drop();
            }
        });
    " 2>/dev/null || true
    
    # Limpiar Redis
    log_info "Limpiando Redis..."
    docker exec redis redis-cli FLUSHDB 2>/dev/null || true
    
    log_success "Datos limpiados"
}

# =============================================================================
# Generar datos de usuarios
# =============================================================================

seed_users() {
    log_seed "Creando usuarios de prueba..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    
    local users_sql="$SEED_DIR/users.sql"
    mkdir -p "$SEED_DIR"
    
    cat > "$users_sql" << 'EOF'
-- Users Seed Data
INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_active, created_at, updated_at) VALUES
('admin@ecommerce.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Admin', 'User', '+1234567890', 'admin', true, NOW(), NOW()),
('customer1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'John', 'Doe', '+1234567891', 'customer', true, NOW(), NOW()),
('customer2@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Jane', 'Smith', '+1234567892', 'customer', true, NOW(), NOW()),
('customer3@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Bob', 'Johnson', '+1234567893', 'customer', true, NOW(), NOW()),
('customer4@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Alice', 'Williams', '+1234567894', 'customer', true, NOW(), NOW()),
('customer5@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Charlie', 'Brown', '+1234567895', 'customer', true, NOW(), NOW()),
('manager@ecommerce.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Store', 'Manager', '+1234567896', 'manager', true, NOW(), NOW()),
('support@ecommerce.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Support', 'Agent', '+1234567897', 'support', true, NOW(), NOW()),
('vendor1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Vendor', 'One', '+1234567898', 'vendor', true, NOW(), NOW()),
('vendor2@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Vendor', 'Two', '+1234567899', 'vendor', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
EOF

    docker exec -i postgres psql -U "$postgres_user" -d "$postgres_db" < "$users_sql"
    
    log_success "Usuarios creados: 10"
    
    # Crear usuarios adicionales si se solicita
    if [[ $COUNT_USERS -gt 10 ]]; then
        log_info "Creando $((COUNT_USERS - 10)) usuarios adicionales..."
        
        for i in $(seq 11 $COUNT_USERS); do
            docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
                INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_active, created_at)
                VALUES ('user$i@example.com', '\$2b\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'User', 'Number$i', '+1234567$(printf "%03d" $i)', 'customer', true, NOW())
                ON CONFLICT (email) DO NOTHING;
            " 2>/dev/null || true
        done
        
        log_success "Usuarios adicionales creados: $((COUNT_USERS - 10))"
    fi
}

# =============================================================================
# Generar categorías
# =============================================================================

seed_categories() {
    log_seed "Creando categorías de productos..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    
    docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
        INSERT INTO categories (name, slug, description, parent_id, is_active, created_at) VALUES
        ('Electronics', 'electronics', 'Electronic devices and accessories', NULL, true, NOW()),
        ('Clothing', 'clothing', 'Fashion and apparel', NULL, true, NOW()),
        ('Home & Garden', 'home-garden', 'Home improvement and garden supplies', NULL, true, NOW()),
        ('Sports & Outdoors', 'sports-outdoors', 'Sports equipment and outdoor gear', NULL, true, NOW()),
        ('Books', 'books', 'Physical and digital books', NULL, true, NOW()),
        ('Smartphones', 'smartphones', 'Mobile phones and accessories', 1, true, NOW()),
        ('Laptops', 'laptops', 'Notebook computers and accessories', 1, true, NOW()),
        ('Men Clothing', 'men-clothing', 'Men\'s fashion', 2, true, NOW()),
        ('Women Clothing', 'women-clothing', 'Women\'s fashion', 2, true, NOW()),
        ('Furniture', 'furniture', 'Home furniture', 3, true, NOW())
        ON CONFLICT (slug) DO NOTHING;
    "
    
    log_success "Categorías creadas: 10"
}

# =============================================================================
# Generar productos
# =============================================================================

seed_products() {
    log_seed "Creando productos..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    
    local products_sql="$SEED_DIR/products.sql"
    mkdir -p "$SEED_DIR"
    
    cat > "$products_sql" << 'EOF'
-- Products Seed Data
INSERT INTO products (name, slug, description, sku, price, compare_at_price, cost_price, category_id, brand, weight, dimensions, is_active, is_featured, created_at, updated_at) VALUES
('iPhone 15 Pro', 'iphone-15-pro', 'Latest Apple iPhone with Pro features', 'APL-IP15P-001', 999.99, 1099.99, 799.99, 6, 'Apple', 0.187, '{"length": 14.7, "width": 7.15, "height": 0.78}', true, true, NOW(), NOW()),
('Samsung Galaxy S24', 'samsung-galaxy-s24', 'Samsung flagship smartphone', 'SAM-GS24-001', 899.99, 999.99, 699.99, 6, 'Samsung', 0.196, '{"length": 15.1, "width": 7.1, "height": 0.79}', true, true, NOW(), NOW()),
('MacBook Pro 16"', 'macbook-pro-16', 'Apple MacBook Pro with M3 chip', 'APL-MBP16-001', 2499.99, 2699.99, 1999.99, 7, 'Apple', 2.15, '{"length": 35.57, "width": 24.81, "height": 1.68}', true, true, NOW(), NOW()),
('Dell XPS 15', 'dell-xps-15', 'Premium Windows laptop', 'DLL-XPS15-001', 1799.99, 1999.99, 1399.99, 7, 'Dell', 1.86, '{"length": 34.4, "width": 23.0, "height": 1.8}', true, false, NOW(), NOW()),
('Men\'s Cotton T-Shirt', 'mens-cotton-tshirt', 'Comfortable cotton t-shirt', 'CLT-MT-001', 29.99, 39.99, 12.99, 8, 'Fashion Brand', 0.2, '{"length": 30, "width": 20, "height": 2}', true, false, NOW(), NOW()),
('Women\'s Summer Dress', 'womens-summer-dress', 'Light summer dress', 'CLT-WD-001', 59.99, 79.99, 24.99, 9, 'Fashion Brand', 0.3, '{"length": 35, "width": 25, "height": 3}', true, true, NOW(), NOW()),
('Modern Sofa', 'modern-sofa', '3-seat modern fabric sofa', 'FUR-SF-001', 799.99, 999.99, 499.99, 10, 'Home Comfort', 45.0, '{"length": 220, "width": 90, "height": 85}', true, true, NOW(), NOW()),
('Coffee Table', 'coffee-table', 'Wooden coffee table', 'FUR-CT-001', 199.99, 249.99, 129.99, 10, 'Home Comfort', 15.0, '{"length": 120, "width": 60, "height": 45}', true, false, NOW(), NOW()),
('Running Shoes', 'running-shoes', 'Professional running shoes', 'SPT-RS-001', 129.99, 159.99, 69.99, 4, 'SportMax', 0.5, '{"length": 32, "width": 12, "height": 12}', true, true, NOW(), NOW()),
('Yoga Mat', 'yoga-mat', 'Non-slip exercise yoga mat', 'SPT-YM-001', 39.99, 49.99, 15.99, 4, 'FitLife', 1.2, '{"length": 183, "width": 61, "height": 0.6}', true, false, NOW(), NOW()),
('The Great Gatsby', 'great-gatsby-book', 'Classic novel by F. Scott Fitzgerald', 'BK-GG-001', 14.99, 19.99, 7.99, 5, 'Penguin Books', 0.4, '{"length": 20, "width": 13, "height": 2}', true, false, NOW(), NOW()),
('Python Programming', 'python-programming-book', 'Learn Python programming', 'BK-PP-001', 49.99, 59.99, 29.99, 5, 'O\'Reilly', 0.8, '{"length": 23, "width": 17, "height": 3}', true, true, NOW(), NOW()),
('Wireless Earbuds', 'wireless-earbuds', 'Bluetooth wireless earbuds', 'APL-WE-001', 149.99, 199.99, 79.99, 6, 'TechSound', 0.05, '{"length": 5, "width": 3, "height": 2}', true, true, NOW(), NOW()),
('Smart Watch', 'smart-watch', 'Fitness and health tracking watch', 'APL-SW-001', 299.99, 349.99, 179.99, 6, 'FitTech', 0.05, '{"length": 4, "width": 3.5, "height": 1}', true, true, NOW(), NOW()),
('Gaming Laptop', 'gaming-laptop', 'High-performance gaming laptop', 'DLL-GL-001', 1999.99, 2299.99, 1499.99, 7, 'GamePro', 2.5, '{"length": 36, "width": 26, "height": 2.5}', true, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
EOF

    docker exec -i postgres psql -U "$postgres_user" -d "$postgres_db" < "$products_sql"
    
    log_success "Productos creados: 15"
    
    # Crear productos adicionales
    if [[ $COUNT_PRODUCTS -gt 15 ]]; then
        log_info "Creando $((COUNT_PRODUCTS - 15)) productos adicionales..."
        
        for i in $(seq 16 $COUNT_PRODUCTS); do
            local category_id=$(( (i % 10) + 1 ))
            local price=$(awk "BEGIN {printf \"%.2f\", ($i * 10) + 9.99}")
            
            docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
                INSERT INTO products (name, slug, description, sku, price, category_id, is_active, created_at)
                VALUES ('Product $i', 'product-$i', 'Description for product $i', 'SKU-$i', $price, $category_id, true, NOW())
                ON CONFLICT (slug) DO NOTHING;
            " 2>/dev/null || true
        done
        
        log_success "Productos adicionales creados: $((COUNT_PRODUCTS - 15))"
    fi
}

# =============================================================================
# Generar inventario
# =============================================================================

seed_inventory() {
    log_seed "Creando inventario..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    
    # Obtener IDs de productos
    local product_ids
    product_ids=$(docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -t -c "SELECT id FROM products;" 2>/dev/null | tr -d ' ')
    
    for product_id in $product_ids; do
        local quantity=$(( (RANDOM % 100) + 10 ))
        local min_stock=$(( (RANDOM % 10) + 5 ))
        local warehouse="WH-$(printf "%03d" $((RANDOM % 5 + 1)))"
        
        docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
            INSERT INTO inventory (product_id, quantity, reserved_quantity, min_stock_level, warehouse_location, updated_at)
            VALUES ($product_id, $quantity, 0, $min_stock, '$warehouse', NOW())
            ON CONFLICT (product_id) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                min_stock_level = EXCLUDED.min_stock_level,
                warehouse_location = EXCLUDED.warehouse_location,
                updated_at = NOW();
        " 2>/dev/null || true
    done
    
    local count
    count=$(echo "$product_ids" | wc -w)
    log_success "Registros de inventario creados: $count"
}

# =============================================================================
# Generar órdenes
# =============================================================================

seed_orders() {
    log_seed "Creando órdenes de ejemplo..."
    
    local postgres_db="${POSTGRES_DB:-ecommerce}"
    local postgres_user="${POSTGRES_USER:-ecommerce_user}"
    
    # Obtener usuarios y productos
    local user_ids
    user_ids=$(docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -t -c "SELECT id FROM users WHERE role = 'customer';" 2>/dev/null | tr -d ' ')
    
    local product_ids
    product_ids=$(docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -t -c "SELECT id FROM products;" 2>/dev/null | tr -d ' ')
    
    local statuses=("pending" "processing" "shipped" "delivered" "cancelled")
    local payment_methods=("credit_card" "paypal" "stripe")
    
    for i in $(seq 1 $COUNT_ORDERS); do
        local user_id=$(echo "$user_ids" | tr ' ' '\n' | shuf -n1)
        local status=${statuses[$((RANDOM % ${#statuses[@]}))]}
        local payment_method=${payment_methods[$((RANDOM % ${#payment_methods[@]}))]}
        local total_amount=$(awk "BEGIN {printf \"%.2f\", ($RANDOM % 500) + 50 + ($RANDOM % 100) / 100}")
        
        # Crear orden
        local order_id
        order_id=$(docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -t -c "
            INSERT INTO orders (user_id, status, total_amount, currency, payment_method, payment_status, shipping_address, billing_address, created_at, updated_at)
            VALUES ($user_id, '$status', $total_amount, 'USD', '$payment_method', 'paid', 
                '{\"street\": \"123 Main St\", \"city\": \"New York\", \"state\": \"NY\", \"zip\": \"10001\", \"country\": \"USA\"}',
                '{\"street\": \"123 Main St\", \"city\": \"New York\", \"state\": \"NY\", \"zip\": \"10001\", \"country\": \"USA\"}',
                NOW() - interval '$((RANDOM % 30)) days',
                NOW())
            RETURNING id;
        " 2>/dev/null | tr -d ' ')
        
        if [[ -n "$order_id" ]]; then
            # Crear items de la orden
            local num_items=$(( (RANDOM % 3) + 1 ))
            for j in $(seq 1 $num_items); do
                local product_id=$(echo "$product_ids" | tr ' ' '\n' | shuf -n1)
                local quantity=$(( (RANDOM % 3) + 1 ))
                local unit_price=$(awk "BEGIN {printf \"%.2f\", ($RANDOM % 200) + 10 + ($RANDOM % 100) / 100}")
                
                docker exec postgres psql -U "$postgres_user" -d "$postgres_db" -c "
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                    VALUES ($order_id, $product_id, $quantity, $unit_price, $unit_price * $quantity);
                " 2>/dev/null || true
            done
        fi
    done
    
    log_success "Órdenes creadas: $COUNT_ORDERS"
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
    
    if ! check_containers; then
        exit 1
    fi
    
    if [[ "$CLEAN" == true ]]; then
        confirm_clean
        clean_data
    fi
    
    case $DATASET in
        all)
            seed_users
            seed_categories
            seed_products
            seed_inventory
            seed_orders
            ;;
        users)
            seed_users
            ;;
        categories)
            seed_categories
            ;;
        products)
            seed_products
            ;;
        inventory)
            seed_inventory
            ;;
        orders)
            seed_orders
            ;;
    esac
    
    echo
    log_success "✅ Datos de seed cargados exitosamente!"
    echo
    log_info "Resumen:"
    log_info "  • Usuarios: $COUNT_USERS (incluyendo admin, manager, vendors)"
    log_info "  • Categorías: 10"
    log_info "  • Productos: $COUNT_PRODUCTS"
    log_info "  • Órdenes: $COUNT_ORDERS"
    echo
    log_info "Credenciales de prueba:"
    log_info "  Admin: admin@ecommerce.com / password"
    log_info "  Customer: customer1@example.com / password"
}

# Manejo de señales
trap 'log_error "\nScript interrumpido"; exit 130' INT TERM

# Ejecutar función principal
main "$@"
