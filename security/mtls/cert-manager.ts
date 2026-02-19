/**
 * mTLS Certificate Manager
 * Handles certificate generation, rotation, and validation for mutual TLS
 */

import { generateKeyPairSync, createSign, createVerify, randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client for certificate storage
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 5, // Use separate DB for certificates
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Certificate types
export type CertificateType = 'server' | 'client' | 'ca';

// Certificate info interface
interface CertificateInfo {
  id: string;
  type: CertificateType;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  algorithm: string;
  keySize: number;
}

// Key pair interface
interface KeyPair {
  privateKey: string;
  publicKey: string;
}

// Certificate with keys
interface CertificateWithKeys extends CertificateInfo {
  privateKey: string;
  certificate: string;
  caChain?: string[];
}

// Certificate configuration
interface CertificateConfig {
  keySize: number;
  days: number;
  algorithm: 'RSA' | 'EC';
  curve?: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  commonName: string;
  subjectAltNames?: string[];
}

const defaultConfig: Partial<CertificateConfig> = {
  keySize: 2048,
  days: 365,
  algorithm: 'RSA',
  curve: 'prime256v1',
  country: 'US',
  state: 'California',
  locality: 'San Francisco',
  organization: 'Ecommerce Platform',
  organizationalUnit: 'Security',
};

/**
 * Generate RSA key pair
 */
export function generateRSAKeyPair(keySize: number = 2048): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

/**
 * Generate EC key pair
 */
export function generateECKeyPair(curve: string = 'prime256v1'): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: curve,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

/**
 * Generate certificate ID
 */
function generateCertId(): string {
  return `cert-${Date.now()}-${randomBytes(8).toString('hex')}`;
}

/**
 * Generate self-signed certificate
 */
export function generateSelfSignedCert(
  config: CertificateConfig
): CertificateWithKeys {
  const certConfig = { ...defaultConfig, ...config };
  
  // Generate key pair
  let keyPair: KeyPair;
  if (certConfig.algorithm === 'RSA') {
    keyPair = generateRSAKeyPair(certConfig.keySize);
  } else {
    keyPair = generateECKeyPair(certConfig.curve);
  }
  
  // In a real implementation, you would use a library like node-forge
  // or call OpenSSL to generate the actual certificate
  // For this example, we'll create a placeholder certificate
  
  const certId = generateCertId();
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() + certConfig.days);
  
  // Create certificate PEM (placeholder)
  const certificate = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qa3BajELMAkGA1UEBhMC
U0cxDzANBgNVBAgTBlNpbmdhcG9yZTEPMA0GA1UEBxMGU2luZ2Fwb3JlMRMwEQYD
VQQKEwpBY21lIEluYy4xEjAQBgNVBAsTCVByb2R1Y3RzMRMwEQYDVQQDEwpBY21l
IEluYy4wHhcNMTcwNjE0MDIxNDEyWhcNMjcwNjEyMDIxNDEyWjBhMQswCQYDVQQG
-----END CERTIFICATE-----`;
  
  const fingerprint = randomBytes(32).toString('hex');
  
  return {
    id: certId,
    type: 'server',
    subject: certConfig.commonName,
    issuer: certConfig.commonName,
    serialNumber: randomBytes(16).toString('hex'),
    notBefore,
    notAfter,
    fingerprint,
    algorithm: certConfig.algorithm,
    keySize: certConfig.keySize,
    privateKey: keyPair.privateKey,
    certificate,
  };
}

/**
 * Store certificate in Redis
 */
export async function storeCertificate(cert: CertificateWithKeys): Promise<void> {
  const key = `cert:${cert.id}`;
  const data = JSON.stringify({
    ...cert,
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
  });
  
  // Store with TTL based on certificate expiry
  const ttl = Math.floor((cert.notAfter.getTime() - Date.now()) / 1000) + 86400; // +1 day buffer
  
  await redis.setex(key, ttl, data);
  
  // Index by type
  await redis.sadd(`certs:${cert.type}`, cert.id);
  
  logger.info(
    { certId: cert.id, type: cert.type, expires: cert.notAfter },
    'Certificate stored'
  );
}

/**
 * Get certificate by ID
 */
export async function getCertificate(certId: string): Promise<CertificateWithKeys | null> {
  const key = `cert:${certId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  const parsed = JSON.parse(data);
  return {
    ...parsed,
    notBefore: new Date(parsed.notBefore),
    notAfter: new Date(parsed.notAfter),
  };
}

/**
 * Get certificate info (without private key)
 */
export async function getCertificateInfo(certId: string): Promise<CertificateInfo | null> {
  const cert = await getCertificate(certId);
  
  if (!cert) {
    return null;
  }
  
  const { privateKey, ...info } = cert;
  return info;
}

/**
 * List certificates by type
 */
export async function listCertificates(type?: CertificateType): Promise<CertificateInfo[]> {
  const certIds: string[] = [];
  
  if (type) {
    certIds.push(...(await redis.smembers(`certs:${type}`)));
  } else {
    const types: CertificateType[] = ['server', 'client', 'ca'];
    for (const t of types) {
      certIds.push(...(await redis.smembers(`certs:${t}`)));
    }
  }
  
  const certs: CertificateInfo[] = [];
  
  for (const certId of certIds) {
    const info = await getCertificateInfo(certId);
    if (info) {
      certs.push(info);
    }
  }
  
  return certs.sort((a, b) => b.notAfter.getTime() - a.notAfter.getTime());
}

/**
 * Check if certificate is valid
 */
export function isCertificateValid(cert: CertificateInfo): boolean {
  const now = new Date();
  return now >= cert.notBefore && now <= cert.notAfter;
}

/**
 * Check if certificate is expiring soon
 */
export function isCertificateExpiring(
  cert: CertificateInfo,
  daysBefore: number = 30
): boolean {
  const now = new Date();
  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + daysBefore);
  
  return cert.notAfter <= expiryThreshold && cert.notAfter > now;
}

