import crypto from "crypto";

/**
 * Deterministically hash a bearer token for storage/lookup.
 *
 * Single-use, high-entropy tokens (invitations, email verification, OAuth
 * account linking, global-athlete claims) are stored only as their SHA-256 hash,
 * so a leaked database row cannot be used as a working token. Lookups hash the
 * value from the URL and compare hashes. Because the hash is deterministic,
 * unique-index and equality-lookup semantics are preserved.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
