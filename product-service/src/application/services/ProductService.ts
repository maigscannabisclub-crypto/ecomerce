import prisma from '../../infrastructure/database/prisma';
import cache from '../../infrastructure/cache/redis';
import messaging from '../../infrastructure/messaging/rabbitmq';
import logger from '../../utils/logger';
import {
  CreateProductDTO,
  UpdateProductDTO,
  ProductResponseDTO,
  ProductListResponseDTO,
  ProductQueryDTO,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  CategoryResponseDTO,
  CreateSubcategoryDTO,
  UpdateSubcategoryDTO,
  SubcategoryResponseDTO,
  UpdateStockDTO,
  StockResponseDTO,
  PaginationDTO
} from '../dto/ProductDTO';

export class ProductService {
  private readonly logger = logger;

  // ==========================================
  // Product Methods
  // ==========================================

  async createProduct(data: CreateProductDTO): Promise<ProductResponseDTO> {
    try {
      // Check if SKU already exists
      const existingProduct = await prisma.product.findUnique({
        where: { sku: data.sku }
      });

      if (existingProduct) {
        throw new Error(`Product with SKU ${data.sku} already exists`);
      }

      // Verify category exists
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId }
      });

      if (!category) {
        throw new Error(`Category with ID ${data.categoryId} not found`);
      }

      // Verify subcategory exists and belongs to the category
      const subcategory = await prisma.subcategory.findUnique({
        where: { id: data.subcategoryId }
      });

      if (!subcategory) {
        throw new Error(`Subcategory with ID ${data.subcategoryId} not found`);
      }

      if (subcategory.categoryId !== data.categoryId) {
        throw new Error('Subcategory does not belong to the specified category');
      }

      // Create product
      const product = await prisma.product.create({
        data: {
          sku: data.sku,
          name: data.name,
          description: data.description,
          price: data.price,
          stock: data.stock,
          images: data.images || [],
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          isActive: data.isActive ?? true
        },
        include: {
          category: true,
          subcategory: true
        }
      });

      // Publish event
      await messaging.publishProductCreated(product.id, product.sku, {
        name: product.name,
        price: product.price,
        stock: product.stock,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId
      });

      // Invalidate cache
      await cache.invalidateProductCache();

      this.logger.info(`Product created: ${product.sku}`, { productId: product.id });

      return this.mapProductToDTO(product);
    } catch (error) {
      this.logger.error('Error creating product', error);
      throw error;
    }
  }

  async getProductById(id: string): Promise<ProductResponseDTO | null> {
    try {
      // Try cache first
      const cacheKey = cache.generateProductKey(id);
      const cached = await cache.get<ProductResponseDTO>(cacheKey);

      if (cached) {
        this.logger.debug(`Product cache hit: ${id}`);
        return cached;
      }

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          subcategory: true
        }
      });

      if (!product) {
        return null;
      }

      const productDTO = this.mapProductToDTO(product);

      // Cache the result
      await cache.set(cacheKey, productDTO);

      return productDTO;
    } catch (error) {
      this.logger.error(`Error getting product by ID: ${id}`, error);
      throw error;
    }
  }

  async getProductBySKU(sku: string): Promise<ProductResponseDTO | null> {
    try {
      const product = await prisma.product.findUnique({
        where: { sku },
        include: {
          category: true,
          subcategory: true
        }
      });

      if (!product) {
        return null;
      }

      return this.mapProductToDTO(product);
    } catch (error) {
      this.logger.error(`Error getting product by SKU: ${sku}`, error);
      throw error;
    }
  }

  async getProducts(query: ProductQueryDTO): Promise<ProductListResponseDTO> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        categoryId,
        subcategoryId,
        minPrice,
        maxPrice,
        name,
        isActive = true,
        search
      } = query;

      // Build where clause
      const where: Record<string, unknown> = {};

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (subcategoryId) {
        where.subcategoryId = subcategoryId;
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {};
        if (minPrice !== undefined) {
          (where.price as Record<string, unknown>).gte = minPrice;
        }
        if (maxPrice !== undefined) {
          (where.price as Record<string, unknown>).lte = maxPrice;
        }
      }

      if (name) {
        where.name = {
          contains: name,
          mode: 'insensitive'
        };
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Try cache for list queries
      const cacheKey = cache.generateProductListKey({ page, limit, sortBy, sortOrder, ...where });
      const cached = await cache.get<ProductListResponseDTO>(cacheKey);

      if (cached) {
        this.logger.debug('Product list cache hit');
        return cached;
      }

      // Get total count
      const total = await prisma.product.count({ where });

      // Get products
      const products = await prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder
        },
        include: {
          category: true,
          subcategory: true
        }
      });

      const totalPages = Math.ceil(total / limit);

      const result: ProductListResponseDTO = {
        products: products.map(p => this.mapProductToDTO(p)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

      // Cache the result
      await cache.set(cacheKey, result, 60); // Shorter TTL for lists

      return result;
    } catch (error) {
      this.logger.error('Error getting products', error);
      throw error;
    }
  }

  async searchProducts(
    search: string,
    filters: Omit<ProductQueryDTO, 'search'> = {}
  ): Promise<ProductListResponseDTO> {
    try {
      const { page = 1, limit = 10 } = filters;

      // Try cache
      const cacheKey = cache.generateSearchKey(search, filters);
      const cached = await cache.get<ProductListResponseDTO>(cacheKey);

      if (cached) {
        this.logger.debug('Search cache hit');
        return cached;
      }

      const where: Record<string, unknown> = {
        isActive: true,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ]
      };

      if (filters.categoryId) {
        where.categoryId = filters.categoryId;
      }

      if (filters.subcategoryId) {
        where.subcategoryId = filters.subcategoryId;
      }

      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        where.price = {};
        if (filters.minPrice !== undefined) {
          (where.price as Record<string, unknown>).gte = filters.minPrice;
        }
        if (filters.maxPrice !== undefined) {
          (where.price as Record<string, unknown>).lte = filters.maxPrice;
        }
      }

      const total = await prisma.product.count({ where });

      const products = await prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          name: 'asc'
        },
        include: {
          category: true,
          subcategory: true
        }
      });

      const totalPages = Math.ceil(total / limit);

      const result: ProductListResponseDTO = {
        products: products.map(p => this.mapProductToDTO(p)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

      // Cache the result
      await cache.set(cacheKey, result, 30); // Short TTL for search

      return result;
    } catch (error) {
      this.logger.error(`Error searching products: ${search}`, error);
      throw error;
    }
  }

  async updateProduct(id: string, data: UpdateProductDTO): Promise<ProductResponseDTO> {
    try {
      // Check if product exists
      const existingProduct = await prisma.product.findUnique({
        where: { id }
      });

      if (!existingProduct) {
        throw new Error(`Product with ID ${id} not found`);
      }

      // Check SKU uniqueness if being updated
      if (data.sku && data.sku !== existingProduct.sku) {
        const skuExists = await prisma.product.findUnique({
          where: { sku: data.sku }
        });

        if (skuExists) {
          throw new Error(`Product with SKU ${data.sku} already exists`);
        }
      }

      // Verify category/subcategory if being updated
      if (data.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: data.categoryId }
        });

        if (!category) {
          throw new Error(`Category with ID ${data.categoryId} not found`);
        }
      }

      if (data.subcategoryId) {
        const subcategory = await prisma.subcategory.findUnique({
          where: { id: data.subcategoryId }
        });

        if (!subcategory) {
          throw new Error(`Subcategory with ID ${data.subcategoryId} not found`);
        }

        const categoryId = data.categoryId || existingProduct.categoryId;
        if (subcategory.categoryId !== categoryId) {
          throw new Error('Subcategory does not belong to the specified category');
        }
      }

      // Track changes for event
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && existingProduct[key as keyof typeof existingProduct] !== value) {
          changes[key] = {
            old: existingProduct[key as keyof typeof existingProduct],
            new: value
          };
        }
      }

      // Update product
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(data.sku && { sku: data.sku }),
          ...(data.name && { name: data.name }),
          ...(data.description && { description: data.description }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.stock !== undefined && { stock: data.stock }),
          ...(data.images && { images: data.images }),
          ...(data.categoryId && { categoryId: data.categoryId }),
          ...(data.subcategoryId && { subcategoryId: data.subcategoryId }),
          ...(data.isActive !== undefined && { isActive: data.isActive })
        },
        include: {
          category: true,
          subcategory: true
        }
      });

      // Publish event
      await messaging.publishProductUpdated(product.id, product.sku, {
        name: product.name,
        price: product.price,
        stock: product.stock,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId
      }, changes);

      // Invalidate cache
      await cache.invalidateProductCache(id);

      this.logger.info(`Product updated: ${product.sku}`, { productId: product.id });

      return this.mapProductToDTO(product);
    } catch (error) {
      this.logger.error(`Error updating product: ${id}`, error);
      throw error;
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      const product = await prisma.product.findUnique({
        where: { id }
      });

      if (!product) {
        throw new Error(`Product with ID ${id} not found`);
      }

      await prisma.product.delete({
        where: { id }
      });

      // Publish event
      await messaging.publishProductDeleted(id, product.sku, {
        name: product.name,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId
      });

      // Invalidate cache
      await cache.invalidateProductCache(id);

      this.logger.info(`Product deleted: ${product.sku}`, { productId: id });
    } catch (error) {
      this.logger.error(`Error deleting product: ${id}`, error);
      throw error;
    }
  }

  async updateStock(id: string, data: UpdateStockDTO): Promise<StockResponseDTO> {
    try {
      const product = await prisma.product.findUnique({
        where: { id }
      });

      if (!product) {
        throw new Error(`Product with ID ${id} not found`);
      }

      const oldStock = product.stock;
      let newStock: number;

      switch (data.operation) {
        case 'increment':
          newStock = oldStock + data.quantity;
          break;
        case 'decrement':
          newStock = oldStock - data.quantity;
          if (newStock < 0) {
            throw new Error('Insufficient stock');
          }
          break;
        case 'set':
          newStock = data.quantity;
          if (newStock < 0) {
            throw new Error('Stock cannot be negative');
          }
          break;
        default:
          throw new Error('Invalid stock operation');
      }

      await prisma.product.update({
        where: { id },
        data: { stock: newStock }
      });

      // Publish event
      await messaging.publishProductStockChanged(id, product.sku, oldStock, newStock, {
        name: product.name,
        operation: data.operation
      });

      // Invalidate cache
      await cache.invalidateProductCache(id);

      this.logger.info(`Stock updated for product: ${product.sku}`, {
        productId: id,
        oldStock,
        newStock
      });

      return {
        productId: id,
        sku: product.sku,
        currentStock: newStock,
        previousStock: oldStock,
        available: newStock > 0 && product.isActive
      };
    } catch (error) {
      this.logger.error(`Error updating stock for product: ${id}`, error);
      throw error;
    }
  }

  // ==========================================
  // Category Methods
  // ==========================================

  async createCategory(data: CreateCategoryDTO): Promise<CategoryResponseDTO> {
    try {
      // Check if slug already exists
      const existing = await prisma.category.findUnique({
        where: { slug: data.slug }
      });

      if (existing) {
        throw new Error(`Category with slug ${data.slug} already exists`);
      }

      const category = await prisma.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description
        }
      });

      this.logger.info(`Category created: ${category.slug}`, { categoryId: category.id });

      return this.mapCategoryToDTO(category);
    } catch (error) {
      this.logger.error('Error creating category', error);
      throw error;
    }
  }

  async getCategoryById(id: string): Promise<CategoryResponseDTO | null> {
    try {
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          subcategories: true,
          _count: {
            select: { products: true }
          }
        }
      });

      if (!category) {
        return null;
      }

      return this.mapCategoryToDTO(category);
    } catch (error) {
      this.logger.error(`Error getting category by ID: ${id}`, error);
      throw error;
    }
  }

  async getCategoryBySlug(slug: string): Promise<CategoryResponseDTO | null> {
    try {
      const category = await prisma.category.findUnique({
        where: { slug },
        include: {
          subcategories: true,
          _count: {
            select: { products: true }
          }
        }
      });

      if (!category) {
        return null;
      }

      return this.mapCategoryToDTO(category);
    } catch (error) {
      this.logger.error(`Error getting category by slug: ${slug}`, error);
      throw error;
    }
  }

  async getCategories(): Promise<CategoryResponseDTO[]> {
    try {
      const categories = await prisma.category.findMany({
        include: {
          subcategories: true,
          _count: {
            select: { products: true }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      return categories.map(c => this.mapCategoryToDTO(c));
    } catch (error) {
      this.logger.error('Error getting categories', error);
      throw error;
    }
  }

  async updateCategory(id: string, data: UpdateCategoryDTO): Promise<CategoryResponseDTO> {
    try {
      const existing = await prisma.category.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Category with ID ${id} not found`);
      }

      if (data.slug && data.slug !== existing.slug) {
        const slugExists = await prisma.category.findUnique({
          where: { slug: data.slug }
        });

        if (slugExists) {
          throw new Error(`Category with slug ${data.slug} already exists`);
        }
      }

      const category = await prisma.category.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.slug && { slug: data.slug }),
          ...(data.description !== undefined && { description: data.description })
        },
        include: {
          subcategories: true,
          _count: {
            select: { products: true }
          }
        }
      });

      this.logger.info(`Category updated: ${category.slug}`, { categoryId: category.id });

      return this.mapCategoryToDTO(category);
    } catch (error) {
      this.logger.error(`Error updating category: ${id}`, error);
      throw error;
    }
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: { products: true }
          }
        }
      });

      if (!category) {
        throw new Error(`Category with ID ${id} not found`);
      }

      if (category._count.products > 0) {
        throw new Error('Cannot delete category with associated products');
      }

      await prisma.category.delete({
        where: { id }
      });

      this.logger.info(`Category deleted: ${category.slug}`, { categoryId: id });
    } catch (error) {
      this.logger.error(`Error deleting category: ${id}`, error);
      throw error;
    }
  }

  // ==========================================
  // Subcategory Methods
  // ==========================================

  async createSubcategory(data: CreateSubcategoryDTO): Promise<SubcategoryResponseDTO> {
    try {
      // Verify category exists
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId }
      });

      if (!category) {
        throw new Error(`Category with ID ${data.categoryId} not found`);
      }

      // Check if slug already exists
      const existing = await prisma.subcategory.findUnique({
        where: { slug: data.slug }
      });

      if (existing) {
        throw new Error(`Subcategory with slug ${data.slug} already exists`);
      }

      const subcategory = await prisma.subcategory.create({
        data: {
          name: data.name,
          slug: data.slug,
          categoryId: data.categoryId
        },
        include: {
          category: true
        }
      });

      this.logger.info(`Subcategory created: ${subcategory.slug}`, { subcategoryId: subcategory.id });

      return this.mapSubcategoryToDTO(subcategory);
    } catch (error) {
      this.logger.error('Error creating subcategory', error);
      throw error;
    }
  }

  async getSubcategoryById(id: string): Promise<SubcategoryResponseDTO | null> {
    try {
      const subcategory = await prisma.subcategory.findUnique({
        where: { id },
        include: {
          category: true,
          _count: {
            select: { products: true }
          }
        }
      });

      if (!subcategory) {
        return null;
      }

      return this.mapSubcategoryToDTO(subcategory);
    } catch (error) {
      this.logger.error(`Error getting subcategory by ID: ${id}`, error);
      throw error;
    }
  }

  async getSubcategoriesByCategory(categoryId: string): Promise<SubcategoryResponseDTO[]> {
    try {
      const subcategories = await prisma.subcategory.findMany({
        where: { categoryId },
        include: {
          category: true,
          _count: {
            select: { products: true }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      return subcategories.map(s => this.mapSubcategoryToDTO(s));
    } catch (error) {
      this.logger.error(`Error getting subcategories by category: ${categoryId}`, error);
      throw error;
    }
  }

  async updateSubcategory(id: string, data: UpdateSubcategoryDTO): Promise<SubcategoryResponseDTO> {
    try {
      const existing = await prisma.subcategory.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Subcategory with ID ${id} not found`);
      }

      if (data.slug && data.slug !== existing.slug) {
        const slugExists = await prisma.subcategory.findUnique({
          where: { slug: data.slug }
        });

        if (slugExists) {
          throw new Error(`Subcategory with slug ${data.slug} already exists`);
        }
      }

      if (data.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: data.categoryId }
        });

        if (!category) {
          throw new Error(`Category with ID ${data.categoryId} not found`);
        }
      }

      const subcategory = await prisma.subcategory.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.slug && { slug: data.slug }),
          ...(data.categoryId && { categoryId: data.categoryId })
        },
        include: {
          category: true,
          _count: {
            select: { products: true }
          }
        }
      });

      this.logger.info(`Subcategory updated: ${subcategory.slug}`, { subcategoryId: subcategory.id });

      return this.mapSubcategoryToDTO(subcategory);
    } catch (error) {
      this.logger.error(`Error updating subcategory: ${id}`, error);
      throw error;
    }
  }

  async deleteSubcategory(id: string): Promise<void> {
    try {
      const subcategory = await prisma.subcategory.findUnique({
        where: { id },
        include: {
          _count: {
            select: { products: true }
          }
        }
      });

      if (!subcategory) {
        throw new Error(`Subcategory with ID ${id} not found`);
      }

      if (subcategory._count.products > 0) {
        throw new Error('Cannot delete subcategory with associated products');
      }

      await prisma.subcategory.delete({
        where: { id }
      });

      this.logger.info(`Subcategory deleted: ${subcategory.slug}`, { subcategoryId: id });
    } catch (error) {
      this.logger.error(`Error deleting subcategory: ${id}`, error);
      throw error;
    }
  }

  // ==========================================
  // Mapper Methods
  // ==========================================

  private mapProductToDTO(product: any): ProductResponseDTO {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price.toString()),
      stock: product.stock,
      images: product.images,
      categoryId: product.categoryId,
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
        description: product.category.description,
        createdAt: product.category.createdAt,
        updatedAt: product.category.updatedAt
      } : undefined,
      subcategoryId: product.subcategoryId,
      subcategory: product.subcategory ? {
        id: product.subcategory.id,
        name: product.subcategory.name,
        slug: product.subcategory.slug,
        categoryId: product.subcategory.categoryId,
        createdAt: product.subcategory.createdAt,
        updatedAt: product.subcategory.updatedAt
      } : undefined,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  }

  private mapCategoryToDTO(category: any): CategoryResponseDTO {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      subcategories: category.subcategories?.map((s: any) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        categoryId: s.categoryId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      productCount: category._count?.products || 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }

  private mapSubcategoryToDTO(subcategory: any): SubcategoryResponseDTO {
    return {
      id: subcategory.id,
      name: subcategory.name,
      slug: subcategory.slug,
      categoryId: subcategory.categoryId,
      category: subcategory.category ? {
        id: subcategory.category.id,
        name: subcategory.category.name,
        slug: subcategory.category.slug,
        description: subcategory.category.description,
        createdAt: subcategory.category.createdAt,
        updatedAt: subcategory.category.updatedAt
      } : undefined,
      productCount: subcategory._count?.products || 0,
      createdAt: subcategory.createdAt,
      updatedAt: subcategory.updatedAt
    };
  }
}

export default new ProductService();