/**
 * Delete certificate
 */
export async function deleteCertificate(certId: string): Promise<void> {
  const cert = await getCertificate(certId);
  
  if (cert) {
    await redis.del(`cert:${certId}`);
    await redis.srem(`certs:${cert.type}`, certId);
    
    logger.info({ certId }, 'Certificate deleted');
  }
}

/**
 * Generate Certificate Signing Request (CSR)
 */
export function generateCSR(
  config: CertificateConfig
): { csr: string; privateKey: string } {
  const certConfig = { ...defaultConfig, ...config };
  
  // Generate key pair
  let keyPair: KeyPair;
  if (certConfig.algorithm === 'RSA') {
    keyPair = generateRSAKeyPair(certConfig.keySize);
  } else {
    keyPair = generateECKeyPair(certConfig.curve);
  }
  
  // In production, use node-forge or OpenSSL to generate CSR
  const csr = `-----BEGIN CERTIFICATE REQUEST-----
MIICvDCCAaQCAQAwdzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWEx
FjAUBgNVBAcMDU1vdW50YWluIFZpZXcxGjAYBgNVBAoMEUNlcnRpZmljYXRlIEF1
dGhvcjEYMBYGA1UEAwwPd3d3LmV4YW1wbGUuY29tMIIBIjANBgkqhkiG9w0BAQEF
-----END CERTIFICATE REQUEST-----`;
  
  return { csr, privateKey: keyPair.privateKey };
}

/**
 * Export certificate to files
 */
export function exportCertificateToFiles(
  cert: CertificateWithKeys,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const certDir = join(outputDir, cert.id);
  mkdirSync(certDir, { recursive: true });
  
  writeFileSync(join(certDir, 'certificate.pem'), cert.certificate);
  writeFileSync(join(certDir, 'private.key'), cert.privateKey);
  
  if (cert.caChain) {
    writeFileSync(join(certDir, 'ca-chain.pem'), cert.caChain.join('\n'));
  }
  
  writeFileSync(
    join(certDir, 'info.json'),
    JSON.stringify(
      {
        id: cert.id,
        type: cert.type,
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        notBefore: cert.notBefore.toISOString(),
        notAfter: cert.notAfter.toISOString(),
        fingerprint: cert.fingerprint,
        algorithm: cert.algorithm,
        keySize: cert.keySize,
      },
      null,
      2
    )
  );
  
  logger.info({ certId: cert.id, outputDir: certDir }, 'Certificate exported');
}

/**
 * Import certificate from files
 */
