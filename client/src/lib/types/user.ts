/**
 * Enhanced user type definitions for analytics and application-wide use
 */

export interface BaseUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isSiteAdmin: boolean;
  athleteId?: string;
}

export interface UserOrganization {
  organizationId: string;
  organizationName: string;
  role: 'org_admin' | 'coach' | 'athlete';
  createdAt: string;
}

export interface EnhancedUser extends BaseUser {
  // Organization context when user is in a specific org
  currentOrganization?: {
    id: string;
    name: string;
    role: 'org_admin' | 'coach' | 'athlete';
  };
  // All user's organizations
  organizations?: UserOrganization[];
  // Backwards compatibility - primary role for the current context
  role?: 'site_admin' | 'org_admin' | 'coach' | 'athlete';
}

export interface ImpersonationStatus {
  isImpersonating: boolean;
  originalUser?: BaseUser;
  targetUser?: BaseUser;
  startTime?: string;
}

// Type guards for role checking
export const isSiteAdmin = (user: BaseUser | null): boolean => {
  return user?.isSiteAdmin === true;
};

export const hasRole = (user: EnhancedUser | null, role: 'org_admin' | 'coach' | 'athlete'): boolean => {
  return user?.currentOrganization?.role === role || user?.role === role;
};

export const hasOrgAccess = (user: EnhancedUser | null, organizationId: string): boolean => {
  if (!user) return false;
  if (isSiteAdmin(user)) return true;
  return user.organizations?.some(org => org.organizationId === organizationId) || false;
};

// Analytics-specific user context
export interface AnalyticsUserContext {
  userId: string;
  organizationId: string;
  role: 'org_admin' | 'coach' | 'athlete';
  isSiteAdmin: boolean;
  canViewAllData: boolean;
  canExportData: boolean;
}

export const createAnalyticsContext = (user: EnhancedUser | null, organizationId?: string): AnalyticsUserContext | null => {
  if (!user || !organizationId) return null;
  
  const hasAccess = hasOrgAccess(user, organizationId);
  if (!hasAccess) return null;
  
  const orgRole = user.currentOrganization?.role || 'athlete';
  const isAdmin = isSiteAdmin(user);
  
  return {
    userId: user.id,
    organizationId,
    role: orgRole,
    isSiteAdmin: isAdmin,
    canViewAllData: isAdmin || orgRole === 'org_admin' || orgRole === 'coach',
    canExportData: isAdmin || orgRole === 'org_admin'
  };
};