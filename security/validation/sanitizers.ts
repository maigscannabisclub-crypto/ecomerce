/**
 * Input Sanitization Service
 * XSS protection, SQL injection prevention, and input cleaning
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Sanitization options
interface SanitizeOptions {
  stripHtml?: boolean;
  normalizeWhitespace?: boolean;
  removeNullBytes?: boolean;
  trim?: boolean;
  maxLength?: number;
}

const defaultOptions: SanitizeOptions = {
  stripHtml: true,
  normalizeWhitespace: true,
  removeNullBytes: true,
  trim: true,
  maxLength: 10000,
};

// XSS dangerous patterns
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*\/>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object[^>]*>[\s\S]*?<\/object>/gi,
  /<embed[^>]*>/gi,
  /<applet[^>]*>[\s\S]*?<\/applet>/gi,
  /<form[^>]*>[\s\S]*?<\/form>/gi,
  /<input[^>]*>/gi,
  /<textarea[^>]*>[\s\S]*?<\/textarea>/gi,
  /<link[^>]*>/gi,
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<meta[^>]*>/gi,
  /<base[^>]*>/gi,
  /<svg[^>]*on\w+\s*=/gi,
  /data:text\/html/gi,
  /data:application\/javascript/gi,
];

// SQL injection patterns
const SQLI_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi,
  /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi,
  /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi,
  /((\%27)|(\'))union/gi,
  /exec(\s|\+)+(s|x)p\w+/gi,
  /UNION\s+SELECT/gi,
  /INSERT\s+INTO/gi,
  /DELETE\s+FROM/gi,
  /DROP\s+TABLE/gi,
];

/**
 * Sanitize string against XSS
 */
