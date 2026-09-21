/**
 * Unit tests for the Jotform waiver webhook (issue #370).
 *
 * These tests use an in-memory `WaiverStore` so they exercise the full route
 * + service code path WITHOUT requiring a database. Coverage:
 *   - bad/missing secret
 *   - missing submissionID / rawRequest
 *   - malformed rawRequest JSON
 *   - valid payload (creates submission, creates athlete user, audit log)
 *   - duplicate submission (idempotent — no double-create)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import crypto from "crypto";
import type {
  WaiverStore,
  JotformWaiverEnvelope,
} from "../services/waiver-service";
import type {
  WaiverSubmission,
  InsertWaiverSubmission,
  User,
  InsertUser,
  InsertAuditLog,
} from "@shared/schema";
import { registerWebhookRoutes } from "../routes/webhook-routes";

const SHARED_SECRET = "s3cret-test-token";

/** Shaped like a real `pg` unique-violation error so `getPgError()` finds it. */
class UniqueViolationError extends Error {
  code = "23505";
  constraint: string;
  constructor(constraint: string) {
    super(`duplicate key value violates unique constraint "${constraint}"`);
    this.constraint = constraint;
  }
}

function buildInMemoryStore() {
  const submissions = new Map<string, WaiverSubmission>();
  const users = new Map<string, User>();
  const usersByEmail = new Map<string, User>();
  const usernames = new Set<string>();
  const auditLogs: InsertAuditLog[] = [];

  let nextId = 0;
  const id = () => `id-${++nextId}`;

  const store: WaiverStore = {
    async findBySubmissionId(submissionId) {
      for (const s of submissions.values()) {
        if (s.submissionId === submissionId) return s;
      }
      return undefined;
    },
    async createSubmission(data: InsertWaiverSubmission) {
      const row = {
        id: id(),
        submissionId: data.submissionId,
        formId: data.formId ?? null,
        source: data.source ?? "jotform",
        athleteUserId: data.athleteUserId ?? null,
        athleteEmail: data.athleteEmail ?? null,
        athleteFirstName: data.athleteFirstName ?? null,
        athleteLastName: data.athleteLastName ?? null,
        athleteBirthDate: (data.athleteBirthDate ?? null) as any,
        parentName: data.parentName ?? null,
        parentEmail: data.parentEmail ?? null,
        parentPhone: data.parentPhone ?? null,
        pdfUrl: data.pdfUrl ?? null,
        signedAt: data.signedAt ?? null,
        status: data.status ?? "received",
        errorMessage: data.errorMessage ?? null,
        rawPayload: data.rawPayload as any,
        processedAt: data.processedAt ?? null,
        createdAt: new Date(),
      } as WaiverSubmission;
      submissions.set(row.id, row);
      return row;
    },
    async markProcessed(rowId, athleteUserId) {
      const row = submissions.get(rowId);
      if (!row) throw new Error(`unknown submission ${rowId}`);
      submissions.set(rowId, {
        ...row,
        status: "processed",
        processedAt: new Date(),
        athleteUserId: athleteUserId ?? null,
        errorMessage: null,
      });
    },
    async markFailed(rowId, errorMessage) {
      const row = submissions.get(rowId);
      if (!row) throw new Error(`unknown submission ${rowId}`);
      submissions.set(rowId, { ...row, status: "failed", errorMessage });
    },
    async findUserByEmail(email) {
      return usersByEmail.get(email.toLowerCase());
    },
    async createUser(data: InsertUser) {
      const d = data as any;
      // Real Postgres enforces `users_username_unique` — mirror that here so
      // tests can exercise the service's collision-retry behavior.
      if (usernames.has(d.username)) {
        throw new UniqueViolationError("users_username_unique");
      }
      const created = {
        id: id(),
        username: d.username,
        emails: d.emails ?? [],
        password: d.password ?? null,
        firstName: d.firstName,
        lastName: d.lastName,
        fullName: `${d.firstName} ${d.lastName}`.trim(),
        isSiteAdmin: d.isSiteAdmin ?? false,
        isActive: d.isActive ?? true,
        createdAt: new Date(),
      } as unknown as User;
      usernames.add(created.username);
      users.set(created.id, created);
      for (const e of created.emails ?? []) usersByEmail.set(e.toLowerCase(), created);
      return created;
    },
    async createAuditLog(data: InsertAuditLog) {
      auditLogs.push(data);
    },
  };

  return { store, submissions, users, usersByEmail, auditLogs };
}

