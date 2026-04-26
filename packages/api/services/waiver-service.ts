/**
 * Waiver Service — Jotform webhook intake
 *
 * Processes a single Jotform waiver submission:
 *   1. Idempotency: short-circuit if `submission_id` was already received.
 *   2. Persist the raw payload to `waiver_submissions` so failures can be
 *      replayed/repaired manually.
 *   3. Match or create the athlete user by email.
 *   4. Mark the submission as processed and emit an audit log entry that
 *      doubles as an internal admin notification (existing pattern in this
 *      codebase — see `notifyNewMeasurement` / membership-request audit logs).
 *
 * Parent/guardian information is denormalized onto the submission row.
 * AthleteMetrics has no parent/guardian domain yet; introducing one would
 * exceed the scope of issue #370. The parent fields are intentionally kept
 * intact on the submission so a future migration can extract them.
 *
 * TODO: download the actual PDF binary from `pdfUrl`. Today we record the
 * Jotform-hosted URL only; binary attachment plumbing does not exist yet
 * in this repo.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  waiverSubmissions,
  type WaiverSubmission,
  type InsertWaiverSubmission,
  users,
  type User,
  type InsertUser,
  type InsertAuditLog,
} from "@shared/schema";

/**
 * Parsed view of a Jotform webhook envelope. The webhook ships
 * `submissionID` + `rawRequest` (a JSON string of the form's answers); the
 * route handler is responsible for parsing those before handing them to the
 * service.
 */
export interface JotformWaiverEnvelope {
  submissionId: string;
  formId?: string | null;
  /** Parsed Jotform `rawRequest` JSON — keys are unique per form. */
  rawRequest: Record<string, unknown>;
  /** Original combined payload (rawRequest plus envelope) — preserved as-is. */
  fullPayload: Record<string, unknown>;
}

export interface ProcessJotformWaiverContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface ProcessJotformWaiverResult {
  status: "created" | "duplicate" | "failed";
  submissionId: string;
  submission?: WaiverSubmission;
  athleteUserId?: string;
  message?: string;
}

/**
 * Subset of storage/db calls the service needs. Concrete implementations
 * use Drizzle/storage; tests inject in-memory fakes so we can exercise the
 * full happy path without a database.
 */
export interface WaiverStore {
  findBySubmissionId(submissionId: string): Promise<WaiverSubmission | undefined>;
  createSubmission(data: InsertWaiverSubmission): Promise<WaiverSubmission>;
  markProcessed(id: string, athleteUserId: string | null): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  findUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  createAuditLog(data: InsertAuditLog): Promise<void>;
}

export const defaultWaiverStore: WaiverStore = {
  async findBySubmissionId(submissionId) {
    const rows = await db
      .select()
      .from(waiverSubmissions)
      .where(eq(waiverSubmissions.submissionId, submissionId))
      .limit(1);
    return rows[0];
  },
  async createSubmission(data) {
    const [row] = await db.insert(waiverSubmissions).values(data).returning();
    return row;
  },
  async markProcessed(id, athleteUserId) {
    await db
      .update(waiverSubmissions)
      .set({
        status: "processed",
        processedAt: new Date(),
        athleteUserId: athleteUserId ?? null,
        errorMessage: null,
      })
      .where(eq(waiverSubmissions.id, id));
  },
  async markFailed(id, errorMessage) {
    await db
      .update(waiverSubmissions)
      .set({ status: "failed", errorMessage })
      .where(eq(waiverSubmissions.id, id));
  },
  async findUserByEmail(email) {
    return await storage.getUserByEmail(email);
  },
  async createUser(data) {
    return await storage.createUser(data);
  },
  async createAuditLog(data) {
    await storage.createAuditLog(data);
  },
};

// ---------------------------------------------------------------------------
// Field extraction helpers — Jotform field keys vary per form (e.g. `q3_name`,
// `name`, `email3`). We try a small set of common keys and accept whichever
// one is present. Operators can extend this list as new forms are added.
// ---------------------------------------------------------------------------

