
interface ApiFilters {
  organizationId?: string;
  teamId?: string;
  athleteId?: string;
  userId?: string;
  [key: string]: any;
}

interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface ApiError extends Error {
  status?: number;
  details?: any;
}

// Constants for CSRF token handling
const CSRF_TOKEN_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const CSRF_MAX_RETRIES = 2;
const CSRF_RETRY_BASE_DELAY_MS = 100;

class ApiClient {
  private baseUrl = '/api';
  private csrfToken: string | null = null;
  private csrfTokenExpiry: number = 0;
  private csrfTokenFetching: Promise<string | null> | null = null;

  /**
   * Get CSRF token with caching and automatic retry.
   * Prevents concurrent token fetches using a mutex pattern.
   * @param retryCount - Current retry attempt (used internally for exponential backoff)
   * @returns The CSRF token or null if unavailable after retries
   */
  private async getCsrfToken(retryCount = 0): Promise<string | null> {
    // If already fetching, wait for that request to complete
    if (this.csrfTokenFetching) {
      return this.csrfTokenFetching;
    }

    // Return cached token if still valid
    const now = Date.now();
    if (this.csrfToken && now < this.csrfTokenExpiry) {
      return this.csrfToken;
    }

    // Start fetch and cache the promise to prevent concurrent fetches
    this.csrfTokenFetching = this._fetchCsrfToken(retryCount);
    try {
      const result = await this.csrfTokenFetching;
      return result;
    } finally {
      this.csrfTokenFetching = null;
    }
  }

  /**
   * Internal method to fetch CSRF token from the server.
   * @param retryCount - Current retry attempt
   * @returns The CSRF token or null if unavailable
   */
  private async _fetchCsrfToken(retryCount: number): Promise<string | null> {
    const now = Date.now();

    try {
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });

      if (csrfResponse.ok) {
        const { csrfToken } = await csrfResponse.json();
        // Cache the token
        this.csrfToken = csrfToken;
        this.csrfTokenExpiry = now + CSRF_TOKEN_CACHE_DURATION_MS;
        return csrfToken;
      }

      // Log non-OK responses for debugging (only in development)
      if (import.meta.env.DEV) {
        console.warn(`CSRF token fetch returned status ${csrfResponse.status}: ${csrfResponse.statusText}`);
      }

      // Retry on 5xx errors
      if (csrfResponse.status >= 500 && retryCount < CSRF_MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, CSRF_RETRY_BASE_DELAY_MS * (retryCount + 1)));
        return this._fetchCsrfToken(retryCount + 1);
      }
    } catch (error) {
      // Log network errors (only in development)
      if (import.meta.env.DEV) {
        console.warn('Failed to fetch CSRF token:', error);
      }

      // Retry on network errors
      if (retryCount < CSRF_MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, CSRF_RETRY_BASE_DELAY_MS * (retryCount + 1)));
        return this._fetchCsrfToken(retryCount + 1);
      }
    }

    // Clear cache on failure
    this.csrfToken = null;
    this.csrfTokenExpiry = 0;
    return null;
  }

  /**
   * Clear the cached CSRF token.
   * Useful when token becomes invalid (e.g., after 403 response or logout).
   * The token will be automatically refetched on the next state-changing request.
   */
  clearCsrfTokenCache(): void {
    this.csrfToken = null;
    this.csrfTokenExpiry = 0;
  }

  /**
   * Handle API response, extracting error information and parsing JSON.
   * @param response - The fetch Response object
   * @returns Promise resolving to the parsed response data
   * @throws ApiError with status code and details
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = new Error(`API Error: ${response.statusText}`) as ApiError;
      error.status = response.status;

      try {
        const errorData = await response.json();
        error.details = errorData;
        error.message = errorData.message || error.message;
      } catch {
        // Response doesn't contain JSON
      }

      // Clear CSRF token cache on 403 Forbidden (likely invalid token)
      if (response.status === 403) {
        this.clearCsrfTokenCache();
      }

      // Enhanced 429 rate limit error message
      if (response.status === 429) {
        const rateLimitReset = response.headers.get('RateLimit-Reset');
        const retryAfter = response.headers.get('Retry-After');

        if (rateLimitReset && !isNaN(parseInt(rateLimitReset))) {
          const resetTime = new Date(parseInt(rateLimitReset) * 1000);
          const now = new Date();
          const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
          if (minutesUntilReset > 0) {
            error.message = `Rate limit exceeded. Please try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}.`;
          } else {
            error.message = 'Rate limit exceeded. Please try again shortly.';
          }
        } else if (retryAfter && !isNaN(parseInt(retryAfter))) {
          const seconds = parseInt(retryAfter);
          const minutes = Math.ceil(seconds / 60);
          error.message = `Rate limit exceeded. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
        } else {
          error.message = error.message || 'Rate limit exceeded. Please try again later.';
        }
      }

      throw error;
    }

    return response.json();
  }

  /**
   * Add CSRF token to request headers for state-changing operations.
   * Throws error if CSRF token cannot be obtained.
   */
  private async addCsrfHeader(headers: Record<string, string>): Promise<void> {
    const csrfToken = await this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF protection token. Please refresh the page and try again.');
    }
    headers['X-CSRF-Token'] = csrfToken;
  }

  /**
   * Send a GET request.
   * @param endpoint - API endpoint path
   * @param filters - Optional query parameters to filter the results
   * @returns Promise resolving to the response data
   */
  async get<T>(endpoint: string, filters?: ApiFilters): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            url.searchParams.set(key, value.join(','));
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      });
    }

    const response = await fetch(url.toString(), {
      credentials: 'include' // Important for session cookies
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Send a POST request with CSRF protection.
   * @param endpoint - API endpoint path
   * @param data - Request body data (will be sent as JSON)
   * @returns Promise resolving to the response data
   */
  async post<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    await this.addCsrfHeader(headers);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Send a PUT request with CSRF protection.
   * @param endpoint - API endpoint path
   * @param data - Request body data (will be sent as JSON)
   * @returns Promise resolving to the response data
   */
  async put<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    await this.addCsrfHeader(headers);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Send a PATCH request with CSRF protection.
   * @param endpoint - API endpoint path
   * @param data - Request body data (will be sent as JSON)
   * @returns Promise resolving to the response data
   */
  async patch<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    await this.addCsrfHeader(headers);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Send a DELETE request.
   * @param endpoint - API endpoint path
   * @param data - Optional request body (if provided, will be sent as JSON)
   * @returns Promise resolving to the response data
   */
  async delete<T = void>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
    }
    await this.addCsrfHeader(headers);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }
}

