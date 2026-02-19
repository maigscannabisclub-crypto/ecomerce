-- =============================================================================
-- PRODUCT SERVICE - Database Initialization
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CATEGORIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    parent_id UUID REFERENCES categories(id),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PRODUCTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    available_quantity INTEGER GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    weight DECIMAL(8, 2),
    category_id UUID REFERENCES categories(id),
    images JSONB DEFAULT '[]',
    attributes JSONB DEFAULT '{}',
    seo_title VARCHAR(70),
    seo_description VARCHAR(160),
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PRODUCT VARIANTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2),
    quantity INTEGER DEFAULT 0,
    options JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(to_tsvector('spanish', name || ' ' || COALESCE(description, '')));

-- =============================================================================
-- SEED DATA - CATEGORIES
-- =============================================================================

INSERT INTO categories (name, slug, description, sort_order) VALUES
    ('Tazas', 'tazas', 'Tazas de cerámica y vidrio', 1),
    ('Para el bebé', 'para-el-bebe', 'Productos para bebés', 2)
ON CONFLICT (slug) DO NOTHING;

-- Subcategorías
WITH parent_tazas AS (SELECT id FROM categories WHERE slug = 'tazas'),
     parent_bebe AS (SELECT id FROM categories WHERE slug = 'para-el-bebe')
INSERT INTO categories (name, slug, description, parent_id, sort_order)
SELECT 'Tazas de Cerámica', 'tazas-ceramica', 'Tazas artesanales de cerámica', id, 1 FROM parent_tazas
UNION ALL
SELECT 'Tazas de Vidrio', 'tazas-vidrio', 'Tazas de vidrio templado', id, 2 FROM parent_tazas
UNION ALL
SELECT 'Juguetes', 'juguetes-bebe', 'Juguetes para bebés', id, 1 FROM parent_bebe
UNION ALL
SELECT 'Ropa', 'ropa-bebe', 'Ropa para bebés', id, 2 FROM parent_bebe
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- SEED DATA - PRODUCTS
-- =============================================================================

INSERT INTO products (sku, name, slug, description, short_description, price, quantity, category_id, is_active, is_featured, images)
SELECT 
    'TAZA-001',
    'Taza de Cerámica Artesanal',
    'taza-ceramica-artesanal',
    'Hermosa taza de cerámica hecha a mano por artesanos locales. Capacidad de 350ml.',
    'Taza artesanal de 350ml',
    24.99,
    100,
    id,
    true,
    true,
    '["https://example.com/taza1.jpg"]'
FROM categories WHERE slug = 'tazas-ceramica'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, slug, description, short_description, price, quantity, category_id, is_active, images)
SELECT 
    'JUG-001',
    'Sonajero de Madera Natural',
    'sonajero-madera-natural',
    'Sonajero de madera natural tratada, seguro para bebés. Diseño ergonómico.',
    'Sonajero de madera seguro',
    15.99,
    50,
    id,
    true,
    '["https://example.com/sonajero1.jpg"]'
FROM categories WHERE slug = 'juguetes-bebe'
ON CONFLICT (sku) DO NOTHING;