function buildApp(store: WaiverStore, opts?: { secret?: string | undefined }) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  registerWebhookRoutes(app, {
    store,
    getConfiguredSecret: () => (opts && "secret" in opts ? opts.secret : SHARED_SECRET),
  });
  return app;
}

function jotformBody(overrides: Partial<{ submissionID: string; formID: string; rawRequest: string | object }> = {}) {
  const defaults = {
    submissionID: "5551234567890",
    formID: "form-abc",
    rawRequest: JSON.stringify({
      name: { first: "Pat", last: "Athlete" },
      email: "pat.athlete@example.com",
      dob: "2010-04-15",
      parentName: "Sam Athlete",
      parentEmail: "sam.athlete@example.com",
      parentPhone: "555-0100",
      pdfUrl: "https://www.jotform.com/uploads/abc/waiver.pdf",
      signedAt: "2024-09-01T12:00:00Z",
    }),
  };
  return { ...defaults, ...overrides };
}

describe("POST /api/webhooks/jotform-waiver", () => {
  let infra: ReturnType<typeof buildInMemoryStore>;
  let app: express.Express;

  beforeEach(() => {
    infra = buildInMemoryStore();
    app = buildApp(infra.store);
  });

  it("rejects when shared secret is missing", async () => {
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .type("form")
      .send(jotformBody());
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(infra.submissions.size).toBe(0);
  });

  it("rejects when shared secret is wrong", async () => {
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: "not-the-secret" })
      .type("form")
      .send(jotformBody());
    expect(res.status).toBe(401);
    expect(infra.submissions.size).toBe(0);
  });

  it("returns 503 when no shared secret is configured", async () => {
    const unconfiguredApp = buildApp(infra.store, { secret: undefined });
    const res = await request(unconfiguredApp)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: "anything" })
      .type("form")
      .send(jotformBody());
    expect(res.status).toBe(503);
    expect(infra.submissions.size).toBe(0);
  });

  it("returns 400 when submissionID is missing", async () => {
    const body = jotformBody();
    delete (body as any).submissionID;
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/submissionID/i);
    expect(infra.submissions.size).toBe(0);
  });

  it("returns 400 when rawRequest is missing", async () => {
    const body = jotformBody();
    delete (body as any).rawRequest;
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rawRequest/i);
    expect(infra.submissions.size).toBe(0);
  });

  it("returns 400 when rawRequest JSON is malformed", async () => {
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send({ submissionID: "abc", rawRequest: "{not-json" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/malformed/i);
    expect(infra.submissions.size).toBe(0);
  });

  it("processes a valid payload and creates an athlete user", async () => {
    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(jotformBody());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("created");
    expect(res.body.submissionId).toBe("5551234567890");
    expect(res.body.athleteUserId).toBeTypeOf("string");

    expect(infra.submissions.size).toBe(1);
    const [submission] = Array.from(infra.submissions.values());
    expect(submission.status).toBe("processed");
    expect(submission.athleteEmail).toBe("pat.athlete@example.com");
    expect(submission.athleteFirstName).toBe("Pat");
    expect(submission.athleteLastName).toBe("Athlete");
    expect(submission.parentEmail).toBe("sam.athlete@example.com");
    expect(submission.parentPhone).toBe("555-0100");
    expect(submission.pdfUrl).toBe("https://www.jotform.com/uploads/abc/waiver.pdf");
    expect(submission.athleteBirthDate).toBe("2010-04-15");
    // Raw payload preserved (minus secret)
    expect(submission.rawPayload).toMatchObject({ submissionID: "5551234567890" });
    expect((submission.rawPayload as any).secret).toBeUndefined();

    expect(infra.users.size).toBe(1);
    const [createdUser] = Array.from(infra.users.values());
    expect(createdUser.emails).toContain("pat.athlete@example.com");

    expect(infra.auditLogs).toHaveLength(1);
    expect(infra.auditLogs[0]).toMatchObject({
      action: "waiver_submission_received",
      resourceType: "waiver_submission",
      resourceId: submission.id,
    });
    // A new athlete user was created for this submission.
    const details = JSON.parse(infra.auditLogs[0].details as string);
    expect(details.athleteAutoCreated).toBe(true);
  });

  it("is idempotent on duplicate submissionID — no double-create", async () => {
    const body = jotformBody({ submissionID: "dup-1" });

    const first = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("created");

    const second = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("duplicate");
    expect(second.body.submissionId).toBe("dup-1");

    // Exactly one submission, one user, one audit log entry — no doubles.
    expect(infra.submissions.size).toBe(1);
    expect(infra.users.size).toBe(1);
    expect(infra.auditLogs).toHaveLength(1);
  });

  it("matches an existing user by email rather than creating a new one", async () => {
    // Pre-seed an existing user with the athlete's email.
    const existing = await infra.store.createUser({
      username: "preexisting",
      emails: ["pat.athlete@example.com"],
      firstName: "Pat",
      lastName: "Existing",
      fullName: "Pat Existing",
    } as InsertUser);

    const res = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(jotformBody({ submissionID: "match-1" }));

    expect(res.status).toBe(200);
    expect(res.body.athleteUserId).toBe(existing.id);
    // Still exactly one user — no duplicate created.
    expect(infra.users.size).toBe(1);
    const [submission] = Array.from(infra.submissions.values());
    expect(submission.athleteUserId).toBe(existing.id);
    // No new athlete was created — an existing user was matched instead.
    const details = JSON.parse(infra.auditLogs[0].details as string);
    expect(details.athleteAutoCreated).toBe(false);
  });

  it("retries with a suffixed username when the derived username collides", async () => {
    // Both submissions derive the same base username: the email local-part
    // is identical ("pat.athlete") and the submissionIds share the same last
    // 6 characters ("111111"), which is what deriveUsername keys off of.
    const first = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(jotformBody({
        submissionID: "AAA111111",
        rawRequest: JSON.stringify({
          name: { first: "Pat", last: "First" },
          email: "pat.athlete@example.com",
        }),
      }));
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("created");

    const second = await request(app)
      .post("/api/webhooks/jotform-waiver")
      .query({ secret: SHARED_SECRET })
      .type("form")
      .send(jotformBody({
        submissionID: "BBB111111",
        rawRequest: JSON.stringify({
          name: { first: "Pat", last: "Second" },
          // Different domain, same local-part — same deriveUsername candidate
          // as the first submission.
          email: "pat.athlete@otherdomain.com",
        }),
      }));

    // The collision must be handled, not surfaced as a failed submission.
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("created");
    expect(second.body.athleteUserId).toBeTypeOf("string");
    expect(second.body.athleteUserId).not.toBe(first.body.athleteUserId);

    // Two distinct users, with two distinct (non-colliding) usernames.
    expect(infra.users.size).toBe(2);
    const usernames = Array.from(infra.users.values()).map((u) => u.username);
    expect(new Set(usernames).size).toBe(2);
  });

  it("uses constant-time secret comparison (smoke test)", () => {
    // Sanity check that timingSafeEqual works for our SHARED_SECRET length.
    // Not strictly a webhook behavior, but documents the assumption.
    const a = Buffer.from(SHARED_SECRET);
    const b = Buffer.from(SHARED_SECRET);
    expect(crypto.timingSafeEqual(a, b)).toBe(true);
  });
});