const ATHLETE_EMAIL_KEYS = ["athleteEmail", "email", "email3"];
const ATHLETE_NAME_KEYS = ["athleteName", "name", "fullName"];
const ATHLETE_FIRST_NAME_KEYS = ["athleteFirst", "firstName"];
const ATHLETE_LAST_NAME_KEYS = ["athleteLast", "lastName"];
const ATHLETE_BIRTH_DATE_KEYS = ["athleteBirthDate", "birthDate", "dob", "dateOfBirth"];
const PARENT_NAME_KEYS = ["parentName", "guardianName", "parent"];
const PARENT_EMAIL_KEYS = ["parentEmail", "guardianEmail"];
const PARENT_PHONE_KEYS = ["parentPhone", "guardianPhone", "phone"];
const PDF_URL_KEYS = ["pdfUrl", "pdf", "documentUrl"];
const SIGNED_AT_KEYS = ["signedAt", "signedDate", "createdAt"];

function pickString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // Jotform "name"/"address" style fields are objects with parts.
      const obj = v as Record<string, unknown>;
      const parts = ["first", "last", "full", "value"]
        .map((k) => obj[k])
        .filter((p): p is string => typeof p === "string" && p.trim() !== "");
      if (parts.length > 0) return parts.join(" ").trim();
    }
  }
  return undefined;
}

function pickFirstLast(raw: Record<string, unknown>, keys: string[]): { first?: string; last?: string } {
  for (const key of keys) {
    const v = raw[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const first = typeof obj.first === "string" ? obj.first.trim() : undefined;
      const last = typeof obj.last === "string" ? obj.last.trim() : undefined;
      if (first || last) return { first, last };
    }
  }
  return {};
}

