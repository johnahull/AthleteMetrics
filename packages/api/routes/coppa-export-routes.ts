/**
 * COPPA Data Export Routes
 *
 * Endpoints for the data export right (COPPA §312.6(a)(2)).
 * Parents can request and download a full export of their child's data.
 *
 * Endpoints:
 *   POST /api/coppa/data-export/request   — Initiate export (token-gated or auth)
 *   GET  /api/coppa/data-export/download/:downloadToken — One-time download
 */

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware';
import { coppaExportService } from '../services/coppa-export-service';
import { shouldSkipRateLimiting } from '../utils/rate-limit-utils';
import { storage } from '../storage';
import { db } from '../db';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';

// Rate limiter for export request endpoint (strict — prevents export enumeration)
const exportRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  message: { message: 'Too many export requests, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// Rate limiter for download endpoint (permissive — token itself is the gate)
const exportDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { message: 'Too many download requests, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

/**
 * Auth-gated request body schema.
 * When the caller is authenticated (site_admin or org_admin), they provide athleteUserId.
 */
const authExportRequestSchema = z.object({
  athleteUserId: z.string().min(1, 'athleteUserId is required'),
  requestedByEmail: z.string().email('requestedByEmail must be a valid email'),
});

/**
 * Token-gated (public) request body schema.
 * Parents supply their consentId + email to prove ownership without logging in.
 */
const tokenGatedExportRequestSchema = z.object({
  consentId: z.string().min(1, 'consentId is required'),
  parentEmail: z.string().email('parentEmail must be a valid email'),
});

export function registerCoppaExportRoutes(app: Express) {
  /**
   * POST /api/coppa/data-export/request
   *
   * Two access modes:
   *
   * 1. Authenticated (site_admin or org_admin):
   *    Body: { athleteUserId, requestedByEmail }
   *
   * 2. Token-gated (parent, unauthenticated):
   *    Body: { consentId, parentEmail }
   *    Verifies consentId belongs to parentEmail (confirmed consent required)
   */
  app.post('/api/coppa/data-export/request', exportRequestLimiter, async (req, res) => {
    try {
      const isAuthenticated = !!req.session.user;

      if (isAuthenticated) {
        // ---- Authenticated path ----
        const actor = req.session.user!;

        const bodyResult = authExportRequestSchema.safeParse(req.body);
        if (!bodyResult.success) {
          return res.status(400).json({
            message: 'Invalid request body',
            errors: bodyResult.error.errors,
          });
        }

        const { athleteUserId } = bodyResult.data;
        // Authenticated actors cannot redirect the download-ready notification
        // (a one-time link to the athlete's full data export) to an arbitrary
        // address — always use the session's own email, ignoring the body.
        const requestedByEmail = actor.email;

        // Authorization: site_admin can request for any athlete.
        // parent must have an active link to the athlete (covers 13-17 minors with no consent record).
        // org_admin must share an organization with the athlete.
        if (!actor.isSiteAdmin) {
          if (actor.role === 'parent') {
            // Authenticated parent: verify active link to the target athlete
            const parentLink = await db.select({ id: parentAthleteLinks.id })
              .from(parentAthleteLinks)
              .where(and(
                eq(parentAthleteLinks.parentUserId, actor.id),
                eq(parentAthleteLinks.athleteUserId, athleteUserId),
                eq(parentAthleteLinks.isActive, true),
              ))
              .limit(1);
            if (parentLink.length === 0) {
              return res.status(403).json({ message: 'Insufficient permissions' });
            }
          } else if (actor.role === 'org_admin') {
            // org_admin must share an organization with the athlete
            const actorOrgs = await storage.getUserOrganizations(actor.id);
            const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
            const isAuthorized = actorOrgs.some(ao =>
              ao.role === 'org_admin' &&
              athleteOrgs.some(eo => eo.organizationId === ao.organizationId),
            );
            if (!isAuthorized) {
              return res.status(403).json({ message: 'Insufficient permissions' });
            }
          } else {
            return res.status(403).json({ message: 'Insufficient permissions' });
          }
        }

        // Verify athlete exists (service also checks, but gives cleaner 404 here)
        const athlete = await storage.getUser(athleteUserId);
        if (!athlete) {
          return res.status(404).json({ message: 'Athlete not found' });
        }

        const result = await coppaExportService.requestExport({
          athleteUserId,
          requestedByEmail,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          actorUserId: actor.id,
        });

        if (!result.success) {
          return res.status(500).json({ message: result.error || 'Failed to create export request' });
        }

        return res.json({ success: true, exportRequestId: result.exportRequestId });
      }

      // ---- Token-gated (public) path ----
      const bodyResult = tokenGatedExportRequestSchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({
          message: 'Invalid request body. Provide either (consentId + parentEmail) or authenticate as an admin.',
          errors: bodyResult.error.errors,
        });
      }

      const { consentId, parentEmail } = bodyResult.data;

      // Verify the parent owns this consent record
      const ownershipCheck = await coppaExportService.verifyConsentOwnership(consentId, parentEmail);
      if (!ownershipCheck.valid) {
        const statusCode = ownershipCheck.reason === 'not_found' ? 404 : 403;
        return res.status(statusCode).json({ message: ownershipCheck.error });
      }

      const result = await coppaExportService.requestExport({
        athleteUserId: ownershipCheck.athleteUserId!,
        requestedByEmail: parentEmail,
        consentId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(500).json({ message: result.error || 'Failed to create export request' });
      }

      return res.json({ success: true, exportRequestId: result.exportRequestId });
    } catch (error) {
      console.error('[COPPA Export] POST /data-export/request error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  /**
   * GET /api/coppa/data-export/download/:downloadToken
   *
   * One-time download endpoint — the download token is the authorization.
   * Returns JSON export bundle. Token is invalidated (status → 'delivered') after first use.
   *
   * Status codes:
   *  200 - Export bundle returned, token consumed
   *  400 - Invalid token format
   *  404 - Token not found
   *  410 - Token already used or expired
   *  500 - Internal error
   */
  app.get('/api/coppa/data-export/download/:downloadToken', exportDownloadLimiter, async (req, res) => {
    try {
      const { downloadToken } = req.params;

      if (!downloadToken || typeof downloadToken !== 'string' || downloadToken.length !== 64 || !/^[0-9a-f]+$/i.test(downloadToken)) {
        return res.status(400).json({ message: 'Invalid token format' });
      }

      const result = await coppaExportService.downloadExport(downloadToken);

      if (!result.success) {
        return res.status(result.statusCode || 400).json({ message: result.error });
      }

      // Return the export bundle as JSON
      // Content-Disposition allows browsers to "Save As" the file
      res.setHeader('Content-Disposition', 'attachment; filename="athlete-data-export.json"');
      res.setHeader('Content-Type', 'application/json');
      return res.json(result.bundle);
    } catch (error) {
      console.error('[COPPA Export] GET /data-export/download/:downloadToken error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
}
