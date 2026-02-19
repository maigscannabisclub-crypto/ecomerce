/**
 * Security Middleware Bundle
 * Combines all security middleware for easy application
 */

import { Request, Response, NextFunction, Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../utils/logger';

// Import individual security modules
import {
  generalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  adminRateLimiter,
  strictRateLimiter,
  adaptiveRateLimiter,
} from '../gateway/rate-limiter';
import { wafMiddleware } from '../gateway/waf-rules';
import {
  securityHeadersMiddleware,
  customSecurityHeaders,
  strictCorsMiddleware,
  apiSecurityHeaders,
} from '../gateway/security-headers';
import { fullSanitizationMiddleware, securityCheckMiddleware } from '../validation/sanitizers';
import { blacklistCheckMiddleware } from '../auth/jwt-blacklist';
import { zeroTrustMiddleware, serviceMeshHeaders } from '../mtls/zero-trust-config';

// Security configuration interface
interface SecurityConfig {
  // Rate limiting
  rateLimiting: {
    enabled: boolean;
    tier: 'general' | 'auth' | 'api' | 'admin' | 'strict' | 'adaptive';
  };
  
  // WAF
  waf: {
    enabled: boolean;
    mode: 'block' | 'monitor' | 'disabled';
  };
  
  // Headers
  headers: {
    enabled: boolean;
    hsts: boolean;
    csp: boolean;
  };
  
  // CORS
  cors: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowCredentials: boolean;
  };
  
  // Input sanitization
  sanitization: {
    enabled: boolean;
    xss: boolean;
    sql: boolean;
    nosql: boolean;
  };
  
  // JWT
  jwt: {
    enabled: boolean;
    checkBlacklist: boolean;
  };
  
  // Zero trust
  zeroTrust: {
    enabled: boolean;
    enforceMtls: boolean;
  };
  
  // Security checks
  securityCheck: {
    enabled: boolean;
  };
}

// Default security configuration
const defaultSecurityConfig: SecurityConfig = {
  rateLimiting: {
    enabled: true,
    tier: 'adaptive',
  },
  waf: {
    enabled: process.env.WAF_ENABLED === 'true',
    mode: (process.env.WAF_MODE as any) || 'block',
  },
  headers: {
    enabled: true,
    hsts: process.env.NODE_ENV === 'production',
    csp: true,
  },
  cors: {
    enabled: true,
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowCredentials: true,
  },
  sanitization: {
    enabled: true,
    xss: true,
    sql: false, // Prisma handles SQL injection
    nosql: true,
  },
  jwt: {
    enabled: true,
    checkBlacklist: true,
  },
  zeroTrust: {
    enabled: process.env.ZERO_TRUST_ENABLED === 'true',
    enforceMtls: process.env.ZERO_TRUST_ENFORCE_MTLS === 'true',
  },
  securityCheck: {
    enabled: true,
  },
};

/**
 * Apply comprehensive security middleware
 */
