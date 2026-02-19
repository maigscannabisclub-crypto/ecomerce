import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import productService from '../../application/services/ProductService';
import logger from '../../utils/logger';
import {
  CreateProductDTO,
  UpdateProductDTO,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  CreateSubcategoryDTO,
  UpdateSubcategoryDTO,
  UpdateStockDTO,
  ProductQueryDTO
} from '../../application/dto/ProductDTO';

// ==========================================
// Response Helpers
// ==========================================

const successResponse = <T>(data: T, meta?: Record<string, unknown>) => ({
  success: true,
  data,
  ...(meta && { meta })
});

const errorResponse = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: {
    code,
    message,
    ...(details && { details })
  }
});

// ==========================================
// Product Controller
// ==========================================

export class ProductController {
  private readonly logger = logger;

  // Create a new product (ADMIN only)
  async createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data: CreateProductDTO = req.body;
      const product = await productService.createProduct(data);

      res.status(201).json(successResponse(product, {
        message: 'Product created successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error creating product');
    }
  }

  // Get product by ID (Public)
  async getProductById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);

      if (!product) {
        res.status(404).json(errorResponse(
          'PRODUCT_NOT_FOUND',
          `Product with ID ${id} not found`
        ));
        return;
      }

      res.status(200).json(successResponse(product));
    } catch (error) {
      this.handleError(res, error, 'Error getting product');
    }
  }

  // List products with filters (Public)
  async getProducts(req: Request, res: Response): Promise<void> {
    try {
      const query: ProductQueryDTO = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        name: req.query.name as string,
        isActive: req.query.isActive !== undefined 
          ? req.query.isActive === 'true' 
          : true // Default to active products for public
      };

      const result = await productService.getProducts(query);

      res.status(200).json(successResponse(result.products, {
        pagination: result.pagination
      }));
    } catch (error) {
      this.handleError(res, error, 'Error getting products');
    }
  }

  // Search products (Public)
  async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.q as string;
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined
      };

      const result = await productService.searchProducts(search, filters);

      res.status(200).json(successResponse(result.products, {
        pagination: result.pagination,
        search
      }));
    } catch (error) {
      this.handleError(res, error, 'Error searching products');
    }
  }

  // Update product (ADMIN only)
  async updateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data: UpdateProductDTO = req.body;
      const product = await productService.updateProduct(id, data);

      res.status(200).json(successResponse(product, {
        message: 'Product updated successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error updating product');
    }
  }

  // Delete product (ADMIN only)
  async deleteProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await productService.deleteProduct(id);

      res.status(200).json(successResponse(null, {
        message: 'Product deleted successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error deleting product');
    }
  }

  // Update product stock (ADMIN only)
  async updateStock(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data: UpdateStockDTO = req.body;
      const result = await productService.updateStock(id, data);

      res.status(200).json(successResponse(result, {
        message: 'Stock updated successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error updating stock');
    }
  }

  // ==========================================
  // Category Methods
  // ==========================================

  // Create category (ADMIN only)
  async createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data: CreateCategoryDTO = req.body;
      const category = await productService.createCategory(data);

      res.status(201).json(successResponse(category, {
        message: 'Category created successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error creating category');
    }
  }

  // Get all categories (Public)
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await productService.getCategories();

      res.status(200).json(successResponse(categories));
    } catch (error) {
      this.handleError(res, error, 'Error getting categories');
    }
  }

  // Get category by ID (Public)
  async getCategoryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const category = await productService.getCategoryById(id);

      if (!category) {
        res.status(404).json(errorResponse(
          'CATEGORY_NOT_FOUND',
          `Category with ID ${id} not found`
        ));
        return;
      }

      res.status(200).json(successResponse(category));
    } catch (error) {
      this.handleError(res, error, 'Error getting category');
    }
  }

  // Update category (ADMIN only)
  async updateCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data: UpdateCategoryDTO = req.body;
      const category = await productService.updateCategory(id, data);

      res.status(200).json(successResponse(category, {
        message: 'Category updated successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error updating category');
    }
  }

  // Delete category (ADMIN only)
  async deleteCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await productService.deleteCategory(id);

      res.status(200).json(successResponse(null, {
        message: 'Category deleted successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error deleting category');
    }
  }

  // ==========================================
  // Subcategory Methods
  // ==========================================

  // Create subcategory (ADMIN only)
  async createSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data: CreateSubcategoryDTO = req.body;
      const subcategory = await productService.createSubcategory(data);

      res.status(201).json(successResponse(subcategory, {
        message: 'Subcategory created successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error creating subcategory');
    }
  }

  // Get subcategories by category (Public)
  async getSubcategoriesByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const subcategories = await productService.getSubcategoriesByCategory(categoryId);

      res.status(200).json(successResponse(subcategories));
    } catch (error) {
      this.handleError(res, error, 'Error getting subcategories');
    }
  }

  // Get subcategory by ID (Public)
  async getSubcategoryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const subcategory = await productService.getSubcategoryById(id);

      if (!subcategory) {
        res.status(404).json(errorResponse(
          'SUBCATEGORY_NOT_FOUND',
          `Subcategory with ID ${id} not found`
        ));
        return;
      }

      res.status(200).json(successResponse(subcategory));
    } catch (error) {
      this.handleError(res, error, 'Error getting subcategory');
    }
  }

  // Update subcategory (ADMIN only)
  async updateSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data: UpdateSubcategoryDTO = req.body;
      const subcategory = await productService.updateSubcategory(id, data);

      res.status(200).json(successResponse(subcategory, {
        message: 'Subcategory updated successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error updating subcategory');
    }
  }

  // Delete subcategory (ADMIN only)
  async deleteSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await productService.deleteSubcategory(id);

      res.status(200).json(successResponse(null, {
        message: 'Subcategory deleted successfully'
      }));
    } catch (error) {
      this.handleError(res, error, 'Error deleting subcategory');
    }
  }

  // ==========================================
  // Error Handler
  // ==========================================

  private handleError(res: Response, error: unknown, context: string): void {
    this.logger.error(context, error);

    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes('already exists')) {
        res.status(409).json(errorResponse(
          'CONFLICT',
          error.message
        ));
        return;
      }

      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse(
          'NOT_FOUND',
          error.message
        ));
        return;
      }

      if (error.message.includes('Cannot delete') || error.message.includes('Insufficient')) {
        res.status(400).json(errorResponse(
          'BAD_REQUEST',
          error.message
        ));
        return;
      }

      if (error.message.includes('does not belong')) {
        res.status(400).json(errorResponse(
          'VALIDATION_ERROR',
          error.message
        ));
        return;
      }

      res.status(400).json(errorResponse(
        'BAD_REQUEST',
        error.message
      ));
      return;
    }

    res.status(500).json(errorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred'
    ));
  }
}

// Health Check Controller
export class HealthController {
  private readonly logger = logger;

  async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const { checkDatabaseHealth } = await import('../../infrastructure/database/prisma');
      const { checkCacheHealth } = await import('../../infrastructure/cache/redis');
      const { checkMessageQueueHealth } = await import('../../infrastructure/messaging/rabbitmq');

      const [dbHealthy, cacheHealthy, mqHealthy] = await Promise.all([
        checkDatabaseHealth(),
        checkCacheHealth(),
        checkMessageQueueHealth()
      ]);

      const allHealthy = dbHealthy && cacheHealthy && mqHealthy;
      const status = allHealthy ? 'healthy' : cacheHealthy || mqHealthy ? 'degraded' : 'unhealthy';

      const healthCheck = {
        status,
        service: 'product-service',
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        checks: {
          database: dbHealthy,
          cache: cacheHealthy,
          messageQueue: mqHealthy
        }
      };

      const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        success: allHealthy,
        data: healthCheck
      });
    } catch (error) {
      this.logger.error('Health check failed', error);

      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Service health check failed'
        }
      });
    }
  }
}

export default new ProductController();
