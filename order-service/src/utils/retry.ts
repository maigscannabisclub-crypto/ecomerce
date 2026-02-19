import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [],
  onRetry: () => {},
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  
  // Add jitter (random value between 0 and 1) to prevent thundering herd
  const jitter = Math.random();
  const delayWithJitter = exponentialDelay * (0.5 + jitter * 0.5);
  
  // Cap at max delay
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  if (retryableErrors.length === 0) return true;
  
  return retryableErrors.some(pattern => 
    error.message.includes(pattern) || 
    error.name.includes(pattern)
  );
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...defaultOptions, ...options };
  const log = logger.child({ context: 'RetryUtil' });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      log.debug(`Attempt ${attempt}/${config.maxRetries}`);
      const result = await fn();
      
      if (attempt > 1) {
        log.info(`Operation succeeded after ${attempt} attempts`);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // Check if this is the last attempt
      if (attempt === config.maxRetries) {
        log.error(`All ${config.maxRetries} attempts failed`, { 
          error: lastError.message,
          stack: lastError.stack 
        });
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(lastError, config.retryableErrors)) {
        log.warn('Non-retryable error encountered, failing fast', { 
          error: lastError.message 
        });
        throw lastError;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(
        attempt,
        config.baseDelayMs,
        config.maxDelayMs,
        config.backoffMultiplier
      );

      log.warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`, {
        error: lastError.message,
        nextAttempt: attempt + 1,
        delay: Math.round(delay),
      });

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(lastError, attempt);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry decorator for class methods
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(
    failureThreshold: number = 5,
    resetTimeoutMs: number = 30000
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }
}

export default {
  withRetry,
  calculateDelay,
  sleep,
  CircuitBreaker,
};
