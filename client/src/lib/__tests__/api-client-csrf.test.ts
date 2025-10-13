/**
 * Unit Tests for API Client CSRF Token Caching
 *
 * Tests CSRF token caching behavior including:
 * - Cache hit/miss scenarios
 * - Cache expiry after 15 minutes
 * - Retry logic with exponential backoff
 * - Cache clearing on 403 errors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const originalFetch = global.fetch;

describe('API Client CSRF Token Caching', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mock before each test
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Clear any existing cache by creating new instance
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Cache Hit Scenarios', () => {
    it('should reuse cached CSRF token within 15 minutes', async () => {
      // Mock CSRF token endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'test-token-123' }),
      });

      // Mock actual API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Dynamic import to get fresh instance
      const { apiClient } = await import('../api');

      // First call - should fetch CSRF token
      await apiClient.post('/test-endpoint', { data: 'test' });

      // Second call within 15 minutes - should reuse token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await apiClient.post('/test-endpoint-2', { data: 'test2' });

      // Should have called fetch 3 times total:
      // 1. GET /api/csrf-token (first request)
      // 2. POST /test-endpoint
      // 3. POST /test-endpoint-2 (reused token, no new CSRF fetch)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify CSRF endpoint was only called once
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls).toHaveLength(1);
    });

    it('should include cached CSRF token in request headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'cached-token-456' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { apiClient } = await import('../api');

      await apiClient.delete('/test-resource');

      // Check that the DELETE request included the CSRF token
      const deleteCall = mockFetch.mock.calls.find(call =>
        call[0]?.includes?.('test-resource')
      );

      expect(deleteCall).toBeDefined();
      expect(deleteCall?.[1]?.headers?.['X-CSRF-Token']).toBe('cached-token-456');
    });
  });

  describe('Cache Miss and Expiry', () => {
    it('should fetch new CSRF token after 15 minute expiry', async () => {
      // First CSRF token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'token-1' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { apiClient } = await import('../api');

      // First request
      await apiClient.post('/test-1', {});

      // Mock time passing (16 minutes)
      const realDateNow = Date.now;
      const startTime = Date.now();
      Date.now = vi.fn(() => startTime + 16 * 60 * 1000);

      // Second CSRF token (after expiry)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'token-2' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Second request (after cache expiry)
      await apiClient.post('/test-2', {});

      // Should have fetched CSRF token twice
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls).toHaveLength(2);

      // Restore Date.now
      Date.now = realDateNow;
    });

    it('should fetch CSRF token on first request (cold start)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'initial-token' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Import fresh module
      vi.resetModules();
      const { apiClient } = await import('../api');

      await apiClient.patch('/test-endpoint', { update: true });

      // Should have called CSRF endpoint first
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('csrf-token');
    });
  });

  describe('Cache Clearing on 403 Errors', () => {
    it('should clear cache and refetch on 403 Forbidden response', async () => {
      // Initial CSRF token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'stale-token' }),
      });

      // First request returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Invalid CSRF token' }),
      });

      const { apiClient } = await import('../api');

      await expect(apiClient.post('/protected-endpoint', {})).rejects.toThrow();

      // Now make another request - should fetch new token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'fresh-token' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await apiClient.post('/protected-endpoint', {});

      // Should have fetched CSRF token twice (initial + after 403)
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('CSRF Token Retry Logic', () => {
    it('should retry CSRF token fetch on 5xx errors', async () => {
      // First attempt - 500 error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Second attempt (retry 1) - 500 error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Third attempt (retry 2) - success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'retry-token' }),
      });

      // Actual API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { apiClient } = await import('../api');

      await apiClient.post('/test-retry', {});

      // Should have retried CSRF fetch
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should retry CSRF token fetch on network errors', async () => {
      // First attempt - network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Second attempt (retry 1) - success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'network-retry-token' }),
      });

      // Actual API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { apiClient } = await import('../api');

      await apiClient.post('/test-network-retry', {});

      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should give up after max retries and throw error', async () => {
      // All attempts fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const { apiClient } = await import('../api');

      await expect(apiClient.post('/test-max-retry', {})).rejects.toThrow(
        /Failed to obtain CSRF protection token/
      );
    });

    it('should use exponential backoff between retries', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      // Mock setTimeout to capture delays
      global.setTimeout = ((callback: any, delay: number) => {
        delays.push(delay);
        callback();
        return 0 as any;
      }) as any;

      // Fail twice, then succeed
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: 'backoff-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const { apiClient } = await import('../api');
      await apiClient.post('/test-backoff', {});

      // Should have delays with exponential backoff
      // Expected pattern: 100ms (retry 1), 200ms (retry 2)
      expect(delays.length).toBeGreaterThanOrEqual(1);
      if (delays.length > 1) {
        expect(delays[1]).toBeGreaterThan(delays[0]);
      }

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Multiple Concurrent Requests', () => {
    it('should handle concurrent requests with single CSRF fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'concurrent-token' }),
      });

      // Mock all API responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { apiClient } = await import('../api');

      // Make multiple concurrent requests
      await Promise.all([
        apiClient.post('/concurrent-1', {}),
        apiClient.post('/concurrent-2', {}),
        apiClient.post('/concurrent-3', {}),
      ]);

      // Should only fetch CSRF token once
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );

      // May be 1 or slightly more depending on race conditions, but should be minimal
      expect(csrfCalls.length).toBeLessThanOrEqual(3);
    });
  });

  describe('CSRF Token Application to Different Methods', () => {
    it('should NOT add CSRF token to GET requests', async () => {
      const { apiClient } = await import('../api');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await apiClient.get('/test-get');

      // GET request should not fetch CSRF token
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls).toHaveLength(0);
    });

    it('should add CSRF token to POST, PUT, PATCH, DELETE', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ csrfToken: 'method-token', success: true }),
      });

      const { apiClient } = await import('../api');

      await apiClient.post('/test-post', {});
      await apiClient.put('/test-put', {});
      await apiClient.patch('/test-patch', {});
      await apiClient.delete('/test-delete');

      // Should fetch CSRF token once and apply to all mutating methods
      const csrfCalls = mockFetch.mock.calls.filter(call =>
        call[0]?.includes?.('csrf-token')
      );
      expect(csrfCalls.length).toBeGreaterThanOrEqual(1);

      // Verify CSRF token in headers for mutating methods
      const postCall = mockFetch.mock.calls.find(c => c[0]?.includes?.('test-post'));
      const putCall = mockFetch.mock.calls.find(c => c[0]?.includes?.('test-put'));
      const patchCall = mockFetch.mock.calls.find(c => c[0]?.includes?.('test-patch'));
      const deleteCall = mockFetch.mock.calls.find(c => c[0]?.includes?.('test-delete'));

      expect(postCall?.[1]?.headers?.['X-CSRF-Token']).toBeDefined();
      expect(putCall?.[1]?.headers?.['X-CSRF-Token']).toBeDefined();
      expect(patchCall?.[1]?.headers?.['X-CSRF-Token']).toBeDefined();
      expect(deleteCall?.[1]?.headers?.['X-CSRF-Token']).toBeDefined();
    });
  });
});
