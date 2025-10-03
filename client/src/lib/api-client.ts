/**
 * Centralized API Client
 * Provides type-safe HTTP methods with consistent error handling,
 * CSRF protection, and request/response interceptors
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestConfig extends RequestInit {
  skipCsrf?: boolean;
  skipAuth?: boolean;
}

class ApiClient {
  private baseUrl = '/api';
  private csrfToken: string | null = null;
  private csrfPromise: Promise<string> | null = null;

  /**
   * Get CSRF token with caching and automatic retry
   */
  private async getCsrfToken(): Promise<string> {
    // Return cached token if available
    if (this.csrfToken) {
      return this.csrfToken;
    }

    // If a fetch is in progress, wait for it
    if (this.csrfPromise) {
      return this.csrfPromise;
    }

    // Fetch new token with retry logic
    this.csrfPromise = this.fetchCsrfTokenWithRetry();
    return this.csrfPromise;
  }

  /**
   * Fetch CSRF token with exponential backoff retry
   */
  private async fetchCsrfTokenWithRetry(retryCount = 0, maxRetries = 3): Promise<string> {
    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new ApiError(
          'Failed to fetch CSRF token',
          response.status,
          'CSRF_FETCH_FAILED'
        );
      }

      const data = await response.json();
      this.csrfToken = data.csrfToken;
      this.csrfPromise = null;
      return this.csrfToken!;
    } catch (error) {
      // Clear promise on error
      this.csrfPromise = null;

      // Retry with exponential backoff if not exceeded max retries
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Cap at 5s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchCsrfTokenWithRetry(retryCount + 1, maxRetries);
      }

      // Max retries exceeded - throw user-friendly error
      throw new ApiError(
        'Unable to establish secure connection. Please check your network connection and try again.',
        0,
        'CSRF_MAX_RETRIES_EXCEEDED',
        error
      );
    }
  }

  /**
   * Clear cached CSRF token (e.g., after logout)
   */
  clearCsrfToken(): void {
    this.csrfToken = null;
    this.csrfPromise = null;
  }

  /**
   * Core fetch method with error handling
   */
  private async fetch<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers as Record<string, string> || {}),
    };

    // Add CSRF token for mutating requests
    if (!config.skipCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method || 'GET')) {
      try {
        const csrfToken = await this.getCsrfToken();
        headers['X-CSRF-Token'] = csrfToken;
      } catch (error) {
        // CSRF token fetch already includes retry logic with exponential backoff
        // If we reach here, all retries have failed
        console.error('CSRF token fetch failed after retries:', error);
        throw error; // Re-throw with original error from getCsrfToken
      }
    }

    // Make request
    try {
      const response = await fetch(url, {
        ...config,
        headers,
        credentials: config.credentials || 'include',
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      // Handle errors
      if (!response.ok) {
        let errorMessage = `Request failed: ${response.statusText}`;
        let errorDetails: unknown = undefined;

        if (isJson) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
            errorDetails = errorData;
          } catch {
            // Failed to parse error response
          }
        }

        // Clear CSRF token on 403 (might be invalid token)
        if (response.status === 403) {
          this.clearCsrfToken();
        }

        throw new ApiError(
          errorMessage,
          response.status,
          this.getErrorCode(response.status),
          errorDetails
        );
      }

      // Handle empty responses
      if (response.status === 204 || !isJson) {
        return null as T;
      }

      // Parse JSON response
      return await response.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiError(
          'Network error. Please check your connection.',
          0,
          'NETWORK_ERROR'
        );
      }

      // Re-throw ApiError
      if (error instanceof ApiError) {
        throw error;
      }

      // Unknown error
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        500,
        'UNKNOWN_ERROR',
        error
      );
    }
  }

  /**
   * Get error code from status
   */
  private getErrorCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMIT_EXCEEDED';
      case 500:
        return 'INTERNAL_SERVER_ERROR';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...config,
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...config,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...config,
      method: 'DELETE',
    });
  }

  /**
   * Upload file with FormData
   */
  async upload<T>(
    endpoint: string,
    formData: FormData,
    config?: Omit<RequestConfig, 'body'>
  ): Promise<T> {
    const headers: Record<string, string> = {
      // Don't set Content-Type for FormData - browser will set it with boundary
      ...(config?.headers as Record<string, string> || {}),
    };
    delete headers['Content-Type'];

    // Get CSRF token
    try {
      const csrfToken = await this.getCsrfToken();
      headers['X-CSRF-Token'] = csrfToken;
    } catch (error) {
      console.error('Failed to get CSRF token for upload:', error);
      throw new ApiError(
        'Failed to get CSRF token. Please refresh the page and try again.',
        0,
        'CSRF_TOKEN_FAILED',
        error
      );
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...config,
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(
        error.message || 'Upload failed',
        response.status,
        this.getErrorCode(response.status),
        error
      );
    }

    return await response.json();
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types
export type { RequestConfig };
