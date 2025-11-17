/**
 * Command palette action registry
 * Defines all quick actions available in the command palette
 */

import { type LucideIcon, UserPlus, Activity, Users, Upload, BarChart, Settings } from 'lucide-react';
import { type Permission } from '@shared/role-types';

export interface CommandAction {
  id: string;
  title: string;
  icon: LucideIcon;
  keywords: string[];
  permission?: Permission;
  action: () => void;
}

/**
 * Get all command actions with navigation callbacks
 */
export function getCommandActions(navigate: (path: string) => void): CommandAction[] {
  return [
    {
      id: 'add-athlete',
      title: 'Add Athlete',
      icon: UserPlus,
      keywords: ['add', 'create', 'new', 'athlete', 'player', 'user'],
      permission: 'CREATE_TEAM', // Users who can create teams can also add athletes
      action: () => navigate('/athletes?action=add'),
    },
    {
      id: 'add-measurement',
      title: 'Add Measurement',
      icon: Activity,
      keywords: ['add', 'record', 'test', 'measurement', 'performance', 'metric'],
      permission: 'CREATE_MEASUREMENTS',
      action: () => navigate('/data-entry'),
    },
    {
      id: 'add-team',
      title: 'Add Team',
      icon: Users,
      keywords: ['add', 'create', 'team', 'group', 'squad'],
      permission: 'CREATE_TEAM',
      action: () => navigate('/teams?action=add'),
    },
    {
      id: 'import-csv',
      title: 'Import CSV',
      icon: Upload,
      keywords: ['import', 'csv', 'upload', 'file', 'bulk', 'data'],
      permission: 'IMPORT_MEASUREMENTS',
      action: () => navigate('/import'),
    },
    {
      id: 'analytics',
      title: 'View Analytics',
      icon: BarChart,
      keywords: ['analytics', 'dashboard', 'stats', 'reports', 'chart', 'graph', 'metrics'],
      permission: 'VIEW_ANALYTICS',
      action: () => navigate('/analytics'),
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config', 'configuration', 'options'],
      permission: 'CONFIGURE_SETTINGS',
      action: () => navigate('/settings'),
    },
  ];
}

/**
 * Filter actions by search query
 */
export function filterActionsByQuery(actions: CommandAction[], query: string): CommandAction[] {
  if (!query) return actions;

  const lowerQuery = query.toLowerCase();

  return actions.filter((action) => {
    // Check if query matches title
    if (action.title.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check if query matches any keyword
    return action.keywords.some((keyword) => keyword.includes(lowerQuery) || lowerQuery.includes(keyword));
  });
}

/**
 * Filter actions by user permissions
 */
export function filterActionsByPermissions(
  actions: CommandAction[],
  hasPermission: (permission: Permission) => boolean
): CommandAction[] {
  return actions.filter((action) => {
    // If action has no permission requirement, show it to everyone
    if (!action.permission) {
      return true;
    }

    // Otherwise, check if user has the required permission
    return hasPermission(action.permission);
  });
}
