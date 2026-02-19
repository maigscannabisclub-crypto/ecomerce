// ==========================================
// Product DTOs
// ==========================================

export interface CreateProductDTO {
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images?: string[];
  categoryId: string;
  subcategoryId: string;
  isActive?: boolean;
}

export interface UpdateProductDTO {
  sku?: string;
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  images?: string[];
  categoryId?: string;
  subcategoryId?: string;
  isActive?: boolean;
}

export interface ProductResponseDTO {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  categoryId: string;
  category?: CategoryResponseDTO;
  subcategoryId: string;
  subcategory?: SubcategoryResponseDTO;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductListResponseDTO {
  products: ProductResponseDTO[];
  pagination: PaginationDTO;
}

// ==========================================
// Category DTOs
// ==========================================

export interface CreateCategoryDTO {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateCategoryDTO {
  name?: string;
  slug?: string;
  description?: string;
}

export interface CategoryResponseDTO {
  id: string;
  name: string;
  slug: string;
  description?: string;
  subcategories?: SubcategoryResponseDTO[];
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Subcategory DTOs
// ==========================================

export interface CreateSubcategoryDTO {
  name: string;
  slug: string;
  categoryId: string;
}

export interface UpdateSubcategoryDTO {
  name?: string;
  slug?: string;
  categoryId?: string;
}

export interface SubcategoryResponseDTO {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  category?: CategoryResponseDTO;
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Pagination & Filter DTOs
// ==========================================

export interface PaginationDTO {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ProductFilterDTO {
  categoryId?: string;
  subcategoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  name?: string;
  isActive?: boolean;
  search?: string;
}

export interface ProductQueryDTO extends ProductFilterDTO {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ==========================================
// Event DTOs
// ==========================================

export interface ProductEventDTO {
  eventType: 'ProductCreated' | 'ProductUpdated' | 'ProductDeleted' | 'ProductStockChanged';
  productId: string;
  sku: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

// ==========================================
// Stock DTOs
// ==========================================

export interface UpdateStockDTO {
  quantity: number;
  operation: 'increment' | 'decrement' | 'set';
}

export interface StockResponseDTO {
  productId: string;
  sku: string;
  currentStock: number;
  previousStock: number;
  available: boolean;
}

// ==========================================
// Health Check DTO
// ==========================================

export interface HealthCheckDTO {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: Date;
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    cache: boolean;
    messageQueue: boolean;
  };
  details?: Record<string, unknown>;
}
