import { EventEmitter } from 'events';
import logger from './logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
  name: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  rejectedCalls: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls: number = 0;
  private rejectedCalls: number = 0;
  private nextAttempt: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    super();
    this.options = {
      failureThreshold: 5,
      timeout: 30000,
      resetTimeout: 60000,
      name: 'default',
      ...options,
    };
  }

  getName(): string {
    return this.options.name;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.rejectedCalls++;
        logger.warn(`Circuit breaker '${this.options.name}' is OPEN - rejecting call`);
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.options.name}`,
          this.state
        );
      }
      
      // Transition to HALF_OPEN
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Reset to CLOSED after successful call in HALF_OPEN state
      this.reset();
      logger.info(`Circuit breaker '${this.options.name}' reset to CLOSED`);
    }

    this.emit('success', {
      name: this.options.name,
      state: this.state,
    });
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Go back to OPEN if failure in HALF_OPEN state
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (this.failures >= this.options.failureThreshold) {
      // Open circuit if threshold reached
      this.transitionTo(CircuitBreakerState.OPEN);
    }

    this.emit('failure', {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
    });
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitBreakerState.OPEN) {
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      logger.error(
        `Circuit breaker '${this.options.name}' transitioned to OPEN ` +
        `(will retry at ${new Date(this.nextAttempt).toISOString()})`
      );
    } else if (newState === CircuitBreakerState.HALF_OPEN) {
      logger.warn(`Circuit breaker '${this.options.name}' transitioned to HALF_OPEN`);
    } else if (newState === CircuitBreakerState.CLOSED) {
      logger.info(`Circuit breaker '${this.options.name}' transitioned to CLOSED`);
    }

    this.emit('stateChange', {
      name: this.options.name,
      from: oldState,
      to: newState,
    });
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = 0;
    this.rejectedCalls = 0;
  }

  forceOpen(): void {
    this.transitionTo(CircuitBreakerState.OPEN);
  }

  forceClose(): void {
    this.reset();
  }

  isClosed(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitBreakerState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    Object.setPrototypeOf(this, CircuitBreakerError.prototype);
  }
}

// Circuit breaker registry for managing multiple breakers
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(
    name: string,
    options?: Partial<CircuitBreakerOptions>
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({ name, ...options });
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  remove(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.removeAllListeners();
      return this.breakers.delete(name);
    }
    return false;
  }

  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }

  resetAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.reset();
    });
  }

  forceOpenAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.forceOpen();
    });
  }

  forceCloseAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.forceClose();
    });
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export default CircuitBreaker;
