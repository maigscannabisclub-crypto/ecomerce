/**
 * Order Validation Schemas
 * Zod schemas for order-related endpoints
 */

import { z } from 'zod';

// Price validation
const priceSchema = z
  .number()
  .positive('Price must be positive')
  .max(999999999.99, 'Price exceeds maximum');

// Phone validation
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)');

// Order item schema
export const orderItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(50),
  quantity: z.number().int().positive().max(999),
  price: priceSchema,
  originalPrice: priceSchema.optional(),
  tax: priceSchema.optional().default(0),
  total: priceSchema,
  attributes: z
    .record(z.string())
    .refine((obj) => Object.keys(obj).length <= 20)
    .optional(),
  image: z.string().url().optional(),
});

// Create order schema
export const createOrderSchema = z.object({
  cartId: z.string().uuid('Invalid cart ID').optional(),
  items: z.array(orderItemSchema).min(1).max(100).optional(),
  shippingAddress: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    company: z.string().max(100).optional(),
    street1: z.string().min(1).max(200),
    street2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(20),
    country: z.string().length(2),
    phone: phoneSchema.optional(),
  }),
  billingAddress: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    company: z.string().max(100).optional(),
    street1: z.string().min(1).max(200),
    street2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(20),
    country: z.string().length(2),
    phone: phoneSchema.optional(),
  }),
  email: z.string().email('Invalid email'),
  phone: phoneSchema.optional(),
  shippingMethod: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    price: priceSchema,
    estimatedDays: z.number().int().positive().optional(),
  }),
  paymentMethod: z.enum([
    'credit_card',
    'paypal',
    'stripe',
    'apple_pay',
    'google_pay',
    'bank_transfer',
    'cod',
  ]),
  paymentToken: z.string().optional(),
  couponCode: z
    .string()
    .max(50)
    .regex(/^[A-Z0-9-]*$/)
    .optional(),
  giftCards: z
    .array(
      z.object({
        code: z.string().min(1).max(50),
        amount: priceSchema,
      })
    )
    .max(5)
    .optional(),
  customerNote: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z
    .record(z.string())
    .refine((obj) => Object.keys(obj).length <= 50)
    .optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
});

// Update order schema (admin only)
export const updateOrderSchema = z.object({
  status: z
    .enum([
      'pending',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
      'on_hold',
    ])
    .optional(),
  paymentStatus: z
    .enum(['pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded'])
    .optional(),
  fulfillmentStatus: z
    .enum(['unfulfilled', 'partial', 'fulfilled', 'restocked'])
    .optional(),
  shippingAddress: z
    .object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      company: z.string().max(100).optional(),
      street1: z.string().min(1).max(200).optional(),
      street2: z.string().max(200).optional(),
      city: z.string().min(1).max(100).optional(),
      state: z.string().min(1).max(100).optional(),
      postalCode: z.string().min(1).max(20).optional(),
      country: z.string().length(2).optional(),
      phone: phoneSchema.optional(),
    })
    .optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  customerNote: z.string().max(1000).optional(),
  staffNote: z.string().max(2000).optional(),
  metadata: z.record(z.string()).optional(),
});

// Order query schema
export const orderQuerySchema = z.object({
  page: z
    .string()
    .or(z.number())
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => val >= 1)
    .optional()
    .default('1'),
  limit: z
    .string()
    .or(z.number())
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => val >= 1 && val <= 100)
    .optional()
    .default('20'),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'total', 'status'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  status: z
    .enum([
      'pending',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
      'on_hold',
    ])
    .optional(),
  paymentStatus: z
    .enum(['pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded'])
    .optional(),
  customerId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  orderNumber: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  minTotal: priceSchema.optional(),
  maxTotal: priceSchema.optional(),
});

// Cancel order schema
export const cancelOrderSchema = z.object({
  reason: z.enum([
    'customer_request',
    'fraudulent',
    'inventory_unavailable',
    'payment_failed',
    'shipping_unavailable',
    'other',
  ]),
  notes: z.string().max(1000).optional(),
  notifyCustomer: z.boolean().optional().default(true),
  restockItems: z.boolean().optional().default(true),
});

// Refund order schema
export const refundOrderSchema = z.object({
  amount: priceSchema,
  reason: z.enum([
    'customer_request',
    'duplicate',
    'fraudulent',
    'product_defective',
    'product_not_as_described',
    'shipping_delay',
    'other',
  ]),
  notes: z.string().max(1000).optional(),
  notifyCustomer: z.boolean().optional().default(true),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        reason: z.string().max(200).optional(),
      })
    )
    .optional(),
});

// Add tracking schema
export const addTrackingSchema = z.object({
  carrier: z.string().min(1).max(100),
  trackingNumber: z.string().min(1).max(100),
  trackingUrl: z.string().url().optional(),
  shippedAt: z.string().datetime().optional(),
  estimatedDelivery: z.string().datetime().optional(),
  notifyCustomer: z.boolean().optional().default(true),
});

// Fulfill order schema
export const fulfillOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  locationId: z.string().uuid().optional(),
  tracking: addTrackingSchema.optional(),
  notifyCustomer: z.boolean().optional().default(true),
});

// Create fulfillment schema
export const createFulfillmentSchema = z.object({
  orderId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  tracking: addTrackingSchema.optional(),
});

// Order note schema
export const orderNoteSchema = z.object({
  content: z.string().min(1).max(2000),
  isCustomerVisible: z.boolean().optional().default(false),
  attachment: z.string().url().optional(),
});

// Bulk order action schema
export const bulkOrderActionSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['fulfill', 'cancel', 'archive', 'unarchive', 'delete']),
  data: z.record(z.any()).optional(),
});

// Export orders schema
export const exportOrdersSchema = z.object({
  format: z.enum(['csv', 'json', 'xml', 'pdf']).optional().default('csv'),
  filters: z
    .object({
      status: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      customerId: z.string().uuid().optional(),
    })
    .optional(),
  fields: z.array(z.string()).optional(),
});

// Payment capture schema
export const paymentCaptureSchema = z.object({
  amount: priceSchema.optional(), // If not provided, capture full amount
});

// Payment void schema
export const paymentVoidSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Types
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
export type AddTrackingInput = z.infer<typeof addTrackingSchema>;
export type FulfillOrderInput = z.infer<typeof fulfillOrderSchema>;
export type CreateFulfillmentInput = z.infer<typeof createFulfillmentSchema>;
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;
export type BulkOrderActionInput = z.infer<typeof bulkOrderActionSchema>;
export type ExportOrdersInput = z.infer<typeof exportOrdersSchema>;
export type PaymentCaptureInput = z.infer<typeof paymentCaptureSchema>;
export type PaymentVoidInput = z.infer<typeof paymentVoidSchema>;

export default {
  orderItemSchema,
  createOrderSchema,
  updateOrderSchema,
  orderQuerySchema,
  cancelOrderSchema,
  refundOrderSchema,
  addTrackingSchema,
  fulfillOrderSchema,
  createFulfillmentSchema,
  orderNoteSchema,
  bulkOrderActionSchema,
  exportOrdersSchema,
  paymentCaptureSchema,
  paymentVoidSchema,
};
