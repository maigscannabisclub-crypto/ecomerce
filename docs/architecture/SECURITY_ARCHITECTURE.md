# Arquitectura de Seguridad

## Índice
1. [Visión General](#visión-general)
2. [Autenticación](#autenticación)
3. [Autorización](#autorización)
4. [Seguridad de APIs](#seguridad-de-apis)
5. [Seguridad de Datos](#seguridad-de-datos)
6. [Seguridad de Infraestructura](#seguridad-de-infraestructura)
7. [Monitoreo de Seguridad](#monitoreo-de-seguridad)
8. [Cumplimiento](#cumplimiento)

---

## Visión General

### Modelo de Seguridad en Capas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: PERIMETER SECURITY                                         │   │
│  │  • WAF (Web Application Firewall)                                   │   │
│  │  • DDoS Protection                                                  │   │
│  │  • Rate Limiting                                                    │   │
│  │  • IP Whitelisting/Blacklisting                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: GATEWAY SECURITY                                           │   │
│  │  • Authentication (JWT/OAuth2)                                      │   │
│  │  • Authorization (RBAC)                                             │   │
│  │  • Request Validation                                               │   │
│  │  • TLS/SSL Termination                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 3: SERVICE SECURITY                                           │   │
│  │  • Input Sanitization                                               │   │
│  │  • Output Encoding                                                  │   │
│  │  • Service-to-Service Auth (mTLS)                                   │   │
│  │  • Circuit Breakers                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 4: DATA SECURITY                                              │   │
│  │  • Encryption at Rest (AES-256)                                     │   │
│  │  • Encryption in Transit (TLS 1.3)                                  │   │
│  │  • Field-level Encryption (PII)                                     │   │
│  │  • Database Access Control                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 5: MONITORING & AUDIT                                         │   │
│  │  • Security Logging                                                 │   │
│  │  • Audit Trails                                                     │   │
│  │  • Anomaly Detection                                                │   │
│  │  • Incident Response                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Principios de Seguridad

1. **Defense in Depth**: Múltiples capas de seguridad
2. **Least Privilege**: Mínimos privilegios necesarios
3. **Zero Trust**: Nunca confiar, siempre verificar
4. **Secure by Default**: Configuraciones seguras por defecto
5. **Fail Secure**: Fallar de forma segura

---

## Autenticación

### Arquitectura de Autenticación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌────────┐│
│  │ Client  │────►│ Gateway │────►│  Auth   │────►│  Redis  │     │   DB   ││
│  │         │     │         │     │ Service │     │ (Cache) │     │        ││
│  └─────────┘     └─────────┘     └────┬────┘     └─────────┘     └────────┘│
│                                       │                                      │
│                                       │ JWT Tokens                           │
│                                       │                                      │
│                                  ┌────┴────┐                                 │
│                                  │  JWT    │                                 │
│                                  │ Service │                                 │
│                                  └─────────┘                                 │
│                                                                              │
│  Token Types:                                                                │
│  • Access Token: JWT corta duración (15 min)                                │
│  • Refresh Token: JWT larga duración (7 días)                               │
│  • Service Token: Para comunicación interna                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### JWT Token Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    JWT TOKEN STRUCTURE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Access Token:                                                               │
│  ═════════════                                                               │
│                                                                              │
│  Header:                                                                     │
│  {                                                                           │
│    "alg": "RS256",                                                           │
│    "typ": "JWT",                                                             │
│    "kid": "key-2024-01"                                                      │
│  }                                                                           │
│                                                                              │
│  Payload:                                                                    │
│  {                                                                           │
│    "sub": "user-123",          // Subject (user ID)                         │
│    "iss": "auth.ecommerce.com", // Issuer                                   │
│    "aud": "api.ecommerce.com",  // Audience                                 │
│    "exp": 1705315800,           // Expiration                               │
│    "iat": 1705314900,           // Issued at                                │
│    "jti": "unique-token-id",    // JWT ID                                   │
│    "scope": "read:products write:orders",                                    │
│    "roles": ["customer"],                                                    │
│    "permissions": ["order:create", "cart:write"]                             │
│  }                                                                           │
│                                                                              │
│  Signature: RS256(private_key, base64(header) + "." + base64(payload))      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flujo de Autenticación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. LOGIN FLOW                                                               │
│  ═════════════                                                               │
│                                                                              │
│  Client ──POST /auth/login──► Auth Service                                  │
│                                    │                                         │
│                                    ├──► Validate credentials                │
│                                    │                                         │
│                                    ├──► Generate tokens                     │
│                                    │                                         │
│                                    ├──► Store refresh token (Redis)         │
│                                    │                                         │
│                                    └──► Return tokens                       │
│                                                                              │
│  2. TOKEN REFRESH                                                            │
│  ════════════════                                                            │
│                                                                              │
│  Client ──POST /auth/refresh──► Auth Service                                │
│                                    │                                         │
│                                    ├──► Validate refresh token              │
│                                    │                                         │
│                                    ├──► Check blacklist                     │
│                                    │                                         │
│                                    ├──► Generate new tokens                 │
│                                    │                                         │
│                                    └──► Return new tokens                   │
│                                                                              │
│  3. LOGOUT FLOW                                                              │
│  ══════════════                                                              │
│                                                                              │
│  Client ──POST /auth/logout──► Auth Service                                 │
│                                    │                                         │
│                                    ├──► Invalidate refresh token            │
│                                    │                                         │
│                                    ├──► Add access token to blacklist       │
│                                    │    (until expiration)                   │
│                                    │                                         │
│                                    └──► Return success                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Estrategias de Autenticación

| Estrategia | Uso | Implementación |
|------------|-----|----------------|
| **JWT Access Token** | APIs stateless | RS256 con rotación de claves |
| **JWT Refresh Token** | Renovación de tokens | Almacenado en Redis |
| **OAuth2** | Third-party apps | Authorization Code flow |
| **API Keys** | Service-to-service | HMAC-SHA256 |
| **mTLS** | Internal services | Certificados X.509 |

---

## Autorización

### RBAC (Role-Based Access Control)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RBAC MODEL                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Role Hierarchy:                                                             │
│  ═══════════════                                                             │
│                                                                              │
│                    ┌─────────────┐                                           │
│                    │   SUPER     │                                           │
│                    │   ADMIN     │                                           │
│                    └──────┬──────┘                                           │
│                           │                                                  │
│           ┌───────────────┼───────────────┐                                  │
│           │               │               │                                  │
│           ▼               ▼               ▼                                  │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐                            │
│     │  ADMIN   │    │ MANAGER  │    │ SUPPORT  │                            │
│     │          │    │          │    │          │                            │
│     └────┬─────┘    └────┬─────┘    └────┬─────┘                            │
│          │               │               │                                   │
│          │         ┌─────┴─────┐         │                                   │
│          │         │           │         │                                   │
│          ▼         ▼           ▼         ▼                                   │
│     ┌──────────┐ ┌─────┐ ┌────────┐ ┌──────────┐                           │
│     │ CUSTOMER │ │SALES│ │PRODUCT │ │GUEST     │                           │
│     │          │ │     │ │ADMIN   │ │          │                           │
│     └──────────┘ └─────┘ └────────┘ └──────────┘                           │
│                                                                              │
│  Permission Examples:                                                        │
│  • product:read, product:create, product:update, product:delete             │
│  • order:read, order:create, order:update, order:cancel                     │
│  • user:read, user:create, user:update, user:delete                         │
│  • inventory:read, inventory:update                                         │
│  • report:read, report:export                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Rol | Productos | Órdenes | Usuarios | Inventario | Reportes |
|-----|-----------|---------|----------|------------|----------|
| Guest | read | - | own | - | - |
| Customer | read | own | own | - | - |
| Sales | read | all | read | read | read |
| Product Admin | all | read | - | all | read |
| Manager | read | all | read | read | all |
| Admin | all | all | all | all | all |
| Super Admin | all | all | all | all | all |

### Claims en JWT

```json
{
  "sub": "user-123",
  "roles": ["customer"],
  "permissions": [
    "product:read",
    "order:create",
    "order:read:own",
    "cart:write",
    "user:read:own",
    "user:update:own"
  ],
  "resource_access": {
    "orders": ["read", "create"],
    "products": ["read"]
  }
}
```

---

## Seguridad de APIs

### API Gateway Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY SECURITY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request Flow:                                                               │
│  ═════════════                                                               │
│                                                                              │
│  Client ──► [WAF] ──► [Rate Limit] ──► [Auth] ──► [Validation] ──► Service │
│                                                                              │
│  Security Controls:                                                          │
│  ══════════════════                                                          │
│                                                                              │
│  1. WAF (Web Application Firewall)                                          │
│     • SQL Injection protection                                               │
│     • XSS protection                                                         │
│     • CSRF protection                                                        │
│     • Bot detection                                                          │
│                                                                              │
│  2. Rate Limiting                                                            │
│     • Por IP: 100 req/min (público)                                         │
│     • Por usuario: 1000 req/min (autenticado)                               │
│     • Por API key: 5000 req/min (premium)                                   │
│     • Burst allowance: 10 req/segundo                                       │
│                                                                              │
│  3. Authentication                                                           │
│     • JWT validation                                                         │
│     • Token expiration check                                                 │
│     • Blacklist check                                                        │
│     • Scope validation                                                       │
│                                                                              │
│  4. Request Validation                                                       │
│     • Schema validation                                                      │
│     • Input sanitization                                                     │
│     • Size limits                                                            │
│     • Content-Type validation                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rate Limiting Configuration

```yaml
rate_limits:
  public:
    requests_per_minute: 100
    burst: 10
    window: 60
  
  authenticated:
    requests_per_minute: 1000
    burst: 50
    window: 60
  
  admin:
    requests_per_minute: 5000
    burst: 100
    window: 60
  
  endpoints:
    /auth/login:
      requests_per_minute: 5  # Strict for login
      block_duration: 300     # 5 min block after limit
    
    /auth/register:
      requests_per_minute: 3
      block_duration: 3600    # 1 hour block
```

### Input Validation

```typescript
// Validation middleware example
const validateProductCreate = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Name must be 3-200 characters'),
  
  body('price.amount')
    .isFloat({ min: 0 })
    .withMessage('Price must be positive'),
  
  body('description')
    .optional()
    .trim()
    .escape()  // XSS protection
    .isLength({ max: 5000 }),
  
  body('categoryId')
    .isUUID()
    .withMessage('Invalid category ID'),
  
  sanitize()  // Additional sanitization
];
```

---

## Seguridad de Datos

### Encryption Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA ENCRYPTION STRATEGY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Encryption in Transit:                                                      │
│  ═══════════════════════                                                     │
│                                                                              │
│  Client ◄────TLS 1.3────► Gateway ◄────mTLS────► Services ◄────TLS────► DB │
│                                                                              │
│  Config:                                                                     │
│  • Min TLS version: 1.2                                                      │
│  • Preferred: TLS 1.3                                                        │
│  • Cipher suites: ECDHE with AES-256-GCM                                    │
│  • HSTS enabled                                                              │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Encryption at Rest:                                                         │
│  ═════════════════════                                                       │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │ PostgreSQL  │    │    Redis    │    │    Files    │                      │
│  │             │    │             │    │   (S3)      │                      │
│  │ TDE enabled │    │ AES-256     │    │ SSE-S3      │                      │
│  │ Field-level │    │ in-memory   │    │ or SSE-KMS  │                      │
│  │ for PII     │    │ encryption  │    │             │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Field-Level Encryption (PII):                                               │
│  ══════════════════════════════                                              │
│                                                                              │
│  Fields encrypted:                                                           │
│  • email (users table)                                                       │
│  • phone (users table)                                                       │
│  • card_number (payments table)                                              │
│  • address fields (addresses table)                                          │
│                                                                              │
│  Algorithm: AES-256-GCM with KMS                                             │
│  Key rotation: 90 days                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### PII Handling

```typescript
// PII Data Classification
enum PIIClassification {
  SENSITIVE = 'sensitive',      // SSN, card numbers
  PERSONAL = 'personal',        // Name, email, phone
  ADDRESS = 'address',          // Physical addresses
  BEHAVIORAL = 'behavioral'     // Purchase history
}

// PII Protection Rules
const piiRules = {
  email: {
    classification: PIIClassification.PERSONAL,
    encrypt: true,
    mask: '***@domain.com',
    log: false,
    retention: '7 years'
  },
  phone: {
    classification: PIIClassification.PERSONAL,
    encrypt: true,
    mask: '***-***-1234',
    log: false,
    retention: '7 years'
  },
  cardNumber: {
    classification: PIIClassification.SENSITIVE,
    encrypt: true,
    mask: '****-****-****-1234',
    log: false,
    retention: 'never stored'
  }
};
```

### Secret Management

```yaml
# Secret management with HashiCorp Vault
secrets:
  database:
    path: secret/data/ecommerce/database
    keys:
      - username
      - password
      - ssl_cert
  
  jwt:
    path: secret/data/ecommerce/jwt
    keys:
      - private_key
      - public_key
    rotation: 90d
  
  api_keys:
    path: secret/data/ecommerce/api-keys
    keys:
      - stripe_secret
      - sendgrid_key
      - twilio_key
  
  encryption:
    path: secret/data/ecommerce/encryption
    keys:
      - pii_key
      - backup_key
```

---

## Seguridad de Infraestructura

### Network Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NETWORK SECURITY                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Network Segmentation:                                                       │
│  ═════════════════════                                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         PUBLIC NETWORK                               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                             │   │
│  │  │   WAF   │  │   CDN   │  │   LB    │                             │   │
│  │  └─────────┘  └─────────┘  └─────────┘                             │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                           │
│  ┌───────────────────────────────┼─────────────────────────────────────┐   │
│  │                    DMZ NETWORK (API Gateway)                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                             │   │
│  │  │ Gateway │  │  Auth   │  │  Rate   │                             │   │
│  │  │         │  │ Service │  │ Limiter │                             │   │
│  │  └─────────┘  └─────────┘  └─────────┘                             │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                           │
│  ┌───────────────────────────────┼─────────────────────────────────────┐   │
│  │                  PRIVATE NETWORK (Microservices)                     │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │   │
│  │  │ Product │  │  Order  │  │  Cart   │  │ Payment │                │   │
│  │  │ Service │  │ Service │  │ Service │  │ Service │                │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘                │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                           │
│  ┌───────────────────────────────┼─────────────────────────────────────┐   │
│  │                   DATA NETWORK (Databases)                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │   │
│  │  │PostgreSQL│  │  Redis  │  │RabbitMQ │  │Elastic  │                │   │
│  │  │         │  │         │  │         │  │Search   │                │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Security Groups:                                                            │
│  • Public: 80, 443 from internet                                            │
│  • DMZ: 3000 from Public, internal ports only                               │
│  • Private: Internal network only                                           │
│  • Data: Private network only, encrypted connections                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Security

```dockerfile
# Dockerfile security best practices
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary tools
RUN apk del curl wget

# Use non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node healthcheck.js

# Start application
CMD ["node", "dist/main.js"]
```

### Kubernetes Security

```yaml
# Pod Security Context
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  
  containers:
    - name: api
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
      resources:
        limits:
          memory: "512Mi"
          cpu: "500m"
        requests:
          memory: "256Mi"
          cpu: "250m"
```

---

## Monitoreo de Seguridad

### Security Logging

```typescript
// Security event logging
interface SecurityEvent {
  eventType: 'authentication' | 'authorization' | 'data_access' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  actor: {
    userId?: string;
    ip: string;
    userAgent: string;
    sessionId?: string;
  };
  resource: {
    type: string;
    id: string;
    action: string;
  };
  result: 'success' | 'failure';
  details: Record<string, unknown>;
}

// Log security events
logger.security({
  eventType: 'authentication',
  severity: 'high',
  actor: { userId: 'user-123', ip: '192.168.1.1' },
  resource: { type: 'session', id: 'sess-456', action: 'login' },
  result: 'failure',
  details: { reason: 'invalid_password', attempt: 3 }
});
```

### Security Alerts

| Alert | Condición | Severidad | Acción |
|-------|-----------|-----------|--------|
| Brute Force | 5 login failures in 5 min | High | Block IP 1 hour |
| Unusual Access | Login from new location | Medium | Require MFA |
| Privilege Esc | User role changed | High | Notify admin |
| Data Exfiltration | Bulk data access | Critical | Block + Alert |
| API Abuse | Rate limit exceeded | Medium | Throttle + Log |

### Audit Trail

```sql
-- Audit log table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id UUID,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Indexes for querying
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

---

## Cumplimiento

### GDPR Compliance

| Requisito | Implementación |
|-----------|----------------|
| Consentimiento | Checkbox explícito en registro |
| Derecho al olvido | Endpoint DELETE /users/me |
| Portabilidad | Exportación de datos en JSON |
| Acceso | Dashboard de datos personales |
| Breach notification | Alertas en 72 horas |

### PCI DSS Compliance

| Requisito | Implementación |
|-----------|----------------|
| Card data | Nunca almacenada (tokenization) |
| Encryption | TLS 1.3 en tránsito |
| Access control | RBAC + MFA para acceso a datos |
| Monitoring | Logs de todas las transacciones |
| Testing | Pentests anuales |

### Security Checklist

```
□ Autenticación
  □ JWT con expiración corta
  □ Refresh tokens rotativos
  □ MFA para admins
  □ Password policies

□ Autorización
  □ RBAC implementado
  □ Principle of least privilege
  □ Resource-level permissions

□ APIs
  □ Rate limiting
  □ Input validation
  □ Output encoding
  □ CORS configurado

□ Datos
  □ Encryption at rest
  □ Encryption in transit
  □ PII encrypted
  □ Secure key management

□ Infraestructura
  □ Network segmentation
  □ Container security
  □ Secrets management
  □ Regular patching

□ Monitoreo
  □ Security logging
  □ Audit trails
  □ Alerting
  □ Incident response plan
```

---

## Referencias

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [API Specification](API_SPECIFICATION.md)
- [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)
