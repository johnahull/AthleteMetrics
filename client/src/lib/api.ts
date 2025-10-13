
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

interface ApiError extends Error {
  status?: number;
  details?: any;
}

class ApiClient {
  private baseUrl = '/api';

  private async getCsrfToken(retryCount = 0): Promise<string | null> {
    const maxRetries = 2;

    try {
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });

      if (csrfResponse.ok) {
        const { csrfToken } = await csrfResponse.json();
        return csrfToken;
      }

      // Log non-OK responses for debugging
      console.warn(`CSRF token fetch returned status ${csrfResponse.status}: ${csrfResponse.statusText}`);

      // Retry on 5xx errors
      if (csrfResponse.status >= 500 && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1))); // exponential backoff
        return this.getCsrfToken(retryCount + 1);
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);

      // Retry on network errors
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1))); // exponential backoff
        return this.getCsrfToken(retryCount + 1);
      }
    }

    return null;
  }

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

  async post<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Add CSRF token for state-changing operations
    const csrfToken = await this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF protection token. Please refresh the page and try again.');
    }
    headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Add CSRF token for state-changing operations
    const csrfToken = await this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF protection token. Please refresh the page and try again.');
    }
    headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Add CSRF token for state-changing operations
    const csrfToken = await this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF protection token. Please refresh the page and try again.');
    }
    headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  async delete<T = void>(endpoint: string, data?: any): Promise<T> {
    const headers: Record<string, string> = data ? { 'Content-Type': 'application/json' } : {};

    // Add CSRF token for state-changing operations
    const csrfToken = await this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF protection token. Please refresh the page and try again.');
    }
    headers['X-CSRF-Token'] = csrfToken;

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
    queryFn: () => apiClient.get(`/organizations/${id}/dependencies`),
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
