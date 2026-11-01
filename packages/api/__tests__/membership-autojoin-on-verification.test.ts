/**
 * Auto-join on email verification.
 *
 * An org with autoApproveRequests=true admits a join-code signup only once the
 * user's email is verified. Until then the request stays pending; verifying the
 * email approves it (PasswordResetService.verifyEmail -> storage.approvePendingAutoJoinRequests).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { PasswordResetService } from "../auth/password-reset";
import { coppaService } from "../services/coppa-service";
import { parentalConsents } from "@shared/schema/tables/coppa";
import {
  organizations,
  users,
  membershipRequests,
  userOrganizations,
  auditLogs,
  emailVerificationTokens,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

describe("Membership auto-join on email verification", () => {
  const suffix = `_autojoin_${Date.now()}`;

  let autoOrgId: string;
  let manualOrgId: string;
  const userIds: string[] = [];
  const orgIds: string[] = [];

  async function makeOrg(name: string, overrides: Partial<typeof organizations.$inferInsert> = {}) {
    const [org] = await db.insert(organizations).values({
      name: `${name}${suffix}`,
      orgType: "club",
      isActive: true,
      allowMembershipRequests: true,
      autoApproveRequests: true,
      ...overrides,
    }).returning();
    orgIds.push(org.id);
    return org;
  }

  async function makeUser(label: string, overrides: Partial<typeof users.$inferInsert> = {}) {
    const [user] = await db.insert(users).values({
      emails: [`${label}${suffix}@example.com`],
      username: `${label}${suffix}`,
      firstName: label,
      lastName: "Tester",
      fullName: `${label} Tester`,
      password: "hashed",
      role: "athlete",
      isActive: true,
      isEmailVerified: false,
      ...overrides,
    }).returning();
    userIds.push(user.id);
    return user;
  }

  async function membershipOf(userId: string, orgId: string) {
    const [row] = await db.select().from(userOrganizations).where(and(
      eq(userOrganizations.userId, userId),
      eq(userOrganizations.organizationId, orgId),
    ));
    return row;
  }

  async function requestById(id: string) {
    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, id));
    return row;
  }

  beforeAll(async () => {
    autoOrgId = (await makeOrg("AutoJoinOrg")).id;
    manualOrgId = (await makeOrg("ManualOrg", { autoApproveRequests: false })).id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (userIds.length) {
      await db.delete(emailVerificationTokens).where(inArray(emailVerificationTokens.userId, userIds));
      await db.delete(membershipRequests).where(inArray(membershipRequests.userId, userIds));
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
    }
    await db.update(organizations).set({
      autoApproveRequests: true, allowMembershipRequests: true, isActive: true, deletedAt: null,
    }).where(eq(organizations.id, autoOrgId));
  });

  afterAll(async () => {
    if (userIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    if (orgIds.length) await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  describe("createMembershipRequest", () => {
    // A verified email is not enough: the immediate path must apply the same eligibility rules as the sweep.
    it.each(["pending_consent", "needs_parent_email", "consent_revoked"] as const)(
      "keeps a verified user whose COPPA status is %s pending instead of approving at once",
      async (coppaStatus) => {
        const user = await makeUser(`vc_${coppaStatus}`, { isEmailVerified: true, coppaStatus });
        const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

        expect(request.status).toBe("pending");
        expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
      },
    );

    it("keeps a deactivated verified user pending instead of approving at once", async () => {
      const user = await makeUser("vinactive", { isEmailVerified: true, isActive: false });
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(request.status).toBe("pending");
      expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
    });

    it("approves immediately when the org auto-approves and the email is verified", async () => {
      const user = await makeUser("verified", { isEmailVerified: true });
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(request.status).toBe("approved");
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });

    it("keeps the request pending when the org auto-approves but the email is unverified", async () => {
      const user = await makeUser("unverified");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(request.status).toBe("pending");
      expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
    });

    it("approves the request when the email gets verified while the request is being created", async () => {
      const user = await makeUser("racer");
      const realGetUser = storage.getUser.bind(storage);
      // The first read (inside createMembershipRequest) sees the user as still unverified; the
      // verification then commits before the pending row exists, so its sweep finds nothing.
      vi.spyOn(storage, "getUser").mockImplementationOnce(async (id: string) => {
        const current = await realGetUser(id);
        await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, id));
        return current ? { ...current, isEmailVerified: false } : current;
      });

      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(request.status).toBe("approved");
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });

    it("stays pending in a manual org even for a verified user", async () => {
      const user = await makeUser("manualverified", { isEmailVerified: true });
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: manualOrgId, discoveryMethod: "join_code" });

      expect(request.status).toBe("pending");
      expect(await membershipOf(user.id, manualOrgId)).toBeUndefined();
    });
  });

  describe("approvePendingAutoJoinRequests", () => {
    it("approves a pending request in an auto-approve org and adds the user as athlete", async () => {
      const user = await makeUser("approve");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      const approved = await storage.approvePendingAutoJoinRequests(user.id);

      expect(approved).toBe(1);
      const after = await requestById(request.id);
      expect(after.status).toBe("approved");
      expect(after.processedBy).toBeNull();
      expect(after.processedAt).not.toBeNull();
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });

    it("writes a membership_request_approved audit row with the verification reason", async () => {
      const user = await makeUser("audit");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      await storage.approvePendingAutoJoinRequests(user.id);

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, request.id));
      const log = logs.find((l) => l.action === "membership_request_approved");
      expect(log).toBeDefined();
      expect(log!.userId).toBe(user.id);
      expect(JSON.parse(log!.details as string)).toMatchObject({
        reason: "auto_approved_on_email_verification",
        organizationId: autoOrgId,
      });
    });

    it("leaves a manual-org request pending", async () => {
      const user = await makeUser("manual");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: manualOrgId, discoveryMethod: "join_code" });

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
      expect(await membershipOf(user.id, manualOrgId)).toBeUndefined();
    });

    it("leaves the request pending when the org switched to manual after the request", async () => {
      const user = await makeUser("flipped");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(organizations).set({ autoApproveRequests: false }).where(eq(organizations.id, autoOrgId));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
    });

    it("leaves the request pending when the org stopped accepting membership requests", async () => {
      const user = await makeUser("closed");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(organizations).set({ allowMembershipRequests: false }).where(eq(organizations.id, autoOrgId));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
    });

    it("skips an inactive or deleted org", async () => {
      const user = await makeUser("inactiveorg");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(organizations).set({ isActive: false }).where(eq(organizations.id, autoOrgId));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
    });

    it("skips an expired request", async () => {
      const user = await makeUser("expired");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(membershipRequests).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(membershipRequests.id, request.id));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
      expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
    });

    it("does not demote a user who became a coach while the request was pending", async () => {
      const user = await makeUser("coachnow");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await storage.addUserToOrganization(user.id, autoOrgId, "coach");

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(1);
      expect((await requestById(request.id)).status).toBe("approved");
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("coach");
    });

    it("does not touch requests that a coach already rejected", async () => {
      const user = await makeUser("rejected");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(membershipRequests).set({ status: "rejected" }).where(eq(membershipRequests.id, request.id));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("rejected");
      expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
    });

    it("only approves the given user's requests", async () => {
      const mine = await makeUser("mine");
      const other = await makeUser("other");
      await storage.createMembershipRequest({ userId: mine.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      const otherRequest = await storage.createMembershipRequest({ userId: other.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(await storage.approvePendingAutoJoinRequests(mine.id)).toBe(1);
      expect((await requestById(otherRequest.id)).status).toBe("pending");
      expect(await membershipOf(other.id, autoOrgId)).toBeUndefined();
    });

    it("is idempotent", async () => {
      const user = await makeUser("twice");
      await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(1);
      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
    });

    // The login gate blocks all three of these statuses, so a link in an old email must not get them into an org either.
    it.each(["pending_consent", "needs_parent_email", "consent_revoked"] as const)(
      "never auto-joins a user whose COPPA status is %s",
      async (coppaStatus) => {
        const user = await makeUser(`minor_${coppaStatus}`, { coppaStatus });
        const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

        expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
        expect((await requestById(request.id)).status).toBe("pending");
        expect(await membershipOf(user.id, autoOrgId)).toBeUndefined();
      },
    );

    it.each(["not_applicable", "consented"] as const)("still auto-joins a user whose COPPA status is %s", async (coppaStatus) => {
      const user = await makeUser(`ok_${coppaStatus}`, { coppaStatus });
      await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(1);
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });

    it("skips an inactive user", async () => {
      const user = await makeUser("inactiveuser");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      expect(await storage.approvePendingAutoJoinRequests(user.id)).toBe(0);
      expect((await requestById(request.id)).status).toBe("pending");
    });
  });

  describe("parental consent confirmation", () => {
    it("approves a request that was waiting on consent once the parent confirms", async () => {
      const user = await makeUser("waiting", { coppaStatus: "pending_consent" });
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      expect(request.status).toBe("pending");

      const [consent] = await db.insert(parentalConsents).values({
        athleteUserId: user.id,
        parentEmail: `parent${suffix}@example.com`,
        tokenHash: `hash${suffix}_${Math.random()}`,
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
      }).returning();

      const result = await coppaService.confirmConsent({ consentId: consent.id, aiConsentGranted: false });

      expect(result.success).toBe(true);
      expect((await requestById(request.id)).status).toBe("approved");
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });
  });

  describe("verifyEmailToken", () => {
    it("does not verify when the token's email no longer belongs to the user", async () => {
      const user = await makeUser("stale");
      const { token } = await storage.createEmailVerificationToken(user.id, `old-address${suffix}@example.com`);

      const result = await storage.verifyEmailToken(token);

      expect(result.success).toBe(false);
      const [after] = await db.select().from(users).where(eq(users.id, user.id));
      expect(after.isEmailVerified).toBe(false);
    });

    it("verifies when the token's email is one of the user's current emails", async () => {
      const user = await makeUser("fresh");
      const { token } = await storage.createEmailVerificationToken(user.id, user.emails![0]);

      expect((await storage.verifyEmailToken(token)).success).toBe(true);
    });
  });

  describe("PasswordResetService.verifyEmail", () => {
    it("approves the user's pending auto-join request when the email is verified", async () => {
      const user = await makeUser("viaverify");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: autoOrgId, discoveryMethod: "join_code" });
      const { token } = await storage.createEmailVerificationToken(user.id, user.emails![0]);

      const result = await PasswordResetService.verifyEmail(token, "127.0.0.1");

      expect(result.success).toBe(true);
      expect((await requestById(request.id)).status).toBe("approved");
      expect((await membershipOf(user.id, autoOrgId))?.role).toBe("athlete");
    });

    it("leaves a manual-org request pending after verification", async () => {
      const user = await makeUser("viaverifymanual");
      const request = await storage.createMembershipRequest({ userId: user.id, organizationId: manualOrgId, discoveryMethod: "join_code" });
      const { token } = await storage.createEmailVerificationToken(user.id, user.emails![0]);

      expect((await PasswordResetService.verifyEmail(token, "127.0.0.1")).success).toBe(true);
      expect((await requestById(request.id)).status).toBe("pending");
    });

    it("still reports success when the auto-join step throws", async () => {
      const user = await makeUser("hookfails");
      const { token } = await storage.createEmailVerificationToken(user.id, user.emails![0]);
      vi.spyOn(storage, "approvePendingAutoJoinRequests").mockRejectedValue(new Error("boom"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await PasswordResetService.verifyEmail(token, "127.0.0.1");

      expect(result.success).toBe(true);
      const [after] = await db.select().from(users).where(eq(users.id, user.id));
      expect(after.isEmailVerified).toBe(true);
    });
  });
});
