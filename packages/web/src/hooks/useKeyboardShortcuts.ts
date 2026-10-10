/**
 * useKeyboardShortcuts Hook
 * Manages global keyboard shortcuts with permission checking
 */

import { useEffect } from 'react';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';
import { anyOrgGrants } from '@/lib/org-roles';
import { shouldIgnoreEvent } from '@/lib/hotkeys';

export interface UseKeyboardShortcutsOptions {
  user: EnhancedUser | null;
  /**
   * The user's memberships (useAuth().userOrganizations); they decide CREATE_MEASUREMENTS.
   * Optional, but omitting it (or passing null) fails closed: no org-gated shortcut fires
   * (site admins excepted).
   */
  userOrganizations?: UserOrganization[] | null;
  onMeasurement?: () => void;
  onHelp?: () => void;
  onEscape?: () => void;
}

/**
 * Global keyboard shortcuts hook
 * Handles:
 * - Ctrl+M / Cmd+M: Open measurement modal (requires CREATE_MEASUREMENTS permission)
 * - ?: Show keyboard shortcuts help dialog
 * - Escape: Close modals (if handler provided)
 *
 * Automatically ignores events when typing in input fields
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const { user, userOrganizations, onMeasurement, onHelp, onEscape } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore keyboard events when typing in input fields
      if (shouldIgnoreEvent(event)) {
        return;
      }

      const key = event.key.toLowerCase();

      // Ctrl+M or Cmd+M - Open measurement modal
      if ((event.ctrlKey || event.metaKey) && key === 'm') {
        // Check if user has CREATE_MEASUREMENTS permission
        if (user && hasUserPermission(user, userOrganizations, 'CREATE_MEASUREMENTS')) {
          event.preventDefault();
          onMeasurement?.();
        }
        return;
      }

      // ? - Show help dialog (no permission required)
      if (event.key === '?' && event.shiftKey) {
        event.preventDefault();
        onHelp?.();
        return;
      }

      // Escape - Close modals (no permission required)
      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [user, userOrganizations, onMeasurement, onHelp, onEscape]);
}

/**
 * Whether the user has the permission in at least one of their organizations (site admins
 * always do). No single organization is in scope for an app-wide shortcut, so this asks every
 * membership rather than the session role; the API checks the row's org.
 */
function hasUserPermission(
  user: EnhancedUser,
  userOrganizations: UserOrganization[] | null | undefined,
  permission: 'CREATE_MEASUREMENTS'
): boolean {
  return anyOrgGrants(user, userOrganizations, permission);
}
