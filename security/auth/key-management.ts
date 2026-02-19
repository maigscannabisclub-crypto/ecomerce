/**
 * JWT Key Management Service
 * Handles RSA key generation, rotation, and secure storage
 */

import { generateKeyPairSync, createHash, randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client for key storage
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 4, // Use separate DB for key management
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Key pair interface
interface KeyPair {
  id: string;
  publicKey: string;
  privateKey: string;
  algorithm: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
}

// Key metadata interface
interface KeyMetadata {
  id: string;
  algorithm: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  rotatedFrom?: string;
}

// Key rotation configuration
interface RotationConfig {
  rotationIntervalDays: number;
  keyExpiryDays: number;
  keySize: number;
  algorithm: 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
}

const defaultRotationConfig: RotationConfig = {
  rotationIntervalDays: 90, // Rotate every 90 days
  keyExpiryDays: 180, // Keys valid for 180 days
  keySize: 2048,
  algorithm: 'RS256',
};

/**
 * Generate RSA key pair
 */
export function generateRSAKeyPair(keySize: number = 2048): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
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

  return { publicKey, privateKey };
}

/**
 * Generate EC key pair (for ES256/ES384/ES512)
 */
export function generateECKeyPair(curve: string = 'prime256v1'): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
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

  return { publicKey, privateKey };
}

/**
 * Generate key ID
 */
function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `key-${timestamp}-${random}`;
}

/**
 * Create new key pair with metadata
 */
export async function createKeyPair(
  config: Partial<RotationConfig> = {}
): Promise<KeyPair> {
  const rotationConfig = { ...defaultRotationConfig, ...config };
  
  let publicKey: string;
  let privateKey: string;
  
  // Generate keys based on algorithm
  if (rotationConfig.algorithm.startsWith('RS')) {
    const keys = generateRSAKeyPair(rotationConfig.keySize);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  } else if (rotationConfig.algorithm.startsWith('ES')) {
    const curveMap: Record<string, string> = {
      ES256: 'prime256v1',
      ES384: 'secp384r1',
      ES512: 'secp521r1',
    };
    const keys = generateECKeyPair(curveMap[rotationConfig.algorithm]);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  } else {
    throw new Error(`Unsupported algorithm: ${rotationConfig.algorithm}`);
  }
  
  const now = Date.now();
  const keyPair: KeyPair = {
    id: generateKeyId(),
    publicKey,
    privateKey,
    algorithm: rotationConfig.algorithm,
    createdAt: now,
    expiresAt: now + rotationConfig.keyExpiryDays * 24 * 60 * 60 * 1000,
    active: true,
  };
  
  // Store in Redis
  await storeKeyPair(keyPair);
  
  logger.info(
    {
      keyId: keyPair.id,
      algorithm: keyPair.algorithm,
      expiresAt: new Date(keyPair.expiresAt).toISOString(),
    },
    'New key pair created'
  );
  
  return keyPair;
}

/**
 * Store key pair in Redis (encrypted)
 */
async function storeKeyPair(keyPair: KeyPair): Promise<void> {
  const metadata: KeyMetadata = {
    id: keyPair.id,
    algorithm: keyPair.algorithm,
    createdAt: keyPair.createdAt,
    expiresAt: keyPair.expiresAt,
    active: keyPair.active,
  };
  
  // Store metadata
  await redis.setex(
    `key:metadata:${keyPair.id}`,
    365 * 24 * 60 * 60, // 1 year TTL
    JSON.stringify(metadata)
  );
  
  // Store public key
  await redis.setex(
    `key:public:${keyPair.id}`,
    365 * 24 * 60 * 60,
    keyPair.publicKey
  );
  
  // Store private key (in production, use proper encryption)
  // For now, we assume Redis is secured and keys are encrypted at rest
  const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKey);
  await redis.setex(
    `key:private:${keyPair.id}`,
    365 * 24 * 60 * 60,
    encryptedPrivateKey
  );
  
  // Set as active key if it's the only one
  const activeKeyId = await redis.get('key:active');
  if (!activeKeyId) {
    await redis.set('key:active', keyPair.id);
  }
}

/**
 * Encrypt private key (placeholder - implement with proper encryption)
 */
async function encryptPrivateKey(privateKey: string): Promise<string> {
  // In production, use AWS KMS, HashiCorp Vault, or similar
  // For now, we'll use a simple encryption with environment key
  const encryptionKey = process.env.KEY_ENCRYPTION_KEY;
  if (!encryptionKey) {
    // If no encryption key, store as-is (not recommended for production)
    logger.warn('No KEY_ENCRYPTION_KEY set, storing private key unencrypted');
    return privateKey;
  }
  
  // Simple XOR encryption (replace with proper AES encryption in production)
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  const dataBuffer = Buffer.from(privateKey);
  const encrypted = Buffer.alloc(dataBuffer.length);
  
  for (let i = 0; i < dataBuffer.length; i++) {
    encrypted[i] = dataBuffer[i] ^ keyBuffer[i % keyBuffer.length];
  }
  
  return encrypted.toString('base64');
}

