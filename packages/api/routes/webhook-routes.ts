/**
 * Webhook routes — external systems POST here.
 *
 * Currently exposes:
 *   POST /api/webhooks/jotform-waiver — Jotform sends form-encoded body with
 *     `submissionID` and `rawRequest` (a JSON string of the form answers).
 *     Authentication is via shared secret query param (`?secret=...`).
 *
 * Implementation notes:
 *   - The route is intentionally CSRF/cookie-free (Jotform is unauthenticated
 *     to our session). The shared secret is the only auth mechanism.
 *   - The handler uses constant-time comparison on the secret to avoid timing
 *     attacks.
 *   - Idempotency, parsing and persistence are delegated to `waiver-service`
 *     so the route file stays thin and unit-testable in isolation.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import {
  processJotformWaiver,
  defaultWaiverStore,
  type WaiverStore,
  type JotformWaiverEnvelope,
} from "../services/waiver-service";

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function readSecret(req: Request): string | undefined {
  // Accept either ?secret=... (per the issue spec) or X-Webhook-Secret header
  // for parity with other webhook conventions.
  const fromQuery = req.query?.secret;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  const fromHeader = req.get("x-webhook-secret");
  if (typeof fromHeader === "string" && fromHeader.length > 0) return fromHeader;
  return undefined;
}

function readSubmissionId(body: any): string | undefined {
  // Jotform documents the field as `submissionID` (capital ID); accept the
  // common variants too in case of forwarders that lowercase keys.
  const candidates = [body?.submissionID, body?.submissionId, body?.submission_id];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
  }
  return undefined;
}

function readRawRequest(body: any): { parsed: Record<string, unknown> } | { error: string } {
  // Jotform ships rawRequest as a JSON string in the form-encoded body.
  // Some forwarders may already decode it into an object; handle both.
  const value = body?.rawRequest ?? body?.raw_request;
  if (value == null) return { error: "Missing rawRequest" };
  if (typeof value === "object" && !Array.isArray(value)) return { parsed: value as Record<string, unknown> };
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsed: parsed as Record<string, unknown> };
      }
      return { error: "rawRequest JSON must be an object" };
    } catch (_e) {
      return { error: "Malformed rawRequest JSON" };
    }
  }
  return { error: "Unsupported rawRequest type" };
}

export interface RegisterWebhookRoutesOptions {
  /** Override the underlying store (used in tests). */
  store?: WaiverStore;
  /** Override the configured shared secret (used in tests). */
  getConfiguredSecret?: () => string | undefined;
}

export function registerWebhookRoutes(app: Express, options: RegisterWebhookRoutesOptions = {}) {
  const store = options.store ?? defaultWaiverStore;
  const getConfiguredSecret = options.getConfiguredSecret
    ?? (() => process.env.JOTFORM_WEBHOOK_SECRET);

  app.post("/api/webhooks/jotform-waiver", async (req: Request, res: Response) => {
    const configured = getConfiguredSecret();
    if (!configured) {
      // Fail closed: if the secret is unset, the webhook is effectively
      // disabled. This avoids a "no-secret-configured" state silently
      // allowing every request through.
      console.error("[webhook:jotform-waiver] JOTFORM_WEBHOOK_SECRET is not configured");
      return res.status(503).json({ ok: false, error: "Webhook is not configured" });
    }

    const provided = readSecret(req);
    if (!provided || !constantTimeEquals(provided, configured)) {
      return res.status(401).json({ ok: false, error: "Invalid secret" });
    }

    const submissionId = readSubmissionId(req.body);
    if (!submissionId) {
      return res.status(400).json({ ok: false, error: "Missing submissionID" });
    }

    const rawResult = readRawRequest(req.body);
    if ("error" in rawResult) {
      // Persisting bad payloads is intentional skip: we have nothing reliable
      // to key idempotency on except submissionID, and the body wasn't usable.
      // Log the rejection with enough context for manual inspection.
      console.warn("[webhook:jotform-waiver] Rejecting request", {
        submissionId,
        reason: rawResult.error,
      });
      return res.status(400).json({ ok: false, error: rawResult.error });
    }

    const envelope: JotformWaiverEnvelope = {
      submissionId,
      formId: typeof req.body?.formID === "string" ? req.body.formID
        : typeof req.body?.formId === "string" ? req.body.formId
        : null,
      rawRequest: rawResult.parsed,
      // Keep the full envelope (including formID, submissionID, etc.) for
      // recovery — strip only the secret which we already validated.
      fullPayload: redactSecret(req.body),
    };

    try {
      const result = await processJotformWaiver(envelope, store, {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Map service result to HTTP status.
      // 200: created or duplicate (Jotform should treat both as success so it
      //      stops retrying). 500 only on unrecoverable processing failure.
      if (result.status === "failed") {
        return res.status(500).json({
          ok: false,
          status: result.status,
          submissionId: result.submissionId,
          message: result.message,
        });
      }
      return res.status(200).json({
        ok: true,
        status: result.status,
        submissionId: result.submissionId,
        athleteUserId: result.athleteUserId,
      });
    } catch (err) {
      // Defensive: processJotformWaiver catches its own errors, but log raw
      // payload context here too in case the route layer itself throws.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[webhook:jotform-waiver] Unhandled processing error", {
        submissionId,
        error: message,
        rawPayloadPreview: typeof req.body === "object"
          ? Object.keys(req.body).slice(0, 20)
          : typeof req.body,
      });
      return res.status(500).json({ ok: false, error: "Internal error", submissionId });
    }
  });
}

function redactSecret(body: any): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const copy: Record<string, unknown> = { ...body };
  // Defense-in-depth: even though Jotform sends the secret in the query
  // string, some forwarders include both — never persist secret values.
  delete copy.secret;
  return copy;
}
