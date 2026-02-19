/**
 * Zero Trust Security Configuration
 * Implements zero-trust principles for service-to-service communication
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Service identity interface
interface ServiceIdentity {
  serviceId: string;
  serviceName: string;
  namespace: string;
  version: string;
  allowedEndpoints: string[];
  allowedMethods: string[];
  certificateFingerprint?: string;
}

// Trust context interface
interface TrustContext {
  identity: ServiceIdentity;
  authenticated: boolean;
  authorizationLevel: 'none' | 'basic' | 'full';
  trustScore: number;
  lastVerified: Date;
}

// Zero trust configuration
interface ZeroTrustConfig {
  enforceMtls: boolean;
  requireIdentity: boolean;
  maxTrustScoreAge: number; // milliseconds
  defaultAuthorizationLevel: 'none' | 'basic' | 'full';
  blockedServices: string[];
  allowedServices: string[];
}

const defaultConfig: ZeroTrustConfig = {
  enforceMtls: process.env.ZERO_TRUST_ENFORCE_MTLS === 'true',
  requireIdentity: true,
  maxTrustScoreAge: 5 * 60 * 1000, // 5 minutes
  defaultAuthorizationLevel: 'basic',
  blockedServices: (process.env.ZERO_TRUST_BLOCKED_SERVICES || '').split(',').filter(Boolean),
  allowedServices: (process.env.ZERO_TRUST_ALLOWED_SERVICES || '').split(',').filter(Boolean),
};

// Service registry (in production, use a proper service mesh)
const serviceRegistry = new Map<string, ServiceIdentity>();

/**
 * Register service identity
 */
export function registerService(identity: ServiceIdentity): void {
  serviceRegistry.set(identity.serviceId, identity);
  logger.info(
    { serviceId: identity.serviceId, serviceName: identity.serviceName },
    'Service registered in zero-trust registry'
  );
}

/**
 * Unregister service
 */
export function unregisterService(serviceId: string): void {
  serviceRegistry.delete(serviceId);
  logger.info({ serviceId }, 'Service unregistered from zero-trust registry');
}

/**
 * Get service identity
 */
export function getServiceIdentity(serviceId: string): ServiceIdentity | undefined {
  return serviceRegistry.get(serviceId);
}

/**
 * Verify service certificate
 */
export function verifyServiceCertificate(
  certFingerprint: string,
  serviceId: string
): boolean {
  const identity = serviceRegistry.get(serviceId);
  
  if (!identity) {
    return false;
  }
  
  return identity.certificateFingerprint === certFingerprint;
}

/**
 * Calculate trust score based on various factors
 */
export function calculateTrustScore(
  identity: ServiceIdentity,
  context: {
    certificateValid: boolean;
    certificateExpiry: Date;
    requestPath: string;
    requestMethod: string;
    rateLimitStatus: 'good' | 'warning' | 'exceeded';
    anomalyScore: number;
  }
): number {
  let score = 50; // Base score
  
  // Certificate validity
  if (context.certificateValid) {
    score += 20;
  }
  
  // Certificate expiry (penalize if expiring soon)
  const daysUntilExpiry =
    (context.certificateExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry > 30) {
    score += 10;
  } else if (daysUntilExpiry > 7) {
    score += 5;
  } else {
    score -= 10;
  }
  
  // Endpoint authorization
  const endpointAllowed = identity.allowedEndpoints.some((pattern) => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(context.requestPath);
  });
  
  if (endpointAllowed) {
    score += 10;
  } else {
    score -= 20;
  }
  
  // Method authorization
  if (identity.allowedMethods.includes(context.requestMethod)) {
    score += 5;
  } else {
    score -= 10;
  }
  
  // Rate limit status
  switch (context.rateLimitStatus) {
    case 'good':
      score += 5;
      break;
    case 'warning':
      score -= 5;
      break;
    case 'exceeded':
      score -= 30;
      break;
  }
  
  // Anomaly score (0-100, lower is better)
  score -= context.anomalyScore * 0.3;
  
  // Clamp score between 0 and 100
  return Math.max(0, Math.min(100, score));
}

