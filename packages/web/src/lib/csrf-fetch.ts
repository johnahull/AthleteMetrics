/**
 * Attaches the CSRF token to same-origin, state-changing /api requests made
 * with raw fetch().
 *
 * The server enforces CSRF on every authenticated mutation, but many call
 * sites use plain fetch() and never send the token. Wrapping fetch once keeps
 * them working without touching each caller; callers that already set
 * X-CSRF-Token (e.g. apiRequest) are left alone.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOKEN_HEADER = 'X-CSRF-Token';
const TOKEN_ENDPOINT = '/api/csrf-token';
const INSTALLED = Symbol.for('athletemetrics.csrfFetchInstalled');

export function installCsrfFetch(): void {
  if ((globalThis.fetch as { [INSTALLED]?: boolean })[INSTALLED]) return;

  const baseFetch = globalThis.fetch.bind(globalThis);
  let cachedToken: string | null = null;
  let inflight: Promise<string | null> | null = null;

  const loadToken = (forceRefresh: boolean): Promise<string | null> => {
    if (cachedToken && !forceRefresh) return Promise.resolve(cachedToken);
    if (!inflight) {
      inflight = baseFetch(TOKEN_ENDPOINT, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return null;
          const { csrfToken } = await res.json();
          cachedToken = csrfToken ?? null;
          return cachedToken;
        })
        .catch(() => null)
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  const needsToken = (input: RequestInfo | URL, init?: RequestInit): boolean => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!MUTATING_METHODS.has(method)) return false;
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  };

  const isCsrfRejection = async (res: Response): Promise<boolean> => {
    if (res.status !== 403) return false;
    try {
      const body = await res.clone().json();
      return /csrf/i.test(`${body?.error ?? ''} ${body?.message ?? ''}`);
    } catch {
      return false;
    }
  };

  const csrfFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!needsToken(input, init)) return baseFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has(TOKEN_HEADER)) return baseFetch(input, init);

    const send = (token: string | null) => {
      const h = new Headers(headers);
      if (token) h.set(TOKEN_HEADER, token);
      return baseFetch(input, { credentials: 'include', ...init, headers: h });
    };

    const res = await send(await loadToken(false));
    if (await isCsrfRejection(res)) {
      // Token expired or session rotated — fetch a fresh one and retry once.
      return send(await loadToken(true));
    }
    return res;
  };
  (csrfFetch as { [INSTALLED]?: boolean })[INSTALLED] = true;
  globalThis.fetch = csrfFetch;
}
