/**
 * Web Application Firewall (WAF) Rules
 * Protection against common web attacks: SQLi, XSS, LFI, RCE, etc.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// WAF Rule types
interface WAFRule {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: RegExp;
  description: string;
  block: boolean;
}

// SQL Injection patterns
const SQL_INJECTION_PATTERNS: WAFRule[] = [
  {
    id: 'SQLI-001',
    name: 'Classic SQL Injection',
    severity: 'critical',
    pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|DATABASE|WHERE)\b)|(--|#|\/\*|\*\/)/i,
    description: 'Classic SQL injection attempt detected',
    block: true,
  },
  {
    id: 'SQLI-002',
    name: 'Time-based Blind SQLi',
    severity: 'critical',
    pattern: /(SLEEP\s*\(\s*\d+\s*\)|BENCHMARK\s*\(\s*\d+\s*,|WAITFOR\s+DELAY|pg_sleep|dbms_lock)/i,
    description: 'Time-based blind SQL injection detected',
    block: true,
  },
  {
    id: 'SQLI-003',
    name: 'Error-based SQLi',
    severity: 'critical',
    pattern: /(AND\s*\d+=\d+|OR\s*\d+=\d+|\'\s*OR\s*\'|\'\s*AND\s*\'|\"\s*OR\s*\"|\"\s*AND\s*\")/i,
    description: 'Error-based SQL injection detected',
    block: true,
  },
  {
    id: 'SQLI-004',
    name: 'Stacked Queries',
    severity: 'critical',
    pattern: /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|EXEC|EXECUTE))/i,
    description: 'Stacked SQL queries detected',
    block: true,
  },
  {
    id: 'SQLI-005',
    name: 'Comment Injection',
    severity: 'high',
    pattern: /(\/\*!?|\*\/|;--|--\s|#|\-\-)/i,
    description: 'SQL comment injection attempt',
    block: true,
  },
];

// XSS patterns
const XSS_PATTERNS: WAFRule[] = [
  {
    id: 'XSS-001',
    name: 'Script Tag Injection',
    severity: 'critical',
    pattern: /(<script[^>]*>[\s\S]*?<\/script>|<script[^>]*\/>)/i,
    description: 'Script tag injection detected',
    block: true,
  },
  {
    id: 'XSS-002',
    name: 'Event Handler Injection',
    severity: 'critical',
    pattern: /\s(on\w+)\s*=\s*["']?[^"'>]*javascript:/i,
    description: 'JavaScript event handler injection detected',
    block: true,
  },
  {
    id: 'XSS-003',
    name: 'JavaScript Protocol',
    severity: 'critical',
    pattern: /javascript:/i,
    description: 'JavaScript protocol detected',
    block: true,
  },
  {
    id: 'XSS-004',
    name: 'HTML Entity Encoding',
    severity: 'medium',
    pattern: /(&#x?\d+;|%\d{2}){3,}/i,
    description: 'Potential encoded XSS payload',
    block: true,
  },
  {
    id: 'XSS-005',
    name: 'Data URI Injection',
    severity: 'high',
    pattern: /data:text\/html|data:application\/javascript/i,
    description: 'Data URI with executable content detected',
    block: true,
  },
  {
    id: 'XSS-006',
    name: 'SVG XSS',
    severity: 'high',
    pattern: /<svg[^>]*onload\s*=/i,
    description: 'SVG onload XSS detected',
    block: true,
  },
];

// Path Traversal / LFI patterns
const PATH_TRAVERSAL_PATTERNS: WAFRule[] = [
  {
    id: 'LFI-001',
    name: 'Path Traversal',
    severity: 'high',
    pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.%2f|\.%5c)/i,
    description: 'Directory traversal attempt detected',
    block: true,
  },
  {
    id: 'LFI-002',
    name: 'Null Byte Injection',
    severity: 'high',
    pattern: /(%00|\x00|%00)/i,
    description: 'Null byte injection detected',
    block: true,
  },
  {
    id: 'LFI-003',
    name: 'Sensitive File Access',
    severity: 'high',
    pattern: /(\/etc\/passwd|\/etc\/shadow|\.env|\.git\/|web\.config|\.htaccess)/i,
    description: 'Attempt to access sensitive files',
    block: true,
  },
];

// Command Injection patterns
const COMMAND_INJECTION_PATTERNS: WAFRule[] = [
  {
    id: 'CMDI-001',
    name: 'Command Injection',
    severity: 'critical',
    pattern: /(;|\||&&|\$\(|`[^`]*`|\$\{[^}]*\}).*\b(cat|ls|pwd|whoami|id|uname|nc|netcat|wget|curl|bash|sh|cmd|powershell)\b/i,
    description: 'Command injection attempt detected',
    block: true,
  },
  {
    id: 'CMDI-002',
    name: 'Reverse Shell',
    severity: 'critical',
    pattern: /(bash\s+-i|sh\s+-i|nc\s+-[el]|python\s+-c\s*["']import\s+socket|socket\.socket)/i,
    description: 'Reverse shell attempt detected',
    block: true,
  },
];

// SSRF patterns
const SSRF_PATTERNS: WAFRule[] = [
  {
    id: 'SSRF-001',
    name: 'Internal IP Access',
    severity: 'high',
    pattern: /(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|localhost|\[::1\]|::1)/i,
    description: 'Attempt to access internal network resources',
    block: true,
  },
  {
    id: 'SSRF-002',
    name: 'Cloud Metadata Access',
    severity: 'critical',
    pattern: /(169\.254\.169\.254|metadata\.google\.internal|169\.254\.170\.2)/i,
    description: 'Cloud metadata service access attempt',
    block: true,
  },
];

// NoSQL Injection patterns
const NOSQL_INJECTION_PATTERNS: WAFRule[] = [
  {
    id: 'NOSQL-001',
    name: 'MongoDB Injection',
    severity: 'critical',
    pattern: /(\$eq|\$ne|\$gt|\$gte|\$lt|\$lte|\$in|\$nin|\$regex|\$where|\$or|\$and)\s*:/i,
    description: 'MongoDB NoSQL injection detected',
    block: true,
  },
];

// XML/XPath Injection patterns
const XML_INJECTION_PATTERNS: WAFRule[] = [
  {
    id: 'XML-001',
    name: 'XXE Injection',
    severity: 'critical',
    pattern: /(<!ENTITY\s+.*\s+SYSTEM\s*["']|<!DOCTYPE\s+.*\s+\[)/i,
    description: 'XML External Entity (XXE) injection detected',
    block: true,
  },
  {
    id: 'XML-002',
    name: 'XPath Injection',
    severity: 'high',
    pattern: /(\]|\[).*?(or|and)\s*.*?=.*?\]/i,
    description: 'XPath injection detected',
    block: true,
  },
];

// Combine all rules
const ALL_RULES: WAFRule[] = [
  ...SQL_INJECTION_PATTERNS,
  ...XSS_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...SSRF_PATTERNS,
  ...NOSQL_INJECTION_PATTERNS,
  ...XML_INJECTION_PATTERNS,
];

// WAF Configuration
interface WAFConfig {
  enabled: boolean;
  mode: 'block' | 'monitor' | 'disabled';
  rules: WAFRule[];
  excludedPaths: string[];
  excludedIPs: string[];
  logViolations: boolean;
}

const defaultConfig: WAFConfig = {
  enabled: process.env.WAF_ENABLED === 'true',
  mode: (process.env.WAF_MODE as 'block' | 'monitor' | 'disabled') || 'block',
  rules: ALL_RULES,
  excludedPaths: ['/health', '/metrics', '/ping'],
  excludedIPs: (process.env.WAF_EXCLUDED_IPS || '').split(',').filter(Boolean),
  logViolations: true,
};

/**
 * Extract all input sources from request
 */
