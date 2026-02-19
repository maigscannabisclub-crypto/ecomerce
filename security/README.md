# Enterprise Security Module

Comprehensive security implementation for the e-commerce platform with enterprise-grade protection.

## Features

### 🔐 Authentication & Authorization
- **JWT Security**: RS256 asymmetric signing with key rotation
- **Token Management**: Blacklist with Redis, refresh token rotation
- **MFA Support**: TOTP, SMS, backup codes
- **Session Management**: Multi-device session tracking

### 🛡️ API Gateway Security
- **Rate Limiting**: Multi-tier (IP, user, endpoint-based)
- **WAF**: Protection against SQLi, XSS, LFI, RCE, SSRF
- **Security Headers**: CSP, HSTS, X-Frame-Options
- **CORS**: Strict configuration

### ✅ Input Validation
- **Zod Schemas**: Type-safe validation for all endpoints
- **Sanitization**: XSS, SQLi, NoSQL injection protection
- **File Upload**: Type, size, content validation

### 🔑 Secrets Management
- **HashiCorp Vault**: Enterprise secret storage
- **AWS Secrets Manager**: Cloud-native alternative
- **Automatic Rotation**: Configurable rotation schedules

### 📜 mTLS & Zero Trust
- **Certificate Management**: Generation, rotation, validation
- **Zero Trust**: Service identity, trust scoring
- **Service Mesh**: Headers, authentication

### 📊 Audit & Monitoring
- **Audit Logging**: Comprehensive event tracking
- **Security Events**: Real-time threat detection
- **Compliance**: GDPR, PCI DSS, SOC 2 ready

## Quick Start

### Installation

```bash
npm install zod helmet cors express-rate-limit ioredis
npm install -D @types/cors
```

### Basic Setup

```typescript
import express from 'express';
import { applySecurityMiddleware } from './security/middleware/security.middleware';

const app = express();

// Apply all security middleware
applySecurityMiddleware(app, {
  rateLimiting: { enabled: true, tier: 'adaptive' },
  waf: { enabled: true, mode: 'block' },
  headers: { enabled: true, hsts: true },
  cors: { enabled: true, allowedOrigins: ['https://example.com'] },
});
```

### Environment Variables

```bash
# JWT Configuration
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
JWT_ISSUER="ecommerce-platform"
JWT_AUDIENCE="ecommerce-api"

# Redis Configuration
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="your-password"

# Security Settings
WAF_ENABLED="true"
WAF_MODE="block"
ZERO_TRUST_ENABLED="true"
AUDIT_ENABLED="true"

# Vault Configuration (optional)
VAULT_ADDR="http://localhost:8200"
VAULT_TOKEN="your-token"

# AWS Configuration (optional)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-key"
AWS_SECRET_ACCESS_KEY="your-secret"
```

## Module Structure

```
security/
├── gateway/              # API Gateway Security
│   ├── rate-limiter.ts   # Multi-tier rate limiting
│   ├── waf-rules.ts      # Web Application Firewall
│   └── security-headers.ts # HTTP security headers
├── auth/                 # Authentication Security
│   ├── jwt-blacklist.ts  # Token revocation
│   ├── token-rotation.ts # Refresh token rotation
│   └── key-management.ts # JWT key management
├── validation/           # Input Validation
│   ├── input-validator.ts # Zod validation
│   ├── sanitizers.ts     # Input sanitization
│   └── schemas/          # Validation schemas
│       ├── auth.schema.ts
│       ├── product.schema.ts
│       ├── cart.schema.ts
│       └── order.schema.ts
├── secrets/              # Secrets Management
│   ├── vault-client.ts   # HashiCorp Vault
│   └── aws-secrets.ts    # AWS Secrets Manager
├── mtls/                 # mTLS & Zero Trust
│   ├── cert-manager.ts   # Certificate management
│   └── zero-trust-config.ts # Zero trust policies
├── middleware/           # Security Middleware
│   ├── security.middleware.ts # Combined security
│   └── audit.middleware.ts    # Audit logging
├── scripts/              # Utility Scripts
│   ├── generate-keys.sh  # Key generation
│   └── rotate-secrets.sh # Secret rotation
├── utils/
│   └── logger.ts         # Security logging
├── security-checklist.md # Security checklist
└── README.md             # This file
```

## Usage Examples

### Rate Limiting

