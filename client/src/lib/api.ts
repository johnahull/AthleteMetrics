
interface ApiFilters {
  organizationId?: string;
  teamId?: string;
  playerId?: string;
  [key: string]: any;
}

interface ApiResponse<T> {
  data: T;
  error?: string;
}

class ApiClient {
  private baseUrl = '/api';

  async get<T>(endpoint: string, filters?: ApiFilters): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  }

  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
  }
}

export const apiClient = new ApiClient();

// Standardized data fetchers
export const dataFetchers = {
  organizations: (filters?: ApiFilters) => 
    apiClient.get('/organizations', filters),
    
  users: (filters?: ApiFilters) => 
    apiClient.get('/users', filters),
    
  teams: (filters?: ApiFilters) => 
    apiClient.get('/teams', filters),
    
  players: (filters?: ApiFilters) => 
    apiClient.get('/players', filters),
    
  measurements: (filters?: ApiFilters) => 
    apiClient.get('/measurements', filters),
    
  userOrganizations: (userId?: string) => 
    apiClient.get(userId ? `/users/${userId}/organizations` : '/auth/me/organizations'),
    
  organizationProfile: (organizationId: string) => 
    apiClient.get(`/organizations/${organizationId}/profile`),
    
  dashboardStats: (filters?: ApiFilters) => 
    apiClient.get('/analytics/dashboard', filters),
};