export function applySecurityMiddleware(
  app: Application,
  config: Partial<SecurityConfig> = {}
): void {
  const securityConfig = mergeConfig(defaultSecurityConfig, config);
  
  logger.info({ config: securityConfig }, 'Applying security middleware');
  
  // 1. Trust proxy (for accurate IP detection behind load balancers)
  app.set('trust proxy', true);
  
  // 2. Security headers (Helmet)
  if (securityConfig.headers.enabled) {
    app.use(securityHeadersMiddleware());
    app.use(customSecurityHeaders());
    logger.debug('Security headers middleware applied');
  }
  
  // 3. CORS
  if (securityConfig.cors.enabled) {
    app.use(
      strictCorsMiddleware({
        allowedOrigins: securityConfig.cors.allowedOrigins,
        allowedMethods: securityConfig.cors.allowedMethods,
        allowCredentials: securityConfig.cors.allowCredentials,
      })
    );
    logger.debug('CORS middleware applied');
  }
  
  // 4. Input sanitization (before body parsing)
  if (securityConfig.sanitization.enabled) {
    app.use(
      fullSanitizationMiddleware({
        xss: securityConfig.sanitization.xss,
        sql: securityConfig.sanitization.sql,
        nosql: securityConfig.sanitization.nosql,
      })
    );
    logger.debug('Input sanitization middleware applied');
  }
  
  // 5. Security check (detect threats without blocking)
  if (securityConfig.securityCheck.enabled) {
    app.use(securityCheckMiddleware());
    logger.debug('Security check middleware applied');
  }
  
  // 6. WAF (Web Application Firewall)
  if (securityConfig.waf.enabled) {
    app.use(
      wafMiddleware({
        enabled: true,
        mode: securityConfig.waf.mode,
      })
    );
    logger.debug('WAF middleware applied');
  }
  
  // 7. Rate limiting
  if (securityConfig.rateLimiting.enabled) {
    const rateLimiter = getRateLimiter(securityConfig.rateLimiting.tier);
    app.use(rateLimiter);
    logger.debug('Rate limiting middleware applied');
  }
  
  // 8. JWT blacklist check
  if (securityConfig.jwt.enabled && securityConfig.jwt.checkBlacklist) {
    app.use(blacklistCheckMiddleware());
    logger.debug('JWT blacklist check middleware applied');
  }
  
  // 9. Zero trust
  if (securityConfig.zeroTrust.enabled) {
    app.use(
      zeroTrustMiddleware({
        enforceMtls: securityConfig.zeroTrust.enforceMtls,
      })
    );
    app.use(serviceMeshHeaders());
    logger.debug('Zero trust middleware applied');
  }
  
  // 10. API security headers (after all other middleware)
  app.use(apiSecurityHeaders());
  
  logger.info('All security middleware applied successfully');
}

/**
 * Get rate limiter based on tier
 */
function getRateLimiter(tier: string) {
  switch (tier) {
    case 'general':
      return generalRateLimiter;
    case 'auth':
      return authRateLimiter;
    case 'api':
      return apiRateLimiter;
    case 'admin':
      return adminRateLimiter;
    case 'strict':
      return strictRateLimiter;
    case 'adaptive':
    default:
      return adaptiveRateLimiter();
  }
}

/**
 * Merge security configurations
 */
function mergeConfig(
  defaultConfig: SecurityConfig,
  userConfig: Partial<SecurityConfig>
): SecurityConfig {
  return {
    rateLimiting: { ...defaultConfig.rateLimiting, ...userConfig.rateLimiting },
    waf: { ...defaultConfig.waf, ...userConfig.waf },
    headers: { ...defaultConfig.headers, ...userConfig.headers },
    cors: { ...defaultConfig.cors, ...userConfig.cors },
    sanitization: { ...defaultConfig.sanitization, ...userConfig.sanitization },
    jwt: { ...defaultConfig.jwt, ...userConfig.jwt },
    zeroTrust: { ...defaultConfig.zeroTrust, ...userConfig.zeroTrust },
    securityCheck: { ...defaultConfig.securityCheck, ...userConfig.securityCheck },
  };
}

/**
 * Security headers only middleware (lightweight)
 */
export function securityHeadersOnly(): any[] {
  return [securityHeadersMiddleware(), customSecurityHeaders(), apiSecurityHeaders()];
}

/**
 * API security middleware (for API routes)
 */
