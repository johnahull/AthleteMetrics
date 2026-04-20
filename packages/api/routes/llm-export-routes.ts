/**
 * LLM export routes
 *
 * GET /api/athletes/:id/llm-export?format=markdown|json
 *
 * Assembles an athlete-centric export suitable for pasting into an LLM to
 * design a training program. This is a *coaching tool*, not a self-service
 * export — permission model is an allowlist (see `ALLOWED_LLM_EXPORT_ROLES`):
 *   - site_admin: any athlete
 *   - coach / org_admin: athletes in their org (via org membership OR team membership)
 *   - athlete role: denied, even for self-access
 *     (coaches are the audience for LLM-generated training programs)
 *   - all other roles (guest, parent, …): denied
 *
 * The athlete-self-denial is covered by integration test
 * "returns 403 for an athlete attempting to export their own profile".
 */

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { requireAuth } from '../middleware';
import { isSiteAdmin } from '../utils/auth-helpers';
import { getCachedUserOrganizations } from '../helpers/cached-org-access';
import { logAuthorizationFailure } from '../helpers/audit-logging';
import {
  AthleteNotFoundError,
  buildAthleteLlmExport,
} from '../services/llm-export-service';

const llmExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: 'Too many export requests, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// PostgreSQL raises "invalid input syntax for type uuid" when a UUID-typed
// column is queried with a non-UUID string. Several DB lookups in this route
// query `users.id` (UUID), so a malformed route param escapes as a generic
// 500. Validate the shape up-front and return 404 — 400 would leak the fact
// that the route specifically inspects UUID format, narrowing the oracle.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// LLM export is a coaching tool: only coaches, org admins, and site admins
// may generate one. Allocated once at module load rather than per-request;
// the Set is immutable after construction and safe to share.
const ALLOWED_LLM_EXPORT_ROLES = new Set(['coach', 'org_admin']);

