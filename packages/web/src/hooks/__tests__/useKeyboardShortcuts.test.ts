/**
 * Unit tests for useKeyboardShortcuts hook
 * Tests keyboard shortcut functionality with permission checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import type { EnhancedUser } from '@/lib/types/user';

describe('useKeyboardShortcuts', () => {
  let mockUser: EnhancedUser | null;
  let mockOnMeasurement: ReturnType<typeof vi.fn>;
  let mockOnHelp: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnMeasurement = vi.fn();
    mockOnHelp = vi.fn();
    mockUser = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Permission Checking', () => {
    it('should trigger Ctrl+M for coach role', () => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };

      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Simulate Ctrl+M
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should trigger Ctrl+M for org_admin role', () => {
      mockUser = {
        id: '1',
        username: 'admin1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'org_admin'
        }
      };

      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Simulate Ctrl+M
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should trigger Ctrl+M for site_admin role', () => {
      mockUser = {
        id: '1',
        username: 'siteadmin',
        email: 'siteadmin@test.com',
        firstName: 'Site',
        lastName: 'Admin',
        isSiteAdmin: true,
        role: 'site_admin'
      };

      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Simulate Ctrl+M
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger Ctrl+M for athlete role', () => {
      mockUser = {
        id: '1',
        username: 'athlete1',
        email: 'athlete@test.com',
        firstName: 'Athlete',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'athlete'
        }
      };

      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Simulate Ctrl+M
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();
    });

    it('should NOT trigger Ctrl+M for null user', () => {
      renderHook(() => useKeyboardShortcuts({
        user: null,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Simulate Ctrl+M
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+M and Cmd+M (Mac) Support', () => {
    beforeEach(() => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };
    });

    it('should trigger on Ctrl+M (Windows/Linux)', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        metaKey: false,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should trigger on Cmd+M (Mac)', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: false,
        metaKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger on M without modifier', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();
    });

    it('should NOT trigger on Shift+M', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('Input Field Detection', () => {
    beforeEach(() => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };
    });

    it('should NOT trigger when typing in input field', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should NOT trigger when typing in textarea', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('should NOT trigger when typing in select', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const select = document.createElement('select');
      document.body.appendChild(select);

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: select, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();

      document.body.removeChild(select);
    });

    it('should NOT trigger when typing in contenteditable', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });

    it('should trigger when not in input field', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const div = document.createElement('div');
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);

      document.body.removeChild(div);
    });
  });

  describe('Help Dialog (? key)', () => {
    beforeEach(() => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };
    });

    it('should trigger help dialog on ? key', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: '?',
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnHelp).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger help dialog when typing ? in input', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: '?',
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input, enumerable: true });
      document.dispatchEvent(event);

      expect(mockOnHelp).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should trigger help dialog regardless of user role', () => {
      const athleteUser: EnhancedUser = {
        id: '1',
        username: 'athlete1',
        email: 'athlete@test.com',
        firstName: 'Athlete',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'athlete'
        }
      };

      renderHook(() => useKeyboardShortcuts({
        user: athleteUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: '?',
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnHelp).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Cleanup', () => {
    it('should remove event listeners on unmount', () => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };

      const { unmount } = renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      // Unmount the hook
      unmount();

      // Try to trigger after unmount
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      // Should not be called after unmount
      expect(mockOnMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('Case Sensitivity', () => {
    beforeEach(() => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };
    });

    it('should work with lowercase m', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });

    it('should work with uppercase M', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'M',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(mockOnMeasurement).toHaveBeenCalledTimes(1);
    });
  });

  describe('preventDefault Behavior', () => {
    beforeEach(() => {
      mockUser = {
        id: '1',
        username: 'coach1',
        email: 'coach@test.com',
        firstName: 'Coach',
        lastName: 'User',
        isSiteAdmin: false,
        currentOrganization: {
          id: 'org1',
          name: 'Test Org',
          role: 'coach'
        }
      };
    });

    it('should preventDefault when handling Ctrl+M', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should preventDefault when handling ?', () => {
      renderHook(() => useKeyboardShortcuts({
        user: mockUser,
        onMeasurement: mockOnMeasurement,
        onHelp: mockOnHelp,
      }));

      const event = new KeyboardEvent('keydown', {
        key: '?',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});
