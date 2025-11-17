/**
 * Keyboard shortcut configuration and utilities
 * Defines global keyboard shortcuts and helper functions
 */

import type { Permission } from '@shared/role-types';

export type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta';

export interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers: Modifier[];
  displayLabel: string;
  description: string;
  category: 'Command Palette' | 'Navigation' | 'Actions';
  requiredPermission?: Permission;
}

/**
 * Global keyboard shortcuts configuration
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'command-palette',
    key: 'k',
    modifiers: ['ctrl', 'meta'], // Both Ctrl (Windows/Linux) and Cmd (Mac)
    displayLabel: 'Ctrl+K / Cmd+K',
    description: 'Open command palette',
    category: 'Command Palette'
  },
  {
    id: 'measurement',
    key: 'm',
    modifiers: ['ctrl', 'meta'], // Both Ctrl (Windows/Linux) and Cmd (Mac)
    displayLabel: 'Ctrl+M / Cmd+M',
    description: 'Quick add measurement',
    category: 'Actions',
    requiredPermission: 'CREATE_MEASUREMENTS'
  },
  {
    id: 'help',
    key: '?',
    modifiers: ['shift'],
    displayLabel: '?',
    description: 'Show keyboard shortcuts help',
    category: 'Command Palette'
  },
  {
    id: 'escape',
    key: 'Escape',
    modifiers: [],
    displayLabel: 'Esc',
    description: 'Close modals and dialogs',
    category: 'Navigation'
  }
];

/**
 * Check if the target element is an input field
 * Returns true for input, textarea, select, and contenteditable elements
 */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;

  const element = target as HTMLElement;
  const tagName = element.tagName?.toLowerCase();

  // Check for input, textarea, select
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // Check for contenteditable
  if (element.contentEditable === 'true') {
    return true;
  }

  return false;
}

/**
 * Check if keyboard event should be ignored (e.g., when typing in input fields)
 */
export function shouldIgnoreEvent(event: KeyboardEvent): boolean {
  return isInputElement(event.target);
}

/**
 * Get display string for keyboard shortcut based on platform
 */
export function getShortcutDisplay(shortcut: KeyboardShortcut, isMac: boolean = false): string {
  if (shortcut.modifiers.includes('ctrl') && shortcut.modifiers.includes('meta')) {
    // Special case for shortcuts that work with both Ctrl and Cmd
    return isMac
      ? `Cmd+${shortcut.key.toUpperCase()}`
      : `Ctrl+${shortcut.key.toUpperCase()}`;
  }

  const modifiers = shortcut.modifiers.map(mod => {
    switch (mod) {
      case 'ctrl':
        return isMac ? 'Control' : 'Ctrl';
      case 'meta':
        return isMac ? 'Cmd' : 'Meta';
      case 'shift':
        return 'Shift';
      case 'alt':
        return isMac ? 'Option' : 'Alt';
      default:
        return mod;
    }
  });

  if (modifiers.length === 0) {
    return shortcut.key;
  }

  return `${modifiers.join('+')}+${shortcut.key.toUpperCase()}`;
}
