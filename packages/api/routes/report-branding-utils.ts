/**
 * Utility functions for PDF report branding — extracted for unit testability.
 */

/**
 * Parse hex color string to RGB tuple.
 * Returns a default blue if the input is not a valid 6-digit hex color.
 */
export function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [41, 128, 185]; // Fallback to default blue
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Validate that a URL is safe to fetch server-side (prevents SSRF).
 * Only HTTPS URLs pointing to public internet hosts are allowed.
 */
export function isSafeLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    // Block loopback, unspecified, and common internal hostnames
    if (hostname === 'localhost' || hostname === '0.0.0.0') return false;
    if (hostname === '127.0.0.1' || hostname === '::1') return false;
    // Block IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if (/^::ffff:/i.test(hostname)) return false;
    // Block RFC-1918 private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // Block APIPA / cloud metadata link-local range
    if (/^169\.254\./.test(hostname)) return false;
    // Block internal TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}
