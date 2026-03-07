/**
 * Device Import Routes
 *
 * Generic routes for importing data from timing gate devices (Dashr, OVR, etc.)
 * POST /api/import/device/parse     — Upload CSV → parse → return preview
 * POST /api/import/device/commit    — Commit batch by parseSessionId
 * GET  /api/import/device/batches   — List batches for org
 * GET  /api/import/device/batches/:batchId — Batch detail
 * POST /api/import/device/batches/:batchId/rollback — Rollback batch
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { DeviceImportService } from "../services/device-import-service";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { isSiteAdmin } from "../utils/auth-helpers";
import { storage } from "../storage";

const importService = new DeviceImportService();

// Rate limiter for device imports
const deviceImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many import requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'upload'),
});

// Multer config for CSV upload (same pattern as import-export-routes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_CSV_FILE_SIZE || '5242880'),
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
    const hasValidMime = allowedMimeTypes.includes(file.mimetype);
    const hasValidExtension = file.originalname.toLowerCase().endsWith('.csv');

    if (hasValidMime && hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'));
    }
  },
});

// Validation schemas
const parseRequestSchema = z.object({
  source: z.enum(['dashr']),
  organizationId: z.string().min(1),
  eventId: z.string().optional(),
  sessionDate: z.string().optional(),
});

const orgQuerySchema = z.object({
  organizationId: z.string().min(1),
});

const commitRequestSchema = z.object({
  batchId: z.string().min(1),
  organizationId: z.string().min(1),
  duplicateStrategy: z.enum(['skip', 'replace']),
  addMissingEventMetrics: z.boolean().default(false),
  athletes: z.array(z.object({
    csvName: z.string(),
    matchedAthleteId: z.string().optional(),
    included: z.boolean(),
  })),
});

export function registerDeviceImportRoutes(app: Express) {
  // ── Parse CSV ──────────────────────────────────────
  app.post("/api/import/device/parse",
    deviceImportLimiter,
    requireAuth,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        // Parse form data (multer puts body fields in req.body)
        const body = parseRequestSchema.safeParse(req.body);
        if (!body.success) {
          return res.status(400).json({
            message: "Invalid request",
            errors: body.error.flatten().fieldErrors,
          });
        }

        const { source, organizationId, eventId, sessionDate } = body.data;

        // Permission check: must be coach or admin in the org
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, organizationId);
          if (!roles.includes('org_admin') && !roles.includes('coach')) {
            return res.status(403).json({
              message: "Access denied. Coach or admin role required for device imports.",
            });
          }
        }

        const result = await importService.parseAndMatch(
          file.buffer,
          file.originalname,
          source,
          organizationId,
          user.id,
          eventId,
          sessionDate,
        );

        return res.json(result);
      } catch (error: any) {
        console.error('Device import parse error:', error);
        return res.status(400).json({ message: error.message });
      }
    }
  );

  // ── Commit Batch ───────────────────────────────────
  app.post("/api/import/device/commit",
    deviceImportLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const body = commitRequestSchema.safeParse(req.body);
        if (!body.success) {
          return res.status(400).json({
            message: "Invalid request",
            errors: body.error.flatten().fieldErrors,
          });
        }

        const { batchId, organizationId, duplicateStrategy, addMissingEventMetrics, athletes } = body.data;

        // Permission check: must be coach or admin in the org
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, organizationId);
          if (!roles.includes('org_admin') && !roles.includes('coach')) {
            return res.status(403).json({
              message: "Access denied. Coach or admin role required.",
            });
          }
        }

        const result = await importService.commitBatch({
          batchId,
          duplicateStrategy,
          addMissingEventMetrics,
          athletes,
          committedBy: user.id,
          organizationId,
        });

        return res.json(result);
      } catch (error: any) {
        console.error('Device import commit error:', error);
        if (error.message.includes('expired')) {
          return res.status(410).json({ message: error.message });
        }
        if (error.message.includes('frozen')) {
          return res.status(409).json({ message: error.message });
        }
        return res.status(400).json({ message: error.message });
      }
    }
  );

  // ── List Batches ───────────────────────────────────
  app.get("/api/import/device/batches",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const query = orgQuerySchema.safeParse(req.query);
        if (!query.success) {
          return res.status(400).json({ message: "organizationId required" });
        }
        const { organizationId } = query.data;

        // Permission check: must be coach or admin in the org
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, organizationId);
          if (!roles.includes('org_admin') && !roles.includes('coach')) {
            return res.status(403).json({
              message: "Access denied. Coach or admin role required.",
            });
          }
        }

        const batches = await importService.getBatches(organizationId);
        return res.json({ batches });
      } catch (error: any) {
        console.error('Device import list batches error:', error);
        return res.status(500).json({ message: error.message });
      }
    }
  );

  // ── Batch Detail ───────────────────────────────────
  app.get("/api/import/device/batches/:batchId",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const query = orgQuerySchema.safeParse(req.query);
        if (!query.success) {
          return res.status(400).json({ message: "organizationId required" });
        }
        const { organizationId } = query.data;

        // Permission check: must be coach or admin in the org
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, organizationId);
          if (!roles.includes('org_admin') && !roles.includes('coach')) {
            return res.status(403).json({
              message: "Access denied. Coach or admin role required.",
            });
          }
        }

        const batch = await importService.getBatchDetail(req.params.batchId, organizationId);
        if (!batch) {
          return res.status(404).json({ message: "Batch not found" });
        }

        return res.json(batch);
      } catch (error: any) {
        console.error('Device import batch detail error:', error);
        return res.status(500).json({ message: error.message });
      }
    }
  );

  // ── Rollback Batch ─────────────────────────────────
  app.post("/api/import/device/batches/:batchId/rollback",
    deviceImportLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const body = orgQuerySchema.safeParse(req.body);
        if (!body.success) {
          return res.status(400).json({ message: "organizationId required" });
        }
        const { organizationId } = body.data;

        // Permission check: must be coach or admin in the org
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, organizationId);
          if (!roles.includes('org_admin') && !roles.includes('coach')) {
            return res.status(403).json({
              message: "Access denied. Coach or admin role required.",
            });
          }
        }

        await importService.rollbackBatch(req.params.batchId, user.id, organizationId);

        return res.json({ message: "Import rolled back successfully" });
      } catch (error: any) {
        console.error('Device import rollback error:', error);
        return res.status(400).json({ message: error.message });
      }
    }
  );
}
