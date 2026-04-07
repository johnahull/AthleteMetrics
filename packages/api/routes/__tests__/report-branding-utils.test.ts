import { describe, it, expect, vi, afterEach } from 'vitest';
import { hexToRgb, isSafeLogoUrl, fetchLogoBase64 } from '../report-branding-utils';

describe('hexToRgb', () => {
  it('converts a valid 6-digit hex color', () => {
    expect(hexToRgb('#1a2b3c')).toEqual([0x1a, 0x2b, 0x3c]);
  });

  it('handles uppercase hex digits', () => {
    expect(hexToRgb('#FF8800')).toEqual([255, 136, 0]);
  });

  it('returns default blue for invalid input (no hash)', () => {
    expect(hexToRgb('1a2b3c')).toEqual([41, 128, 185]);
  });

  it('returns default blue for short hex', () => {
    expect(hexToRgb('#abc')).toEqual([41, 128, 185]);
  });

  it('returns default blue for empty string', () => {
    expect(hexToRgb('')).toEqual([41, 128, 185]);
  });

  it('returns default blue for NaN-producing input', () => {
    expect(hexToRgb('#xxyyzz')).toEqual([41, 128, 185]);
  });
});

describe('isSafeLogoUrl', () => {
  // --- Should allow ---
  it('allows a public HTTPS URL', () => {
    expect(isSafeLogoUrl('https://example.com/logo.png')).toBe(true);
  });

  it('allows a public HTTPS URL with a path', () => {
    expect(isSafeLogoUrl('https://cdn.example.com/assets/logos/org.png')).toBe(true);
  });

  // --- Protocol checks ---
  it('blocks HTTP URLs', () => {
    expect(isSafeLogoUrl('http://example.com/logo.png')).toBe(false);
  });

  it('blocks FTP URLs', () => {
    expect(isSafeLogoUrl('ftp://example.com/logo.png')).toBe(false);
  });

  it('blocks file:// URLs', () => {
    expect(isSafeLogoUrl('file:///etc/passwd')).toBe(false);
  });

  // --- Loopback / unspecified ---
  it('blocks localhost', () => {
    expect(isSafeLogoUrl('https://localhost/logo.png')).toBe(false);
  });

  it('blocks 127.0.0.1', () => {
    expect(isSafeLogoUrl('https://127.0.0.1/logo.png')).toBe(false);
  });

  it('blocks 127.0.0.2 (loopback range, not just .1)', () => {
    expect(isSafeLogoUrl('https://127.0.0.2/logo.png')).toBe(false);
  });

  it('blocks 127.255.255.254 (end of loopback range)', () => {
    expect(isSafeLogoUrl('https://127.255.255.254/logo.png')).toBe(false);
  });

  it('blocks IPv6 loopback ::1', () => {
    expect(isSafeLogoUrl('https://[::1]/logo.png')).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(isSafeLogoUrl('https://0.0.0.0/logo.png')).toBe(false);
  });

  it('blocks 0.0.0.0/8 subnet (e.g. 0.1.2.3)', () => {
    expect(isSafeLogoUrl('https://0.1.2.3/logo.png')).toBe(false);
    expect(isSafeLogoUrl('https://0.255.255.255/logo.png')).toBe(false);
  });

  // --- IPv4-mapped IPv6 ---
  it('blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)', () => {
    expect(isSafeLogoUrl('https://[::ffff:127.0.0.1]/logo.png')).toBe(false);
  });

  it('blocks ::ffff:10.0.0.1 (IPv4-mapped private)', () => {
    expect(isSafeLogoUrl('https://[::ffff:10.0.0.1]/logo.png')).toBe(false);
  });

  // --- RFC-1918 private ranges ---
  it('blocks 10.x.x.x', () => {
    expect(isSafeLogoUrl('https://10.0.0.1/logo.png')).toBe(false);
  });

  it('blocks 192.168.x.x', () => {
    expect(isSafeLogoUrl('https://192.168.1.1/logo.png')).toBe(false);
  });

  it('blocks 172.16.x.x', () => {
    expect(isSafeLogoUrl('https://172.16.0.1/logo.png')).toBe(false);
  });

  it('blocks 172.31.x.x', () => {
    expect(isSafeLogoUrl('https://172.31.255.255/logo.png')).toBe(false);
  });

  it('allows 172.15.x.x (just outside RFC-1918 range)', () => {
    expect(isSafeLogoUrl('https://172.15.0.1/logo.png')).toBe(true);
  });

  it('allows 172.32.x.x (just outside RFC-1918 range)', () => {
    expect(isSafeLogoUrl('https://172.32.0.1/logo.png')).toBe(true);
  });

  // --- APIPA / link-local / metadata ---
  it('blocks 169.254.0.0 (APIPA start)', () => {
    expect(isSafeLogoUrl('https://169.254.0.0/logo.png')).toBe(false);
  });

  it('blocks 169.254.169.254 (AWS metadata)', () => {
    expect(isSafeLogoUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('blocks 169.254.1.1 (other APIPA)', () => {
    expect(isSafeLogoUrl('https://169.254.1.1/logo.png')).toBe(false);
  });

  // --- CGNAT shared address space (100.64.0.0/10) ---
  it('blocks 100.64.0.1 (CGNAT range start)', () => {
    expect(isSafeLogoUrl('https://100.64.0.1/logo.png')).toBe(false);
  });

  it('blocks 100.100.0.1 (middle of CGNAT range)', () => {
    expect(isSafeLogoUrl('https://100.100.0.1/logo.png')).toBe(false);
  });

  it('blocks 100.127.255.255 (CGNAT range end)', () => {
    expect(isSafeLogoUrl('https://100.127.255.255/logo.png')).toBe(false);
  });

  it('allows 100.128.0.1 (just outside CGNAT range)', () => {
    expect(isSafeLogoUrl('https://100.128.0.1/logo.png')).toBe(true);
  });

  it('allows 100.63.255.255 (just below CGNAT range)', () => {
    expect(isSafeLogoUrl('https://100.63.255.255/logo.png')).toBe(true);
  });

  // --- Internal TLDs ---
  it('blocks .internal hostnames', () => {
    expect(isSafeLogoUrl('https://service.internal/logo.png')).toBe(false);
  });

  it('blocks .local hostnames', () => {
    expect(isSafeLogoUrl('https://printer.local/logo.png')).toBe(false);
  });

  // --- Invalid URLs ---
  it('blocks malformed URLs', () => {
    expect(isSafeLogoUrl('not-a-url')).toBe(false);
  });

  it('blocks empty string', () => {
    expect(isSafeLogoUrl('')).toBe(false);
  });
});

describe('fetchLogoBase64', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeFetchResponse(opts: {
    ok?: boolean;
    contentType?: string;
    contentLength?: number;
    body?: ArrayBuffer;
  }) {
    const { ok = true, contentType = 'image/png', contentLength, body = new ArrayBuffer(100) } = opts;
    return Promise.resolve({
      ok,
      headers: {
        get: (h: string) => {
          if (h === 'content-type') return contentType;
          if (h === 'content-length' && contentLength !== undefined) return String(contentLength);
          return null;
        },
      },
      arrayBuffer: () => Promise.resolve(body),
    } as unknown as Response);
  }

  it('returns null for an unsafe (HTTP) URL', async () => {
    expect(await fetchLogoBase64('http://example.com/logo.png')).toBeNull();
  });

  it('returns null for a private-IP URL', async () => {
    expect(await fetchLogoBase64('https://192.168.1.1/logo.png')).toBeNull();
  });

  it('returns null when fetch response is not ok', async () => {
    vi.stubGlobal('fetch', () => makeFetchResponse({ ok: false }));
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
  });

  it('returns null for unsupported content-type (SVG)', async () => {
    vi.stubGlobal('fetch', () => makeFetchResponse({ contentType: 'image/svg+xml' }));
    expect(await fetchLogoBase64('https://example.com/logo.svg')).toBeNull();
  });

  it('returns null for spoofed content-type text/html; x-hint=jpeg', async () => {
    vi.stubGlobal('fetch', () => makeFetchResponse({ contentType: 'text/html; x-hint=jpeg' }));
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
  });

  it('returns null for spoofed content-type application/octet-stream; hint=png', async () => {
    vi.stubGlobal('fetch', () => makeFetchResponse({ contentType: 'application/octet-stream; hint=png' }));
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
  });

  it('returns null when image exceeds 2 MB', async () => {
    const bigBuffer = new ArrayBuffer(3 * 1024 * 1024);
    vi.stubGlobal('fetch', () => makeFetchResponse({ body: bigBuffer }));
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
  });

  it('returns null when Content-Length header exceeds 2 MB (before buffering)', async () => {
    const arrayBufferSpy = vi.fn(() => Promise.resolve(new ArrayBuffer(100)));
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: {
          get: (h: string) => {
            if (h === 'content-type') return 'image/png';
            if (h === 'content-length') return String(3 * 1024 * 1024);
            return null;
          },
        },
        arrayBuffer: arrayBufferSpy,
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
    // Fast-reject must skip buffering entirely — arrayBuffer should never be called
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it('does not reject when Content-Length header is absent (relies on post-download cap)', async () => {
    // No contentLength in opts → header returns null → contentLength parses to 0 → pre-check skipped
    vi.stubGlobal('fetch', () => makeFetchResponse({ body: new ArrayBuffer(100) }));
    const result = await fetchLogoBase64('https://example.com/logo.png');
    expect(result).not.toBeNull();
  });

  it('returns base64 result for a valid PNG response', async () => {
    const data = new TextEncoder().encode('fakeimagedata');
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    vi.stubGlobal('fetch', () => makeFetchResponse({ contentType: 'image/png', body: arrayBuffer }));
    const result = await fetchLogoBase64('https://example.com/logo.png');
    expect(result).not.toBeNull();
    expect(result?.ext).toBe('PNG');
    expect(result?.mimeType).toBe('image/png');
    expect(result?.base64).toBe(Buffer.from('fakeimagedata').toString('base64'));
  });

  it('returns base64 result for a valid JPEG response', async () => {
    const body = Buffer.from('fakejpegdata');
    vi.stubGlobal('fetch', () => makeFetchResponse({ contentType: 'image/jpeg', body: body.buffer }));
    const result = await fetchLogoBase64('https://example.com/logo.jpg');
    expect(result).not.toBeNull();
    expect(result?.ext).toBe('JPEG');
    expect(result?.mimeType).toBe('image/jpeg');
  });

  it('passes redirect: error to fetch to prevent SSRF via redirect chains', async () => {
    const fetchSpy = vi.fn(() => makeFetchResponse({}));
    vi.stubGlobal('fetch', fetchSpy);
    await fetchLogoBase64('https://example.com/logo.png');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/logo.png',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('returns null when fetch throws (e.g. redirect error or timeout)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('redirect')));
    expect(await fetchLogoBase64('https://example.com/logo.png')).toBeNull();
  });
});
