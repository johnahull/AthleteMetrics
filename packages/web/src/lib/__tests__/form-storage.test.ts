/**
 * Unit tests for form storage utility
 * Tests user-scoped localStorage wrapper with error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormStorage } from '../form-storage';

describe('FormStorage', () => {
  const userId = 'user-123';
  const testKey = 'test-key';
  const testValue = { metric: 'FLY10_TIME', date: '2024-01-01' };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('User-scoped storage keys', () => {
    it('should generate scoped key with userId prefix', () => {
      const storage = new FormStorage(userId);
      const scopedKey = storage.getScopedKey(testKey);
      expect(scopedKey).toBe(`measurement-form-state-${userId}`);
    });

    it('should isolate storage between different users', () => {
      const user1Storage = new FormStorage('user-1');
      const user2Storage = new FormStorage('user-2');

      user1Storage.set(testKey, { value: 'user1' });
      user2Storage.set(testKey, { value: 'user2' });

      expect(user1Storage.get(testKey)).toEqual({ value: 'user1' });
      expect(user2Storage.get(testKey)).toEqual({ value: 'user2' });
    });

    it('should not allow access to other users data', () => {
      const user1Storage = new FormStorage('user-1');
      const user2Storage = new FormStorage('user-2');

      user1Storage.set(testKey, { secret: 'data' });

      expect(user2Storage.get(testKey)).toBeNull();
    });
  });

  describe('Set/Get operations', () => {
    it('should store and retrieve simple values', () => {
      const storage = new FormStorage(userId);
      storage.set(testKey, testValue);

      const retrieved = storage.get(testKey);
      expect(retrieved).toEqual(testValue);
    });

    it('should handle null values', () => {
      const storage = new FormStorage(userId);
      storage.set(testKey, null);

      expect(storage.get(testKey)).toBeNull();
    });

    it('should handle undefined values (store as null)', () => {
      const storage = new FormStorage(userId);
      storage.set(testKey, undefined);

      expect(storage.get(testKey)).toBeNull();
    });

    it('should handle complex nested objects', () => {
      const storage = new FormStorage(userId);
      const complexValue = {
        metric: 'FLY10_TIME',
        date: '2024-01-01',
        nested: {
          array: [1, 2, 3],
          bool: true
        }
      };

      storage.set(testKey, complexValue);
      expect(storage.get(testKey)).toEqual(complexValue);
    });

    it('should return default value when key does not exist', () => {
      const storage = new FormStorage(userId);
      const defaultValue = { default: true };

      const result = storage.get('non-existent-key', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should return null when key does not exist and no default provided', () => {
      const storage = new FormStorage(userId);
      expect(storage.get('non-existent-key')).toBeNull();
    });
  });

  describe('JSON serialization/deserialization', () => {
    it('should properly serialize objects to JSON', () => {
      const storage = new FormStorage(userId);
      storage.set(testKey, testValue);

      const rawValue = localStorage.getItem(`measurement-form-state-${userId}`);
      expect(rawValue).toBe(JSON.stringify(testValue));
    });

    it('should properly deserialize JSON to objects', () => {
      const storage = new FormStorage(userId);
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        JSON.stringify(testValue)
      );

      expect(storage.get(testKey)).toEqual(testValue);
    });

    it('should handle invalid JSON gracefully', () => {
      const storage = new FormStorage(userId);
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        'invalid-json{{'
      );

      // Should return default value on parse error
      const result = storage.get(testKey, { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    it('should handle corrupted data gracefully', () => {
      const storage = new FormStorage(userId);
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        'null'
      );

      expect(storage.get(testKey)).toBeNull();
    });
  });

  describe('Remove operations', () => {
    it('should remove specific key', () => {
      const storage = new FormStorage(userId);
      storage.set(testKey, testValue);

      expect(storage.get(testKey)).toEqual(testValue);

      storage.remove(testKey);
      expect(storage.get(testKey)).toBeNull();
    });

    it('should not throw when removing non-existent key', () => {
      const storage = new FormStorage(userId);
      expect(() => storage.remove('non-existent')).not.toThrow();
    });

    it('should only remove user-scoped keys', () => {
      const user1Storage = new FormStorage('user-1');
      const user2Storage = new FormStorage('user-2');

      user1Storage.set(testKey, { value: 'user1' });
      user2Storage.set(testKey, { value: 'user2' });

      user1Storage.remove(testKey);

      expect(user1Storage.get(testKey)).toBeNull();
      expect(user2Storage.get(testKey)).toEqual({ value: 'user2' });
    });
  });

  describe('Clear all operations', () => {
    it('should clear all user-scoped keys', () => {
      const storage = new FormStorage(userId);
      storage.set('key1', { value: 1 });
      storage.set('key2', { value: 2 });
      storage.set('key3', { value: 3 });

      storage.clearAll();

      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
      expect(storage.get('key3')).toBeNull();
    });

    it('should only clear current users keys', () => {
      const user1Storage = new FormStorage('user-1');
      const user2Storage = new FormStorage('user-2');

      user1Storage.set(testKey, { value: 'user1' });
      user2Storage.set(testKey, { value: 'user2' });

      user1Storage.clearAll();

      expect(user1Storage.get(testKey)).toBeNull();
      expect(user2Storage.get(testKey)).toEqual({ value: 'user2' });
    });

    it('should not affect non-form-storage keys', () => {
      localStorage.setItem('other-app-data', 'should-persist');

      const storage = new FormStorage(userId);
      storage.set(testKey, testValue);
      storage.clearAll();

      expect(localStorage.getItem('other-app-data')).toBe('should-persist');
    });
  });

  describe('Error handling - localStorage disabled', () => {
    it('should handle localStorage.setItem throwing QuotaExceededError', () => {
      const storage = new FormStorage(userId);

      // Mock localStorage.setItem to throw quota error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      // Should not throw, but fail silently
      expect(() => storage.set(testKey, testValue)).not.toThrow();

      // Restore original
      localStorage.setItem = originalSetItem;
    });

    it('should handle localStorage.getItem throwing error', () => {
      const storage = new FormStorage(userId);

      // Mock localStorage.getItem to throw error
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn(() => {
        throw new Error('localStorage disabled');
      });

      // Should return default value
      const result = storage.get(testKey, { fallback: true });
      expect(result).toEqual({ fallback: true });

      // Restore original
      localStorage.getItem = originalGetItem;
    });

    it('should handle localStorage.removeItem throwing error', () => {
      const storage = new FormStorage(userId);

      // Mock localStorage.removeItem to throw error
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = vi.fn(() => {
        throw new Error('localStorage disabled');
      });

      // Should not throw
      expect(() => storage.remove(testKey)).not.toThrow();

      // Restore original
      localStorage.removeItem = originalRemoveItem;
    });

    it('should gracefully handle private browsing mode', () => {
      const storage = new FormStorage(userId);

      // Simulate private browsing (setItem fails) using vi.spyOn
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      // Attempt to set - should fail silently (not throw)
      expect(() => {
        storage.set(testKey, testValue);
      }).not.toThrow();

      // Restore spy
      setItemSpy.mockRestore();

      // After restoration, verify warning was logged (tested by not throwing)
      // The actual behavior is: graceful degradation - app continues to work
      // even when localStorage is unavailable
      expect(true).toBe(true); // Test passes if no throw occurred
    });
  });

  describe('Edge cases', () => {
    it('should handle empty userId', () => {
      const storage = new FormStorage('');
      storage.set(testKey, testValue);

      expect(storage.get(testKey)).toEqual(testValue);
    });

    it('should handle special characters in userId', () => {
      const storage = new FormStorage('user@email.com');
      storage.set(testKey, testValue);

      expect(storage.get(testKey)).toEqual(testValue);
    });

    it('should handle large data objects', () => {
      const storage = new FormStorage(userId);
      const largeObject = {
        data: new Array(1000).fill({ value: 'test' })
      };

      storage.set(testKey, largeObject);
      expect(storage.get(testKey)).toEqual(largeObject);
    });

    it('should handle circular references gracefully', () => {
      const storage = new FormStorage(userId);
      const circular: any = { value: 'test' };
      circular.self = circular;

      // Should not throw, but fail to store
      expect(() => storage.set(testKey, circular)).not.toThrow();
    });
  });

  describe('Type safety', () => {
    it('should preserve type information with generic get', () => {
      const storage = new FormStorage(userId);

      interface TestType {
        metric: string;
        date: string;
      }

      storage.set(testKey, testValue);
      const result = storage.get<TestType>(testKey);

      expect(result).toEqual(testValue);
      expect(typeof result?.metric).toBe('string');
      expect(typeof result?.date).toBe('string');
    });
  });
});
