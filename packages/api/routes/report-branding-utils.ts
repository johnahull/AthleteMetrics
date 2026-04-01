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
 *
 * Known limitation: DNS rebinding is not mitigated here. A domain could resolve
 * to a public IP during this hostname check and then resolve to a private IP at
 * actual fetch time. The blast radius is limited because only org admins can set
 * brandLogoUrl, but deployments in highly sensitive environments should consider
 * an egress proxy or allowlist-based approach for complete protection.
 */
export function isSafeLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    // Block loopback, unspecified, and common internal hostnames
    if (hostname === 'localhost' || hostname === '0.0.0.0') return false;
    if (hostname === '127.0.0.1') return false;
    // Block all IPv6 addresses (bracketed) — covers ::1, ::ffff:*, fc00::/7, fe80::, etc.
    if (hostname.startsWith('[')) return false;
    // Block RFC-1918 private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // Block APIPA / cloud metadata link-local range
    if (/^169\.254\./.test(hostname)) return false;
    // Block CGNAT shared address space (100.64.0.0/10) — used by some cloud providers for internal routing
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return false;
    // Block internal TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

export interface LogoFetchResult {
  base64: string;
  ext: 'JPEG' | 'PNG';
  mimeType: string;
}

/**
 * Fetch a logo image from a URL and return it as a base64-encoded result.
 * Returns null if the URL is unsafe, the fetch fails, the content-type is not
 * an allowed image type, or the image exceeds the 2 MB size cap.
 *
 * Security: validates the URL with isSafeLogoUrl, disables redirect following
 * to prevent SSRF via open redirects, and enforces a 5-second timeout.
 */
export async function fetchLogoBase64(url: string): Promise<LogoFetchResult | null> {
  if (!isSafeLogoUrl(url)) return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error', // Prevent SSRF via redirect chains
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    const isJpeg = contentType.includes('jpeg') || contentType.includes('jpg');
    const isPng = contentType.includes('png');
    if (!isJpeg && !isPng) return null; // Reject SVG, WebP, etc.
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) return null; // 2 MB cap
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      base64,
      ext: isJpeg ? 'JPEG' : 'PNG',
      mimeType: isJpeg ? 'image/jpeg' : 'image/png',
    };
  } catch {
    return null;
  }
}
