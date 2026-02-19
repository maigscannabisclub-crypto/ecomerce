/**
 * Security Audit Middleware
 * Comprehensive audit logging for security events
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client for audit log buffering
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 6, // Use separate DB for audit logs
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Audit event types
export type AuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled'
  | 'auth.token_refresh'
  | 'auth.token_revoked'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.role_change'
  | 'order.create'
  | 'order.update'
  | 'order.cancel'
  | 'order.refund'
  | 'payment.process'
  | 'payment.refund'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'admin.action'
  | 'security.violation'
  | 'security.rate_limit'
  | 'security.blocked'
  | 'api.access'
  | 'data.export'
  | 'config.change';

// Audit event severity
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// Audit event interface
interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actor: {
    userId?: string;
    email?: string;
    ip: string;
    userAgent: string;
    sessionId?: string;
    serviceId?: string;
  };
  resource: {
    type: string;
    id?: string;
    path: string;
  };
  action: {
    method: string;
    statusCode: number;
    success: boolean;
  };
  details: Record<string, any>;
  metadata: {
    requestId: string;
    correlationId?: string;
    duration?: number;
  };
}

// Audit configuration
interface AuditConfig {
  enabled: boolean;
  logToConsole: boolean;
  logToRedis: boolean;
  logToFile: boolean;
  sensitiveFields: string[];
  retentionDays: number;
  batchSize: number;
  flushInterval: number;
}

const defaultConfig: AuditConfig = {
  enabled: process.env.AUDIT_ENABLED === 'true',
  logToConsole: true,
  logToRedis: true,
  logToFile: false,
  sensitiveFields: [
    'password',
    'token',
    'secret',
    'creditCard',
    'cvv',
    'ssn',
    'apiKey',
    'privateKey',
  ],
  retentionDays: 90,
  batchSize: 100,
  flushInterval: 5000,
};

// In-memory buffer for batch processing
const auditBuffer: AuditEvent[] = [];

/**
 * Sanitize sensitive data from object
 */
function sanitizeSensitiveData(obj: any, sensitiveFields: string[]): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Check if string looks like sensitive data
    for (const field of sensitiveFields) {
      if (obj.toLowerCase().includes(field.toLowerCase())) {
        return '[REDACTED]';
      }
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeSensitiveData(item, sensitiveFields));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key is sensitive
      const isSensitive = sensitiveFields.some(
        (field) => key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeSensitiveData(value, sensitiveFields);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Create audit event
 */
export function createAuditEvent(
  req: Request,
  res: Response,
  eventType: AuditEventType,
  severity: AuditSeverity = 'info',
  details: Record<string, any> = {}
): AuditEvent {
  const config = defaultConfig;
  
  const event: AuditEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    eventType,
    severity,
    actor: {
      userId: (req as any).user?.id,
      email: (req as any).user?.email,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      sessionId: req.headers['x-session-id'] as string,
      serviceId: req.headers['x-service-id'] as string,
    },
    resource: {
      type: req.path.split('/')[1] || 'unknown',
      id: req.params.id,
      path: req.path,
    },
    action: {
      method: req.method,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
    },
    details: sanitizeSensitiveData(details, config.sensitiveFields),
    metadata: {
      requestId: req.headers['x-request-id'] as string,
      correlationId: req.headers['x-correlation-id'] as string,
      duration: (req as any).startTime
        ? Date.now() - (req as any).startTime
        : undefined,
    },
  };
  
  return event;
}

/**
 * Log audit event
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const config = defaultConfig;
  
  // Log to console
  if (config.logToConsole) {
    const logMethod =
      event.severity === 'error' || event.severity === 'critical'
        ? 'error'
        : event.severity === 'warning'
        ? 'warn'
        : 'info';
    
    logger[logMethod](
      {
        auditId: event.id,
        eventType: event.eventType,
        severity: event.severity,
        actor: event.actor,
        resource: event.resource,
        action: event.action,
      },
      `AUDIT: ${event.eventType}`
    );
  }
  
  // Buffer for batch processing
  if (config.logToRedis) {
    auditBuffer.push(event);
    
    if (auditBuffer.length >= config.batchSize) {
      await flushAuditBuffer();
    }
  }
}

/**
 * Flush audit buffer to Redis
 */
