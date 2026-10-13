/**
 * Returns a same-origin path (pathname + search + hash) for a user-supplied
 * `?redirect=` value, or null when it is not safe to navigate to.
 *
 * Parses with URL instead of matching strings: browsers drop tab/newline
 * characters and treat "\" as "/", so "/\t/evil.com" and "/\evil.com" both
 * resolve to "//evil.com".
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = url.pathname + url.search + url.hash;
    // URL resolves dot-segments, so "/.//evil.com" yields "//evil.com", which a browser treats as another host
    return path.startsWith('//') ? null : path;
  } catch {
    return null;
  }
}

/** Join code from a `/join/:code` redirect (codes are 4-20 alphanumerics), else null. */
export function joinCodeFromRedirect(raw: string | null | undefined): string | null {
  const path = safeRedirectPath(raw);
  if (!path) return null;
  return /^\/join\/([A-Za-z0-9]{4,20})$/.exec(path)?.[1] ?? null;
}
