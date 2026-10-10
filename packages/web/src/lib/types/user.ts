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
  emailVerified?: boolean;
  athleteId?: string;
  primaryOrganizationId?: string;
}

export interface UserOrganization {
  organizationId: string;
  organizationName: string;
  role: 'org_admin' | 'coach' | 'athlete';
  createdAt: string;
}

export interface EnhancedUser extends BaseUser {
  /**
   * @deprecated Never set: the API does not send it, so it is always undefined. Use
   * getOrgRole / getHighestOrgRole (lib/org-roles) with useAuth().userOrganizations.
   * Kept only until DeviceImportButton stops reading it (fixed in PR #589); then delete.
   */
  currentOrganization?: {
    id: string;
    name: string;
    role: 'org_admin' | 'coach' | 'athlete';
  };
  // All user's organizations
  organizations?: UserOrganization[];
  // Backwards compatibility - primary role for the current context
  role?: 'site_admin' | 'org_admin' | 'coach' | 'athlete' | 'parent' | 'guest';
  // COPPA status for under-13 athletes
  coppaStatus?: 'not_applicable' | 'pending_consent' | 'consented' | 'consent_revoked' | 'needs_parent_email';
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

export const hasOrgAccess = (user: EnhancedUser | null, organizationId: string): boolean => {
  if (!user) return false;
  if (isSiteAdmin(user)) return true;
  return user.organizations?.some(org => org.organizationId === organizationId) || false;
};