/**
 * Zero trust middleware
 */
export function zeroTrustMiddleware(config: Partial<ZeroTrustConfig> = {}) {
  const ztConfig = { ...defaultConfig, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract client certificate info
    const clientCert = (req.socket as any).getPeerCertificate?.();
    const certFingerprint = clientCert?.fingerprint;
    
    // Extract service identity from headers
    const serviceId = req.headers['x-service-id'] as string;
    const serviceName = req.headers['x-service-name'] as string;
    
    // Check if service is blocked
    if (serviceId && ztConfig.blockedServices.includes(serviceId)) {
      logger.warn({ serviceId, path: req.path }, 'Blocked service attempted access');
      return res.status(403).json({
        error: 'Access denied',
        message: 'Service is blocked',
        code: 'SERVICE_BLOCKED',
      });
    }
    
    // Check if mTLS is enforced
    if (ztConfig.enforceMtls && !clientCert) {
      logger.warn({ path: req.path }, 'mTLS required but no client certificate provided');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Client certificate required',
        code: 'MTLS_REQUIRED',
      });
    }
    
    // Verify service identity
    let identity: ServiceIdentity | undefined;
    let authenticated = false;
    
    if (serviceId) {
      identity = serviceRegistry.get(serviceId);
      
      if (identity && certFingerprint) {
        authenticated = verifyServiceCertificate(certFingerprint, serviceId);
      }
    }
    
    // Check allowed services list
    if (
      ztConfig.allowedServices.length > 0 &&
      serviceId &&
      !ztConfig.allowedServices.includes(serviceId)
    ) {
      logger.warn({ serviceId }, 'Service not in allowed list');
      return res.status(403).json({
        error: 'Access denied',
        message: 'Service not authorized',
        code: 'SERVICE_NOT_AUTHORIZED',
      });
    }
    
    // Calculate trust score
    const trustScore = identity
      ? calculateTrustScore(identity, {
          certificateValid: !!clientCert && !(clientCert as any).valid_from,
          certificateExpiry: clientCert
            ? new Date((clientCert as any).valid_to)
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          requestPath: req.path,
          requestMethod: req.method,
          rateLimitStatus: 'good',
          anomalyScore: 0,
        })
      : 0;
    
    // Create trust context
    const trustContext: TrustContext = {
      identity: identity || {
        serviceId: serviceId || 'unknown',
        serviceName: serviceName || 'unknown',
        namespace: 'default',
        version: 'unknown',
        allowedEndpoints: [],
        allowedMethods: [],
      },
      authenticated,
      authorizationLevel: authenticated ? 'full' : ztConfig.defaultAuthorizationLevel,
      trustScore,
      lastVerified: new Date(),
    };
    
    // Attach trust context to request
    (req as any).trustContext = trustContext;
    
    // Add zero-trust headers to response
    res.setHeader('X-Trust-Score', trustScore.toString());
    res.setHeader('X-Authenticated', authenticated.toString());
    res.setHeader('X-Authorization-Level', trustContext.authorizationLevel);
    
    // Log access attempt
    logger.debug(
      {
        serviceId: trustContext.identity.serviceId,
        path: req.path,
        trustScore,
        authenticated,
      },
      'Zero-trust access check'
    );
    
    next();
  };
}

/**
 * Require authentication middleware
 */
export function requireAuthentication() {
  return (req: Request, res: Response, next: NextFunction) => {
    const trustContext = (req as any).trustContext as TrustContext | undefined;
    
    if (!trustContext || !trustContext.authenticated) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid service authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    
    next();
  };
}

/**
 * Require minimum trust score middleware
 */
