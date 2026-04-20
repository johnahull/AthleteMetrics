/**
 * LLM export routes
 *
 * GET /api/athletes/:id/llm-export?format=markdown|json
 *
 * Assembles an athlete-centric export suitable for pasting into an LLM to
 * design a training program. Permission model mirrors GET /api/athletes/:id:
 *   - site admin: any athlete
 *   - athlete role: only self
 *   - coach / org_admin: athletes in their org (via org membership OR team membership)
 */

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { requireAuth } from '../middleware';
import { isSiteAdmin } from '../utils/auth-helpers';
import { getCachedUserOrganizations } from '../helpers/cached-org-access';
import { logAuthorizationFailure } from '../helpers/audit-logging';
import { buildAthleteLlmExport } from '../services/llm-export-service';

const llmExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: 'Too many export requests, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

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

        const rawFormat = (req.query.format ?? 'markdown') as string;
        if (rawFormat !== 'markdown' && rawFormat !== 'json') {
          return res.status(400).json({
            message: "Invalid format — must be 'markdown' or 'json'",
          });
        }

        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: 'Athlete not found' });
        }

        const userIsSiteAdmin = isSiteAdmin(currentUser);
        let targetOrganizationId: string | null = null;

        // LLM export is a coaching tool: only coaches, org admins, and site
        // admins may generate one. This is an *allowlist*, not a denylist —
        // any role not explicitly named here (athlete, parent, guest, …) is
        // denied, so new roles added to the system default to no-access until
        // a policy decision is made.
        const ALLOWED_LLM_EXPORT_ROLES = new Set(['coach', 'org_admin']);
        if (!userIsSiteAdmin && !ALLOWED_LLM_EXPORT_ROLES.has(currentUser.role)) {
          return res.status(403).json({
            message: 'LLM export is only available to coaches and organization admins',
          });
        }

        if (!userIsSiteAdmin) {
          const userOrgs = await getCachedUserOrganizations(
            req,
            currentUser.id,
          );
          if (userOrgs.length === 0) {
            return res
              .status(403)
              .json({ message: 'Access denied - no organization access' });
          }

          const athleteOrgs = await getCachedUserOrganizations(req, athleteId);
          const athleteTeams = await storage.getUserTeams(athleteId);

          if (athleteOrgs.length === 0 && athleteTeams.length === 0) {
            return res.status(403).json({
              message: 'Athlete has no organization or team assignments',
            });
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
            return res.status(403).json({
              message:
                'Access denied - athlete belongs to a different organization',
            });
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
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"`,
        );
        res.status(200).send(content);
      } catch (err) {
        console.error('LLM export failed:', err);
        res.status(500).json({
          message: 'Failed to generate LLM export',
        });
      }
    },
  );
}