export function apiSecurityMiddleware(config: Partial<SecurityConfig> = {}): any[] {
  const securityConfig = mergeConfig(defaultSecurityConfig, {
    ...config,
    rateLimiting: { enabled: true, tier: 'api' },
  });
  
  const middlewares: any[] = [];
  
  if (securityConfig.headers.enabled) {
    middlewares.push(securityHeadersMiddleware());
    middlewares.push(customSecurityHeaders());
  }
  
  if (securityConfig.cors.enabled) {
    middlewares.push(
      strictCorsMiddleware({
        allowedOrigins: securityConfig.cors.allowedOrigins,
        allowedMethods: securityConfig.cors.allowedMethods,
        allowCredentials: securityConfig.cors.allowCredentials,
      })
    );
  }
  
  if (securityConfig.sanitization.enabled) {
    middlewares.push(
      fullSanitizationMiddleware({
        xss: securityConfig.sanitization.xss,
        sql: securityConfig.sanitization.sql,
        nosql: securityConfig.sanitization.nosql,
      })
    );
  }
  
  if (securityConfig.waf.enabled) {
    middlewares.push(wafMiddleware({ enabled: true, mode: securityConfig.waf.mode }));
  }
  
  middlewares.push(apiRateLimiter);
  middlewares.push(apiSecurityHeaders());
  
  return middlewares;
}

/**
 * Admin security middleware (stricter)
 */
export function adminSecurityMiddleware(config: Partial<SecurityConfig> = {}): any[] {
  const securityConfig = mergeConfig(defaultSecurityConfig, {
    ...config,
    rateLimiting: { enabled: true, tier: 'admin' },
    waf: { enabled: true, mode: 'block' },
  });
  
  const middlewares: any[] = [];
  
  if (securityConfig.headers.enabled) {
    middlewares.push(securityHeadersMiddleware());
    middlewares.push(customSecurityHeaders());
  }
  
  if (securityConfig.cors.enabled) {
    middlewares.push(
      strictCorsMiddleware({
        allowedOrigins: securityConfig.cors.allowedOrigins,
        allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
      })
    );
  }
  
  if (securityConfig.sanitization.enabled) {
    middlewares.push(
      fullSanitizationMiddleware({
        xss: true,
        sql: true,
        nosql: true,
      })
    );
  }
  
  if (securityConfig.waf.enabled) {
    middlewares.push(wafMiddleware({ enabled: true, mode: 'block' }));
  }
  
  middlewares.push(adminRateLimiter);
  middlewares.push(apiSecurityHeaders());
  
  return middlewares;
}

/**
 * Auth security middleware (for authentication routes)
 */
export function authSecurityMiddleware(config: Partial<SecurityConfig> = {}): any[] {
  const securityConfig = mergeConfig(defaultSecurityConfig, {
    ...config,
    rateLimiting: { enabled: true, tier: 'auth' },
  });
  
  const middlewares: any[] = [];
  
  if (securityConfig.headers.enabled) {
    middlewares.push(securityHeadersMiddleware());
    middlewares.push(customSecurityHeaders());
  }
  
  if (securityConfig.cors.enabled) {
    middlewares.push(
      strictCorsMiddleware({
        allowedOrigins: securityConfig.cors.allowedOrigins,
        allowedMethods: ['POST', 'OPTIONS'],
        allowCredentials: true,
      })
    );
  }
  
  if (securityConfig.sanitization.enabled) {
    middlewares.push(
      fullSanitizationMiddleware({
        xss: true,
        sql: false,
        nosql: true,
      })
    );
  }
  
  if (securityConfig.waf.enabled) {
    middlewares.push(wafMiddleware({ enabled: true, mode: 'block' }));
  }
  
  middlewares.push(authRateLimiter);
  middlewares.push(apiSecurityHeaders());
  
  return middlewares;
}

/**
 * Create security middleware for specific route patterns
 */
export function createRouteSecurity(pattern: string, config: Partial<SecurityConfig> = {}): any[] {
  if (pattern.startsWith('/admin')) {
    return adminSecurityMiddleware(config);
  }
  
  if (pattern.startsWith('/auth') || pattern.includes('/login') || pattern.includes('/register')) {
    return authSecurityMiddleware(config);
  }
  
  if (pattern.startsWith('/api')) {
    return apiSecurityMiddleware(config);
  }
  
  return securityHeadersOnly();
}

export default {
  applySecurityMiddleware,
  securityHeadersOnly,
  apiSecurityMiddleware,
  adminSecurityMiddleware,
  authSecurityMiddleware,
  createRouteSecurity,
  defaultSecurityConfig,
};