export async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) {
    return;
  }
  
  const events = [...auditBuffer];
  auditBuffer.length = 0;
  
  const pipeline = redis.pipeline();
  
  for (const event of events) {
    const key = `audit:${new Date().toISOString().split('T')[0]}:${event.id}`;
    pipeline.setex(
      key,
      defaultConfig.retentionDays * 24 * 60 * 60,
      JSON.stringify(event)
    );
    
    // Add to event type index
    pipeline.sadd(`audit:index:${event.eventType}`, event.id);
    
    // Add to user index
    if (event.actor.userId) {
      pipeline.sadd(`audit:user:${event.actor.userId}`, event.id);
    }
    
    // Add to severity index
    pipeline.sadd(`audit:severity:${event.severity}`, event.id);
  }
  
  try {
    await pipeline.exec();
    logger.debug({ count: events.length }, 'Audit buffer flushed');
  } catch (error) {
    logger.error({ error }, 'Failed to flush audit buffer');
    // Re-add events to buffer for retry
    auditBuffer.unshift(...events);
  }
}

/**
 * Audit middleware
 */
export function auditMiddleware(config: Partial<AuditConfig> = {}) {
  const auditConfig = { ...defaultConfig, ...config };
  
  if (!auditConfig.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
  
  // Setup periodic flush
  setInterval(flushAuditBuffer, auditConfig.flushInterval);
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Record start time
    (req as any).startTime = Date.now();
    
    // Capture response finish
    const originalEnd = res.end;
    res.end = function (this: Response, ...args: any[]) {
      originalEnd.apply(this, args);
      
      // Determine event type based on request
      const eventType = determineEventType(req, res);
      const severity = determineSeverity(res.statusCode, eventType);
      
      // Create and log audit event
      const event = createAuditEvent(req, res, eventType, severity, {
        query: req.query,
        params: req.params,
        // Don't log body for security
      });
      
      logAuditEvent(event).catch((error) => {
        logger.error({ error }, 'Failed to log audit event');
      });
    };
    
    next();
  };
}

/**
 * Determine event type from request
 */
function determineEventType(req: Request, res: Response): AuditEventType {
  const path = req.path.toLowerCase();
  const method = req.method;
  
  // Auth events
  if (path.includes('/login')) {
    return res.statusCode === 200 ? 'auth.login' : 'auth.login_failed';
  }
  if (path.includes('/logout')) return 'auth.logout';
  if (path.includes('/password/reset')) return 'auth.password_reset';
  if (path.includes('/password/change')) return 'auth.password_change';
  if (path.includes('/mfa/enable')) return 'auth.mfa_enabled';
  if (path.includes('/mfa/disable')) return 'auth.mfa_disabled';
  if (path.includes('/token/refresh')) return 'auth.token_refresh';
  if (path.includes('/token/revoke')) return 'auth.token_revoked';
  
  // User events
  if (path.includes('/users')) {
    if (method === 'POST') return 'user.create';
    if (method === 'PUT' || method === 'PATCH') return 'user.update';
    if (method === 'DELETE') return 'user.delete';
    if (path.includes('/role')) return 'user.role_change';
  }
  
  // Order events
  if (path.includes('/orders')) {
    if (method === 'POST') return 'order.create';
    if (method === 'PUT' || method === 'PATCH') return 'order.update';
    if (path.includes('/cancel')) return 'order.cancel';
    if (path.includes('/refund')) return 'order.refund';
  }
  
  // Payment events
  if (path.includes('/payments')) {
    if (method === 'POST') return 'payment.process';
    if (path.includes('/refund')) return 'payment.refund';
  }
  
  // Product events
  if (path.includes('/products')) {
    if (method === 'POST') return 'product.create';
    if (method === 'PUT' || method === 'PATCH') return 'product.update';
    if (method === 'DELETE') return 'product.delete';
  }
  
  // Admin events
  if (path.startsWith('/admin')) return 'admin.action';
  
  // Security events
  if (res.statusCode === 429) return 'security.rate_limit';
  if (res.statusCode === 403) return 'security.blocked';
  
  // Data export
  if (path.includes('/export')) return 'data.export';
  
  // Config changes
  if (path.includes('/config')) return 'config.change';
  
  return 'api.access';
}

