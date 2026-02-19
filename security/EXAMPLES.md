# Security Module Usage Examples

This document provides practical examples for using the security module in your e-commerce platform.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [WAF Protection](#waf-protection)
6. [Audit Logging](#audit-logging)
7. [Secrets Management](#secrets-management)
8. [mTLS Configuration](#mtls-configuration)

## Basic Setup

### Express Application with Full Security

```typescript
import express from 'express';
import { applySecurityMiddleware } from './security/middleware/security.middleware';

const app = express();

// Apply all security middleware with default configuration
applySecurityMiddleware(app);

// Or with custom configuration
applySecurityMiddleware(app, {
  rateLimiting: { enabled: true, tier: 'adaptive' },
  waf: { enabled: true, mode: 'block' },
  headers: { enabled: true, hsts: true, csp: true },
  cors: { 
    enabled: true, 
    allowedOrigins: ['https://myapp.com'],
    allowCredentials: true 
  },
  sanitization: { enabled: true, xss: true, nosql: true },
  jwt: { enabled: true, checkBlacklist: true },
  zeroTrust: { enabled: false },
  securityCheck: { enabled: true },
});
```

## Authentication

### JWT Token Generation and Validation

```typescript
import { 
  generateTokenPair, 
  rotateRefreshToken, 
  verifyAccessToken 
} from './security/auth/token-rotation';
import { blacklistToken } from './security/auth/jwt-blacklist';

// Login endpoint
app.post('/auth/login', async (req, res) => {
  // Validate credentials...
  const user = await validateCredentials(req.body.email, req.body.password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Generate tokens
  const tokens = await generateTokenPair(
    user.id,
    user.roles,
    user.permissions
  );
  
  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.accessTokenExpiresAt,
  });
});

// Refresh token endpoint
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const newTokens = await rotateRefreshToken(refreshToken);
    
    res.json({
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/auth/logout', authenticate, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = decodeToken(token);
  
  if (decoded) {
    await blacklistToken({
      jti: decoded.jti,
      userId: decoded.sub,
      issuedAt: decoded.iat * 1000,
      expiresAt: decoded.exp * 1000,
      tokenType: 'access',
    }, 'logout');
  }
  
  res.json({ message: 'Logged out successfully' });
});

// Protected route
app.get('/api/profile', authenticate, (req, res) => {
  // req.user is populated by authentication middleware
  res.json(req.user);
});
```

### Authentication Middleware

```typescript
import { verifyAccessToken } from './security/auth/token-rotation';
import { isTokenBlacklisted } from './security/auth/jwt-blacklist';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const payload = verifyAccessToken(token);
    
    // Check blacklist
    if (await isTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    
    // Attach user to request
    req.user = {
      id: payload.sub,
      roles: payload.roles,
      permissions: payload.permissions,
    };
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

## Rate Limiting

### Route-Specific Rate Limiting

```typescript
import { 
  authRateLimiter, 
  apiRateLimiter, 
  adminRateLimiter 
} from './security/gateway/rate-limiter';

// Auth routes - strict limit
app.use('/auth', authRateLimiter);

// API routes - standard limit
app.use('/api', apiRateLimiter);

// Admin routes - moderate limit
app.use('/admin', adminRateLimiter);

// Specific endpoint - custom limit
import { createRateLimiter } from './security/gateway/rate-limiter';

const webhookLimiter = createRateLimiter('strict');
app.post('/webhooks', webhookLimiter, handleWebhook);
```

### Blacklist IP

```typescript
import { blacklistIP, unblacklistIP } from './security/gateway/rate-limiter';

// Blacklist suspicious IP
app.post('/admin/block-ip', async (req, res) => {
  const { ip, duration } = req.body;
  await blacklistIP(ip, duration * 60 * 60 * 1000); // duration in hours
  res.json({ message: 'IP blocked' });
});

// Unblock IP
app.post('/admin/unblock-ip', async (req, res) => {
  const { ip } = req.body;
  await unblacklistIP(ip);
  res.json({ message: 'IP unblocked' });
});
```

## Input Validation

### Request Validation with Zod

```typescript
import { validateRequest } from './security/validation/input-validator';
import { createProductSchema } from './security/validation/schemas/product.schema';
import { loginSchema } from './security/validation/schemas/auth.schema';

// Product creation with validation
app.post(
  '/products',
  authenticate,
  validateRequest({ body: createProductSchema }),
  async (req, res) => {
    // req.validatedBody contains sanitized and validated data
    const productData = req.validatedBody;
    
    const product = await createProduct(productData);
    res.status(201).json(product);
  }
);

// Login with validation
app.post(
  '/auth/login',
  validateRequest({ body: loginSchema }),
  async (req, res) => {
    const { email, password } = req.validatedBody;
    // ... authentication logic
  }
);

// Multiple sources validation
app.get(
  '/products',
  validateRequest({
    query: productQuerySchema,
  }),
  async (req, res) => {
    const filters = req.validatedQuery;
    const products = await getProducts(filters);
    res.json(products);
  }
);
```

### Custom Validation

```typescript
import { z } from 'zod';
import { validate } from './security/validation/input-validator';

const customSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18).max(120),
  preferences: z.object({
    newsletter: z.boolean(),
    notifications: z.enum(['all', 'important', 'none']),
  }),
});

const result = validate(customSchema, req.body);

if (!result.success) {
  return res.status(400).json({
    error: 'Validation failed',
    details: result.errors,
  });
}

// result.data contains validated data
```

## WAF Protection

### Basic WAF Setup

```typescript
import { wafMiddleware } from './security/gateway/waf-rules';

// Enable WAF in block mode
app.use(wafMiddleware({
  enabled: true,
  mode: 'block',
}));

// Or monitor mode for testing
app.use(wafMiddleware({
  enabled: true,
  mode: 'monitor',
}));
```

### Custom WAF Rules

```typescript
import { createWAFRule, addCustomRules } from './security/gateway/waf-rules';

// Create custom rule
const customRule = createWAFRule(
  'CUSTOM-001',
  'Block Specific User Agent',
  /BadBot\/1\.0/,
  'high',
  true
);

// Add to WAF
addCustomRules([customRule]);
```

### WAF Statistics

```typescript
import { getWAFStats } from './security/gateway/waf-rules';

app.get('/admin/security/waf-stats', async (req, res) => {
  const stats = await getWAFStats();
  res.json(stats);
});
```

## Audit Logging

### Basic Audit Setup

```typescript
import { auditMiddleware } from './security/middleware/audit.middleware';

// Apply audit middleware
app.use(auditMiddleware({
  enabled: true,
  logToConsole: true,
  logToRedis: true,
}));
```

### Custom Security Events

```typescript
import { logSecurityEvent } from './security/middleware/audit.middleware';

// Log suspicious activity
app.post('/transfer', authenticate, async (req, res) => {
  const { amount, toAccount } = req.body;
  
  // Check for suspicious amount
  if (amount > 10000) {
    await logSecurityEvent(req, 'security.large_transfer', {
      amount,
      toAccount,
      userId: req.user.id,
    }, 'warning');
  }
  
  // ... process transfer
});

// Log access to sensitive data
app.get('/admin/users', authenticate, requireAdmin, async (req, res) => {
  await logSecurityEvent(req, 'admin.user_list_access', {
    adminId: req.user.id,
    filters: req.query,
  }, 'info');
  
  // ... return users
});
```

### Query Audit Logs

```typescript
import { queryAuditLogs, getAuditStats } from './security/middleware/audit.middleware';

// Get audit logs for user
app.get('/admin/audit/user/:userId', async (req, res) => {
  const logs = await queryAuditLogs({
    userId: req.params.userId,
    fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    limit: 100,
  });
  
  res.json(logs);
});

// Get audit statistics
app.get('/admin/audit/stats', async (req, res) => {
  const stats = await getAuditStats();
  res.json(stats);
});
```

## Secrets Management

### HashiCorp Vault

```typescript
import { getVaultClient } from './security/secrets/vault-client';

const vault = getVaultClient();

// Read database credentials
async function getDatabaseConfig() {
  const secret = await vault.readSecret('database/credentials');
  return {
    host: secret.data.host,
    port: secret.data.port,
    username: secret.data.username,
    password: secret.data.password,
  };
}

// Write new API key
async function storeAPIKey(service: string, key: string) {
  await vault.writeSecret(
    `api-keys/${service}`,
    { key },
    {
      description: `${service} API key`,
      tags: { service, environment: 'production' },
    }
  );
}

// Rotate database password
async function rotateDatabasePassword() {
  const newPassword = generateSecurePassword();
  
  await vault.rotateSecret(
    'database/credentials',
    async () => ({
      ...(await vault.readSecret('database/credentials')).data,
      password: newPassword,
    })
  );
  
  // Update database with new password
  await updateDatabasePassword(newPassword);
}
```

### AWS Secrets Manager

```typescript
import { getAWSSecretsManager } from './security/secrets/aws-secrets';

const secretsManager = getAWSSecretsManager();

// Load secrets at startup
async function loadSecrets() {
  await secretsManager.loadSecretsToEnv([
    'production/database',
    'production/api-keys',
    'production/jwt-keys',
  ], {
    prefix: 'PROD',
    uppercase: true,
  });
  
  // Now accessible as process.env.PROD_DATABASE_PASSWORD
}

// Get specific secret
async function getStripeKey() {
  return secretsManager.getSecret('production/stripe');
}
```

## mTLS Configuration

### Server mTLS Setup

```typescript
import https from 'https';
import { getTLSConfig } from './security/mtls/cert-manager';

async function createSecureServer(app) {
  const tlsConfig = await getTLSConfig(
    'server-cert-id',
    ['ca-cert-id'] // CA certificates for client verification
  );
  
  const server = https.createServer(
    {
      ...tlsConfig,
      requestCert: true,
      rejectUnauthorized: true,
    },
    app
  );
  
  return server;
}
```

### Zero Trust Service Authentication

```typescript
import { 
  zeroTrustMiddleware, 
  initializeZeroTrust,
  registerService 
} from './security/mtls/zero-trust-config';

// Initialize service
initializeZeroTrust('product-service', 'Product Service', {
  namespace: 'production',
  version: '1.0.0',
  allowedEndpoints: ['/products/*', '/categories/*'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// Apply zero trust middleware
app.use(zeroTrustMiddleware({
  enforceMtls: true,
}));

// Register another service
registerService({
  serviceId: 'order-service',
  serviceName: 'Order Service',
  namespace: 'production',
  version: '1.0.0',
  allowedEndpoints: ['/orders/*'],
  allowedMethods: ['GET', 'POST'],
  certificateFingerprint: 'abc123...',
});
```

### Service Token Generation

```typescript
import { generateServiceToken, verifyServiceToken } from './security/mtls/zero-trust-config';

// Generate service token
const token = generateServiceToken('product-service', 'Product Service', 3600);

// Verify service token
const result = verifyServiceToken(token);
if (result.valid) {
  console.log(`Authenticated service: ${result.serviceName}`);
}
```

## Complete Example: Protected API Endpoint

```typescript
import express from 'express';
import { 
  applySecurityMiddleware,
  validateRequest,
  authenticate,
  requireRole,
  logSecurityEvent 
} from './security';
import { createOrderSchema } from './security/validation/schemas/order.schema';

const app = express();

// Apply all security middleware
applySecurityMiddleware(app);

// Protected order creation endpoint
app.post(
  '/api/orders',
  authenticate,                          // JWT authentication
  requireRole('customer'),               // Authorization
  validateRequest({ body: createOrderSchema }), // Input validation
  async (req, res) => {
    try {
      const orderData = req.validatedBody;
      
      // Log order creation
      await logSecurityEvent(req, 'order.create', {
        items: orderData.items.length,
        total: orderData.total,
      });
      
      // Create order
      const order = await createOrder(orderData, req.user.id);
      
      res.status(201).json(order);
    } catch (error) {
      // Log error
      await logSecurityEvent(req, 'order.create_failed', {
        error: error.message,
      }, 'error');
      
      throw error;
    }
  }
);
```

## Testing Security Features

### Rate Limiting Test

```bash
# Test rate limiting
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'

# Repeat 6 times to trigger rate limit
```

### WAF Test

```bash
# SQL Injection attempt (should be blocked)
curl "http://localhost:3000/api/products?id=1' OR '1'='1"

# XSS attempt (should be blocked)
curl -X POST http://localhost:3000/api/reviews \
  -H "Content-Type: application/json" \
  -d '{"content":"<script>alert(1)</script>"}'
```

### JWT Security Test

```bash
# Login and get tokens
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password"}'

# Use access token
curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer <access_token>"

# Try revoked token (should fail)
curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer <revoked_token>"
```

## Troubleshooting

### Common Issues

1. **Redis Connection Errors**
   ```bash
   # Check Redis status
   redis-cli ping
   
   # Verify configuration
   echo $REDIS_HOST $REDIS_PORT
   ```

2. **JWT Verification Fails**
   - Verify public key is correctly set
   - Check token hasn't expired
   - Ensure algorithm matches (RS256)

3. **Rate Limiting Not Working**
   - Verify Redis connection
   - Check rate limit configuration
   - Ensure middleware is applied before routes

4. **WAF False Positives**
   - Switch to monitor mode
   - Review violation logs
   - Add custom exclusions

---

For more information, see the [main README](./README.md) and [security checklist](./security-checklist.md).
