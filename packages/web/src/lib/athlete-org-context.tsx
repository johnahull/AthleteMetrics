/**
 * AthleteOrgContext - Manages organization filtering for athlete views
 * Provides organization filter state with localStorage persistence
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './auth';
import { getAthleteOrgFilter, setAthleteOrgFilter } from './athlete-org-storage';

/**
 * Filter mode types:
 * - 'all': Show all organizations
 * - 'personal': Show only personal/independent data
 * - string (org ID): Show specific organization
 */
export type FilterMode = 'all' | 'personal' | string;

/**
 * Organization option for display in selectors
 */
export interface OrganizationOption {
  id: string;
  name: string;
}

/**
 * Context value shape
 */
export interface AthleteOrgContextType {
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  organizations: OrganizationOption[];
}

export const AthleteOrgContext = createContext<AthleteOrgContextType | undefined>(undefined);

export function AthleteOrgProvider({ children }: { children: React.ReactNode }) {
  const { user, userOrganizations } = useAuth();
  const [filterMode, setFilterModeState] = useState<FilterMode>('all');

  // Convert userOrganizations to OrganizationOption array
  const organizations = useMemo<OrganizationOption[]>(() => {
    if (!userOrganizations || userOrganizations.length === 0) {
      return [];
    }
    return userOrganizations.map(org => ({
      id: org.organizationId,
      name: org.organizationName,
    }));
  }, [userOrganizations]);

  // Initialize from localStorage on mount and when user changes
  useEffect(() => {
    if (!user?.id) {
      // User logged out, reset to 'all'
      setFilterModeState('all');
      return;
    }

    // Edge case: If user has 0 organizations, auto-select "personal"
    if (organizations.length === 0) {
      setFilterModeState('personal');
      setAthleteOrgFilter(user.id, 'personal');
      return;
    }

    const storedFilter = getAthleteOrgFilter(user.id);

    // Validate stored filter
    if (storedFilter === 'all' || storedFilter === 'personal') {
      setFilterModeState(storedFilter);
    } else {
      // Check if stored org ID exists in user's organizations
      const orgExists = organizations.some(org => org.id === storedFilter);
      if (orgExists) {
        setFilterModeState(storedFilter);
      } else {
        // Invalid org ID, reset to 'all'
        setFilterModeState('all');
      }
    }
  }, [user?.id, organizations]);

  // Re-validate filter when organizations change
  useEffect(() => {
    if (!user?.id) return;

    // If current filter is an org ID, check if it still exists
    if (filterMode !== 'all' && filterMode !== 'personal') {
      const orgExists = organizations.some(org => org.id === filterMode);
      if (!orgExists) {
        // Org no longer exists, reset to 'all'
        setFilterModeState('all');
        setAthleteOrgFilter(user.id, 'all');
      }
    }
  }, [organizations, filterMode, user?.id]);

  /**
   * Set filter mode with validation and persistence
   */
  const setFilterMode = (mode: FilterMode) => {
    if (!user?.id) {
      console.warn('Cannot set filter mode without authenticated user');
      return;
    }

    // Validate org ID if not 'all' or 'personal'
    if (mode !== 'all' && mode !== 'personal') {
      const orgExists = organizations.some(org => org.id === mode);
      if (!orgExists) {
        console.warn(`Organization ${mode} not found in user's organizations, defaulting to 'all'`);
        setFilterModeState('all');
        setAthleteOrgFilter(user.id, 'all');
        return;
      }
    }

    // Update state and persist
    setFilterModeState(mode);
    setAthleteOrgFilter(user.id, mode);
  };

  return (
    <AthleteOrgContext.Provider
      value={{
        filterMode,
        setFilterMode,
        organizations,
      }}
    >
      {children}
    </AthleteOrgContext.Provider>
  );
}

/**
 * Hook to access athlete organization context
 * @throws Error if used outside AthleteOrgProvider
 */
export function useAthleteOrg() {
  const context = useContext(AthleteOrgContext);
  if (context === undefined) {
    throw new Error('useAthleteOrg must be used within an AthleteOrgProvider');
  }
  return context;
}
