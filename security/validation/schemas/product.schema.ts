/**
 * Product Validation Schemas
 * Zod schemas for product-related endpoints
 */

import { z } from 'zod';

// Price validation (positive, max 2 decimal places)
const priceSchema = z
  .number()
  .positive('Price must be positive')
  .max(999999999.99, 'Price exceeds maximum')
  .refine(
    (val) => {
      const decimals = (val.toString().split('.')[1] || '').length;
      return decimals <= 2;
    },
    { message: 'Price can have at most 2 decimal places' }
  );

// SKU validation
const skuSchema = z
  .string()
  .min(3, 'SKU must be at least 3 characters')
  .max(50, 'SKU too long')
  .regex(
    /^[A-Z0-9-]+$/,
    'SKU must contain only uppercase letters, numbers, and hyphens'
  );

// Slug validation
const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(200, 'Slug too long')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain only lowercase letters, numbers, and hyphens'
  );

// Create product schema
export const createProductSchema = z.object({
  name: z
    .string()
    .min(1, 'Product name is required')
    .max(200, 'Product name too long')
    .transform((val) => val.trim()),
  description: z
    .string()
    .max(5000, 'Description too long')
    .optional()
    .transform((val) => val?.trim()),
  sku: skuSchema,
  slug: slugSchema.optional(),
  price: priceSchema,
  compareAtPrice: priceSchema.optional().refine(
    (val) => {
      if (val === undefined) return true;
      return true; // Additional validation in refine below
    },
    { message: 'Compare at price must be higher than regular price' }
  ),
  cost: priceSchema.optional(),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(0, 'Quantity cannot be negative')
    .max(999999, 'Quantity exceeds maximum'),
  trackInventory: z.boolean().optional().default(true),
  allowBackorders: z.boolean().optional().default(false),
  status: z.enum(['draft', 'active', 'archived']).optional().default('draft'),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Tags must be lowercase alphanumeric with hyphens')
    )
    .max(50, 'Too many tags')
    .optional(),
  attributes: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        value: z.string().min(1).max(500),
      })
    )
    .max(100, 'Too many attributes')
    .optional(),
  images: z
    .array(
      z.object({
        url: z.string().url('Invalid image URL'),
        alt: z.string().max(200).optional(),
        position: z.number().int().min(0).optional(),
      })
    )
    .max(20, 'Too many images')
    .optional(),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(320).optional(),
      keywords: z.array(z.string().max(50)).max(20).optional(),
    })
    .optional(),
  weight: z
    .number()
    .positive()
    .max(999999, 'Weight exceeds maximum')
    .optional(),
  dimensions: z
    .object({
      length: z.number().positive().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    })
    .optional(),
  shippingRequired: z.boolean().optional().default(true),
  taxable: z.boolean().optional().default(true),
  taxCode: z.string().max(50).optional(),
  vendor: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  metaFields: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().min(1).max(1000),
      })
    )
    .max(100)
    .optional(),
}).refine(
  (data) => {
    if (data.compareAtPrice && data.price) {
      return data.compareAtPrice > data.price;
    }
    return true;
  },
  {
    message: 'Compare at price must be higher than regular price',
    path: ['compareAtPrice'],
  }
);

// Update product schema (all fields optional)
export const updateProductSchema = createProductSchema.partial();

// Product query schema
export const productQuerySchema = z.object({
  page: z
    .string()
    .or(z.number())
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => val >= 1, 'Page must be at least 1')
    .optional()
    .default('1'),
  limit: z
    .string()
    .or(z.number())
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .optional()
    .default('20'),
  sortBy: z
    .enum(['name', 'price', 'createdAt', 'updatedAt', 'quantity'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  minPrice: priceSchema.optional(),
  maxPrice: priceSchema.optional(),
  inStock: z.boolean().optional(),
  tags: z.string().optional(), // Comma-separated
  vendor: z.string().optional(),
});

// Create category schema
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(100, 'Category name too long')
    .transform((val) => val.trim()),
  description: z.string().max(1000).optional(),
  slug: slugSchema,
  parentId: z.string().uuid().optional(),
  image: z.string().url().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(320).optional(),
      keywords: z.array(z.string().max(50)).max(20).optional(),
    })
    .optional(),
  metaFields: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().min(1).max(1000),
      })
    )
    .max(100)
    .optional(),
});

// Update category schema
export const updateCategorySchema = createCategorySchema.partial();

// Create variant schema
export const createVariantSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  sku: skuSchema,
  name: z.string().min(1).max(200),
  price: priceSchema.optional(),
  quantity: z.number().int().min(0).optional().default(0),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        value: z.string().min(1).max(100),
      })
    )
    .min(1, 'At least one option is required'),
  image: z.string().url().optional(),
  barcode: z.string().max(50).optional(),
  weight: z.number().positive().optional(),
  isDefault: z.boolean().optional().default(false),
});

// Update variant schema
export const updateVariantSchema = createVariantSchema
  .omit({ productId: true })
  .partial();

// Bulk update schema
export const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
  data: z.object({
    status: z.enum(['draft', 'active', 'archived']).optional(),
    categoryId: z.string().uuid().optional(),
    price: priceSchema.optional(),
    compareAtPrice: priceSchema.optional(),
    quantity: z.number().int().min(0).optional(),
    tags: z.array(z.string()).optional(),
    taxable: z.boolean().optional(),
    shippingRequired: z.boolean().optional(),
  }),
});

// Product review schema
export const createReviewSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000),
  images: z.array(z.string().url()).max(5).optional(),
  verifiedPurchase: z.boolean().optional().default(false),
});

// Inventory adjustment schema
export const inventoryAdjustmentSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid().optional(),
  adjustment: z.number().int(),
  reason: z.enum([
    'restock',
    'damage',
    'theft',
    'return',
    'correction',
    'other',
  ]),
  notes: z.string().max(1000).optional(),
});

// Import products schema
export const importProductsSchema = z.object({
  format: z.enum(['csv', 'json', 'xml']).optional().default('csv'),
  skipValidation: z.boolean().optional().default(false),
  updateExisting: z.boolean().optional().default(false),
});

// Export products schema
export const exportProductsSchema = z.object({
  format: z.enum(['csv', 'json', 'xml']).optional().default('csv'),
  filters: z
    .object({
      categoryId: z.string().uuid().optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
      vendor: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  fields: z.array(z.string()).optional(),
});

// Types
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;
export type ImportProductsInput = z.infer<typeof importProductsSchema>;
export type ExportProductsInput = z.infer<typeof exportProductsSchema>;

export default {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  createVariantSchema,
  updateVariantSchema,
  bulkUpdateSchema,
  createReviewSchema,
  inventoryAdjustmentSchema,
  importProductsSchema,
  exportProductsSchema,
};