export const apiClient = new ApiClient();

// Consolidated data fetchers with React Query support
export const queries = {
  // Organizations
  organizations: (filters?: ApiFilters) => ({
    queryKey: ['organizations', filters],
    queryFn: () => apiClient.get('/organizations', filters),
  }),

  organization: (id: string) => ({
    queryKey: ['organizations', id],
    queryFn: () => apiClient.get(`/organizations/${id}`),
  }),

  organizationProfile: (id: string) => ({
    queryKey: ['organizations', id, 'profile'],
    queryFn: () => apiClient.get(`/organizations/${id}/profile`),
  }),

  organizationDependencies: (id: string) => ({
    queryKey: ['organizations', id, 'dependencies'],
    queryFn: () => apiClient.get<{ users: number; teams: number; measurements: number }>(`/organizations/${id}/dependencies`),
  }),

  myOrganizations: () => ({
    queryKey: ['my-organizations'],
    queryFn: () => apiClient.get('/my-organizations'),
  }),

  // Teams
  teams: (filters?: ApiFilters) => ({
    queryKey: ['teams', filters],
    queryFn: () => apiClient.get('/teams', filters),
  }),

  team: (id: string) => ({
    queryKey: ['teams', id],
    queryFn: () => apiClient.get(`/teams/${id}`),
  }),

  // Athletes
  athletes: (filters?: ApiFilters) => ({
    queryKey: ['athletes', filters],
    queryFn: () => apiClient.get('/athletes', filters),
  }),

  athlete: (id: string) => ({
    queryKey: ['athletes', id],
    queryFn: () => apiClient.get(`/athletes/${id}`),
  }),

  // Measurements
  measurements: (filters?: ApiFilters) => ({
    queryKey: ['measurements', filters],
    queryFn: () => apiClient.get('/measurements', filters),
  }),

  measurement: (id: string) => ({
    queryKey: ['measurements', id],
    queryFn: () => apiClient.get(`/measurements/${id}`),
  }),

  // Users
  users: (filters?: ApiFilters) => ({
    queryKey: ['users', filters],
    queryFn: () => apiClient.get('/users', filters),
  }),

  user: (id: string) => ({
    queryKey: ['users', id],
    queryFn: () => apiClient.get(`/users/${id}`),
  }),

  userProfile: (id: string) => ({
    queryKey: ['users', id, 'profile'],
    queryFn: () => apiClient.get(`/users/${id}/profile`),
  }),

  // Authentication
  currentUser: () => ({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/auth/me'),
  }),

  userOrganizations: (userId?: string) => ({
    queryKey: ['auth', 'organizations', userId],
    queryFn: () => apiClient.get(userId ? `/users/${userId}/organizations` : '/auth/me/organizations'),
  }),

  // Analytics
  dashboardStats: (filters?: ApiFilters) => ({
    queryKey: ['analytics', 'dashboard', filters],
    queryFn: () => apiClient.get('/analytics/dashboard', filters),
  }),

  teamStats: (filters?: ApiFilters) => ({
    queryKey: ['analytics', 'teams', filters],
    queryFn: () => apiClient.get('/analytics/teams', filters),
  }),

  // Invitations
  invitations: (filters?: ApiFilters) => ({
    queryKey: ['invitations', filters],
    queryFn: () => apiClient.get('/invitations', filters),
  }),

  invitation: (token: string) => ({
    queryKey: ['invitations', token],
    queryFn: () => apiClient.get(`/invitations/${token}`),
  }),
};

