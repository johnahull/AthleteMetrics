import { describe, it, expect } from "vitest";
import {
  canManageInvitation,
  invitationsVisibleTo,
  toSafeUser,
  visibilityForRole,
  withoutPrivateMemberDetails,
} from "../lib/safe-user";

const fullRow = {
  id: "u1",
  username: "lucy",
  emails: ["lucy@example.com"],
  password: "$2b$hash",
  firstName: "Lucy",
  lastName: "Ortiz",
  fullName: "Lucy Ortiz",
  birthDate: "2010-05-05",
  birthYear: 2010,
  graduationYear: 2028,
  school: "Central",
  phoneNumbers: ["555"],
  sports: ["Soccer"],
  positions: ["F"],
  height: 60,
  weight: 100,
  gender: "Female",
  mfaEnabled: true,
  mfaSecret: "MFA",
  backupCodes: ["B1"],
  lastLoginAt: null,
  loginAttempts: 3,
  lockedUntil: null,
  isEmailVerified: true,
  googleId: "g",
  appleId: "a",
  oauthEmail: "o@example.com",
  isSiteAdmin: false,
  isActive: true,
  isMinor: true,
  parentEmail: "parent@example.com",
  parentConsentId: "c1",
  coppaStatus: "consented",
  createdAt: new Date(0),
  someColumnAddedLater: "must stay hidden",
} as any;

const NEVER = [
  "password", "mfaSecret", "backupCodes", "loginAttempts", "lockedUntil",
  "googleId", "appleId", "oauthEmail", "parentConsentId", "someColumnAddedLater",
];

describe("toSafeUser", () => {
  it.each(["self", "staff", "member"] as const)("never includes credentials or unknown columns (%s)", (visibility) => {
    const safe = toSafeUser(fullRow, visibility);
    for (const key of NEVER) expect(safe).not.toHaveProperty(key);
  });

  it("hides the parent email from staff and members but gives it back to the account owner", () => {
    expect(toSafeUser(fullRow, "staff")).not.toHaveProperty("parentEmail");
    expect(toSafeUser(fullRow, "member")).not.toHaveProperty("parentEmail");
    expect(toSafeUser(fullRow, "self")).toMatchObject({ parentEmail: "parent@example.com" });
  });

  it("gives staff contact and age details", () => {
    const safe = toSafeUser(fullRow, "staff");
    expect(safe).toMatchObject({ emails: ["lucy@example.com"], birthDate: "2010-05-05", phoneNumbers: ["555"] });
  });

  it("gives plain members only names and school details", () => {
    const safe = toSafeUser(fullRow, "member");
    expect(safe).toMatchObject({ id: "u1", username: "lucy", fullName: "Lucy Ortiz", school: "Central" });
    // birthYear too: for a minor it tells any org member that they are underage
    for (const key of ["emails", "birthDate", "birthYear", "phoneNumbers", "coppaStatus", "isMinor"]) {
      expect(safe).not.toHaveProperty(key);
    }
  });

  it("does not add keys the row does not have", () => {
    expect(toSafeUser({ id: "u2", fullName: "X Y" } as any, "staff")).toEqual({ id: "u2", fullName: "X Y" });
  });
});

describe("visibilityForRole", () => {
  it("is staff for site admins, org admins and coaches, member otherwise", () => {
    expect(visibilityForRole("org_admin", false)).toBe("staff");
    expect(visibilityForRole("coach", false)).toBe("staff");
    expect(visibilityForRole(undefined, true)).toBe("staff");
    expect(visibilityForRole("athlete", false)).toBe("member");
    expect(visibilityForRole(undefined, false)).toBe("member");
  });
});

describe("invitation visibility", () => {
  it("lets admins see every role, coaches only athlete invitations, athletes none", () => {
    expect(canManageInvitation("org_admin", false, "org_admin")).toBe(true);
    expect(canManageInvitation(undefined, true, "org_admin")).toBe(true);
    expect(canManageInvitation("coach", false, "athlete")).toBe(true);
    expect(canManageInvitation("coach", false, "coach")).toBe(false);
    expect(canManageInvitation("coach", false, "org_admin")).toBe(false);
    expect(canManageInvitation("athlete", false, "athlete")).toBe(false);
    expect(canManageInvitation(undefined, false, "athlete")).toBe(false);
  });

  it("filters a list by the same rule", () => {
    const list = [{ role: "org_admin" }, { role: "coach" }, { role: "athlete" }];
    expect(invitationsVisibleTo(list, "org_admin", false)).toHaveLength(3);
    expect(invitationsVisibleTo(list, "coach", false)).toEqual([{ role: "athlete" }]);
    expect(invitationsVisibleTo(list, "athlete", false)).toEqual([]);
  });
});

describe("withoutPrivateMemberDetails", () => {
  it("drops contact and age details and keeps everything else", () => {
    const row = { id: "u1", fullName: "A B", role: "athlete", emails: ["a@x.com"], birthDate: "2010-01-01", birthYear: 2010, phoneNumbers: ["1"], height: 60, weight: 100 };
    expect(withoutPrivateMemberDetails(row)).toEqual({ id: "u1", fullName: "A B", role: "athlete" });
    expect(row.emails).toEqual(["a@x.com"]); // input is not mutated
  });
});
