/**
 * Keyboard Shortcuts Help Modal
 * Displays all available keyboard shortcuts for the application
 * Dynamically reads shortcuts from hotkeys.ts configuration
 */

import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';
import { KEYBOARD_SHORTCUTS, getShortcutDisplay } from '@/lib/hotkeys';
import type { KeyboardShortcut } from '@/lib/hotkeys';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Convert hotkeys.ts shortcut format to display format
 */
interface DisplayShortcut {
  keys: string[];
  description: string;
  category: string;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  // Detect platform
  const isMac = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  }, []);

  // Convert hotkeys.ts shortcuts to display format
  const displayShortcuts = useMemo(() => {
    return KEYBOARD_SHORTCUTS.map((shortcut): DisplayShortcut => {
      // Get platform-specific display string
      const displayString = getShortcutDisplay(shortcut, isMac);

      // Split the display string into individual keys
      // e.g., "Cmd+K" -> ["Cmd", "K"], "?" -> ["?"], "Esc" -> ["Esc"]
      const keys = displayString.includes('+')
        ? displayString.split('+')
        : [displayString];

      return {
        keys,
        description: shortcut.description,
        category: shortcut.category
      };
    });
  }, [isMac]);

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    return displayShortcuts.reduce((acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    }, {} as Record<string, DisplayShortcut[]>);
  }, [displayShortcuts]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[500px]"
        aria-labelledby="keyboard-shortcuts-title"
        aria-describedby="keyboard-shortcuts-description"
      >
        <DialogHeader>
          <DialogTitle id="keyboard-shortcuts-title" className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription id="keyboard-shortcuts-description">
            Quick reference for keyboard shortcuts available in AthleteMetrics
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span
                      className="text-sm"
                      data-shortcut-description
                    >
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <React.Fragment key={keyIndex}>
                          <kbd
                            data-shortcut-key
                            className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border rounded-md shadow-sm"
                          >
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground mx-0.5">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted border border-border rounded">Esc</kbd> to close this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