// Mutation helpers
export const mutations = {
  // Organizations
  createOrganization: (data: any) => apiClient.post('/organizations', data),
  updateOrganization: (id: string, data: any) => apiClient.put(`/organizations/${id}`, data),
  deactivateOrganization: (id: string) => apiClient.patch(`/organizations/${id}/status`, { isActive: false }),
  reactivateOrganization: (id: string) => apiClient.patch(`/organizations/${id}/status`, { isActive: true }),
  deleteOrganization: (id: string, confirmationName: string) =>
    apiClient.delete(`/organizations/${id}`, { confirmationName }),

  // Teams
  createTeam: (data: any) => apiClient.post('/teams', data),
  updateTeam: (id: string, data: any) => apiClient.patch(`/teams/${id}`, data),
  deleteTeam: (id: string) => apiClient.delete(`/teams/${id}`),

  // Athletes
  createAthlete: (data: any) => apiClient.post('/athletes', data),
  updateAthlete: (id: string, data: any) => apiClient.patch(`/athletes/${id}`, data),
  deleteAthlete: (id: string) => apiClient.delete(`/athletes/${id}`),

  // Measurements
  createMeasurement: (data: any) => apiClient.post('/measurements', data),
  updateMeasurement: (id: string, data: any) => apiClient.patch(`/measurements/${id}`, data),
  deleteMeasurement: (id: string) => apiClient.delete(`/measurements/${id}`),
  verifyMeasurement: (id: string) => apiClient.put(`/measurements/${id}/verify`, {}),

  // Users
  createUser: (data: any) => apiClient.post('/users', data),
  updateUser: (id: string, data: any) => apiClient.patch(`/users/${id}`, data),
  deleteUser: (id: string) => apiClient.delete(`/users/${id}`),
  updateUserRole: (id: string, role: string, organizationId?: string) => 
    apiClient.put(`/users/${id}/role`, { role, organizationId }),
  updateUserStatus: (id: string, isActive: boolean) => 
    apiClient.put(`/users/${id}/status`, { isActive }),

  // Authentication
  login: (credentials: { username: string; password: string }) => 
    apiClient.post('/auth/login', credentials),
  logout: () => apiClient.post('/auth/logout', {}),
  updateProfile: (data: any) => apiClient.put('/profile', data),
  changePassword: (data: any) => apiClient.put('/profile/password', data),

  // Invitations
  createInvitation: (data: any) => apiClient.post('/invitations', data),
  deleteInvitation: (id: string) => apiClient.delete(`/invitations/${id}`),
  acceptInvitation: (token: string, data: any) => 
    apiClient.post(`/invitations/${token}/accept`, data),

  // Admin
  impersonateUser: (userId: string) => apiClient.post(`/admin/impersonate/${userId}`, {}),
  stopImpersonation: () => apiClient.post('/admin/stop-impersonation', {}),
};

// Legacy exports for backward compatibility
export const dataFetchers = {
  organizations: (filters?: ApiFilters) => apiClient.get('/organizations', filters),
  users: (filters?: ApiFilters) => apiClient.get('/users', filters),
  teams: (filters?: ApiFilters) => apiClient.get('/teams', filters),
  athletes: (filters?: ApiFilters) => apiClient.get('/athletes', filters),
  measurements: (filters?: ApiFilters) => apiClient.get('/measurements', filters),
  userOrganizations: (userId?: string) => 
    apiClient.get(userId ? `/users/${userId}/organizations` : '/auth/me/organizations'),
  organizationProfile: (organizationId: string) => 
    apiClient.get(`/organizations/${organizationId}/profile`),
  dashboardStats: (filters?: ApiFilters) => 
    apiClient.get('/analytics/dashboard', filters),
};