/**
 * Decrypt private key
 */
async function decryptPrivateKey(encryptedKey: string): Promise<string> {
  const encryptionKey = process.env.KEY_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return encryptedKey;
  }
  
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  const dataBuffer = Buffer.from(encryptedKey, 'base64');
  const decrypted = Buffer.alloc(dataBuffer.length);
  
  for (let i = 0; i < dataBuffer.length; i++) {
    decrypted[i] = dataBuffer[i] ^ keyBuffer[i % keyBuffer.length];
  }
  
  return decrypted.toString();
}

/**
 * Get active key pair
 */
export async function getActiveKeyPair(): Promise<KeyPair | null> {
  const activeKeyId = await redis.get('key:active');
  
  if (!activeKeyId) {
    return null;
  }
  
  return getKeyPair(activeKeyId);
}

/**
 * Get key pair by ID
 */
export async function getKeyPair(keyId: string): Promise<KeyPair | null> {
  const metadataData = await redis.get(`key:metadata:${keyId}`);
  const publicKeyData = await redis.get(`key:public:${keyId}`);
  const privateKeyData = await redis.get(`key:private:${keyId}`);
  
  if (!metadataData || !publicKeyData || !privateKeyData) {
    return null;
  }
  
  const metadata = JSON.parse(metadataData) as KeyMetadata;
  const privateKey = await decryptPrivateKey(privateKeyData);
  
  return {
    id: metadata.id,
    publicKey: publicKeyData,
    privateKey,
    algorithm: metadata.algorithm,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    active: metadata.active,
  };
}

/**
 * Get public key by ID (for token verification)
 */
export async function getPublicKey(keyId: string): Promise<string | null> {
  return redis.get(`key:public:${keyId}`);
}

/**
 * Rotate keys
 */
export async function rotateKeys(
  config: Partial<RotationConfig> = {}
): Promise<{ oldKeyId: string; newKeyId: string }> {
  const rotationConfig = { ...defaultRotationConfig, ...config };
  
  // Get current active key
  const currentKeyId = await redis.get('key:active');
  
  // Create new key pair
  const newKeyPair = await createKeyPair(rotationConfig);
  
  // Set as active
  await redis.set('key:active', newKeyPair.id);
  
  // Mark old key as inactive but keep for verification
  if (currentKeyId) {
    const oldKeyData = await redis.get(`key:metadata:${currentKeyId}`);
    if (oldKeyData) {
      const oldMetadata = JSON.parse(oldKeyData) as KeyMetadata;
      oldMetadata.active = false;
      oldMetadata.rotatedFrom = currentKeyId;
      
      await redis.setex(
        `key:metadata:${currentKeyId}`,
        30 * 24 * 60 * 60, // Keep for 30 days for token verification
        JSON.stringify(oldMetadata)
      );
    }
    
    // Schedule old key deletion
    await redis.expire(`key:private:${currentKeyId}`, 30 * 24 * 60 * 60);
  }
  
  logger.info(
    {
      oldKeyId: currentKeyId,
      newKeyId: newKeyPair.id,
    },
    'Keys rotated successfully'
  );
  
  return {
    oldKeyId: currentKeyId || 'none',
    newKeyId: newKeyPair.id,
  };
}

/**
 * Check if key rotation is needed
 */
export async function isRotationNeeded(
  config: Partial<RotationConfig> = {}
): Promise<boolean> {
  const rotationConfig = { ...defaultRotationConfig, ...config };
  
  const activeKeyId = await redis.get('key:active');
  
  if (!activeKeyId) {
    return true;
  }
  
  const metadataData = await redis.get(`key:metadata:${activeKeyId}`);
  
  if (!metadataData) {
    return true;
  }
  
  const metadata = JSON.parse(metadataData) as KeyMetadata;
  const ageMs = Date.now() - metadata.createdAt;
  const rotationIntervalMs = rotationConfig.rotationIntervalDays * 24 * 60 * 60 * 1000;
  
  return ageMs >= rotationIntervalMs;
}

/**
 * Get all key metadata
 */