function extractInputSources(req: Request): Record<string, any> {
  return {
    query: req.query,
    body: req.body,
    params: req.params,
    headers: req.headers,
    cookies: req.cookies,
    path: req.path,
    originalUrl: req.originalUrl,
  };
}

/**
 * Recursively scan object for malicious patterns
 */
function scanObject(
  obj: any,
  rules: WAFRule[],
  path: string = ''
): Array<{ rule: WAFRule; value: string; path: string }> {
  const violations: Array<{ rule: WAFRule; value: string; path: string }> = [];
  
  if (obj === null || obj === undefined) {
    return violations;
  }
  
  if (typeof obj === 'string') {
    for (const rule of rules) {
      if (rule.pattern.test(obj)) {
        violations.push({ rule, value: obj.substring(0, 100), path });
      }
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      violations.push(...scanObject(value, rules, newPath));
    }
  }
  
  return violations;
}

/**
 * Main WAF middleware
 */
export function wafMiddleware(config: Partial<WAFConfig> = {}) {
  const wafConfig = { ...defaultConfig, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if WAF is disabled
    if (!wafConfig.enabled || wafConfig.mode === 'disabled') {
      return next();
    }
    
    // Skip excluded paths
    if (wafConfig.excludedPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }
    
    // Skip excluded IPs
    const clientIP = req.ip || req.socket.remoteAddress || '';
    if (wafConfig.excludedIPs.includes(clientIP)) {
      return next();
    }
    
    const inputSources = extractInputSources(req);
    const allViolations: Array<{ rule: WAFRule; value: string; path: string }> = [];
    
    // Scan all input sources
    for (const [sourceName, sourceValue] of Object.entries(inputSources)) {
      const violations = scanObject(sourceValue, wafConfig.rules, sourceName);
      allViolations.push(...violations);
    }
    
    // If violations found
    if (allViolations.length > 0) {
      const criticalViolations = allViolations.filter(
        (v) => v.rule.severity === 'critical' || v.rule.block
      );
      
      // Log violations
      if (wafConfig.logViolations) {
        logger.warn(
          {
            ip: clientIP,
            path: req.path,
            method: req.method,
            violations: allViolations.map((v) => ({
              ruleId: v.rule.id,
              ruleName: v.rule.name,
              severity: v.rule.severity,
              path: v.path,
            })),
          },
          'WAF violation detected'
        );
      }
      
      // Block if in block mode and critical violations exist
      if (wafConfig.mode === 'block' && criticalViolations.length > 0) {
        // Set security headers
        res.setHeader('X-WAF-Blocked', 'true');
        res.setHeader('X-WAF-Rule-ID', criticalViolations[0].rule.id);
        
        return res.status(403).json({
          error: 'Request blocked by security policy',
          message: 'The request contains potentially malicious content',
          code: 'WAF_BLOCKED',
          incidentId: generateIncidentId(),
        });
      }
    }
    
    // Add WAF headers
    res.setHeader('X-WAF-Enabled', 'true');
    res.setHeader('X-WAF-Mode', wafConfig.mode);
    
    next();
  };
}

