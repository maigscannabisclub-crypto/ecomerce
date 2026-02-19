import { Router } from 'express';
import { ProductController, HealthController } from '../controllers/ProductController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  createProductSchema,
  updateProductSchema,
  getProductByIdSchema,
  listProductsSchema,
  searchProductsSchema,
  updateStockSchema,
  createCategorySchema,
  updateCategorySchema,
  getCategoryByIdSchema,
  createSubcategorySchema,
  updateSubcategorySchema
} from '../middleware/validation';

// Initialize controllers
const productController = new ProductController();
const healthController = new HealthController();

// Create router
const router = Router();

// ==========================================
// Health Check
// ==========================================
router.get('/health', (req, res) => healthController.checkHealth(req, res));

// ==========================================
// Public Routes (No Authentication Required)
// ==========================================

// Products - Public
router.get('/products', validate(listProductsSchema), (req, res) => 
  productController.getProducts(req, res)
);

router.get('/products/search', validate(searchProductsSchema), (req, res) => 
  productController.searchProducts(req, res)
);

router.get('/products/:id', validate(getProductByIdSchema), (req, res) => 
  productController.getProductById(req, res)
);

// Categories - Public
router.get('/categories', (req, res) => 
  productController.getCategories(req, res)
);

router.get('/categories/:id', validate(getCategoryByIdSchema), (req, res) => 
  productController.getCategoryById(req, res)
);

// Subcategories - Public
router.get('/categories/:categoryId/subcategories', (req, res) => 
  productController.getSubcategoriesByCategory(req, res)
);

router.get('/subcategories/:id', validate(getCategoryByIdSchema), (req, res) => 
  productController.getSubcategoryById(req, res)
);

// ==========================================
// Protected Routes (ADMIN Only)
// ==========================================

// Apply authentication middleware to all routes below
router.use(authenticate);
router.use(requireAdmin);

// Products - Admin Only
router.post('/products', validate(createProductSchema), (req, res) => 
  productController.createProduct(req, res)
);

router.put('/products/:id', validate(updateProductSchema), (req, res) => 
  productController.updateProduct(req, res)
);

router.delete('/products/:id', validate(getProductByIdSchema), (req, res) => 
  productController.deleteProduct(req, res)
);

router.patch('/products/:id/stock', validate(updateStockSchema), (req, res) => 
  productController.updateStock(req, res)
);

// Categories - Admin Only
router.post('/categories', validate(createCategorySchema), (req, res) => 
  productController.createCategory(req, res)
);

router.put('/categories/:id', validate(updateCategorySchema), (req, res) => 
  productController.updateCategory(req, res)
);

router.delete('/categories/:id', validate(getCategoryByIdSchema), (req, res) => 
  productController.deleteCategory(req, res)
);

// Subcategories - Admin Only
router.post('/subcategories', validate(createSubcategorySchema), (req, res) => 
  productController.createSubcategory(req, res)
);

router.put('/subcategories/:id', validate(updateSubcategorySchema), (req, res) => 
  productController.updateSubcategory(req, res)
);

router.delete('/subcategories/:id', validate(getCategoryByIdSchema), (req, res) => 
  productController.deleteSubcategory(req, res)
);

export default router;
