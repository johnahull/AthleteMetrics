import { describe, it, expect } from 'vitest';
import { hexToRgb, isSafeLogoUrl } from '../report-branding-utils';

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

  it('blocks IPv6 loopback ::1', () => {
    expect(isSafeLogoUrl('https://[::1]/logo.png')).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(isSafeLogoUrl('https://0.0.0.0/logo.png')).toBe(false);
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
