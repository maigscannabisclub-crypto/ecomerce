import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import CircuitBreaker, { circuitBreakerRegistry } from '../../utils/circuitBreaker';

export interface HttpClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  circuitBreakerName?: string;
  circuitBreakerOptions?: {
    failureThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class HttpClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private baseURL: string;

  constructor(clientConfig: HttpClientConfig) {
    this.baseURL = clientConfig.baseURL;
    
    // Initialize Axios instance
    this.client = axios.create({
      baseURL: clientConfig.baseURL,
      timeout: clientConfig.timeout || config.inventoryServiceTimeout,
      headers: {
        'Content-Type': 'application/json',
        ...clientConfig.headers,
      },
    });

    // Setup request interceptor
    this.client.interceptors.request.use(
      (requestConfig) => {
        logger.debug(`HTTP Request: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
          baseURL: requestConfig.baseURL,
          url: requestConfig.url,
          method: requestConfig.method,
        });
        return requestConfig;
      },
      (error) => {
        logger.error('HTTP Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Setup response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(`HTTP Error Response: ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response.status}`, {
            status: error.response.status,
            data: error.response.data,
          });
        } else if (error.request) {
          logger.error(`HTTP No Response: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            message: error.message,
          });
        } else {
          logger.error('HTTP Error:', error);
        }
        return Promise.reject(error);
      }
    );

    // Initialize circuit breaker
    const breakerName = clientConfig.circuitBreakerName || 'http-client';
    this.circuitBreaker = circuitBreakerRegistry.getOrCreate(breakerName, {
      failureThreshold: clientConfig.circuitBreakerOptions?.failureThreshold || 
        config.circuitBreaker.failureThreshold,
      timeout: clientConfig.circuitBreakerOptions?.timeout || 
        config.circuitBreaker.timeout,
      resetTimeout: clientConfig.circuitBreakerOptions?.resetTimeout || 
        config.circuitBreaker.resetTimeout,
    });

    // Listen to circuit breaker events
    this.circuitBreaker.on('stateChange', ({ from, to }) => {
      logger.warn(`Circuit breaker '${breakerName}' state changed: ${from} -> ${to}`);
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.executeWithCircuitBreaker(() => 
      this.client.get<T>(url, config)
    );
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.executeWithCircuitBreaker(() => 
      this.client.post<T>(url, data, config)
    );
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.executeWithCircuitBreaker(() => 
      this.client.put<T>(url, data, config)
    );
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.executeWithCircuitBreaker(() => 
      this.client.patch<T>(url, data, config)
    );
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.executeWithCircuitBreaker(() => 
      this.client.delete<T>(url, config)
    );
  }

  private async executeWithCircuitBreaker<T>(
    fn: () => Promise<AxiosResponse<T>>
  ): Promise<HttpResponse<T>> {
    try {
      const response = await this.circuitBreaker.execute(() => fn());
      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'CircuitBreakerError') {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        const axiosError = error;
        throw new HttpClientError(
          axiosError.message,
          axiosError.response?.status || 0,
          axiosError.response?.data,
          axiosError.code
        );
      }
      
      throw error;
    }
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getMetrics();
  }

  forceCircuitOpen(): void {
    this.circuitBreaker.forceOpen();
  }

  forceCircuitClose(): void {
    this.circuitBreaker.forceClose();
  }
}

export class HttpClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseData?: any,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'HttpClientError';
    Object.setPrototypeOf(this, HttpClientError.prototype);
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  isTimeout(): boolean {
    return this.code === 'ECONNABORTED' || this.code === 'ETIMEDOUT';
  }

  isNetworkError(): boolean {
    return this.code === 'ECONNREFUSED' || this.code === 'ENOTFOUND';
  }
}

// Inventory Service Client
export class InventoryServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient({
      baseURL: config.inventoryServiceUrl,
      timeout: config.inventoryServiceTimeout,
      circuitBreakerName: 'inventory-service',
      circuitBreakerOptions: {
        failureThreshold: config.circuitBreaker.failureThreshold,
        timeout: config.circuitBreaker.timeout,
        resetTimeout: config.circuitBreaker.resetTimeout,
      },
    });
  }

  async checkStock(productId: string, quantity: number): Promise<{
    available: boolean;
    stock: number;
    requested: number;
    message?: string;
  }> {
    try {
      const response = await this.httpClient.get(`/inventory/${productId}/check`, {
        params: { quantity },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to check stock for product ${productId}:`, error);
      
      // If circuit breaker is open or service unavailable, assume stock is available
      // This is a business decision - could also choose to reject
      if (error instanceof Error && error.name === 'CircuitBreakerError') {
        logger.warn(`Circuit breaker open for inventory check, allowing product ${productId}`);
        return {
          available: true,
          stock: -1, // Unknown
          requested: quantity,
          message: 'Stock check unavailable, proceeding with caution',
        };
      }
      
      throw error;
    }
  }

  async getProduct(productId: string): Promise<{
    id: string;
    name: string;
    sku: string;
    price: number;
    stock: number;
    isActive: boolean;
  } | null> {
    try {
      const response = await this.httpClient.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      if (error instanceof HttpClientError && error.isNotFound()) {
        return null;
      }
      logger.error(`Failed to get product ${productId}:`, error);
      throw error;
    }
  }

  async reserveStock(productId: string, quantity: number, cartId: string): Promise<{
    success: boolean;
    reservationId?: string;
    message?: string;
  }> {
    try {
      const response = await this.httpClient.post(`/inventory/reserve`, {
        productId,
        quantity,
        cartId,
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to reserve stock for product ${productId}:`, error);
      throw error;
    }
  }

  async releaseStock(reservationId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const response = await this.httpClient.post(`/inventory/release`, {
        reservationId,
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to release stock reservation ${reservationId}:`, error);
      throw error;
    }
  }

  getHealth(): { state: string; metrics: any } {
    return {
      state: this.httpClient.getCircuitBreakerState(),
      metrics: this.httpClient.getCircuitBreakerMetrics(),
    };
  }
}

// Factory function for creating inventory service client
export const createInventoryServiceClient = (): InventoryServiceClient => {
  return new InventoryServiceClient();
};

export default HttpClient;
