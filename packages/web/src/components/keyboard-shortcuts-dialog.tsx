/**
 * Keyboard Shortcuts Help Dialog
 * Shows available keyboard shortcuts to users
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS, getShortcutDisplay } from '@/lib/hotkeys';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@shared/role-types';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { user } = useAuth();

  // Detect if user is on Mac
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // Filter shortcuts based on user permissions
  const availableShortcuts = KEYBOARD_SHORTCUTS.filter(shortcut => {
    // If no permission required, show to everyone
    if (!shortcut.requiredPermission) {
      return true;
    }

    // Check if user has required permission
    if (!user) {
      return false;
    }

    // Site admins have all permissions
    if (user.isSiteAdmin) {
      return true;
    }

    // Check role-based permissions
    const role = user.currentOrganization?.role || user.role;
    if (!role) {
      return false;
    }

    return hasPermission(role, shortcut.requiredPermission);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription>
            Use these shortcuts to navigate faster
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {availableShortcuts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No keyboard shortcuts available for your role.
            </p>
          ) : (
            <div className="space-y-3">
              {availableShortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {shortcut.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md shadow-sm">
                      {getShortcutDisplay(shortcut, isMac)}
                    </kbd>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">?</kbd> anytime to see this help
        </div>
      </DialogContent>
    </Dialog>
  );
}
