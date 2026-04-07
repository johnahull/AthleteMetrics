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
 * Re-export the shared URL safety check. The canonical implementation lives in
 * @shared/url-safety so both Zod schemas and API routes use the same logic.
 *
 * Known limitation: DNS rebinding is not mitigated. Partial mitigations in
 * fetchLogoBase64 (5s timeout, 2 MB cap, redirect: 'error') reduce the window.
 * See @shared/url-safety.ts for full documentation.
 */
import { isSafePublicUrl } from '@shared/url-safety';
export { isSafePublicUrl as isSafeLogoUrl };

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
 * Security: validates the URL with isSafePublicUrl, disables redirect following
 * to prevent SSRF via open redirects, and enforces a 5-second timeout.
 */
export async function fetchLogoBase64(url: string): Promise<LogoFetchResult | null> {
  if (!isSafePublicUrl(url)) {
    console.debug(`[fetchLogoBase64] Blocked unsafe URL: ${url}`);
    return null;
  }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error', // Prevent SSRF via redirect chains
    });
    if (!response.ok) {
      console.debug(`[fetchLogoBase64] Non-OK response ${response.status} from ${url}`);
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    // Use startsWith for precise MIME type matching — .includes() would accept
    // spoofed types like "text/html; x-hint=jpeg" as valid image content.
    const isJpeg = contentType.startsWith('image/jpeg') || contentType.startsWith('image/jpg');
    const isPng = contentType.startsWith('image/png');
    if (!isJpeg && !isPng) {
      console.debug(`[fetchLogoBase64] Rejected content-type "${contentType}" from ${url}`);
      return null;
    }
    // Fast reject if Content-Length header indicates oversized image (before buffering)
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) {
      console.debug(`[fetchLogoBase64] Content-Length ${contentLength} exceeds 2 MB from ${url}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) {
      console.debug(`[fetchLogoBase64] Downloaded ${arrayBuffer.byteLength} bytes exceeds 2 MB from ${url}`);
      return null;
    }
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      base64,
      ext: isJpeg ? 'JPEG' : 'PNG',
      mimeType: isJpeg ? 'image/jpeg' : 'image/png',
    };
  } catch (err) {
    console.debug(`[fetchLogoBase64] Fetch failed for ${url}: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
