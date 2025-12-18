/**
 * Cached Organization Access Helper
 *
 * Provides request-scoped caching for getUserOrganizations() to reduce
 * redundant database queries within a single request.
 *
 * Performance Impact:
 * - Before: 8+ DB queries per request (e.g., in athlete-routes.ts)
 * - After: 1 DB query per user per request
 *
 * Usage:
 * Replace:
 *   const userOrgs = await storage.getUserOrganizations(userId);
 * With:
 *   const userOrgs = await getCachedUserOrganizations(req, userId);
 */

import type { Request } from 'express';
import { storage } from '../storage';
import type { UserOrganization, Organization } from '@shared/schema';

/** Type returned by getUserOrganizations - user org membership with nested organization */
export type UserOrganizationWithOrg = UserOrganization & { organization: Organization };

/**
 * Get user organizations with request-scoped caching
 *
 * @param req - Express request object (must have req.cache from requestCacheMiddleware)
 * @param userId - User ID to fetch organizations for
 * @returns Promise of user organizations (same format as storage.getUserOrganizations)
 *
 * Caching Strategy:
 * - Cache key: `auth:userOrgs:${userId}` (namespaced to avoid collisions)
 * - Cache hit: Return cached result without DB query
 * - Cache miss: Query DB, store in cache, return result
 * - Cache scope: Single request only (not shared across requests)
 * - Error handling: Errors are propagated, not cached
 */
export async function getCachedUserOrganizations(
  req: Request,
  userId: string
): Promise<UserOrganizationWithOrg[]> {
  const cacheKey = `auth:userOrgs:${userId}`;

  // Check if cache exists and has the result
  if (req.cache?.has(cacheKey)) {
    return req.cache.get(cacheKey);
  }

  // Cache miss - fetch from storage
  const userOrgs = await storage.getUserOrganizations(userId);

  // Store in cache for future calls in this request
  req.cache?.set(cacheKey, userOrgs);

  return userOrgs;
}
