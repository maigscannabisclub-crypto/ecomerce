/**
 * Security Headers Configuration
 * Enterprise-grade security headers including CSP, HSTS, and protection headers
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

// Content Security Policy configuration
interface CSPConfig {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  objectSrc: string[];
  mediaSrc: string[];
  frameSrc: string[];
  childSrc: string[];
  workerSrc: string[];
  manifestSrc: string[];
  baseUri: string[];
  formAction: string[];
  frameAncestors: string[];
  upgradeInsecureRequests: boolean;
  blockAllMixedContent: boolean;
}

// Default CSP configuration
const defaultCSP: CSPConfig = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'", // Required for some legacy integrations
    "'unsafe-eval'", // Required for some bundlers
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    'https://cdn.jsdelivr.net',
  ],
  imgSrc: [
    "'self'",
    'data:',
    'blob:',
    'https:',
    '*.amazonaws.com',
    '*.cloudfront.net',
  ],
  connectSrc: [
    "'self'",
    'https://api.stripe.com',
    'https://*.amazonaws.com',
    'wss:',
    'ws:',
  ],
  fontSrc: [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
  ],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: [
    "'self'",
    'https://js.stripe.com',
    'https://hooks.stripe.com',
    'https://www.youtube-nocookie.com',
  ],
  childSrc: ["'self'"],
  workerSrc: ["'self'", 'blob:'],
  manifestSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"], // Prevent clickjacking
  upgradeInsecureRequests: true,
  blockAllMixedContent: true,
};

/**
 * Build CSP directive string from configuration
 */
function buildCSPString(config: Partial<CSPConfig> = {}): string {
  const csp = { ...defaultCSP, ...config };
  
  const directives: string[] = [
    `default-src ${csp.defaultSrc?.join(' ')}`,
    `script-src ${csp.scriptSrc?.join(' ')}`,
    `style-src ${csp.styleSrc?.join(' ')}`,
    `img-src ${csp.imgSrc?.join(' ')}`,
    `connect-src ${csp.connectSrc?.join(' ')}`,
    `font-src ${csp.fontSrc?.join(' ')}`,
    `object-src ${csp.objectSrc?.join(' ')}`,
    `media-src ${csp.mediaSrc?.join(' ')}`,
    `frame-src ${csp.frameSrc?.join(' ')}`,
    `child-src ${csp.childSrc?.join(' ')}`,
    `worker-src ${csp.workerSrc?.join(' ')}`,
    `manifest-src ${csp.manifestSrc?.join(' ')}`,
    `base-uri ${csp.baseUri?.join(' ')}`,
    `form-action ${csp.formAction?.join(' ')}`,
    `frame-ancestors ${csp.frameAncestors?.join(' ')}`,
  ];
  
  if (csp.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }
  
  if (csp.blockAllMixedContent) {
    directives.push('block-all-mixed-content');
  }
  
  return directives.join('; ');
}

/**
 * Generate nonce for inline scripts/styles
 */
export function generateNonce(): string {
  return Buffer.from(Math.random().toString()).toString('base64').substring(0, 16);
}

/**
 * CSP middleware with nonce support
 */
export function cspMiddleware(cspConfig: Partial<CSPConfig> = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate nonce for this request
    const nonce = generateNonce();
    res.locals.cspNonce = nonce;
    
    // Add nonce to script-src
    const configWithNonce = {
      ...cspConfig,
      scriptSrc: [
        ...(cspConfig.scriptSrc || defaultCSP.scriptSrc || []),
        `'nonce-${nonce}'`,
      ],
    };
    
    const cspString = buildCSPString(configWithNonce);
    res.setHeader('Content-Security-Policy', cspString);
    
    next();
  };
}

/**
 * Report-only CSP middleware for testing
 */
export function cspReportOnlyMiddleware(cspConfig: Partial<CSPConfig> = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cspString = buildCSPString(cspConfig);
    res.setHeader('Content-Security-Policy-Report-Only', cspString);
    next();
  };
}