function parseDateSafe(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Jotform "date" fields can be "YYYY-MM-DD" or "MM/DD/YYYY". Try ISO first.
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [_, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function parseTimestampSafe(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

interface ExtractedFields {
  athleteEmail?: string;
  athleteFirstName?: string;
  athleteLastName?: string;
  athleteBirthDate?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  pdfUrl?: string;
  signedAt?: Date;
}

export function extractWaiverFields(raw: Record<string, unknown>): ExtractedFields {
  const email = pickString(raw, ATHLETE_EMAIL_KEYS);
  const fullName = pickString(raw, ATHLETE_NAME_KEYS);
  let first = pickString(raw, ATHLETE_FIRST_NAME_KEYS);
  let last = pickString(raw, ATHLETE_LAST_NAME_KEYS);
  if (!first || !last) {
    const fl = pickFirstLast(raw, ATHLETE_NAME_KEYS);
    first = first ?? fl.first;
    last = last ?? fl.last;
  }
  if ((!first || !last) && fullName) {
    const parts = fullName.split(/\s+/);
    if (!first) first = parts[0];
    if (!last && parts.length > 1) last = parts.slice(1).join(" ");
  }

  return {
    athleteEmail: email?.toLowerCase(),
    athleteFirstName: first,
    athleteLastName: last,
    athleteBirthDate: parseDateSafe(pickString(raw, ATHLETE_BIRTH_DATE_KEYS)),
    parentName: pickString(raw, PARENT_NAME_KEYS),
    parentEmail: pickString(raw, PARENT_EMAIL_KEYS)?.toLowerCase(),
    parentPhone: pickString(raw, PARENT_PHONE_KEYS),
    pdfUrl: pickString(raw, PDF_URL_KEYS),
    signedAt: parseTimestampSafe(pickString(raw, SIGNED_AT_KEYS)),
  };
}

// ---------------------------------------------------------------------------
// Username helpers — derive a stable, unique-ish username from the email so
// we can satisfy the NOT NULL+UNIQUE constraint on users.username for athletes
// auto-created from waiver intake. Uniqueness is handled later by appending a
// suffix on collision.
// ---------------------------------------------------------------------------

function deriveUsername(email: string, submissionId: string): string {
  const local = email.split("@")[0]?.toLowerCase() ?? "athlete";
  const cleaned = local.replace(/[^a-z0-9_]/g, "_").slice(0, 24);
  // Use last 6 chars of submissionId as a stable disambiguator so retried
  // webhooks for the same submission produce the same username candidate.
  const suffix = submissionId.slice(-6).replace(/[^a-zA-Z0-9]/g, "x");
  return `${cleaned || "athlete"}_${suffix}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function processJotformWaiver(
  envelope: JotformWaiverEnvelope,
  store: WaiverStore = defaultWaiverStore,
  context: ProcessJotformWaiverContext = {},
): Promise<ProcessJotformWaiverResult> {
  const { submissionId } = envelope;

  // 1. Idempotency.
  const existing = await store.findBySubmissionId(submissionId);
  if (existing) {
    return {
      status: "duplicate",
      submissionId,
      submission: existing,
      athleteUserId: existing.athleteUserId ?? undefined,
      message: "Submission already processed",
    };
  }

  // 2. Field extraction.
  const fields = extractWaiverFields(envelope.rawRequest);

  // 3. Persist the raw payload up front so we always have the data even if
  //    user creation fails downstream.
  const submission = await store.createSubmission({
    submissionId,
    formId: envelope.formId ?? null,
    source: "jotform",
    athleteEmail: fields.athleteEmail ?? null,
    athleteFirstName: fields.athleteFirstName ?? null,
    athleteLastName: fields.athleteLastName ?? null,
    athleteBirthDate: fields.athleteBirthDate ?? null,
    parentName: fields.parentName ?? null,
    parentEmail: fields.parentEmail ?? null,
    parentPhone: fields.parentPhone ?? null,
    pdfUrl: fields.pdfUrl ?? null,
    signedAt: fields.signedAt ?? null,
    rawPayload: envelope.fullPayload as any,
    status: "received",
  });

  // 4. Match-or-create the athlete user.
  try {
    let athleteUserId: string | null = null;

    if (fields.athleteEmail) {
      const matched = await store.findUserByEmail(fields.athleteEmail);
      if (matched) {
        athleteUserId = matched.id;
      } else {
        const first = fields.athleteFirstName ?? "Waiver";
        const last = fields.athleteLastName ?? "Athlete";
        // `fullName` and `birthYear` are computed inside storage.createUser,
        // so we deliberately do not provide them here. `password` is also
        // computed (placeholder hash inserted for invitation-pending accounts).
        const created = await store.createUser({
          username: deriveUsername(fields.athleteEmail, submissionId),
          emails: [fields.athleteEmail],
          firstName: first,
          lastName: last,
          isActive: true,
          isSiteAdmin: false,
        } as unknown as InsertUser);
        athleteUserId = created.id;
      }
    }

    await store.markProcessed(submission.id, athleteUserId);

    // 5. Internal admin notification via audit log (consistent with
    //    membership-request and OAuth flows that all use audit logs as their
    //    "internal notification" channel today).
    await store.createAuditLog({
      userId: athleteUserId ?? null,
      action: "waiver_submission_received",
      resourceType: "waiver_submission",
      resourceId: submission.id,
      details: JSON.stringify({
        submissionId,
        formId: envelope.formId ?? null,
        athleteEmail: fields.athleteEmail ?? null,
        athleteName: [fields.athleteFirstName, fields.athleteLastName].filter(Boolean).join(" ") || null,
        parentName: fields.parentName ?? null,
        parentEmail: fields.parentEmail ?? null,
        pdfUrl: fields.pdfUrl ?? null,
        athleteAutoCreated: !!athleteUserId && !fields.athleteEmail
          ? false
          : (athleteUserId ? "see athlete_user_id" : false),
        timestamp: new Date().toISOString(),
      }),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    } as InsertAuditLog);

    return {
      status: "created",
      submissionId,
      submission: { ...submission, athleteUserId, status: "processed" },
      athleteUserId: athleteUserId ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Failure is logged with enough context (submission row + raw payload)
    // for a human to manually recover.
    console.error("[waiver-service] Failed to process Jotform waiver", {
      submissionId,
      error: message,
    });
    try {
      await store.markFailed(submission.id, message);
    } catch (markErr) {
      console.error("[waiver-service] Additionally failed to mark submission failed", markErr);
    }
    return {
      status: "failed",
      submissionId,
      submission,
      message,
    };
  }
}
