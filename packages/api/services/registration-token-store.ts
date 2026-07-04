/**
 * In-memory token store for the post-consent parent-registration flow.
 *
 * Replaces embedding parentEmail + consentId directly in the /register URL
 * (browser history, referrer headers, server access logs). Tokens are
 * short-lived (1 hour) and single-use (consumed on first lookup).
 *
 * Acceptable as in-memory because:
 * - App runs as a single process (no clustering)
 * - Tokens live 1 hour max — restart just requires re-granting consent
 * - No sensitive data stored beyond consentId + parentEmail, keyed by token hash
 */

import crypto from 'crypto';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Purge expired entries every 15 minutes

interface TokenEntry {
  consentId: string;
  parentEmail: string;
  expiresAt: number;
}

const store = new Map<string, TokenEntry>();

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate an opaque token for a parent who just granted consent, so the
 * registration page can be linked to without exposing their email or
 * consentId in the URL. Returns the raw (unhashed) token — only the hash is
 * stored.
 */
export function generateRegistrationToken(consentId: string, parentEmail: string): string {
  const raw = crypto.randomBytes(32).toString('hex');
  store.set(hashToken(raw), { consentId, parentEmail, expiresAt: Date.now() + TOKEN_TTL_MS });
  return raw;
}

/**
 * Consume a token: returns the { consentId, parentEmail } if the token is
 * valid and not expired, then deletes it (single-use). Returns null if
 * invalid/expired/already used.
 */
export function consumeRegistrationToken(rawToken: string): { consentId: string; parentEmail: string } | null {
  const hash = hashToken(rawToken);
  const entry = store.get(hash);

  if (!entry) return null;

  // Always delete — token is single-use regardless of expiry
  store.delete(hash);

  if (Date.now() > entry.expiresAt) return null;

  return { consentId: entry.consentId, parentEmail: entry.parentEmail };
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
