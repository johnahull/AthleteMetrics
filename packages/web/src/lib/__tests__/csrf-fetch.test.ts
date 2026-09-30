/**
 * Unit tests for installCsrfFetch: attaches the CSRF token to same-origin
 * mutating /api requests made with raw fetch().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installCsrfFetch } from '../csrf-fetch';

const originalFetch = globalThis.fetch;

function tokenResponse(token = 'tok-1') {
  return new Response(JSON.stringify({ csrfToken: token }), { status: 200 });
}

describe('installCsrfFetch', () => {
  let baseFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/csrf-token')) return tokenResponse();
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = baseFetch as unknown as typeof fetch;
    installCsrfFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const callsTo = (path: string) =>
    baseFetch.mock.calls.filter(([url]) => String(url).includes(path));

  it('adds X-CSRF-Token to a mutating /api request', async () => {
    await fetch('/api/reports/1/generate-insights', { method: 'POST' });
    const [, init] = callsTo('/generate-insights')[0];
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('tok-1');
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('covers %s', async (method) => {
    await fetch('/api/x', { method });
    const [, init] = callsTo('/api/x')[0];
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('tok-1');
  });

  it('leaves GET and default-method requests untouched', async () => {
    await fetch('/api/x');
    await fetch('/api/x', { method: 'GET' });
    expect(callsTo('/api/csrf-token')).toHaveLength(0);
  });

  it('does not touch non-/api or cross-origin requests', async () => {
    await fetch('/assets/x.json', { method: 'POST' });
    await fetch('https://example.com/api/x', { method: 'POST' });
    expect(callsTo('/api/csrf-token')).toHaveLength(0);
  });

  it('keeps a caller-supplied token and preserves other headers', async () => {
    await fetch('/api/x', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'mine', 'Content-Type': 'application/json' },
    });
    const [, init] = callsTo('/api/x')[0];
    const h = new Headers(init.headers);
    expect(h.get('X-CSRF-Token')).toBe('mine');
    expect(h.get('Content-Type')).toBe('application/json');
    expect(callsTo('/api/csrf-token')).toHaveLength(0);
  });

  it('caches the token across requests', async () => {
    await fetch('/api/a', { method: 'POST' });
    await fetch('/api/b', { method: 'POST' });
    expect(callsTo('/api/csrf-token')).toHaveLength(1);
  });

  it('is idempotent when installed twice', async () => {
    installCsrfFetch();
    await fetch('/api/a', { method: 'POST' });
    expect(callsTo('/api/a')).toHaveLength(1);
  });

  it('sends the request anyway if the token cannot be fetched', async () => {
    baseFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/csrf-token')) return new Response('', { status: 500 });
      return new Response('{}', { status: 200 });
    });
    const res = await fetch('/api/a', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('refreshes the token and retries once on a CSRF 403', async () => {
    let n = 0;
    baseFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/csrf-token')) return tokenResponse(`tok-${++n}`);
      return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), { status: 403 });
    });
    await fetch('/api/a', { method: 'POST' });
    expect(callsTo('/api/a')).toHaveLength(2);
    expect(callsTo('/api/csrf-token')).toHaveLength(2);
  });

  it('does not retry a non-CSRF 403', async () => {
    baseFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/csrf-token')) return tokenResponse();
      return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
    });
    await fetch('/api/a', { method: 'POST' });
    expect(callsTo('/api/a')).toHaveLength(1);
  });
});
