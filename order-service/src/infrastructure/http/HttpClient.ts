import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { createLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import config from '../../config';
import { CartData, CartItem } from '../../application/services/OrderService';

const logger = createLogger('HttpClient');

export interface HttpClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private client: AxiosInstance;

  constructor(config: HttpClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (request) => {
        logger.debug(`HTTP Request: ${request.method?.toUpperCase()} ${request.url}`, {
          baseURL: request.baseURL,
          headers: request.headers,
        });
        return request;
      },
      (error) => {
        logger.error('HTTP Request Error', { error: (error as Error).message });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error: AxiosError) => {
        const errorMessage = error.response?.data?.message || error.message;
        logger.error('HTTP Response Error', {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          message: errorMessage,
        });
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

/**
 * Cart Service Client
 */
export class CartServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient({
      baseURL: config.services.cart,
      timeout: 5000,
    });
  }

  async getCart(cartId: string, token: string): Promise<CartData> {
    return withRetry(
      async () => {
        const response = await this.httpClient.get<{
          id: string;
          userId: string;
          items: Array<{
            productId: string;
            productName: string;
            productSku: string;
            quantity: number;
            unitPrice: number;
          }>;
          total: number;
        }>(`/carts/${cartId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        return {
          id: response.id,
          userId: response.userId,
          items: response.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          total: response.total,
        };
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }

  async clearCart(cartId: string, token: string): Promise<void> {
    return withRetry(
      async () => {
        await this.httpClient.delete(`/carts/${cartId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }
}

/**
 * Inventory Service Client
 */
export class InventoryServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient({
      baseURL: config.services.inventory,
      timeout: 5000,
    });
  }

  async validateStock(
    items: Array<{ productId: string; quantity: number }>,
    token: string
  ): Promise<{
    valid: boolean;
    invalidItems?: Array<{
      productId: string;
      requested: number;
      available: number;
    }>;
  }> {
    return withRetry(
      async () => {
        return this.httpClient.post('/inventory/validate', { items }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }

  async reserveStock(
    orderId: string,
    items: Array<{ productId: string; quantity: number }>,
    token: string
  ): Promise<{
    reservationId: string;
    status: string;
  }> {
    return withRetry(
      async () => {
        return this.httpClient.post('/inventory/reserve', {
          orderId,
          items,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }

  async releaseStock(
    reservationId: string,
    token: string
  ): Promise<void> {
    return withRetry(
      async () => {
        await this.httpClient.post('/inventory/release', {
          reservationId,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }
}

/**
 * User Service Client
 */
export class UserServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient({
      baseURL: config.services.user,
      timeout: 5000,
    });
  }

  async validateToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    email?: string;
    roles?: string[];
  }> {
    return withRetry(
      async () => {
        return this.httpClient.post('/auth/validate', { token });
      },
      {
        maxRetries: 2,
        baseDelayMs: 500,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
      }
    );
  }

  async getUser(userId: string, token: string): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  }> {
    return withRetry(
      async () => {
        return this.httpClient.get(`/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }
}

/**
 * Payment Service Client
 */
export class PaymentServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient({
      baseURL: config.services.payment,
      timeout: 10000,
    });
  }

  async processPayment(data: {
    orderId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    token: string;
  }): Promise<{
    paymentId: string;
    status: string;
    transactionId?: string;
  }> {
    return withRetry(
      async () => {
        return this.httpClient.post('/payments/process', {
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency,
          paymentMethod: data.paymentMethod,
        }, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504'],
      }
    );
  }
}

export default {
  HttpClient,
  CartServiceClient,
  InventoryServiceClient,
  UserServiceClient,
  PaymentServiceClient,
};
