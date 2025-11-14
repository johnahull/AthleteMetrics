/**
 * Custom hook for generating breadcrumb navigation items
 * Provides consistent breadcrumb trails across the application
 */

import { useMemo } from 'react';
import { Home, Users, FileText, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
}

interface EntityData {
  name?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

type PageType = 'athlete' | 'team' | 'report';

/**
 * Generate breadcrumb navigation items based on page type and entity data
 *
 * @param type - Type of page (athlete, team, or report)
 * @param entityData - Optional data about the current entity (name, fullName, etc.)
 * @returns Array of breadcrumb items
 *
 * @example
 * // Athlete profile page
 * const breadcrumbs = useBreadcrumbs('athlete', { fullName: 'John Smith' });
 * // Returns: [Dashboard, Athletes, John Smith]
 *
 * @example
 * // Team page
 * const breadcrumbs = useBreadcrumbs('team', { name: 'Varsity Soccer' });
 * // Returns: [Dashboard, Teams, Varsity Soccer]
 */
export function useBreadcrumbs(
  type: PageType,
  entityData?: EntityData
): BreadcrumbItem[] {
  return useMemo(() => {
    const breadcrumbs: BreadcrumbItem[] = [
      {
        label: 'Dashboard',
        href: '/',
        icon: Home,
      },
    ];

    // Add middle breadcrumb based on page type
    switch (type) {
      case 'athlete':
        breadcrumbs.push({
          label: 'Athletes',
          href: '/athletes',
          icon: Users,
        });
        break;
      case 'team':
        breadcrumbs.push({
          label: 'Teams',
          href: '/teams',
          icon: Users,
        });
        break;
      case 'report':
        breadcrumbs.push({
          label: 'Reports',
          href: '/reports',
          icon: FileText,
        });
        break;
    }

    // Add current page breadcrumb (no href)
    let currentLabel = '';
    let currentIcon: LucideIcon | undefined;

    if (type === 'athlete') {
      // Build athlete name from available data
      if (entityData?.fullName && entityData.fullName.trim()) {
        currentLabel = entityData.fullName;
      } else if (entityData?.firstName && entityData?.lastName) {
        currentLabel = `${entityData.firstName} ${entityData.lastName}`;
      } else if (entityData?.firstName && entityData.firstName.trim()) {
        currentLabel = entityData.firstName;
      } else {
        currentLabel = 'Athlete';
      }
      currentIcon = User;
    } else if (type === 'team') {
      currentLabel = (entityData?.name && entityData.name.trim()) ? entityData.name : 'Team';
      currentIcon = Users;
    } else if (type === 'report') {
      currentLabel = (entityData?.name && entityData.name.trim()) ? entityData.name : 'Report';
      currentIcon = FileText;
    }

    breadcrumbs.push({
      label: currentLabel,
      icon: currentIcon,
      // No href for current page
    });

    return breadcrumbs;
  }, [type, entityData?.name, entityData?.firstName, entityData?.lastName, entityData?.fullName]);
}
