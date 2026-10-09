/**
 * Eval battery template and org eval report settings routes (AM-FEAT-019 P2).
 * Authorization is by the organization of the ROW; a row the caller may not touch answers 404.
 */
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware";
import { db } from "../db";
import { events } from "@shared/schema";
import {
  applyEvalTemplateSchema,
  createEvalTemplateFromEventSchema,
  createEvalTemplateSchema,
  evalReportSettingsInputSchema,
  updateEvalTemplateSchema,
} from "@shared/eval-template-schemas";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import type { SessionUser } from "../utils/auth-helpers";
import * as svc from "../services/eval-template-service";

const limiter = (limit: number, message: string) =>
  rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, limit, message: { message }, standardHeaders: "draft-7", legacyHeaders: false });
const readLimiter = limiter(RATE_LIMITS.STANDARD, "Too many requests, please try again later.");
const writeLimiter = limiter(RATE_LIMITS.MUTATION, "Too many modification attempts, please try again later.");

const NOT_FOUND = { error: "Not found" };

function handleError(res: Response, error: unknown) {
  if (error instanceof svc.TemplateNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof svc.TemplateConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof svc.EventFrozenError) return res.status(409).json({ error: error.message });
  if (error instanceof svc.EmptyEventError) return res.status(400).json({ error: error.message });
  if (error instanceof svc.TemplateValidationError) return res.status(400).json({ error: error.message });
  console.error("Eval template route error:", error);
  return res.status(500).json({ error: "Internal server error" });
}

export function registerEvalTemplateRoutes(app: Express) {
  const userOf = (req: Request) => req.user as SessionUser;

  /** The event, only if the caller writes in the event's own organization. */
  async function writableEvent(req: Request) {
    const [event] = await db.select({ id: events.id, organizationId: events.organizationId }).from(events).where(eq(events.id, req.params.eventId));
    if (!event?.organizationId || !(await svc.isOrgWriter(userOf(req), event.organizationId))) return null;
    return { id: event.id, organizationId: event.organizationId };
  }

  app.get("/api/organizations/:orgId/eval-templates", requireAuth, readLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId))) return res.status(404).json(NOT_FOUND);
      return res.json(await svc.listTemplates(req.params.orgId));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.post("/api/organizations/:orgId/eval-templates", requireAuth, writeLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId)) || !(await svc.organizationExists(req.params.orgId))) return res.status(404).json(NOT_FOUND);
      const parsed = createEvalTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
      return res.status(201).json(await svc.createTemplate(req.params.orgId, userOf(req).id, parsed.data));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.post("/api/events/:eventId/eval-templates", requireAuth, writeLimiter, async (req, res) => {
    try {
      const event = await writableEvent(req);
      if (!event) return res.status(404).json(NOT_FOUND);
      const parsed = createEvalTemplateFromEventSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
      return res.status(201).json(await svc.createTemplateFromEvent(event, userOf(req).id, parsed.data));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.get("/api/eval-templates/:id", requireAuth, readLimiter, async (req, res) => {
    try {
      const template = await svc.getVisibleTemplate(userOf(req), req.params.id);
      return template ? res.json(template) : res.status(404).json(NOT_FOUND);
    } catch (e) {
      return handleError(res, e);
    }
  });

  /** Resolve the template for a change; 404 if not visible, 403 if visible but not editable (global default). */
  async function editableTemplate(req: Request, res: Response) {
    const template = await svc.getVisibleTemplate(userOf(req), req.params.id);
    if (!template) {
      res.status(404).json(NOT_FOUND);
      return null;
    }
    if (!(await svc.canEditTemplate(userOf(req), template))) {
      res.status(403).json({ error: "Only a site admin can change the default template" });
      return null;
    }
    return template;
  }

  app.patch("/api/eval-templates/:id", requireAuth, writeLimiter, async (req, res) => {
    try {
      const template = await editableTemplate(req, res);
      if (!template) return;
      const parsed = updateEvalTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
      return res.json(await svc.updateTemplate(template.id, parsed.data));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.post("/api/eval-templates/:id/archive", requireAuth, writeLimiter, async (req, res) => {
    try {
      const template = await editableTemplate(req, res);
      if (!template) return;
      return res.json(await svc.archiveTemplate(template.id));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.delete("/api/eval-templates/:id", requireAuth, writeLimiter, async (req, res) => {
    try {
      const template = await editableTemplate(req, res);
      if (!template) return;
      if (!template.organizationId) return res.status(409).json({ error: "The default template cannot be deleted; archive it instead" });
      await svc.deleteTemplate(template.id);
      return res.status(204).end();
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.post("/api/events/:eventId/apply-eval-template", requireAuth, writeLimiter, async (req, res) => {
    try {
      // Authorize the event before looking at the body
      const event = await writableEvent(req);
      if (!event) return res.status(404).json(NOT_FOUND);
      const parsed = applyEvalTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const template = await svc.getVisibleTemplate(userOf(req), parsed.data.templateId);
      // A template of another organization is invisible here even to a writer of both organizations
      if (!template || template.archivedAt || (template.organizationId && template.organizationId !== event.organizationId)) {
        return res.status(404).json(NOT_FOUND);
      }
      return res.json(await svc.applyTemplateToEvent(event.id, userOf(req).id, template, parsed.data.includeOptional));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.get("/api/organizations/:orgId/eval-report-settings", requireAuth, readLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId))) return res.status(404).json(NOT_FOUND);
      return res.json(await svc.getSettings(req.params.orgId));
    } catch (e) {
      return handleError(res, e);
    }
  });

  app.put("/api/organizations/:orgId/eval-report-settings", requireAuth, writeLimiter, async (req, res) => {
    try {
      if (!(await svc.isOrgWriter(userOf(req), req.params.orgId)) || !(await svc.organizationExists(req.params.orgId))) return res.status(404).json(NOT_FOUND);
      const parsed = evalReportSettingsInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten() });
      return res.json(await svc.putSettings(req.params.orgId, userOf(req).id, parsed.data));
    } catch (e) {
      return handleError(res, e);
    }
  });
}