/**
 * Strict Transport Security (HSTS) middleware
 */
export function hstsMiddleware(options: { 
  maxAge?: number; 
  includeSubDomains?: boolean; 
  preload?: boolean 
} = {}) {
  const {
    maxAge = 31536000, // 1 year
    includeSubDomains = true,
    preload = true,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    let headerValue = `max-age=${maxAge}`;
    
    if (includeSubDomains) {
      headerValue += '; includeSubDomains';
    }
    
    if (preload) {
      headerValue += '; preload';
    }
    
    res.setHeader('Strict-Transport-Security', headerValue);
    next();
  };
}

/**
 * Complete security headers middleware using Helmet
 */
export function securityHeadersMiddleware() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
          'https://js.stripe.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', '*.amazonaws.com'],
        connectSrc: [
          "'self'",
          'https://api.stripe.com',
          'https://*.amazonaws.com',
          'wss:',
        ],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://hooks.stripe.com',
        ],
        childSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    
    // Cross-Origin policies
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    
    // DNS prefetch control
    dnsPrefetchControl: { allow: false },
    
    // Frame options (clickjacking protection)
    frameguard: { action: 'deny' },
    
    // Hide powered-by header
    hidePoweredBy: true,
    
    // HSTS
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    
    // IE No Open
    ieNoOpen: true,
    
    // No cache (for sensitive endpoints)
    noSniff: true,
    
    // Origin Agent Cluster
    originAgentCluster: true,
    
    // Permissions Policy
    permissionsPolicy: {
      features: {
        accelerometer: ["'none'"],
        camera: ["'none'"],
        geolocation: ["'self'"],
        gyroscope: ["'none'"],
        magnetometer: ["'none'"],
        microphone: ["'none'"],
        payment: ["'self'", 'https://js.stripe.com'],
        usb: ["'none'"],
      },
    },
    
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    
    // X-Content-Type-Options
    xssFilter: true,
  });
}

/**
 * Custom security headers middleware
 */
export function customSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // X-Frame-Options (legacy clickjacking protection)
    res.setHeader('X-Frame-Options', 'DENY');
    
    // X-XSS-Protection (legacy, mostly deprecated)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy (formerly Feature-Policy)
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(self), gyroscope=(), ' +
      'magnetometer=(), microphone=(), payment=(self "https://js.stripe.com"), usb=()'
    );
    
    // Cache control for sensitive endpoints
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/admin')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add security-related headers
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    
    // Expect-CT (Certificate Transparency)
    res.setHeader(
      'Expect-CT',
      'max-age=86400, enforce'
    );
    
    next();
  };
}

/**
 * CORS middleware with strict configuration
 */
export function strictCorsMiddleware(options: {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
} = {}) {
  const {
    allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders = [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-ID',
      'X-API-Key',
    ],
    allowCredentials = true,
    maxAge = 86400,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.length === 0 || 
      allowedOrigins.includes(origin || '') ||
      allowedOrigins.includes('*');
    
    if (isAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', allowCredentials.toString());
    res.setHeader('Access-Control-Max-Age', maxAge.toString());
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    
    next();
  };
}

/**
 * API-specific security headers
 */
export function apiSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // API-specific headers
    res.setHeader('X-API-Version', process.env.API_VERSION || 'v1');
    res.setHeader('X-Request-ID', req.headers['x-request-id'] || req.id || '');
    
    // Content-Type for API responses
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // Prevent caching of API responses
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
    next();
  };
}

/**
 * Combine all security headers
 */
export function comprehensiveSecurityHeaders() {
  const helmetMiddleware = securityHeadersMiddleware();
  const customHeaders = customSecurityHeaders();
  const apiHeaders = apiSecurityHeaders();
  
  return (req: Request, res: Response, next: NextFunction) => {
    helmetMiddleware(req, res, (err?: any) => {
      if (err) return next(err);
      
      customHeaders(req, res, (err?: any) => {
        if (err) return next(err);
        
        apiHeaders(req, res, next);
      });
    });
  };
}

export default {
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
};
