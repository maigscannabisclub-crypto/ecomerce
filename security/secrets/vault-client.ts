/**
 * HashiCorp Vault Client
 * Enterprise secrets management with automatic rotation
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

// Vault configuration
interface VaultConfig {
  address: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  mountPath: string;
  timeout: number;
}

// Secret metadata
interface SecretMetadata {
  version: number;
  createdAt: string;
  deletionTime?: string;
  destroyed: boolean;
  customMetadata?: Record<string, string>;
}

// Secret response
interface SecretResponse<T = any> {
  data: T;
  metadata: SecretMetadata;
}

// Default configuration
const defaultConfig: VaultConfig = {
  address: process.env.VAULT_ADDR || 'http://localhost:8200',
  token: process.env.VAULT_TOKEN,
  roleId: process.env.VAULT_ROLE_ID,
  secretId: process.env.VAULT_SECRET_ID,
  namespace: process.env.VAULT_NAMESPACE,
  mountPath: process.env.VAULT_MOUNT_PATH || 'secret',
  timeout: 30000,
};

/**
 * Vault Client class
 */
export class VaultClient {
  private client: AxiosInstance;
  private config: VaultConfig;
  private tokenExpiry: number = 0;

  constructor(config: Partial<VaultConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    this.client = axios.create({
      baseURL: this.config.address,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Add request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      config.headers['X-Vault-Token'] = token;
      
      if (this.config.namespace) {
        config.headers['X-Vault-Namespace'] = this.config.namespace;
      }
      
      return config;
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error(
          {
            error: error.message,
            status: error.response?.status,
            path: error.config?.url,
          },
          'Vault request failed'
        );
        throw error;
      }
    );
  }

  /**
   * Get authentication token
   */
  private async getToken(): Promise<string> {
    // Check if token is still valid
    if (this.config.token && Date.now() < this.tokenExpiry) {
      return this.config.token;
    }
    
    // Use AppRole authentication if configured
    if (this.config.roleId && this.config.secretId) {
      return this.authenticateWithAppRole();
    }
    
    // Use token directly
    if (!this.config.token) {
      throw new Error('No Vault authentication method configured');
    }
    
    return this.config.token;
  }

  /**
   * Authenticate using AppRole
   */
  private async authenticateWithAppRole(): Promise<string> {
    try {
      const response = await axios.post(
        `${this.config.address}/v1/auth/approle/login`,
        {
          role_id: this.config.roleId,
          secret_id: this.config.secretId,
        },
        { timeout: this.config.timeout }
      );
      
      const { client_token, lease_duration } = response.data.auth;
      this.config.token = client_token;
      this.tokenExpiry = Date.now() + lease_duration * 1000 - 60000; // Renew 1 min before expiry
      
      logger.info('Vault AppRole authentication successful');
      
      return client_token;
    } catch (error) {
      logger.error({ error }, 'Vault AppRole authentication failed');
      throw error;
    }
  }

