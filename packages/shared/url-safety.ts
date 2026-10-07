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
 * Non-standard IPv4 representations (decimal, octal, hex — e.g. 2130706433,
 * 0x7f000001, 0177.0.0.1 for 127.0.0.1) are safe here because Node's WHATWG URL
 * parser normalizes them to dotted-decimal before we inspect `hostname`.
 * Tests in report-branding-utils.test.ts verify this.
 *
 * Known limitation: DNS rebinding is not mitigated here. A domain could resolve
 * to a public IP during validation and then resolve to a private IP at fetch time.
 */
export function isSafePublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    // A trailing dot is the same DNS name (localhost. == localhost), so drop it
    // before the name checks below.
    const hostname = parsed.hostname.replace(/\.+$/, '');
    // Block loopback, unspecified, and common internal hostnames (*.localhost
    // resolves to loopback too, RFC 6761)
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (/^0\./.test(hostname)) return false; // 0.0.0.0/8 — Linux routes to local interfaces
    if (/^127\./.test(hostname)) return false; // 127.0.0.0/8 loopback range
    // Block all IPv6 addresses (bracketed) — covers ::1, ::ffff:*, fc00::/7, fe80::, etc.
    if (hostname.startsWith('[')) return false;
    // Block RFC-1918 private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // Block APIPA / cloud metadata link-local range (169.254.0.0/16).
    // This covers AWS metadata (169.254.169.254) via IP; .internal TLD check below
    // provides additional coverage for metadata.aws.internal.
    if (/^169\.254\./.test(hostname)) return false;
    // Block CGNAT shared address space (100.64.0.0/10)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return false;
    // Block multicast 224.0.0.0/4, reserved 240.0.0.0/4 (incl. broadcast
    // 255.255.255.255) and benchmarking 198.18.0.0/15 IPv4 literals
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (a >= 224) return false;
      if (a === 198 && (b === 18 || b === 19)) return false;
    }
    // Block internal TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}