export function requireTrustScore(minScore: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const trustContext = (req as any).trustContext as TrustContext | undefined;
    
    if (!trustContext || trustContext.trustScore < minScore) {
      logger.warn(
        {
          serviceId: trustContext?.identity.serviceId,
          trustScore: trustContext?.trustScore,
          requiredScore: minScore,
        },
        'Trust score too low'
      );
      
      return res.status(403).json({
        error: 'Access denied',
        message: `Trust score below required threshold (${minScore})`,
        code: 'TRUST_SCORE_TOO_LOW',
      });
    }
    
    next();
  };
}

/**
 * Require service authorization for endpoint
 */
export function requireEndpointAuthorization() {
  return (req: Request, res: Response, next: NextFunction) => {
    const trustContext = (req as any).trustContext as TrustContext | undefined;
    
    if (!trustContext) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Trust context not available',
        code: 'NO_TRUST_CONTEXT',
      });
    }
    
    const identity = trustContext.identity;
    
    // Check endpoint authorization
    const endpointAllowed = identity.allowedEndpoints.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(req.path);
    });
    
    if (!endpointAllowed) {
      logger.warn(
        {
          serviceId: identity.serviceId,
          path: req.path,
          allowedEndpoints: identity.allowedEndpoints,
        },
        'Service not authorized for endpoint'
      );
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'Service not authorized for this endpoint',
        code: 'ENDPOINT_NOT_AUTHORIZED',
      });
    }
    
    // Check method authorization
    if (!identity.allowedMethods.includes(req.method)) {
      logger.warn(
        {
          serviceId: identity.serviceId,
          method: req.method,
          allowedMethods: identity.allowedMethods,
        },
        'Method not allowed for service'
      );
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'Method not allowed for this service',
        code: 'METHOD_NOT_ALLOWED',
      });
    }
    
    next();
  };
}

/**
 * Service mesh headers middleware
 */
export function serviceMeshHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add service mesh headers for observability
    const trustContext = (req as any).trustContext as TrustContext | undefined;
    
    if (trustContext) {
      req.headers['x-service-id'] = trustContext.identity.serviceId;
      req.headers['x-service-name'] = trustContext.identity.serviceName;
      req.headers['x-trust-score'] = trustContext.trustScore.toString();
      req.headers['x-auth-level'] = trustContext.authorizationLevel;
    }
    
    // Add forwarding headers
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      req.headers['x-forwarded-for'] = `${req.ip}, ${forwardedFor}`;
    } else {
      req.headers['x-forwarded-for'] = req.ip || '';
    }
    
    next();
  };
}

/**
 * Generate service token for internal communication
 */
export function generateServiceToken(
  serviceId: string,
  serviceName: string,
  expiresIn: number = 3600
): string {
  const jwt = require('jsonwebtoken');
  
  const payload = {
    sub: serviceId,
    name: serviceName,
    type: 'service',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };
  
  const secret = process.env.SERVICE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('SERVICE_TOKEN_SECRET not configured');
  }
  
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

/**
 * Verify service token
 */
export function verifyServiceToken(token: string): {
  serviceId: string;
  serviceName: string;
  valid: boolean;
} {
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.SERVICE_TOKEN_SECRET;
    
    if (!secret) {
      throw new Error('SERVICE_TOKEN_SECRET not configured');
    }
    
    const decoded = jwt.verify(token, secret) as any;
    
    return {
      serviceId: decoded.sub,
      serviceName: decoded.name,
      valid: true,
    };
  } catch (error) {
    return {
      serviceId: '',
      serviceName: '',
      valid: false,
    };
  }
}

/**
 * Initialize zero-trust for service
 */
export function initializeZeroTrust(
  serviceId: string,
  serviceName: string,
  options: {
    namespace?: string;
    version?: string;
    allowedEndpoints?: string[];
    allowedMethods?: string[];
    certificateFingerprint?: string;
  } = {}
): void {
  registerService({
    serviceId,
    serviceName,
    namespace: options.namespace || 'default',
    version: options.version || '1.0.0',
    allowedEndpoints: options.allowedEndpoints || ['/*'],
    allowedMethods: options.allowedMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    certificateFingerprint: options.certificateFingerprint,
  });
}

export default {
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
};
