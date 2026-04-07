/**
 * In-memory token store for the COPPA "collect parent email" flow.
 *
 * Replaces the username-in-URL pattern to prevent minor status enumeration.
 * Tokens are short-lived (15 minutes) and single-use (consumed on first lookup).
 *
 * Acceptable as in-memory because:
 * - App runs as a single process (no clustering)
 * - Tokens live 15 minutes max — restart just requires re-login
 * - No sensitive data stored (only userId + expiry, keyed by token hash)
 */

import crypto from 'crypto';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Purge expired entries every 5 minutes

interface TokenEntry {
  userId: string;
  expiresAt: number;
}

const store = new Map<string, TokenEntry>();

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate an opaque token for a user who needs to provide a parent email.
 * Returns the raw (unhashed) token — only the hash is stored.
 */
export function generateParentEmailToken(userId: string): string {
  const raw = crypto.randomBytes(32).toString('hex');
  store.set(hashToken(raw), { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return raw;
}

/**
 * Consume a token: returns the userId if the token is valid and not expired,
 * then deletes it (single-use). Returns null if invalid/expired/already used.
 */
export function consumeParentEmailToken(rawToken: string): string | null {
  const hash = hashToken(rawToken);
  const entry = store.get(hash);

  if (!entry) return null;

  // Always delete — token is single-use regardless of expiry
  store.delete(hash);

  if (Date.now() > entry.expiresAt) return null;

  return entry.userId;
}

// Periodic cleanup of expired entries to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(hash);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();
