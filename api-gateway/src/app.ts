import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import routes from './routes';
import { config } from './config';
import { correlationMiddleware } from './middleware/correlation';
import { globalRateLimiter, apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger, createRequestLogger } from './middleware/logger';
import { AuthenticatedRequest } from './types';

// ============================================
// ENTERPRISE SECURITY IMPORTS
// ============================================
import {
  generalRateLimiter,
  authRateLimiter,
  apiRateLimiter as enterpriseApiRateLimiter,
  adminRateLimiter,
  adaptiveRateLimiter,
  blacklistIP,
  isBlacklisted,
} from '../../../security/gateway/rate-limiter';
import { wafMiddleware } from '../../../security/gateway/waf-rules';
import {
  securityHeadersMiddleware,
  customSecurityHeaders,
  strictCorsMiddleware,
  apiSecurityHeaders,
} from '../../../security/gateway/security-headers';
import { fullSanitizationMiddleware, securityCheckMiddleware } from '../../../security/validation/sanitizers';
import { blacklistCheckMiddleware } from '../../../security/auth/jwt-blacklist';
import { auditMiddleware, logSecurityEvent } from '../../../security/middleware/audit.middleware';

// Create Express application
const app: Application = express();

// ============================================
// ENTERPRISE SECURITY MIDDLEWARE (Phase 1)
// Applied before body parsing for early threat detection
// ============================================

// Trust proxy for accurate IP detection
app.set('trust proxy', true);

// Security headers (Helmet + custom)
app.use(securityHeadersMiddleware());
app.use(customSecurityHeaders());

// CORS with strict configuration
app.use(strictCorsMiddleware({
  allowedOrigins: config.cors.origin || [],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowCredentials: true,
}));

// Input sanitization (before body parsing)
app.use(fullSanitizationMiddleware({
  xss: true,
  sql: false, // Prisma handles SQL injection
  nosql: true,
}));

// Security check (detect threats without blocking)
app.use(securityCheckMiddleware());

// Web Application Firewall
app.use(wafMiddleware({
  enabled: process.env.WAF_ENABLED === 'true',
  mode: (process.env.WAF_MODE as 'block' | 'monitor' | 'disabled') || 'monitor',
}));

// ============================================
// COMPRESSION
// ============================================

app.use(compression({
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6
}));

// ============================================
// REQUEST PARSING
// ============================================

app.use(express.json({
  limit: '10mb',
  strict: true
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// ============================================
// CORRELATION & REQUEST TRACKING
// ============================================

app.use(correlationMiddleware);

// ============================================
// AUDIT LOGGING
// ============================================

app.use(auditMiddleware({
  enabled: process.env.AUDIT_ENABLED === 'true',
  logToConsole: true,
  logToRedis: true,
}));

// ============================================
// REQUEST LOGGING
// ============================================

app.use((req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const requestLogger = createRequestLogger({
    correlationId: authReq.correlationId,
    requestId: authReq.requestId,
    path: req.path,
    method: req.method,
    ip: req.ip || 'unknown',
    userAgent: req.get('user-agent') || undefined
  });

  requestLogger.info('Request started', {
    query: req.query,
    contentType: req.get('content-type')
  });

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    requestLogger.log(level, 'Request completed', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length')
    });
  });

  next();
});

// ============================================
// ENTERPRISE RATE LIMITING (Phase 2)
// Adaptive rate limiting based on route patterns
// ============================================

// Legacy rate limiters (kept for backward compatibility)
app.use(globalRateLimiter);
app.use('/api', apiRateLimiter);

// Enterprise adaptive rate limiter
app.use(adaptiveRateLimiter());

// Specific route rate limiters
app.use('/auth', authRateLimiter);
app.use('/api', enterpriseApiRateLimiter);
app.use('/admin', adminRateLimiter);

// ============================================
// JWT BLACKLIST CHECK
// ============================================

app.use(blacklistCheckMiddleware());

// ============================================
// IP BLACKLIST CHECK
// ============================================

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.socket.remoteAddress || '';
  
  if (await isBlacklisted(clientIP)) {
    logger.warn({ ip: clientIP, path: req.path }, 'Blocked request from blacklisted IP');
    
    // Log security event
    await logSecurityEvent(req, 'security.blocked', {
      reason: 'ip_blacklisted',
      ip: clientIP,
    }, 'warning');
    
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked',
      code: 'IP_BLOCKED',
    });
  }
  
  next();
});

// ============================================
// API SECURITY HEADERS
// ============================================

app.use(apiSecurityHeaders());

// ============================================
// ROUTES
// ============================================

app.use(routes);

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// UNHANDLED ERRORS
// ============================================

app.on('error', (error: Error) => {
  logger.error('Express application error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  });
});

// ============================================
// SECURITY HEALTH CHECK ENDPOINT
// ============================================

app.get('/health/security', async (req: Request, res: Response) => {
  const { getWAFStats } = await import('../../../security/gateway/waf-rules');
  const { getBlacklistStats } = await import('../../../security/auth/jwt-blacklist');
  
  const [wafStats, blacklistStats] = await Promise.all([
    getWAFStats(),
    getBlacklistStats(),
  ]);
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    security: {
      waf: wafStats,
      blacklist: blacklistStats,
      headers: {
        hsts: true,
        csp: true,
        xframe: true,
      },
    },
  });
});

export default app;
