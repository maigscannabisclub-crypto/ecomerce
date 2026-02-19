/**
 * AWS Secrets Manager Client
 * Enterprise secrets management with AWS integration
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  RotateSecretCommand,
  DescribeSecretCommand,
  TagResourceCommand,
  ResourceNotFoundException,
  InvalidRequestException,
} from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger';

// AWS configuration
interface AWSSecretsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For local testing
}

// Secret metadata
interface SecretMetadata {
  name: string;
  arn: string;
  versionId?: string;
  versionStages: string[];
  createdDate?: Date;
  lastRotatedDate?: Date;
  tags: Record<string, string>;
}

// Default configuration
const defaultConfig: AWSSecretsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.AWS_SECRETS_ENDPOINT, // For localstack
};

/**
 * AWS Secrets Manager Client class
 */
export class AWSSecretsManager {
  private client: SecretsManagerClient;
  private config: AWSSecretsConfig;

  constructor(config: Partial<AWSSecretsConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    const clientConfig: any = {
      region: this.config.region,
    };
    
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
    }
    
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      };
    }
    
    this.client = new SecretsManagerClient(clientConfig);
  }

  /**
   * Get secret value
   */
  async getSecret<T = any>(secretName: string, versionStage: string = 'AWSCURRENT'): Promise<T> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: versionStage,
      });
      
      const response = await this.client.send(command);
      
      if (response.SecretString) {
        return JSON.parse(response.SecretString) as T;
      }
      
      if (response.SecretBinary) {
        // Handle binary secrets
        const buff = Buffer.from(response.SecretBinary as Uint8Array);
        return JSON.parse(buff.toString('utf-8')) as T;
      }
      
      throw new Error('Secret value is empty');
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw new Error(`Secret not found: ${secretName}`);
      }
      logger.error({ error, secretName }, 'Failed to get secret');
      throw error;
    }
  }

  /**
   * Get secret as string (for non-JSON secrets)
   */
  async getSecretString(secretName: string, versionStage: string = 'AWSCURRENT'): Promise<string> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: versionStage,
      });
      
      const response = await this.client.send(command);
      
      return response.SecretString || '';
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw new Error(`Secret not found: ${secretName}`);
      }
      throw error;
    }
  }

  /**
   * Create new secret
   */
  async createSecret<T = any>(
    secretName: string,
    value: T,
    options: {
      description?: string;
      kmsKeyId?: string;
      tags?: Record<string, string>;
    } = {}
  ): Promise<string> {
    try {
      const secretString = typeof value === 'string' ? value : JSON.stringify(value);
      
      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretString,
        Description: options.description,
        KmsKeyId: options.kmsKeyId,
        Tags: options.tags
          ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
          : undefined,
      });
      
      const response = await this.client.send(command);
      
      logger.info({ secretName, arn: response.ARN }, 'Secret created');
      
      return response.ARN || '';
    } catch (error) {
      if (error instanceof InvalidRequestException) {
        throw new Error(`Secret already exists: ${secretName}`);
      }
      logger.error({ error, secretName }, 'Failed to create secret');
      throw error;
    }
  }

  /**
   * Update secret value
   */
  async updateSecret<T = any>(
    secretName: string,
    value: T,
    options: {
      versionStages?: string[];
    } = {}
  ): Promise<string> {
    const secretString = typeof value === 'string' ? value : JSON.stringify(value);
    
    const command = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: secretString,
      VersionStages: options.versionStages,
    });
    
    const response = await this.client.send(command);
    
    logger.info({ secretName, versionId: response.VersionId }, 'Secret updated');
    
    return response.VersionId || '';
  }

  /**
   * Delete secret
   */
  async deleteSecret(
    secretName: string,
    options: {
      forceDelete?: boolean;
      recoveryWindowDays?: number;
    } = {}
  ): Promise<void> {
    const command = new DeleteSecretCommand({
      SecretId: secretName,
      ForceDeleteWithoutRecovery: options.forceDelete,
      RecoveryWindowInDays: options.recoveryWindowDays,
    });
    
    await this.client.send(command);
    
    logger.info(
      { secretName, forceDelete: options.forceDelete },
      'Secret scheduled for deletion'
    );
  }

  /**
   * List secrets
   */
  async listSecrets(options: {
    maxResults?: number;
    filters?: { Key: string; Values: string[] }[];
  } = {}): Promise<SecretMetadata[]> {
    const secrets: SecretMetadata[] = [];
    let nextToken: string | undefined;
    
    do {
      const command = new ListSecretsCommand({
        MaxResults: options.maxResults || 100,
        NextToken: nextToken,
        Filters: options.filters,
      });
      
      const response = await this.client.send(command);
      
      for (const secret of response.SecretList || []) {
        secrets.push({
          name: secret.Name || '',
          arn: secret.ARN || '',
          versionStages: secret.VersionIdsToStages
            ? Object.values(secret.VersionIdsToStages).flat()
            : [],
          createdDate: secret.CreatedDate,
          lastRotatedDate: secret.LastRotatedDate,
          tags: secret.Tags
            ? Object.fromEntries(secret.Tags.map((t) => [t.Key || '', t.Value || '']))
            : {},
        });
      }
      
      nextToken = response.NextToken;
    } while (nextToken);
    
    return secrets;
  }

  /**
   * Describe secret
   */
  async describeSecret(secretName: string): Promise<SecretMetadata> {
    const command = new DescribeSecretCommand({
      SecretId: secretName,
    });
    
    const response = await this.client.send(command);
    
    return {
      name: response.Name || '',
      arn: response.ARN || '',
      versionStages: response.VersionIdsToStages
        ? Object.values(response.VersionIdsToStages).flat()
        : [],
      createdDate: response.CreatedDate,
      lastRotatedDate: response.LastRotatedDate,
      tags: response.Tags
        ? Object.fromEntries(response.Tags.map((t) => [t.Key || '', t.Value || '']))
        : {},
    };
  }

  /**
   * Rotate secret
   */
  async rotateSecret(
    secretName: string,
    options: {
      lambdaARN?: string;
      automaticallyAfterDays?: number;
    } = {}
  ): Promise<void> {
    const command = new RotateSecretCommand({
      SecretId: secretName,
      RotationLambdaARN: options.lambdaARN,
      AutomaticallyRotateAfterDays: options.automaticallyAfterDays,
    });
    
    await this.client.send(command);
    
    logger.info({ secretName }, 'Secret rotation initiated');
  }

  /**
   * Tag secret
   */
  async tagSecret(secretName: string, tags: Record<string, string>): Promise<void> {
    const command = new TagResourceCommand({
      SecretId: secretName,
      Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    });
    
    await this.client.send(command);
    
    logger.info({ secretName, tags }, 'Secret tagged');
  }

  /**
   * Get database credentials
   */
  async getDatabaseCredentials(secretName: string): Promise<{
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }> {
    return this.getSecret(secretName);
  }

  /**
   * Get API key
   */
  async getAPIKey(secretName: string): Promise<{
    key: string;
    secret?: string;
  }> {
    return this.getSecret(secretName);
  }

  /**
   * Get JWT signing keys
   */
  async getJWTKeys(secretName: string): Promise<{
    privateKey: string;
    publicKey: string;
    algorithm: string;
  }> {
    return this.getSecret(secretName);
  }

  /**
   * Store JWT keys
   */
  async storeJWTKeys(
    secretName: string,
    keys: {
      privateKey: string;
      publicKey: string;
      algorithm: string;
    },
    options: {
      description?: string;
      kmsKeyId?: string;
    } = {}
  ): Promise<string> {
    return this.createSecret(
      secretName,
      keys,
      {
        description: options.description || 'JWT signing keys',
        kmsKeyId: options.kmsKeyId,
        tags: {
          Purpose: 'jwt-signing',
          Environment: process.env.NODE_ENV || 'development',
        },
      }
    );
  }

  /**
   * Bulk load secrets to environment
   */
  async loadSecretsToEnv(
    secretNames: string[],
    options: {
      prefix?: string;
      uppercase?: boolean;
    } = {}
  ): Promise<void> {
    const { prefix = '', uppercase = true } = options;
    
    for (const secretName of secretNames) {
      try {
        const secret = await this.getSecret(secretName);
        
        if (typeof secret === 'object' && secret !== null) {
          for (const [key, value] of Object.entries(secret)) {
            let envKey = prefix ? `${prefix}_${key}` : key;
            if (uppercase) {
              envKey = envKey.toUpperCase();
            }
            process.env[envKey] = String(value);
          }
        } else {
          // Single value secret
          let envKey = prefix ? `${prefix}_${secretName}` : secretName;
          if (uppercase) {
            envKey = envKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
          }
          process.env[envKey] = String(secret);
        }
        
        logger.info({ secretName }, 'Secret loaded to environment');
      } catch (error) {
        logger.error({ error, secretName }, 'Failed to load secret to environment');
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    region: string;
    error?: string;
  }> {
    try {
      await this.listSecrets({ maxResults: 1 });
      return { healthy: true, region: this.config.region };
    } catch (error: any) {
      return {
        healthy: false,
        region: this.config.region,
        error: error.message,
      };
    }
  }
}

// Singleton instance
let awsSecretsManager: AWSSecretsManager | null = null;

/**
 * Get AWS Secrets Manager instance
 */
export function getAWSSecretsManager(config?: Partial<AWSSecretsConfig>): AWSSecretsManager {
  if (!awsSecretsManager) {
    awsSecretsManager = new AWSSecretsManager(config);
  }
  return awsSecretsManager;
}

/**
 * Initialize AWS Secrets Manager
 */
export function initAWSSecretsManager(config?: Partial<AWSSecretsConfig>): AWSSecretsManager {
  awsSecretsManager = new AWSSecretsManager(config);
  return awsSecretsManager;
}

/**
 * Load secrets from AWS to environment at startup
 */
export async function loadAWSSecretsAtStartup(
  secretNames: string[],
  options?: {
    prefix?: string;
    uppercase?: boolean;
  }
): Promise<void> {
  const manager = getAWSSecretsManager();
  await manager.loadSecretsToEnv(secretNames, options);
}

export default {
  AWSSecretsManager,
  getAWSSecretsManager,
  initAWSSecretsManager,
  loadAWSSecretsAtStartup,
};
