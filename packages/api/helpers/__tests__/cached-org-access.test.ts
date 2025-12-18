import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Request } from 'express';
import { getCachedUserOrganizations } from '../cached-org-access';
import { storage } from '../../storage';

// Mock storage module
vi.mock('../../storage', () => ({
  storage: {
    getUserOrganizations: vi.fn(),
  },
}));

describe('getCachedUserOrganizations', () => {
  let mockReq: Partial<Request>;
  const mockUserId = 'user-123';
  const mockUserOrgs = [
    { organizationId: 'org-1', role: 'coach' },
    { organizationId: 'org-2', role: 'athlete' },
  ];

  beforeEach(() => {
    mockReq = {
      cache: new Map(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should call storage.getUserOrganizations on first call (cache miss)', async () => {
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockUserOrgs);

    const result = await getCachedUserOrganizations(mockReq as Request, mockUserId);

    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);
    expect(storage.getUserOrganizations).toHaveBeenCalledWith(mockUserId);
    expect(result).toEqual(mockUserOrgs);
  });

  it('should return cached result on second call without hitting storage (cache hit)', async () => {
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockUserOrgs);

    // First call - should hit storage
    const result1 = await getCachedUserOrganizations(mockReq as Request, mockUserId);

    // Second call - should use cache
    const result2 = await getCachedUserOrganizations(mockReq as Request, mockUserId);

    // Storage should only be called once
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);

    // Both results should be identical
    expect(result1).toEqual(mockUserOrgs);
    expect(result2).toEqual(mockUserOrgs);
    expect(result1).toBe(result2); // Same reference
  });

  it('should call storage separately for different userIds', async () => {
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const userOrgs1 = [{ organizationId: 'org-1', role: 'coach' }];
    const userOrgs2 = [{ organizationId: 'org-2', role: 'athlete' }];

    vi.mocked(storage.getUserOrganizations)
      .mockResolvedValueOnce(userOrgs1)
      .mockResolvedValueOnce(userOrgs2);

    const result1 = await getCachedUserOrganizations(mockReq as Request, userId1);
    const result2 = await getCachedUserOrganizations(mockReq as Request, userId2);

    // Storage should be called twice (once per unique userId)
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(2);
    expect(storage.getUserOrganizations).toHaveBeenCalledWith(userId1);
    expect(storage.getUserOrganizations).toHaveBeenCalledWith(userId2);

    expect(result1).toEqual(userOrgs1);
    expect(result2).toEqual(userOrgs2);
  });

  it('should use separate cache per request (not shared across requests)', async () => {
    const req1 = { cache: new Map() } as Request;
    const req2 = { cache: new Map() } as Request;

    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockUserOrgs);

    // Call with same userId but different requests
    await getCachedUserOrganizations(req1, mockUserId);
    await getCachedUserOrganizations(req2, mockUserId);

    // Storage should be called twice (once per request)
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(2);
  });

  it('should handle requests without cache gracefully', async () => {
    const reqWithoutCache = {} as Request;
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockUserOrgs);

    const result = await getCachedUserOrganizations(reqWithoutCache, mockUserId);

    // Should still call storage and return result
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockUserOrgs);
  });

  it('should cache empty results (user with no orgs)', async () => {
    const emptyOrgs: any[] = [];
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(emptyOrgs);

    const result1 = await getCachedUserOrganizations(mockReq as Request, mockUserId);
    const result2 = await getCachedUserOrganizations(mockReq as Request, mockUserId);

    // Storage should only be called once even for empty results
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);
    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
  });

  it('should use correct cache key format (auth:userOrgs:userId)', async () => {
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockUserOrgs);

    await getCachedUserOrganizations(mockReq as Request, mockUserId);

    // Verify cache key format (namespaced to avoid collisions)
    const expectedCacheKey = `auth:userOrgs:${mockUserId}`;
    expect(mockReq.cache?.has(expectedCacheKey)).toBe(true);
    expect(mockReq.cache?.get(expectedCacheKey)).toEqual(mockUserOrgs);
  });

  it('should handle storage errors by propagating them', async () => {
    const storageError = new Error('Database connection failed');
    vi.mocked(storage.getUserOrganizations).mockRejectedValue(storageError);

    await expect(
      getCachedUserOrganizations(mockReq as Request, mockUserId)
    ).rejects.toThrow('Database connection failed');

    // Error should not be cached
    expect(mockReq.cache?.has(`auth:userOrgs:${mockUserId}`)).toBe(false);
  });

  it('should not cache errors (allowing retry on subsequent calls)', async () => {
    vi.mocked(storage.getUserOrganizations)
      .mockRejectedValueOnce(new Error('Transient DB error'))
      .mockResolvedValueOnce(mockUserOrgs);

    // First call should fail
    await expect(
      getCachedUserOrganizations(mockReq as Request, mockUserId)
    ).rejects.toThrow('Transient DB error');

    // Second call should succeed (not return cached error)
    const result = await getCachedUserOrganizations(mockReq as Request, mockUserId);
    expect(result).toEqual(mockUserOrgs);

    // Storage should be called twice (error was not cached)
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(2);
  });

  it('should support multiple cached users in single request', async () => {
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const userId3 = 'user-3';
    const userOrgs1 = [{ organizationId: 'org-1', role: 'coach' }];
    const userOrgs2 = [{ organizationId: 'org-2', role: 'athlete' }];
    const userOrgs3 = [{ organizationId: 'org-3', role: 'org_admin' }];

    vi.mocked(storage.getUserOrganizations)
      .mockResolvedValueOnce(userOrgs1)
      .mockResolvedValueOnce(userOrgs2)
      .mockResolvedValueOnce(userOrgs3);

    // First calls - populate cache
    await getCachedUserOrganizations(mockReq as Request, userId1);
    await getCachedUserOrganizations(mockReq as Request, userId2);
    await getCachedUserOrganizations(mockReq as Request, userId3);

    // Second calls - should all use cache
    const result1 = await getCachedUserOrganizations(mockReq as Request, userId1);
    const result2 = await getCachedUserOrganizations(mockReq as Request, userId2);
    const result3 = await getCachedUserOrganizations(mockReq as Request, userId3);

    // Storage should only be called 3 times total (once per user)
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(3);

    // Verify all results
    expect(result1).toEqual(userOrgs1);
    expect(result2).toEqual(userOrgs2);
    expect(result3).toEqual(userOrgs3);
  });
});