/**
 * Generate unique incident ID for tracking
 */
function generateIncidentId(): string {
  return `WAF-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create custom WAF rule
 */
export function createWAFRule(
  id: string,
  name: string,
  pattern: RegExp,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  block: boolean = true
): WAFRule {
  return {
    id,
    name,
    severity,
    pattern,
    description: `Custom rule: ${name}`,
    block,
  };
}

/**
 * Add custom rules to WAF
 */
export function addCustomRules(rules: WAFRule[]): void {
  defaultConfig.rules.push(...rules);
}

/**
 * Get WAF statistics
 */
export async function getWAFStats(): Promise<{
  totalRules: number;
  rulesByCategory: Record<string, number>;
}> {
  const rulesByCategory: Record<string, number> = {
    'SQL Injection': SQL_INJECTION_PATTERNS.length,
    'XSS': XSS_PATTERNS.length,
    'Path Traversal': PATH_TRAVERSAL_PATTERNS.length,
    'Command Injection': COMMAND_INJECTION_PATTERNS.length,
    'SSRF': SSRF_PATTERNS.length,
    'NoSQL Injection': NOSQL_INJECTION_PATTERNS.length,
    'XML Injection': XML_INJECTION_PATTERNS.length,
  };
  
  return {
    totalRules: ALL_RULES.length,
    rulesByCategory,
  };
}

export default {
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
};
