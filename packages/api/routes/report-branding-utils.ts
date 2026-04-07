/**
 * Utility functions for PDF report branding — extracted for unit testability.
 */

/**
 * Parse hex color string to RGB tuple.
 * Returns a default blue [41, 128, 185] if the input is not a valid 6-digit hex color.
 * Note: this fallback is silent — callers receive a valid tuple with no indication
 * that the input was invalid. Fine for PDF rendering where a sensible default is
 * preferable to an error, but do not rely on this function for input validation.
 */
export function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [41, 128, 185]; // Silent fallback to default blue
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
 * brandLogoUrl. Partial mitigations in fetchLogoBase64 (5s timeout, 2 MB cap,
 * redirect: 'error') reduce the window and limit exfiltration size, but do not
 * fully prevent a rebinding attack. Deployments in highly sensitive environments
 * should consider an egress proxy or allowlist-based approach.
 */
export function isSafeLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    // Block loopback, unspecified, and common internal hostnames
    if (hostname === 'localhost') return false;
    if (/^0\./.test(hostname)) return false; // Block 0.0.0.0/8 — Linux routes 0.x.x.x to local interfaces
    if (/^127\./.test(hostname)) return false; // Block entire 127.0.0.0/8 loopback range
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
    // Use startsWith for precise MIME type matching — .includes() would accept
    // spoofed types like "text/html; x-hint=jpeg" as valid image content.
    const isJpeg = contentType.startsWith('image/jpeg') || contentType.startsWith('image/jpg');
    const isPng = contentType.startsWith('image/png');
    if (!isJpeg && !isPng) return null; // Reject SVG, WebP, etc.
    // Fast reject if Content-Length header indicates oversized image (before buffering)
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) return null; // 2 MB cap (handles absent/spoofed content-length)
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
