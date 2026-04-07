/**
 * URL safety validation — shared between frontend and backend.
 *
 * Validates that a URL points to a public internet host (not internal/private IPs).
 * Used in Zod schemas to prevent storing internal URLs, and in the API layer
 * as a pre-fetch guard against SSRF.
 */

/**
 * Check if a URL is safe to use server-side (prevents SSRF).
 * Only HTTPS URLs pointing to public internet hosts are allowed.
 *
 * Known limitation: DNS rebinding is not mitigated here. A domain could resolve
 * to a public IP during validation and then resolve to a private IP at fetch time.
 */
export function isSafePublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    // Block loopback, unspecified, and common internal hostnames
    if (hostname === 'localhost') return false;
    if (/^0\./.test(hostname)) return false; // 0.0.0.0/8 — Linux routes to local interfaces
    if (/^127\./.test(hostname)) return false; // 127.0.0.0/8 loopback range
    // Block all IPv6 addresses (bracketed) — covers ::1, ::ffff:*, fc00::/7, fe80::, etc.
    if (hostname.startsWith('[')) return false;
    // Block RFC-1918 private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // Block APIPA / cloud metadata link-local range
    if (/^169\.254\./.test(hostname)) return false;
    // Block CGNAT shared address space (100.64.0.0/10)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return false;
    // Block internal TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}
