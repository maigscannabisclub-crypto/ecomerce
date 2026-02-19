/**
 * Authentication Validation Schemas
 * Zod schemas for auth-related endpoints
 */

import { z } from 'zod';

// Common validation helpers
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[@$!%*?&]/, 'Password must contain at least one special character');

const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email too short')
  .max(254, 'Email too long')
  .transform((email) => email.toLowerCase().trim());

const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)');

// Registration schema
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name contains invalid characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name contains invalid characters'),
  phone: phoneSchema.optional(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
  acceptPrivacy: z.boolean().refine((val) => val === true, {
    message: 'You must accept the privacy policy',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Login schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
  deviceInfo: z
    .object({
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
      deviceType: z.enum(['desktop', 'mobile', 'tablet', 'other']).optional(),
      os: z.string().optional(),
      browser: z.string().optional(),
    })
    .optional(),
});

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Logout schema
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  allDevices: z.boolean().optional().default(false),
});

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// Reset password schema
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Change password schema
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// Verify email schema
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Resend verification schema
export const resendVerificationSchema = z.object({
  email: emailSchema,
});

// MFA setup schema
export const mfaSetupSchema = z.object({
  method: z.enum(['totp', 'sms', 'email']),
});

// MFA verify schema
export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6, 'Code must be 6 digits')
    .regex(/^\d{6}$/, 'Code must contain only digits'),
  method: z.enum(['totp', 'sms', 'email', 'backup']),
  rememberDevice: z.boolean().optional().default(false),
});

// MFA disable schema
export const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: z
    .string()
    .length(6, 'Code must be 6 digits')
    .regex(/^\d{6}$/, 'Code must contain only digits'),
});

// Social login schema
export const socialLoginSchema = z.object({
  provider: z.enum(['google', 'facebook', 'apple', 'github']),
  code: z.string().min(1, 'Authorization code is required'),
  redirectUri: z.string().url('Invalid redirect URI').optional(),
  state: z.string().optional(),
});

// Session revoke schema
export const sessionRevokeSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID').optional(),
  allExceptCurrent: z.boolean().optional().default(false),
});

// Update profile schema
export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name contains invalid characters')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name contains invalid characters')
    .optional(),
  phone: phoneSchema.optional(),
  dateOfBirth: z
    .string()
    .datetime()
    .optional()
    .refine(
      (date) => {
        if (!date) return true;
        const dob = new Date(date);
        const now = new Date();
        const age = now.getFullYear() - dob.getFullYear();
        return age >= 13;
      },
      { message: 'You must be at least 13 years old' }
    ),
});

// Address schema
export const addressSchema = z.object({
  type: z.enum(['shipping', 'billing']),
  name: z.string().min(1).max(100),
  street1: z.string().min(1).max(200),
  street2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2), // ISO country code
  isDefault: z.boolean().optional().default(false),
});

// API key create schema
export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z
    .array(z.enum(['read', 'write', 'delete', 'admin']))
    .min(1, 'At least one permission is required'),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .default(30),
  allowedIps: z.array(z.string().ip()).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
});

// API key revoke schema
export const apiKeyRevokeSchema = z.object({
  keyId: z.string().uuid('Invalid key ID'),
});

// Webhook register schema
export const webhookRegisterSchema = z.object({
  url: z.string().url('Invalid URL'),
  events: z
    .array(
      z.enum([
        'order.created',
        'order.updated',
        'order.cancelled',
        'payment.success',
        'payment.failed',
        'user.created',
        'user.updated',
      ])
    )
    .min(1, 'At least one event is required'),
  secret: z.string().min(32, 'Secret must be at least 32 characters').optional(),
});

// Types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
export type SessionRevokeInput = z.infer<typeof sessionRevokeSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyRevokeInput = z.infer<typeof apiKeyRevokeSchema>;
export type WebhookRegisterInput = z.infer<typeof webhookRegisterSchema>;

export default {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  mfaSetupSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  socialLoginSchema,
  sessionRevokeSchema,
  updateProfileSchema,
  addressSchema,
  apiKeyCreateSchema,
  apiKeyRevokeSchema,
  webhookRegisterSchema,
};