```typescript
import { createRateLimiter, authRateLimiter } from './security/gateway/rate-limiter';

// Use predefined limiters
app.use('/auth', authRateLimiter);

// Custom rate limiter
const customLimiter = createRateLimiter('api');
app.use('/api', customLimiter);
```

### Input Validation

```typescript
import { validateRequest } from './security/validation/input-validator';
import { createProductSchema } from './security/validation/schemas/product.schema';

app.post('/products', validateRequest({ body: createProductSchema }), (req, res) => {
  // req.validatedBody contains validated data
  const productData = req.validatedBody;
  // ...
});
```

### JWT Token Management

```typescript
import { generateTokenPair, rotateRefreshToken } from './security/auth/token-rotation';
import { blacklistToken } from './security/auth/jwt-blacklist';

// Generate tokens
const tokens = await generateTokenPair(userId, ['user'], ['read']);

// Rotate refresh token
const newTokens = await rotateRefreshToken(refreshToken);

// Blacklist token on logout
await blacklistToken(tokenMetadata, 'logout');
```

### WAF Protection

```typescript
import { wafMiddleware } from './security/gateway/waf-rules';

app.use(wafMiddleware({
  enabled: true,
  mode: 'block', // or 'monitor' for testing
}));
```

### Secrets Management

```typescript
import { getVaultClient } from './security/secrets/vault-client';

const vault = getVaultClient();

// Read secret
const dbCredentials = await vault.readSecret('database/credentials');

// Write secret
await vault.writeSecret('api/keys/stripe', { key: 'sk_test_...' });

// Rotate secret
await vault.rotateSecret('database/credentials', async () => {
  return generateNewPassword();
});
```

### Audit Logging

```typescript
import { auditMiddleware, logSecurityEvent } from './security/middleware/audit.middleware';

// Apply audit middleware
app.use(auditMiddleware());

// Log custom security event
await logSecurityEvent(req, 'security.violation', {
  reason: 'suspicious_activity',
  details: { ip: req.ip },
}, 'warning');
```

## Configuration Reference

### Rate Limiting Tiers

| Tier | Requests/Min | Use Case |
|------|--------------|----------|
| general | 100 | Public endpoints |
| auth | 5 | Login/register |
| api | 1000 | Authenticated API |
| admin | 500 | Admin endpoints |
| strict | 10 | Sensitive endpoints |

### WAF Modes

- **block**: Block malicious requests (production)
- **monitor**: Log only (testing)
- **disabled**: No WAF

### Security Headers

All major security headers are configured by default:
- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy

## Scripts

### Generate Keys

```bash
# Generate all keys
./scripts/generate-keys.sh all

# Generate JWT keys only
./scripts/generate-keys.sh jwt

# Generate mTLS certificates
./scripts/generate-keys.sh mtls
```

### Rotate Secrets

```bash
# Rotate all secrets
./scripts/rotate-secrets.sh all

# Rotate specific secrets
./scripts/rotate-secrets.sh jwt
./scripts/rotate-secrets.sh db postgres
./scripts/rotate-secrets.sh api-keys

# Dry run (preview changes)
./scripts/rotate-secrets.sh all --dry-run
```

## Security Checklist

See [security-checklist.md](./security-checklist.md) for a comprehensive security checklist.

## Best Practices

1. **Never commit secrets** - Use Vault or AWS Secrets Manager
2. **Rotate keys regularly** - Automate with scripts
3. **Monitor logs** - Set up alerts for security events
4. **Test WAF rules** - Use monitor mode before blocking
5. **Validate all inputs** - Use Zod schemas consistently
6. **Enable audit logging** - For compliance and forensics
7. **Use mTLS internally** - For service-to-service communication
8. **Keep dependencies updated** - Run `npm audit` regularly

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis connection
redis-cli ping

# Verify Redis configuration
redis-cli CONFIG GET maxmemory
```

### JWT Verification Fails

1. Check public key is correct
2. Verify algorithm is RS256
3. Check token hasn't expired
4. Verify issuer and audience match

### WAF False Positives

1. Switch to monitor mode
2. Review violation logs
3. Add exclusions for legitimate traffic
4. Adjust rule sensitivity

## Contributing

1. Follow security best practices
2. Add tests for new features
3. Update documentation
4. Run security scans before submitting

## License

MIT License - See LICENSE file for details

## Support

- Security Issues: security@company.com
- General Questions: dev@company.com
- Documentation: https://docs.company.com/security
