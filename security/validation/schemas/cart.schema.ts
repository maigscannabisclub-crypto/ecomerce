/**
 * Cart Validation Schemas
 * Zod schemas for cart-related endpoints
 */

import { z } from 'zod';

// Cart item schema
export const cartItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid().optional(),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be positive')
    .max(999, 'Quantity exceeds maximum'),
});

// Add to cart schema
export const addToCartSchema = z.object({
  items: z
    .array(cartItemSchema)
    .min(1, 'At least one item is required')
    .max(100, 'Too many items'),
});

// Update cart item schema
export const updateCartItemSchema = z.object({
  itemId: z.string().uuid('Invalid item ID'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(0, 'Quantity cannot be negative')
    .max(999, 'Quantity exceeds maximum'),
});

// Remove from cart schema
export const removeFromCartSchema = z.object({
  itemId: z.string().uuid('Invalid item ID'),
});

// Apply coupon schema
export const applyCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Coupon code is required')
    .max(50, 'Coupon code too long')
    .regex(
      /^[A-Z0-9-]+$/,
      'Coupon code must contain only uppercase letters, numbers, and hyphens'
    )
    .transform((val) => val.toUpperCase().trim()),
});

// Remove coupon schema
export const removeCouponSchema = z.object({
  code: z.string().min(1),
});

// Apply gift card schema
export const applyGiftCardSchema = z.object({
  code: z
    .string()
    .min(1, 'Gift card code is required')
    .max(50, 'Gift card code too long')
    .regex(
      /^[A-Z0-9-]+$/,
      'Gift card code must contain only uppercase letters, numbers, and hyphens'
    )
    .transform((val) => val.toUpperCase().trim()),
});

// Update cart notes schema
export const updateCartNotesSchema = z.object({
  note: z.string().max(1000, 'Note too long').optional(),
  attributes: z
    .record(z.string().min(1).max(500))
    .refine((obj) => Object.keys(obj).length <= 20, {
      message: 'Too many attributes',
    })
    .optional(),
});

// Set shipping address schema
export const setShippingAddressSchema = z.object({
  address: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    company: z.string().max(100).optional(),
    street1: z.string().min(1).max(200),
    street2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(20),
    country: z.string().length(2), // ISO country code
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
      .optional(),
  }),
});

// Set billing address schema
export const setBillingAddressSchema = z.object({
  sameAsShipping: z.boolean().optional().default(false),
  address: z
    .object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      company: z.string().max(100).optional(),
      street1: z.string().min(1).max(200),
      street2: z.string().max(200).optional(),
      city: z.string().min(1).max(100),
      state: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      country: z.string().length(2),
      phone: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
        .optional(),
    })
    .optional(),
});

// Set shipping method schema
export const setShippingMethodSchema = z.object({
  methodId: z.string().min(1, 'Shipping method ID is required'),
  rateId: z.string().optional(),
});

// Set payment method schema
export const setPaymentMethodSchema = z.object({
  method: z.enum([
    'credit_card',
    'paypal',
    'stripe',
    'apple_pay',
    'google_pay',
    'bank_transfer',
    'cod',
  ]),
  token: z.string().optional(), // Payment provider token
  savePaymentMethod: z.boolean().optional().default(false),
  billingDetails: z
    .object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      phone: z.string().optional(),
      address: z.object({
        line1: z.string().min(1).max(200),
        line2: z.string().max(200).optional(),
        city: z.string().min(1).max(100),
        state: z.string().min(1).max(100),
        postalCode: z.string().min(1).max(20),
        country: z.string().length(2),
      }),
    })
    .optional(),
});

// Merge cart schema (for guest to logged-in user)
export const mergeCartSchema = z.object({
  guestCartId: z.string().uuid('Invalid guest cart ID'),
});

// Abandoned cart recovery schema
export const abandonedCartRecoverySchema = z.object({
  email: z.string().email('Invalid email'),
  cartId: z.string().uuid().optional(),
});

// Cart settings schema
export const cartSettingsSchema = z.object({
  currency: z.string().length(3).optional(),
  taxExempt: z.boolean().optional().default(false),
  taxNumber: z.string().max(50).optional(),
  customerNote: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// Estimate shipping schema
export const estimateShippingSchema = z.object({
  country: z.string().length(2),
  postalCode: z.string().min(1).max(20),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
});

// Types
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
export type RemoveCouponInput = z.infer<typeof removeCouponSchema>;
export type ApplyGiftCardInput = z.infer<typeof applyGiftCardSchema>;
export type UpdateCartNotesInput = z.infer<typeof updateCartNotesSchema>;
export type SetShippingAddressInput = z.infer<typeof setShippingAddressSchema>;
export type SetBillingAddressInput = z.infer<typeof setBillingAddressSchema>;
export type SetShippingMethodInput = z.infer<typeof setShippingMethodSchema>;
export type SetPaymentMethodInput = z.infer<typeof setPaymentMethodSchema>;
export type MergeCartInput = z.infer<typeof mergeCartSchema>;
export type AbandonedCartRecoveryInput = z.infer<typeof abandonedCartRecoverySchema>;
export type CartSettingsInput = z.infer<typeof cartSettingsSchema>;
export type EstimateShippingInput = z.infer<typeof estimateShippingSchema>;

export default {
  cartItemSchema,
  addToCartSchema,
  updateCartItemSchema,
  removeFromCartSchema,
  applyCouponSchema,
  removeCouponSchema,
  applyGiftCardSchema,
  updateCartNotesSchema,
  setShippingAddressSchema,
  setBillingAddressSchema,
  setShippingMethodSchema,
  setPaymentMethodSchema,
  mergeCartSchema,
  abandonedCartRecoverySchema,
  cartSettingsSchema,
  estimateShippingSchema,
};
