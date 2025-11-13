/**
 * useKeyboardShortcuts Hook
 * Manages global keyboard shortcuts with permission checking
 */

import { useEffect } from 'react';
import type { EnhancedUser } from '@/lib/types/user';
import { hasPermission } from '@shared/role-types';
import { shouldIgnoreEvent } from '@/lib/hotkeys';

export interface UseKeyboardShortcutsOptions {
  user: EnhancedUser | null;
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
  const { user, onMeasurement, onHelp, onEscape } = options;

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
        if (user && hasUserPermission(user, 'CREATE_MEASUREMENTS')) {
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
  }, [user, onMeasurement, onHelp, onEscape]);
}

/**
 * Helper function to check if user has a specific permission
 * Works with both site admins and role-based users
 */
function hasUserPermission(user: EnhancedUser, permission: 'CREATE_MEASUREMENTS'): boolean {
  // Site admins have all permissions
  if (user.isSiteAdmin) {
    return true;
  }

  // Check role-based permissions
  const role = user.currentOrganization?.role || user.role;
  if (!role) {
    return false;
  }

  return hasPermission(role, permission);
}
