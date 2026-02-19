import logger from '../../utils/logger';

/**
 * HTTP Request Options
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

/**
 * HTTP Response
 */
export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

/**
 * HTTP Error
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * HTTP Client for making external API calls
 */
export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private defaultRetries: number;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    defaultTimeout: number = 30000,
    defaultRetries: number = 3
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...defaultHeaders,
    };
    this.defaultTimeout = defaultTimeout;
    this.defaultRetries = defaultRetries;
  }

  /**
   * Make an HTTP request
   */
  async request<T = unknown>(
    endpoint: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retries = this.defaultRetries,
    } = options;

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    const requestInit: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body && method !== 'GET') {
      requestInit.body = JSON.stringify(body);
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        logger.debug(`HTTP ${method} ${url}`, { attempt: attempt + 1 });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        requestInit.signal = controller.signal;

        const response = await fetch(url, requestInit);
        clearTimeout(timeoutId);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let data: T;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          data = (await response.json()) as T;
        } else {
          data = (await response.text()) as unknown as T;
        }

        if (!response.ok) {
          throw new HttpError(
            `HTTP Error ${response.status}: ${response.statusText}`,
            response.status,
            response.statusText,
            data
          );
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 4xx errors (client errors)
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === retries) {
          break;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Request failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          error: lastError.message,
        });
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(
    endpoint: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(
    endpoint: string,
    body: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * Make a PUT request
   */
  async put<T = unknown>(
    endpoint: string,
    body: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * Make a PATCH request
   */
  async patch<T = unknown>(
    endpoint: string,
    body: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * Make a DELETE request
   */
  async delete<T = unknown>(
    endpoint: string,
    options?: Omit<HttpRequestOptions, 'method'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Set default header
   */
  setHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  /**
   * Remove default header
   */
  removeHeader(key: string): void {
    delete this.defaultHeaders[key];
  }

  /**
   * Set authorization header
   */
  setAuthorization(token: string, type: 'Bearer' | 'Basic' = 'Bearer'): void {
    this.defaultHeaders['Authorization'] = `${type} ${token}`;
  }

  /**
   * Clear authorization header
   */
  clearAuthorization(): void {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Create a default HTTP client instance
export const createHttpClient = (
  baseUrl: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
  }
): HttpClient => {
  return new HttpClient(
    baseUrl,
    options?.headers,
    options?.timeout,
    options?.retries
  );
};

export default HttpClient;