export function importCertificateFromFiles(
  certPath: string,
  privateKeyPath: string
): CertificateWithKeys {
  const certificate = readFileSync(certPath, 'utf-8');
  const privateKey = readFileSync(privateKeyPath, 'utf-8');
  
  // Parse certificate info (in production, use a proper parser)
  const certId = generateCertId();
  
  return {
    id: certId,
    type: 'server',
    subject: 'Imported Certificate',
    issuer: 'Unknown',
    serialNumber: randomBytes(16).toString('hex'),
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    fingerprint: randomBytes(32).toString('hex'),
    algorithm: 'RSA',
    keySize: 2048,
    privateKey,
    certificate,
  };
}

/**
 * Get expiring certificates
 */
export async function getExpiringCertificates(
  daysBefore: number = 30
): Promise<CertificateInfo[]> {
  const allCerts = await listCertificates();
  
  return allCerts.filter((cert) => isCertificateExpiring(cert, daysBefore));
}

/**
 * Certificate rotation check
 */
export async function checkCertificateRotation(
  rotationDays: number = 30
): Promise<{
  expiring: CertificateInfo[];
  actionRequired: boolean;
}> {
  const expiring = await getExpiringCertificates(rotationDays);
  
  return {
    expiring,
    actionRequired: expiring.length > 0,
  };
}

/**
 * Create certificate bundle
 */
export async function createCertificateBundle(
  certIds: string[]
): Promise<{
  certificates: string;
  privateKeys: string;
}> {
  const certificates: string[] = [];
  const privateKeys: string[] = [];
  
  for (const certId of certIds) {
    const cert = await getCertificate(certId);
    if (cert) {
      certificates.push(cert.certificate);
      privateKeys.push(cert.privateKey);
    }
  }
  
  return {
    certificates: certificates.join('\n'),
    privateKeys: privateKeys.join('\n'),
  };
}

/**
 * Validate certificate chain
 */
export function validateCertificateChain(
  certificate: string,
  caCertificates: string[]
): boolean {
  // In production, use proper chain validation
  // This is a placeholder
  return certificate.includes('BEGIN CERTIFICATE') && caCertificates.length > 0;
}

/**
 * Get TLS configuration for Node.js
 */
export async function getTLSConfig(
  certId: string,
  caCertIds?: string[]
): Promise<{
  key: string;
  cert: string;
  ca?: string[];
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}> {
  const cert = await getCertificate(certId);
  
  if (!cert) {
    throw new Error(`Certificate not found: ${certId}`);
  }
  
  const config: any = {
    key: cert.privateKey,
    cert: cert.certificate,
  };
  
  if (caCertIds && caCertIds.length > 0) {
    config.ca = [];
    for (const caId of caCertIds) {
      const caCert = await getCertificate(caId);
      if (caCert) {
        config.ca.push(caCert.certificate);
      }
    }
  }
  
  return config;
}

/**
 * Generate mTLS client certificate
 */
export async function generateClientCertificate(
  clientId: string,
  caCertId: string,
  days: number = 365
): Promise<CertificateWithKeys> {
  const caCert = await getCertificate(caCertId);
  
  if (!caCert) {
    throw new Error(`CA certificate not found: ${caCertId}`);
  }
  
  const config: CertificateConfig = {
    commonName: clientId,
    days,
    algorithm: 'RSA',
    keySize: 2048,
    organization: 'Ecommerce Platform',
    organizationalUnit: 'API Clients',
  };
  
  // Generate client cert (signed by CA in production)
  const clientCert = generateSelfSignedCert(config);
  clientCert.type = 'client';
  clientCert.issuer = caCert.subject;
  
  await storeCertificate(clientCert);
  
  logger.info(
    { clientId, certId: clientCert.id, caCertId },
    'Client certificate generated'
  );
  
  return clientCert;
}

export default {
  generateRSAKeyPair,
  generateECKeyPair,
  generateSelfSignedCert,
  generateCSR,
  storeCertificate,
  getCertificate,
  getCertificateInfo,
  listCertificates,
  deleteCertificate,
  isCertificateValid,
  isCertificateExpiring,
  getExpiringCertificates,
  checkCertificateRotation,
  exportCertificateToFiles,
  importCertificateFromFiles,
  createCertificateBundle,
  validateCertificateChain,
  getTLSConfig,
  generateClientCertificate,
};
