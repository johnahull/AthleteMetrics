/**
 * Report template routes. Authorization is by the organization of the ROW (URL org, or the template's own);
 * anything the caller may not touch answers 404.
 */
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { createReportTemplateSchema, updateReportTemplateSchema } from "@shared/report-template-schemas";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import type { SessionUser } from "../utils/auth-helpers";
import * as svc from "../services/report-template-service";

const limiter = (limit: number, message: string) =>
  rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, limit, message: { message }, standardHeaders: "draft-7", legacyHeaders: false });
const readLimiter = limiter(RATE_LIMITS.STANDARD, "Too many requests, please try again later.");
const writeLimiter = limiter(RATE_LIMITS.MUTATION, "Too many modification attempts, please try again later.");

const NOT_FOUND = { error: "Not found" };

function handleError(res: Response, error: unknown) {
  if (error instanceof svc.TemplateConflictError) return res.status(409).json({ error: error.message });
  console.error("Report template route error:", error);
  return res.status(500).json({ error: "Internal server error" });
}

export function registerReportTemplateRoutes(app: Express) {
  const userOf = (req: Request) => req.user as SessionUser;

  app.get("/api/organizations/:orgId/report-templates", requireAuth, readLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId))) return res.status(404).json(NOT_FOUND);
      return res.json(await svc.listTemplates(req.params.orgId));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.post("/api/organizations/:orgId/report-templates", requireAuth, writeLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId))) return res.status(404).json(NOT_FOUND);
      // A member's org exists by FK; only a site admin can name an org that does not
      if (userOf(req).isSiteAdmin && !(await svc.organizationExists(req.params.orgId))) return res.status(404).json(NOT_FOUND);
      const parsed = createReportTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
      return res.status(201).json(await svc.createTemplate(req.params.orgId, userOf(req).id, parsed.data));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.patch("/api/report-templates/:id", requireAuth, writeLimiter, async (req, res) => {
    try {
      const template = await svc.getWritableTemplate(userOf(req), req.params.id);
      if (!template) return res.status(404).json(NOT_FOUND);
      const parsed = updateReportTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
      const updated = await svc.updateTemplate(template.id, parsed.data);
      return updated ? res.json(updated) : res.status(404).json(NOT_FOUND);
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.delete("/api/report-templates/:id", requireAuth, writeLimiter, async (req, res) => {
    try {
      const template = await svc.getWritableTemplate(userOf(req), req.params.id);
      if (!template) return res.status(404).json(NOT_FOUND);
      await svc.deleteTemplate(template.id);
      return res.status(204).end();
    } catch (e) {
      return handleError(res, e);
    }
  });
}
