/**
 * Unit tests for hotkeys utility functions
 * Tests keyboard shortcut configuration and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isInputElement,
  shouldIgnoreEvent,
  KEYBOARD_SHORTCUTS,
  type KeyboardShortcut
} from '../hotkeys';

describe('hotkeys utilities', () => {
  describe('isInputElement', () => {
    it('should return true for input element', () => {
      const input = document.createElement('input');
      expect(isInputElement(input)).toBe(true);
    });

    it('should return true for textarea element', () => {
      const textarea = document.createElement('textarea');
      expect(isInputElement(textarea)).toBe(true);
    });

    it('should return true for select element', () => {
      const select = document.createElement('select');
      expect(isInputElement(select)).toBe(true);
    });

    it('should return true for contenteditable div', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      expect(isInputElement(div)).toBe(true);
    });

    it('should return false for regular div', () => {
      const div = document.createElement('div');
      expect(isInputElement(div)).toBe(false);
    });

    it('should return false for button element', () => {
      const button = document.createElement('button');
      expect(isInputElement(button)).toBe(false);
    });

    it('should return false for span element', () => {
      const span = document.createElement('span');
      expect(isInputElement(span)).toBe(false);
    });

    it('should handle null target', () => {
      expect(isInputElement(null)).toBe(false);
    });
  });

  describe('shouldIgnoreEvent', () => {
    it('should ignore event from input field', () => {
      const input = document.createElement('input');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: input, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(true);
    });

    it('should ignore event from textarea', () => {
      const textarea = document.createElement('textarea');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: textarea, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(true);
    });

    it('should ignore event from select', () => {
      const select = document.createElement('select');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: select, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(true);
    });

    it('should ignore event from contenteditable', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(true);
    });

    it('should NOT ignore event from regular div', () => {
      const div = document.createElement('div');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(false);
    });

    it('should NOT ignore event from button', () => {
      const button = document.createElement('button');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: button, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(false);
    });

    it('should handle event with null target', () => {
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: null, enumerable: true });

      expect(shouldIgnoreEvent(event)).toBe(false);
    });
  });

  describe('KEYBOARD_SHORTCUTS configuration', () => {
    it('should have measurement shortcut defined', () => {
      const measurementShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'measurement');
      expect(measurementShortcut).toBeDefined();
      expect(measurementShortcut?.key).toBe('m');
      expect(measurementShortcut?.modifiers).toContain('ctrl');
      expect(measurementShortcut?.modifiers).toContain('meta');
    });

    it('should have help shortcut defined', () => {
      const helpShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'help');
      expect(helpShortcut).toBeDefined();
      expect(helpShortcut?.key).toBe('?');
    });

    it('should have escape shortcut defined', () => {
      const escapeShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'escape');
      expect(escapeShortcut).toBeDefined();
      expect(escapeShortcut?.key).toBe('Escape');
    });

    it('measurement shortcut should require CREATE_MEASUREMENTS permission', () => {
      const measurementShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'measurement');
      expect(measurementShortcut?.requiredPermission).toBe('CREATE_MEASUREMENTS');
    });

    it('help shortcut should have no permission requirement', () => {
      const helpShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'help');
      expect(helpShortcut?.requiredPermission).toBeUndefined();
    });

    it('escape shortcut should have no permission requirement', () => {
      const escapeShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'escape');
      expect(escapeShortcut?.requiredPermission).toBeUndefined();
    });

    it('should have display labels for all shortcuts', () => {
      KEYBOARD_SHORTCUTS.forEach(shortcut => {
        expect(shortcut.displayLabel).toBeDefined();
        expect(shortcut.displayLabel.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptions for all shortcuts', () => {
      KEYBOARD_SHORTCUTS.forEach(shortcut => {
        expect(shortcut.description).toBeDefined();
        expect(shortcut.description.length).toBeGreaterThan(0);
      });
    });

    it('measurement shortcut should have both ctrl and meta modifiers', () => {
      const measurementShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'measurement');
      expect(measurementShortcut?.modifiers).toEqual(expect.arrayContaining(['ctrl', 'meta']));
    });

    it('help shortcut should have shift modifier', () => {
      const helpShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'help');
      expect(helpShortcut?.modifiers).toEqual(['shift']);
    });

    it('escape shortcut should have no modifiers', () => {
      const escapeShortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'escape');
      expect(escapeShortcut?.modifiers).toEqual([]);
    });
  });

  describe('KeyboardShortcut type validation', () => {
    it('should accept valid shortcut configuration', () => {
      const validShortcut: KeyboardShortcut = {
        id: 'test',
        key: 't',
        modifiers: ['ctrl'],
        displayLabel: 'Ctrl+T',
        description: 'Test shortcut',
        requiredPermission: 'VIEW_ANALYTICS'
      };

      expect(validShortcut.id).toBe('test');
      expect(validShortcut.key).toBe('t');
      expect(validShortcut.modifiers).toEqual(['ctrl']);
    });

    it('should accept shortcut without modifiers', () => {
      const validShortcut: KeyboardShortcut = {
        id: 'test',
        key: 'Escape',
        modifiers: [],
        displayLabel: 'Esc',
        description: 'Test escape'
      };

      expect(validShortcut.modifiers).toEqual([]);
    });

    it('should accept shortcut without permission requirement', () => {
      const validShortcut: KeyboardShortcut = {
        id: 'test',
        key: '?',
        modifiers: ['shift'],
        displayLabel: '?',
        description: 'Test help'
      };

      expect(validShortcut.requiredPermission).toBeUndefined();
    });
  });
});