export async function getAllKeyMetadata(): Promise<KeyMetadata[]> {
  const keys: KeyMetadata[] = [];
  
  const stream = redis.scanStream({
    match: 'key:metadata:*',
    count: 100,
  });
  
  for await (const keyIds of stream) {
    for (const keyId of keyIds) {
      const data = await redis.get(keyId);
      if (data) {
        keys.push(JSON.parse(data) as KeyMetadata);
      }
    }
  }
  
  return keys.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Revoke key (emergency use)
 */
export async function revokeKey(keyId: string): Promise<void> {
  const metadataData = await redis.get(`key:metadata:${keyId}`);
  
  if (!metadataData) {
    throw new Error('Key not found');
  }
  
  const metadata = JSON.parse(metadataData) as KeyMetadata;
  metadata.active = false;
  
  await redis.setex(
    `key:metadata:${keyId}`,
    7 * 24 * 60 * 60, // Keep for 7 days for audit
    JSON.stringify(metadata)
  );
  
  // Delete private key immediately
  await redis.del(`key:private:${keyId}`);
  
  // If this was the active key, we need a new one
  const activeKeyId = await redis.get('key:active');
  if (activeKeyId === keyId) {
    await redis.del('key:active');
    logger.warn(
      { revokedKeyId: keyId },
      'Active key revoked, system needs new key generation'
    );
  }
  
  logger.info({ keyId }, 'Key revoked');
}

/**
 * Export keys to files (for backup)
 */
export async function exportKeysToFiles(outputDir: string): Promise<void> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const keys = await getAllKeyMetadata();
  
  for (const metadata of keys) {
    const keyPair = await getKeyPair(metadata.id);
    
    if (keyPair) {
      const keyDir = join(outputDir, metadata.id);
      mkdirSync(keyDir, { recursive: true });
      
      writeFileSync(
        join(keyDir, 'public.pem'),
        keyPair.publicKey
      );
      
      // Only export private keys for active keys
      if (metadata.active) {
        writeFileSync(
          join(keyDir, 'private.pem'),
          keyPair.privateKey
        );
      }
      
      writeFileSync(
        join(keyDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
    }
  }
  
  logger.info({ outputDir, keyCount: keys.length }, 'Keys exported to files');
}

/**
 * Import keys from files
 */
export async function importKeysFromFiles(inputDir: string): Promise<void> {
  const { readdirSync } = require('fs');
  
  const keyDirs = readdirSync(inputDir, { withFileTypes: true })
    .filter((dirent: any) => dirent.isDirectory())
    .map((dirent: any) => dirent.name);
  
  for (const keyId of keyDirs) {
    const keyDir = join(inputDir, keyId);
    
    try {
      const publicKey = readFileSync(join(keyDir, 'public.pem'), 'utf-8');
      const privateKey = readFileSync(join(keyDir, 'private.pem'), 'utf-8');
      const metadata = JSON.parse(
        readFileSync(join(keyDir, 'metadata.json'), 'utf-8')
      ) as KeyMetadata;
      
      const keyPair: KeyPair = {
        id: metadata.id,
        publicKey,
        privateKey,
        algorithm: metadata.algorithm,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
        active: metadata.active,
      };
      
      await storeKeyPair(keyPair);
    } catch (error) {
      logger.error({ error, keyId }, 'Failed to import key');
    }
  }
  
  logger.info({ inputDir, keyCount: keyDirs.length }, 'Keys imported from files');
}

/**
 * Get key thumbprint (for JWKS)
 */
export function getKeyThumbprint(publicKey: string): string {
  return createHash('sha256')
    .update(publicKey)
    .digest('base64url')
    .substring(0, 16);
}

/**
 * Generate JWKS (JSON Web Key Set)
 */
export async function generateJWKS(): Promise<{
  keys: Array<{
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n?: string;
    e?: string;
    x?: string;
    y?: string;
    crv?: string;
  }>;
}> {
  const keys = await getAllKeyMetadata();
  const jwks: any = { keys: [] };
  
  for (const metadata of keys) {
    if (!metadata.active) continue;
    
    const publicKey = await getPublicKey(metadata.id);
    if (!publicKey) continue;
    
    // Parse the public key to extract components
    // This is a simplified version - in production use proper JWK conversion
    const keyThumbprint = getKeyThumbprint(publicKey);
    
    const jwk: any = {
      kty: metadata.algorithm.startsWith('RS') ? 'RSA' : 'EC',
      kid: keyThumbprint,
      use: 'sig',
      alg: metadata.algorithm,
    };
    
    jwks.keys.push(jwk);
  }
  
  return jwks;
}

export default {
  createKeyPair,
  getActiveKeyPair,
  getKeyPair,
  getPublicKey,
  rotateKeys,
  isRotationNeeded,
  getAllKeyMetadata,
  revokeKey,
  exportKeysToFiles,
  importKeysFromFiles,
  generateRSAKeyPair,
  generateECKeyPair,
  getKeyThumbprint,
  generateJWKS,
};