export function sanitizeXSS(input: string, options: SanitizeOptions = {}): string {
  const opts = { ...defaultOptions, ...options };
  let sanitized = input;
  
  // Remove null bytes
  if (opts.removeNullBytes) {
    sanitized = sanitized.replace(/\x00/g, '');
  }
  
  // Strip HTML tags
  if (opts.stripHtml) {
    for (const pattern of XSS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }
    // Remove remaining HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }
  
  // HTML entity encoding for remaining content
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Normalize whitespace
  if (opts.normalizeWhitespace) {
    sanitized = sanitized.replace(/\s+/g, ' ');
  }
  
  // Trim
  if (opts.trim) {
    sanitized = sanitized.trim();
  }
  
  // Enforce max length
  if (opts.maxLength && sanitized.length > opts.maxLength) {
    sanitized = sanitized.substring(0, opts.maxLength);
  }
  
  return sanitized;
}

/**
 * Sanitize against SQL injection
 */
export function sanitizeSQL(input: string): string {
  let sanitized = input;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Escape SQL special characters
  sanitized = sanitized
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\x1a/g, '\\Z');
  
  // Remove common SQL injection patterns
  for (const pattern of SQLI_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  return sanitized;
}

/**
 * Sanitize against NoSQL injection
 */
export function sanitizeNoSQL(input: any): any {
  if (typeof input === 'string') {
    // Remove NoSQL operators
    return input.replace(/\$[a-zA-Z]+/g, '');
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeNoSQL);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Remove keys starting with $
      if (!key.startsWith('$')) {
        sanitized[key] = sanitizeNoSQL(value);
      }
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Sanitize path (prevent path traversal)
 */
export function sanitizePath(input: string): string {
  let sanitized = input;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Remove path traversal sequences
  sanitized = sanitized.replace(/(\.\.\/|\.\.\\)/g, '');
  
  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove leading slashes
  sanitized = sanitized.replace(/^(\.\/|\/)+/, '');
  
  // Remove multiple consecutive slashes
  sanitized = sanitized.replace(/\/+/g, '/');
  
  return sanitized;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(input: string): string {
  let sanitized = input;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Remove path separators
  sanitized = sanitized.replace(/[\/\\]/g, '');
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Trim and limit length
  sanitized = sanitized.trim();
  if (sanitized.length > 255) {
    const ext = sanitized.lastIndexOf('.');
    if (ext > 0) {
      sanitized = sanitized.substring(0, 251) + sanitized.substring(ext);
    } else {
      sanitized = sanitized.substring(0, 255);
    }
  }
  
  // Ensure not empty
  if (!sanitized) {
    sanitized = 'unnamed';
  }
  
  return sanitized;
}

/**
 * Sanitize email
 */
export function sanitizeEmail(input: string): string {
  let sanitized = input.toLowerCase().trim();
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Basic email validation and sanitization
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
}

/**
 * Sanitize URL
 */
export function sanitizeURL(input: string): string {
  let sanitized = input.trim();
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Remove javascript: and data: protocols
  const lower = sanitized.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    throw new Error('Invalid URL protocol');
  }
  
  // Validate URL format
  try {
    const url = new URL(sanitized);
    
    // Only allow http and https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid URL protocol');
    }
    
    return sanitized;
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * Deep sanitize object
 */
export function deepSanitize(
  obj: any,
  options: {
    xss?: boolean;
    sql?: boolean;
    nosql?: boolean;
  } = {}
): any {
  const opts = { xss: true, sql: false, nosql: true, ...options };
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    let sanitized = obj;
    if (opts.xss) {
      sanitized = sanitizeXSS(sanitized);
    }
    if (opts.sql) {
      sanitized = sanitizeSQL(sanitized);
    }
    return sanitized;
  }
  
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitize(item, opts));
  }
  
  if (typeof obj === 'object') {
    if (opts.nosql) {
      obj = sanitizeNoSQL(obj);
    }
    
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = opts.xss ? sanitizeXSS(key) : key;
      sanitized[sanitizedKey] = deepSanitize(value, opts);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Create sanitization middleware
 */
export function createSanitizationMiddleware(
  fields: string[],
  options: {
    source?: 'body' | 'query' | 'params';
    xss?: boolean;
    sql?: boolean;
    nosql?: boolean;
  } = {}
) {
  const { source = 'body', xss = true, sql = false, nosql = true } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    
    if (!data || typeof data !== 'object') {
      return next();
    }
    
    for (const field of fields) {
      if (field in data) {
        const value = data[field];
        
        if (typeof value === 'string') {
          let sanitized = value;
          
          if (xss) {
            sanitized = sanitizeXSS(sanitized);
          }
          
          if (sql) {
            sanitized = sanitizeSQL(sanitized);
          }
          
          data[field] = sanitized;
        } else if (typeof value === 'object' && nosql) {
          data[field] = sanitizeNoSQL(value);
        }
      }
    }
    
    next();
  };
}

/**
 * Full request sanitization middleware
 */
export function fullSanitizationMiddleware(
  options: {
    xss?: boolean;
    sql?: boolean;
    nosql?: boolean;
  } = {}
) {
  const opts = { xss: true, sql: false, nosql: true, ...options };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body, opts);
    }
    
    // Sanitize query
    if (req.query && typeof req.query === 'object') {
      req.query = deepSanitize(req.query, opts);
    }
    
    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = deepSanitize(req.params, opts);
    }
    
    // Log sanitization for audit
    logger.debug(
      {
        path: req.path,
        method: req.method,
        options: opts,
      },
      'Request sanitized'
    );
    
    next();
  };
}

/**
 * Check if input contains XSS
 */
export function containsXSS(input: string): boolean {
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if input contains SQL injection
 */
export function containsSQLI(input: string): boolean {
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

/**
 * Security check middleware (detects but doesn't block)
 */
export function securityCheckMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const threats: string[] = [];
    
    // Check body
    if (req.body) {
      const bodyStr = JSON.stringify(req.body);
      if (containsXSS(bodyStr)) {
        threats.push('XSS in body');
      }
      if (containsSQLI(bodyStr)) {
        threats.push('SQLi in body');
      }
    }
    
    // Check query
    if (req.query) {
      const queryStr = JSON.stringify(req.query);
      if (containsXSS(queryStr)) {
        threats.push('XSS in query');
      }
      if (containsSQLI(queryStr)) {
        threats.push('SQLi in query');
      }
    }
    
    // Log threats
    if (threats.length > 0) {
      logger.warn(
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          threats,
        },
        'Potential security threats detected'
      );
      
      // Add threat info to request for later processing
      (req as any).securityThreats = threats;
    }
    
    next();
  };
}

export default {
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
};
