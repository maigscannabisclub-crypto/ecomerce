/**
 * Security Module Index
 * Centralized exports for all security components
 */

// Gateway Security
export {
  createRateLimiter,
  generalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  adminRateLimiter,
  strictRateLimiter,
  adaptiveRateLimiter,
  createBurstLimiter,
  blacklistIP,
  unblacklistIP,
  isWhitelisted,
  isBlacklisted,
} from './gateway/rate-limiter';

export {
  wafMiddleware,
  createWAFRule,
  addCustomRules,
  getWAFStats,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  COMMAND_INJECTION_PATTERNS,
  SSRF_PATTERNS,
  NOSQL_INJECTION_PATTERNS,
  XML_INJECTION_PATTERNS,
} from './gateway/waf-rules';

export {
  securityHeadersMiddleware,
  customSecurityHeaders,
  cspMiddleware,
  cspReportOnlyMiddleware,
  hstsMiddleware,
  strictCorsMiddleware,
  apiSecurityHeaders,
  comprehensiveSecurityHeaders,
  generateNonce,
  buildCSPString,
} from './gateway/security-headers';

// Authentication Security
export {
  blacklistToken,
  isTokenBlacklisted,
  getBlacklistEntry,
  blacklistAllUserTokens,
  addActiveSession,
  removeActiveSession,
  getUserSessions,
  cleanupExpiredEntries,
  getBlacklistStats,
  blacklistCheckMiddleware,
} from './auth/jwt-blacklist';

export {
  generateTokenPair,
  rotateRefreshToken,
  verifyAccessToken,
  decodeToken,
  revokeTokenFamily,
  generateKeyPair,
  getTokenStats,
} from './auth/token-rotation';

export {
  createKeyPair,
  getActiveKeyPair,
  getKeyPair,
  getPublicKey,
  rotateKeys,
  isRotationNeeded,
  getAllKeyMetadata,
  revokeKey,
  exportKeysToFiles,
  importKeysFromFiles,
  generateRSAKeyPair,
  generateECKeyPair,
  getKeyThumbprint,
  generateJWKS,
} from './auth/key-management';

// Input Validation
export {
  validate,
  validateAsync,
  createValidationMiddleware,
  validateRequest,
  commonSchemas,
  sanitizeString,
  sanitizeHtml,
  validateFileUpload,
  validateLoginAttempt,
  createJsonSchemaValidator,
  InferType,
} from './validation/input-validator';

export {
  sanitizeXSS,
  sanitizeSQL,
  sanitizeNoSQL,
  sanitizePath,
  sanitizeFilename,
  sanitizeEmail,
  sanitizeURL,
  deepSanitize,
  createSanitizationMiddleware,
  fullSanitizationMiddleware,
  securityCheckMiddleware,
  containsXSS,
  containsSQLI,
} from './validation/sanitizers';

// Validation Schemas
export {
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
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  LogoutInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  VerifyEmailInput,
  ResendVerificationInput,
  MfaSetupInput,
  MfaVerifyInput,
  MfaDisableInput,
  SocialLoginInput,
  SessionRevokeInput,
  UpdateProfileInput,
  AddressInput,
  ApiKeyCreateInput,
  ApiKeyRevokeInput,
  WebhookRegisterInput,
} from './validation/schemas/auth.schema';

export {
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
  CreateProductInput,
  UpdateProductInput,
  ProductQueryInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateVariantInput,
  UpdateVariantInput,
  BulkUpdateInput,
  CreateReviewInput,
  InventoryAdjustmentInput,
  ImportProductsInput,
  ExportProductsInput,
} from './validation/schemas/product.schema';

export {
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
  CartItemInput,
  AddToCartInput,
  UpdateCartItemInput,
  RemoveFromCartInput,
  ApplyCouponInput,
  RemoveCouponInput,
  ApplyGiftCardInput,
  UpdateCartNotesInput,
  SetShippingAddressInput,
  SetBillingAddressInput,
  SetShippingMethodInput,
  SetPaymentMethodInput,
  MergeCartInput,
  AbandonedCartRecoveryInput,
  CartSettingsInput,
  EstimateShippingInput,
} from './validation/schemas/cart.schema';

export {
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
  OrderItemInput,
  CreateOrderInput,
  UpdateOrderInput,
  OrderQueryInput,
  CancelOrderInput,
  RefundOrderInput,
  AddTrackingInput,
  FulfillOrderInput,
  CreateFulfillmentInput,
  OrderNoteInput,
  BulkOrderActionInput,
  ExportOrdersInput,
  PaymentCaptureInput,
  PaymentVoidInput,
} from './validation/schemas/order.schema';

// Secrets Management
export {
  VaultClient,
  getVaultClient,
  initVaultClient,
  loadSecretsToEnv,
} from './secrets/vault-client';

export {
  AWSSecretsManager,
  getAWSSecretsManager,
  initAWSSecretsManager,
  loadAWSSecretsAtStartup,
} from './secrets/aws-secrets';

// mTLS & Zero Trust
export {
  generateRSAKeyPair,
  generateECKeyPair,
  generateSelfSignedCert,
  generateCSR,
  storeCertificate,
  getCertificate,
  getCertificateInfo,
  listCertificates,
  deleteCertificate,
  isCertificateValid,
  isCertificateExpiring,
  getExpiringCertificates,
  checkCertificateRotation,
  exportCertificateToFiles,
  importCertificateFromFiles,
  createCertificateBundle,
  validateCertificateChain,
  getTLSConfig,
  generateClientCertificate,
} from './mtls/cert-manager';

export {
  zeroTrustMiddleware,
  requireAuthentication,
  requireTrustScore,
  requireEndpointAuthorization,
  serviceMeshHeaders,
  registerService,
  unregisterService,
  getServiceIdentity,
  verifyServiceCertificate,
  calculateTrustScore,
  generateServiceToken,
  verifyServiceToken,
  initializeZeroTrust,
} from './mtls/zero-trust-config';

// Security Middleware
export {
  applySecurityMiddleware,
  securityHeadersOnly,
  apiSecurityMiddleware,
  adminSecurityMiddleware,
  authSecurityMiddleware,
  createRouteSecurity,
  defaultSecurityConfig,
} from './middleware/security.middleware';

export {
  auditMiddleware,
  createAuditEvent,
  logAuditEvent,
  logSecurityEvent,
  queryAuditLogs,
  getAuditStats,
  cleanupAuditLogs,
  flushAuditBuffer,
  AuditEventType,
  AuditSeverity,
} from './middleware/audit.middleware';

// Utilities
export {
  logger,
  securityLogger,
  auditLogger,
  accessLogger,
  errorLogger,
  perfLogger,
  logSecurityEvent as logSecurityEventUtil,
  logAccess,
  logError,
  logPerformance,
} from './utils/logger';
