import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { EnhancedUser, ImpersonationStatus, UserOrganization } from './types/user';

interface AuthContextType {
  user: EnhancedUser | null;
  isLoading: boolean;
  organizationContext: string | null;
  userOrganizations: UserOrganization[] | null;
  setOrganizationContext: (orgId: string | null) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; redirectUrl?: string; message?: string }>;
  logout: () => void;
  impersonationStatus: ImpersonationStatus | null;
  startImpersonation: (userId: string) => Promise<{ success: boolean; message?: string }>;
  stopImpersonation: () => Promise<{ success: boolean; message?: string }>;
  checkImpersonationStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<EnhancedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationContext, setOrganizationContext] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[] | null>(null);
  const [impersonationStatus, setImpersonationStatus] = useState<ImpersonationStatus | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user && user.isSiteAdmin) {
      checkImpersonationStatus();
    }
    if (user && !user.isSiteAdmin) {
      fetchUserOrganizations();
    }
  }, [user]);

  const fetchUserOrganizations = async () => {
    try {
      const response = await fetch('/api/auth/me/organizations', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setUserOrganizations(data);
      } else {
        setUserOrganizations(null);
      }
    } catch (error) {
      console.error('Failed to fetch user organizations:', error);
      setUserOrganizations(null);
    }
  };

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // Auto-set organization context for non-site-admin users
        if (data.user && !data.user.isSiteAdmin) {
          try {
            const orgResponse = await fetch('/api/auth/me/organizations', {
              credentials: 'include'
            });
            if (orgResponse.ok) {
              const organizations = await orgResponse.json();
              if (organizations && organizations.length > 0) {
                // Set the first organization as the default context
                setOrganizationContext(organizations[0].organizationId);
              }
            }
          } catch (orgError) {
            console.error('Failed to fetch user organizations:', orgError);
          }
        }
      } else {
        setUser(null);
        setOrganizationContext(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setOrganizationContext(null);
    } finally {
      setIsLoading(false);
    }
  };

  const checkImpersonationStatus = async () => {
    try {
      const response = await fetch('/api/admin/impersonation-status', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setImpersonationStatus(data);
      }
    } catch (error) {
      console.error('Failed to check impersonation status:', error);
    }
  };

  const startImpersonation = async (userId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`/api/admin/impersonate/${userId}`, {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setUser(data.user);
        setImpersonationStatus(data.impersonationStatus);
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || 'Failed to start impersonation' };
      }
    } catch (error) {
      return { success: false, message: 'Network error occurred' };
    }
  };

  const stopImpersonation = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch('/api/admin/stop-impersonation', {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setUser(data.user);
        setImpersonationStatus(data.impersonationStatus);
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || 'Failed to stop impersonation' };
      }
    } catch (error) {
      return { success: false, message: 'Network error occurred' };
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; redirectUrl?: string; message?: string }> => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message || 'Login failed' };
      }

      const data = await response.json();
      setUser(data.user);

      // Redirect to the specified URL or default to dashboard
      setLocation(data.redirectUrl || '/');
      return { success: true, redirectUrl: data.redirectUrl || '/' };
    } catch (error) {
      return { success: false, message: 'Network error occurred' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
      setUserOrganizations(null);
      setOrganizationContext(null);
      setImpersonationStatus(null);
      setLocation('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      setUser(null);
      setUserOrganizations(null);
      setOrganizationContext(null);
      setImpersonationStatus(null);
      setLocation('/login');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isLoading,
      organizationContext,
      userOrganizations,
      setOrganizationContext,
      impersonationStatus,
      startImpersonation,
      stopImpersonation,
      checkImpersonationStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}