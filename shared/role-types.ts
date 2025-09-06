import { z } from "zod";

export const ROLE_HIERARCHY = {
  site_admin: 100,
  org_admin: 80,
  coach: 60,
  athlete: 40,
  guest: 20
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

export const PERMISSIONS = {
  // Organization management
  CREATE_ORGANIZATION: ['site_admin'],
  MANAGE_ORGANIZATION: ['site_admin', 'org_admin'],
  VIEW_ORGANIZATION: ['site_admin', 'org_admin', 'coach', 'athlete'],
  DELETE_ORGANIZATION: ['site_admin'],
  
  // User management
  INVITE_USERS: ['site_admin', 'org_admin'],
  MANAGE_USERS: ['site_admin', 'org_admin'],
  VIEW_ALL_USERS: ['site_admin', 'org_admin', 'coach'],
  DELETE_USERS: ['site_admin', 'org_admin'],
  IMPERSONATE_USERS: ['site_admin'],
  
  // Team management
  CREATE_TEAM: ['site_admin', 'org_admin', 'coach'],
  MANAGE_TEAM: ['site_admin', 'org_admin', 'coach'],
  VIEW_TEAM: ['site_admin', 'org_admin', 'coach', 'athlete'],
  DELETE_TEAM: ['site_admin', 'org_admin'],
  
  // Measurement management
  IMPORT_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  CREATE_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  EDIT_ANY_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  EDIT_OWN_MEASUREMENTS: ['athlete'],
  VIEW_ALL_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  VIEW_OWN_MEASUREMENTS: ['athlete'],
  DELETE_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  VERIFY_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  
  // Analytics and reporting
  VIEW_ANALYTICS: ['site_admin', 'org_admin', 'coach'],
  VIEW_ADVANCED_ANALYTICS: ['site_admin', 'org_admin'],
  EXPORT_DATA: ['site_admin', 'org_admin', 'coach'],
  BULK_EXPORT: ['site_admin', 'org_admin'],
  
  // System administration
  MANAGE_SYSTEM: ['site_admin'],
  VIEW_LOGS: ['site_admin'],
  CONFIGURE_SETTINGS: ['site_admin', 'org_admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const roleSchema = z.enum(['site_admin', 'org_admin', 'coach', 'athlete', 'guest']);

export function hasPermission(userRole: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(userRole as Role);
}

export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function canManageRole(managerRole: Role, targetRole: Role): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}

export function getAvailableRoles(managerRole: Role): Role[] {
  const managerLevel = getRoleLevel(managerRole);
  return Object.keys(ROLE_HIERARCHY).filter(role => 
    getRoleLevel(role as Role) < managerLevel
  ) as Role[];
}

export function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    site_admin: 'Site Administrator',
    org_admin: 'Organization Admin',
    coach: 'Coach',
    athlete: 'Athlete',
    guest: 'Guest'
  };
  return displayNames[role] || role;
}

export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    site_admin: 'Full system access and administration',
    org_admin: 'Manages organization, teams, and users',
    coach: 'Manages teams and athlete measurements',
    athlete: 'Views own data and measurements',
    guest: 'Limited read-only access'
  };
  return descriptions[role] || '';
}