/**
 * Determine severity from status code and event type
 */
function determineSeverity(statusCode: number, eventType: AuditEventType): AuditSeverity {
  // Critical events
  if (
    eventType === 'security.violation' ||
    eventType === 'auth.login_failed' ||
    eventType === 'user.delete'
  ) {
    return 'critical';
  }
  
  // Error events
  if (statusCode >= 500) return 'error';
  if (statusCode === 403 || statusCode === 401) return 'error';
  
  // Warning events
  if (statusCode === 429) return 'warning';
  if (eventType === 'security.rate_limit') return 'warning';
  if (eventType === 'admin.action') return 'warning';
  
  return 'info';
}

/**
 * Log specific security event
 */
export async function logSecurityEvent(
  req: Request,
  eventType: AuditEventType,
  details: Record<string, any> = {},
  severity: AuditSeverity = 'warning'
): Promise<void> {
  const res = { statusCode: 0 } as Response;
  const event = createAuditEvent(req, res, eventType, severity, details);
  await logAuditEvent(event);
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(options: {
  eventType?: AuditEventType;
  userId?: string;
  severity?: AuditSeverity;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}): Promise<AuditEvent[]> {
  const events: AuditEvent[] = [];
  
  if (options.userId) {
    const eventIds = await redis.smembers(`audit:user:${options.userId}`);
    for (const id of eventIds.slice(0, options.limit || 100)) {
      // Find the actual key
      const keys = await redis.keys(`audit:*:${id}`);
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const event = JSON.parse(data) as AuditEvent;
          
          // Apply filters
          if (options.eventType && event.eventType !== options.eventType) continue;
          if (options.severity && event.severity !== options.severity) continue;
          if (options.fromDate && new Date(event.timestamp) < options.fromDate) continue;
          if (options.toDate && new Date(event.timestamp) > options.toDate) continue;
          
          events.push(event);
        }
      }
    }
  }
  
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Get audit statistics
 */
export async function getAuditStats(
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}> {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let totalEvents = 0;
  
  // Get all event types
  const eventTypes = await redis.keys('audit:index:*');
  
  for (const key of eventTypes) {
    const count = await redis.scard(key);
    const type = key.replace('audit:index:', '');
    byType[type] = count;
    totalEvents += count;
  }
  
  // Get severity counts
  const severities = await redis.keys('audit:severity:*');
  
  for (const key of severities) {
    const count = await redis.scard(key);
    const severity = key.replace('audit:severity:', '');
    bySeverity[severity] = count;
  }
  
  return { totalEvents, byType, bySeverity };
}

/**
 * Cleanup old audit logs
 */
export async function cleanupAuditLogs(olderThanDays: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  let deleted = 0;
  const stream = redis.scanStream({
    match: 'audit:*',
    count: 100,
  });
  
  for await (const keys of stream) {
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl <= 0) {
        await redis.del(key);
        deleted++;
      }
    }
  }
  
  logger.info({ deleted, olderThanDays }, 'Audit logs cleaned up');
  
  return deleted;
}

export default {
  auditMiddleware,
  createAuditEvent,
  logAuditEvent,
  logSecurityEvent,
  queryAuditLogs,
  getAuditStats,
  cleanupAuditLogs,
  flushAuditBuffer,
};