  /**
   * Read secret from Vault
   */
  async readSecret<T = any>(path: string): Promise<SecretResponse<T>> {
    const fullPath = `/v1/${this.config.mountPath}/data/${path}`;
    
    try {
      const response = await this.client.get(fullPath);
      
      return {
        data: response.data.data.data as T,
        metadata: {
          version: response.data.data.metadata.version,
          createdAt: response.data.data.metadata.created_time,
          deletionTime: response.data.data.metadata.deletion_time,
          destroyed: response.data.data.metadata.destroyed,
          customMetadata: response.data.data.metadata.custom_metadata,
        },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Secret not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Write secret to Vault
   */
  async writeSecret<T = any>(
    path: string,
    data: T,
    options: {
      cas?: number;
      customMetadata?: Record<string, string>;
    } = {}
  ): Promise<SecretMetadata> {
    const fullPath = `/v1/${this.config.mountPath}/data/${path}`;
    
    const payload: any = { data };
    
    if (options.cas !== undefined) {
      payload.options = { cas: options.cas };
    }
    
    if (options.customMetadata) {
      payload.custom_metadata = options.customMetadata;
    }
    
    const response = await this.client.post(fullPath, payload);
    
    logger.info({ path, version: response.data.data.version }, 'Secret written to Vault');
    
    return {
      version: response.data.data.version,
      createdAt: response.data.data.created_time,
      destroyed: false,
    };
  }

  /**
   * Delete secret from Vault
   */
  async deleteSecret(path: string, versions?: number[]): Promise<void> {
    const fullPath = `/v1/${this.config.mountPath}/data/${path}`;
    
    if (versions && versions.length > 0) {
      // Delete specific versions
      const deletePath = `/v1/${this.config.mountPath}/delete/${path}`;
      await this.client.post(deletePath, { versions });
    } else {
      // Delete latest version
      await this.client.delete(fullPath);
    }
    
    logger.info({ path, versions }, 'Secret deleted from Vault');
  }

  /**
   * Destroy secret permanently
   */
  async destroySecret(path: string, versions: number[]): Promise<void> {
    const destroyPath = `/v1/${this.config.mountPath}/destroy/${path}`;
    
    await this.client.post(destroyPath, { versions });
    
    logger.info({ path, versions }, 'Secret destroyed in Vault');
  }

  /**
   * List secrets at path
   */
  async listSecrets(path: string): Promise<string[]> {
    const listPath = `/v1/${this.config.mountPath}/metadata/${path}`;
    
    try {
      const response = await this.client.list(listPath);
      return response.data.data.keys || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get secret metadata
   */
  async getSecretMetadata(path: string): Promise<any> {
    const metadataPath = `/v1/${this.config.mountPath}/metadata/${path}`;
    
    const response = await this.client.get(metadataPath);
    return response.data.data;
  }

  /**
   * Get secret versions
   */
  async getSecretVersions(path: string): Promise<number[]> {
    const metadata = await this.getSecretMetadata(path);
    return metadata.versions ? Object.keys(metadata.versions).map(Number) : [];
  }

  /**
   * Rotate secret (create new version)
   */
  async rotateSecret<T = any>(
    path: string,
    generateData: () => Promise<T> | T
  ): Promise<SecretMetadata> {
    // Generate new secret data
    const newData = await generateData();
    
    // Write new version
    return this.writeSecret(path, newData);
  }

  /**
   * Enable automatic secret rotation
   */
  async enableAutoRotation(
    path: string,
    rotationIntervalMs: number,
    generateData: () => Promise<any> | any
  ): Promise<void> {
    // Store rotation configuration
    const configPath = `rotation-config/${path}`;
    await this.writeSecret(configPath, {
      path,
      rotationIntervalMs,
      lastRotation: Date.now(),
    });
    
    logger.info({ path, rotationIntervalMs }, 'Auto-rotation enabled for secret');
  }

  /**
   * Check and perform auto-rotation
   */
  async checkAndRotate(): Promise<string[]> {
    const rotated: string[] = [];
    
    try {
      const configs = await this.listSecrets('rotation-config');
      
      for (const configPath of configs) {
        try {
          const config = await this.readSecret(`rotation-config/${configPath}`);
          const { path, rotationIntervalMs, lastRotation, generateData } = config.data;
          
          if (Date.now() - lastRotation >= rotationIntervalMs) {
            // Perform rotation
            await this.rotateSecret(path, generateData);
            
            // Update last rotation time
            await this.writeSecret(`rotation-config/${configPath}`, {
              path,
              rotationIntervalMs,
              lastRotation: Date.now(),
            });
            
            rotated.push(path);
          }
        } catch (error) {
          logger.error({ error, configPath }, 'Failed to process rotation config');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check auto-rotation');
    }
    
    return rotated;
  }

  /**
   * Get database credentials from Vault
   */
  async getDatabaseCredentials(
    role: string,
    dbPath: string = 'database'
  ): Promise<{
    username: string;
    password: string;
    leaseId: string;
    leaseDuration: number;
  }> {
    const credsPath = `/v1/${dbPath}/creds/${role}`;
    
    const response = await this.client.get(credsPath);
    
    return {
      username: response.data.data.username,
      password: response.data.data.password,
      leaseId: response.data.lease_id,
      leaseDuration: response.data.lease_duration,
    };
  }

  /**
   * Renew lease
   */
  async renewLease(leaseId: string, increment?: number): Promise<any> {
    const response = await this.client.put('/v1/sys/leases/renew', {
      lease_id: leaseId,
      increment,
    });
    
    return response.data;
  }

  /**
   * Revoke lease
   */
  async revokeLease(leaseId: string): Promise<void> {
    await this.client.put('/v1/sys/leases/revoke', {
      lease_id: leaseId,
    });
    
    logger.info({ leaseId }, 'Lease revoked');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    initialized: boolean;
    sealed: boolean;
    standby: boolean;
  }> {
    const response = await axios.get(`${this.config.address}/v1/sys/health`, {
      timeout: this.config.timeout,
    });
    
    return {
      initialized: response.data.initialized,
      sealed: response.data.sealed,
      standby: response.data.standby,
    };
  }

  /**
   * Seal status
   */
  async sealStatus(): Promise<{
    sealed: boolean;
    threshold: number;
    shares: number;
    progress: number;
  }> {
    const response = await axios.get(`${this.config.address}/v1/sys/seal-status`, {
      timeout: this.config.timeout,
    });
    
    return response.data;
  }
}

// Singleton instance
let vaultClient: VaultClient | null = null;

/**
 * Get Vault client instance
 */
export function getVaultClient(config?: Partial<VaultConfig>): VaultClient {
  if (!vaultClient) {
    vaultClient = new VaultClient(config);
  }
  return vaultClient;
}

/**
 * Initialize Vault client
 */
export function initVaultClient(config?: Partial<VaultConfig>): VaultClient {
  vaultClient = new VaultClient(config);
  return vaultClient;
}

/**
 * Load secrets from Vault to environment
 */
export async function loadSecretsToEnv(
  paths: string[],
  prefix: string = ''
): Promise<void> {
  const vault = getVaultClient();
  
  for (const path of paths) {
    try {
      const secret = await vault.readSecret(path);
      
      for (const [key, value] of Object.entries(secret.data)) {
        const envKey = prefix ? `${prefix}_${key.toUpperCase()}` : key.toUpperCase();
        process.env[envKey] = String(value);
      }
      
      logger.info({ path }, 'Secrets loaded from Vault');
    } catch (error) {
      logger.error({ error, path }, 'Failed to load secrets from Vault');
    }
  }
}

export default {
  VaultClient,
  getVaultClient,
  initVaultClient,
  loadSecretsToEnv,
};
