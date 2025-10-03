/**
 * Tests for API client CSRF token management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../api-client';

// Mock fetch
global.fetch = vi.fn();

describe('API Client CSRF Token Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any cached tokens
    apiClient.clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CSRF Token Caching', () => {
    it('should cache CSRF token and reuse it', async () => {
      const mockCsrfResponse = { csrfToken: 'test-csrf-token-123' };

      // Mock fetch for CSRF token request
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCsrfResponse,
      });

      // Mock fetch for actual API request
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      // First request should fetch CSRF token
      await apiClient.post('/test', { data: 'test' });

      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 for CSRF, 1 for API call

      // Reset mock
      (global.fetch as any).mockClear();

      // Mock only the API request (not CSRF)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      // Second request should use cached token
      await apiClient.post('/test2', { data: 'test2' });

      expect(global.fetch).toHaveBeenCalledTimes(1); // Only API call, no CSRF fetch
    });

    it('should include CSRF token in request headers', async () => {
      const mockCsrfResponse = { csrfToken: 'test-csrf-token-123' };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCsrfResponse,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiClient.post('/test', { data: 'test' });

      // Check second call (the API request) has CSRF header
      const apiCall = (global.fetch as any).mock.calls[1];
      expect(apiCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token-123');
    });
  });

  describe('CSRF Token TTL (15 minutes)', () => {
    it('should refresh expired CSRF token', async () => {
      const mockCsrfResponse1 = { csrfToken: 'token-1' };
      const mockCsrfResponse2 = { csrfToken: 'token-2' };

      // First CSRF fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCsrfResponse1,
      });

      // First API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiClient.post('/test', { data: 'test' });

      // Fast-forward time by 16 minutes (past the 15-minute TTL)
      vi.useFakeTimers();
      vi.advanceTimersByTime(16 * 60 * 1000);

      // Second CSRF fetch (due to expiration)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCsrfResponse2,
      });

      // Second API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiClient.post('/test2', { data: 'test2' });

      vi.useRealTimers();

      // Should have fetched CSRF token twice (once initially, once after expiration)
      const csrfCalls = (global.fetch as any).mock.calls.filter(
        (call: any) => call[0] === '/api/csrf-token'
      );
      expect(csrfCalls).toHaveLength(2);
    });
  });

  describe('CSRF Token Retry Logic', () => {
    it('should retry CSRF fetch on failure with exponential backoff', async () => {
      vi.useFakeTimers();

      // Fail first 2 attempts, succeed on 3rd
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: 'retry-token' }),
        });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      const promise = apiClient.post('/test', { data: 'test' });

      // Advance through retry delays
      await vi.runAllTimersAsync();

      await promise;

      vi.useRealTimers();

      // Should have attempted CSRF fetch 3 times
      const csrfCalls = (global.fetch as any).mock.calls.filter(
        (call: any) => call[0] === '/api/csrf-token'
      );
      expect(csrfCalls).toHaveLength(3);
    });

    it('should fail after max retries (3 attempts)', async () => {
      vi.useFakeTimers();

      // Fail all attempts
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const promise = apiClient.post('/test', { data: 'test' });

      // Advance through all retry delays and expect rejection
      try {
        await vi.runAllTimersAsync();
        await promise;
        expect.fail('Expected promise to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('Unable to establish secure connection');
      }

      vi.useRealTimers();

      // Should have attempted CSRF fetch 4 times (initial + 3 retries)
      const csrfCalls = (global.fetch as any).mock.calls.filter(
        (call: any) => call[0] === '/api/csrf-token'
      );
      expect(csrfCalls).toHaveLength(4);
    });
  });

  describe('CSRF Token Clearing', () => {
    it('should clear CSRF token on 403 response', async () => {
      const mockCsrfResponse = { csrfToken: 'test-token' };

      // First CSRF fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCsrfResponse,
      });

      // API call returns 403
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Invalid CSRF token' }),
      });

      await expect(apiClient.post('/test', { data: 'test' })).rejects.toThrow();

      // Next request should fetch new CSRF token
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'new-token' }),
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiClient.post('/test2', { data: 'test2' });

      // Should have fetched CSRF token twice
      const csrfCalls = (global.fetch as any).mock.calls.filter(
        (call: any) => call[0] === '/api/csrf-token'
      );
      expect(csrfCalls).toHaveLength(2);
    });

    it('should allow manual token clearing', () => {
      // This is more of a smoke test since we can't easily inspect private fields
      expect(() => apiClient.clearCsrfToken()).not.toThrow();
    });
  });

  describe('Non-mutating requests', () => {
    it('should not fetch CSRF token for GET requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: 'test' }),
      });

      await apiClient.get('/test');

      // Should only have 1 fetch call (the GET request, no CSRF)
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as any).mock.calls[0][0]).not.toBe('/api/csrf-token');
    });
  });
});
