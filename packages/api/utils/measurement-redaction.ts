/**
 * Measurement redaction helpers (AM-FEAT-015 Decision 12).
 *
 * measurements.media_url (e.g. a coach's video clip link) must never appear in public
 * report snapshots or in CSV / LLM / COPPA exports, nor in views that aggregate across
 * organizations. Serializers in those paths build explicit field lists; these helpers
 * are for the paths that pass raw rows through, and a defense-in-depth backstop.
 */

export function omitMediaUrl<T extends object>(row: T): Omit<T, "mediaUrl"> {
  const { mediaUrl: _omitted, ...rest } = row as T & { mediaUrl?: unknown };
  return rest as Omit<T, "mediaUrl">;
}

export function omitMediaUrlFromRows<T extends object>(rows: T[]): Array<Omit<T, "mediaUrl">> {
  return rows.map(omitMediaUrl);
}

/** Recursively remove every `mediaUrl` key from plain objects/arrays (Dates etc. are preserved). */
export function stripMediaUrlDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripMediaUrlDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "mediaUrl") continue;
      out[k] = stripMediaUrlDeep(v);
    }
    return out as T;
  }
  return value;
}