export function registerLlmExportRoutes(app: Express) {
  app.get(
    '/api/athletes/:id/llm-export',
    llmExportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const athleteId = req.params.id;
        const currentUser = req.session.user;
        if (!currentUser?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!UUID_RE.test(athleteId)) {
          return res.status(404).json({ message: 'Athlete not found' });
        }

        // Express parses repeated query params (?format=a&format=b) as string[].
        // Pick the first entry so the subsequent === comparison is always a
        // string compare, not a silent array-to-string coercion.
        const rawFormatParam = req.query.format;
        const rawFormat = Array.isArray(rawFormatParam)
          ? rawFormatParam[0]
          : (rawFormatParam ?? 'markdown');
        if (rawFormat !== 'markdown' && rawFormat !== 'json') {
          return res.status(400).json({
            message: "Invalid format — must be 'markdown' or 'json'",
          });
        }

        const userIsSiteAdmin = isSiteAdmin(currentUser);
        let targetOrganizationId: string | null = null;

        // The allowlist is an *allowlist*, not a denylist — any role not
        // explicitly named (athlete, parent, guest, …) is denied, so new
        // roles added to the system default to no-access until a policy
        // decision is made.
        //
        // Role check runs *before* the athlete-existence lookup so a denied
        // caller cannot distinguish "athlete exists but you can't read it"
        // (403) from "athlete does not exist" (404). The 404-vs-403 split is
        // an existence oracle for unauthorised callers; flatten it to 403.
        if (!userIsSiteAdmin && !ALLOWED_LLM_EXPORT_ROLES.has(currentUser.role)) {
          return res.status(403).json({
            message: 'LLM export is only available to coaches and organization admins',
          });
        }

        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: 'Athlete not found' });
        }

        if (!userIsSiteAdmin) {
          const userOrgs = await getCachedUserOrganizations(
            req,
            currentUser.id,
          );
          if (userOrgs.length === 0) {
            // Audit the revoked-coach probe pattern: a session that survived
            // org-membership removal is a signal worth capturing. Without
            // this log, the only other 403 branch (`sharedOrgId === null`,
            // below) is the only audited path — revoked coaches would probe
            // silently.
            logAuthorizationFailure(currentUser.id, 'read', 'athlete', {
              userOrgIds: [],
              ipAddress: req.ip,
              userAgent: req.get('user-agent'),
              route: req.path,
              method: req.method,
            });
            return res
              .status(403)
              .json({ message: 'Access denied - no organization access' });
          }

          // Two independent lookups — fetch in parallel to halve the
          // authorization round-trip cost.
          const [athleteOrgs, athleteTeams] = await Promise.all([
            getCachedUserOrganizations(req, athleteId),
            storage.getUserTeams(athleteId),
          ]);

          if (athleteOrgs.length === 0 && athleteTeams.length === 0) {
            // Generic body to avoid signalling whether the athlete exists or
            // what state their org/team assignments are in.
            return res.status(403).json({ message: 'Access denied' });
          }

          const userOrgIds = userOrgs.map((o) => o.organizationId);
          const athleteOrgIds = athleteOrgs.map((o) => o.organizationId);
          const athleteTeamOrgIds = athleteTeams.map(
            (t) => t.team.organizationId,
          );
          const allAthleteOrgIds = Array.from(
            new Set([...athleteOrgIds, ...athleteTeamOrgIds]),
          );

          const sharedOrgId = allAthleteOrgIds.find((id) =>
            userOrgIds.includes(id),
          );
          if (!sharedOrgId) {
            logAuthorizationFailure(currentUser.id, 'read', 'athlete', {
              attemptedOrgId: allAthleteOrgIds[0],
              userOrgIds,
              ipAddress: req.ip,
              userAgent: req.get('user-agent'),
              route: req.path,
              method: req.method,
            });
            // Generic body to match the sibling branch at line 138 — a caller
            // must not be able to distinguish "athlete is unaffiliated" from
            // "athlete belongs to a different org" by comparing 403 bodies.
            // Differentiated messages let a probing coach oracle an athlete's
            // org-affiliation state; the audit log captures the granular
            // reason server-side where it belongs.
            return res.status(403).json({ message: 'Access denied' });
          }
          targetOrganizationId = sharedOrgId;
        } else {
          // Site admin: use athlete's first org if present, else null.
          const athleteOrgs = await getCachedUserOrganizations(req, athleteId);
          targetOrganizationId = athleteOrgs[0]?.organizationId ?? null;
        }

        const format = rawFormat as 'markdown' | 'json';
        const { content, filename, contentType } = await buildAthleteLlmExport(
          athleteId,
          format,
          { organizationId: targetOrganizationId },
        );

        res.setHeader('Content-Type', contentType);
        // NOTE: `filename=` is the RFC 6266 unquoted-ASCII form. This is
        // only correct because `filenameFor` strips diacritics and collapses
        // non-alphanumerics, so the slug is guaranteed [a-z0-9-]. If Unicode
        // filenames are ever introduced, switch to `filename*=UTF-8''<encoded>`
        // per RFC 5987 to avoid malformed headers on strict HTTP stacks.
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"`,
        );
        // TODO(audit): emit a `data_export` security event for successful
        // exports so exfiltration patterns are detectable — the payload
        // includes medical notes and is intended for external-LLM paste.
        // Deferred: the `createSecurityEventSchema` enum in
        // `@shared/enhanced-auth-schema` does not currently include a
        // `data_export` variant, so this needs a schema+migration change
        // tracked in its own PR. Success-path audit here would be too
        // loosely typed to sit on `authorization_failed` or
        // `suspicious_activity`.
        res.status(200).send(content);
      } catch (err) {
        // If the athlete was deleted between the route-level existence check
        // and the service's own query, the service throws AthleteNotFoundError.
        // Surface as a 404 rather than the generic 500.
        if (err instanceof AthleteNotFoundError) {
          return res.status(404).json({ message: 'Athlete not found' });
        }
        console.error('LLM export failed:', err);
        res.status(500).json({
          message: 'Failed to generate LLM export',
        });
      }
    },
  );
}
