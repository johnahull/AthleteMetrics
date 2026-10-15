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

/** Organization roles that may read clips on other athletes' measurements of that organization */
const CLIP_READER_ROLES = new Set(["coach", "org_admin"]);

export interface ClipViewer {
  userId: string;
  isSiteAdmin: boolean;
  /** organizationId -> the viewer's membership role in that organization */
  orgRoles: ReadonlyMap<string, string>;
}

/** Build a ClipViewer from the session user and their organization memberships (from the database) */
export function clipViewer(
  user: { id: string; isSiteAdmin?: boolean },
  memberships: Array<{ organizationId: string; role: string }>
): ClipViewer {
  return {
    userId: user.id,
    isSiteAdmin: user.isSiteAdmin === true,
    orgRoles: new Map(memberships.map((m) => [m.organizationId, m.role])),
  };
}

/**
 * Clip read rule for authenticated organization-scoped views: a row keeps its
 * mediaUrl only for a site admin, the athlete who owns the row, or a coach /
 * org admin of the row's organization. Everyone else (a teammate athlete, a
 * parent, a guest) gets the row without mediaUrl.
 */
export function omitClipsHiddenFromViewer<T extends { userId: string; organizationId: string | null }>(
  rows: T[],
  viewer: ClipViewer
): Array<T | Omit<T, "mediaUrl">> {
  if (viewer.isSiteAdmin) return rows;
  return rows.map((row) => {
    const role = row.organizationId ? viewer.orgRoles.get(row.organizationId) : undefined;
    const visible = row.userId === viewer.userId || (role !== undefined && CLIP_READER_ROLES.has(role));
    return visible ? row : omitMediaUrl(row);
  });
}

/**
 * Recursively remove every `mediaUrl` key from plain objects/arrays, including
 * null-prototype objects. Class instances (Dates etc.) are preserved as-is.
 */
export function stripMediaUrlDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripMediaUrlDeep(v)) as unknown as T;
  }
  const proto = value !== null && typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "mediaUrl") continue;
      out[k] = stripMediaUrlDeep(v);
    }
    return out as T;
  }
  return value;
}
