import {
  organizations, teams, users, measurements, userOrganizations, userTeams, invitations,
  type Organization, type Team, type Measurement, type User, type UserOrganization, type UserTeam, type Invitation,
  type InsertOrganization, type InsertTeam, type InsertMeasurement, type InsertUser, type InsertUserOrganization, type InsertUserTeam, type InsertInvitation
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

export interface IStorage {
  // Authentication & Users
  authenticateUser(username: string, password: string): Promise<User | null>;
  authenticateUserByEmail(email: string, password: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getUserOrganizations(userId: string): Promise<(UserOrganization & { organization: Organization })[]>;
  getUserTeams(userId: string): Promise<(UserTeam & { team: Team & { organization: Organization } })[]>;

  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization>;
  deleteOrganization(id: string): Promise<void>;
  getOrganizationUsers(organizationId: string): Promise<(UserOrganization & { user: User })[]>;
  getOrganizationsWithUsers(): Promise<(Organization & { users: (UserOrganization & { user: User })[] })[]>;

  // Teams
  getTeams(organizationId?: string): Promise<(Team & { organization: Organization })[]>;
  getTeam(id: string): Promise<(Team & { organization: Organization }) | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;

  // User Management
  addUserToOrganization(userId: string, organizationId: string, role: string): Promise<UserOrganization>;
  addUserToTeam(userId: string, teamId: string): Promise<UserTeam>;
  removeUserFromOrganization(userId: string, organizationId: string): Promise<void>;
  removeUserFromTeam(userId: string, teamId: string): Promise<void>;

  // Invitations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitation(token: string): Promise<Invitation | undefined>;
  updateInvitation(id: string, invitation: Partial<InsertInvitation>): Promise<Invitation>;
  acceptInvitation(token: string, userInfo: { email: string; username: string; password: string; firstName: string; lastName: string }): Promise<{ user: User; playerId?: string }>;

  // Athletes (users with athlete role)
  getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
  }): Promise<User[]>;
  getAthlete(id: string): Promise<User | undefined>;
  createAthlete(athlete: Partial<InsertUser>): Promise<User>;
  updateAthlete(id: string, athlete: Partial<InsertUser>): Promise<User>;
  deleteAthlete(id: string): Promise<void>;

  // Measurements
  getMeasurements(filters?: {
    userId?: string;
    teamIds?: string[];
    organizationId?: string;
    metric?: string;
    dateFrom?: string;
    dateTo?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    ageFrom?: number;
    ageTo?: number;
    search?: string;
    sport?: string;
    includeUnverified?: boolean;
  }): Promise<(Measurement & {
    user: User;
    submittedBy: User;
    verifiedBy?: User;
  })[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement): Promise<Measurement>;
  updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<void>;
  verifyMeasurement(id: string, verifiedBy: string): Promise<Measurement>;

  // Analytics
  getUserStats(userId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }>;
  getTeamStats(organizationId?: string): Promise<Array<{
    teamId: string;
    teamName: string;
    organizationName: string;
    athleteCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>>;
  getDashboardStats(organizationId?: string): Promise<{
    totalAthletes: number;
    totalTeams: number;
    bestFly10Today?: { value: number; userName: string };
    bestVerticalToday?: { value: number; userName: string };
  }>;
}

export class DatabaseStorage implements IStorage {
  // Authentication & Users
  async authenticateUser(username: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async authenticateUserByEmail(email: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    // For invited users, password might be empty - use a placeholder
    const password = user.password || "INVITATION_PENDING";
    const hashedPassword = await bcrypt.hash(password, 10);

    // Calculate fullName and birthYear from provided data
    const fullName = `${user.firstName} ${user.lastName}`;
    const birthYear = user.birthDate ? new Date(user.birthDate).getFullYear() : undefined;

    const [newUser] = await db.insert(users).values({
      ...user,
      password: hashedPassword,
      fullName,
      birthYear
    }).returning();
    return newUser;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.lastName), asc(users.firstName));
  }

  async getSiteAdminUsers(): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.isSiteAdmin, "true"))
      .orderBy(asc(users.lastName), asc(users.firstName));
  }

  async getInvitations(): Promise<any[]> {
    return await db.select().from(invitations).orderBy(asc(invitations.createdAt));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User> {
    const updateData: any = {};

    // Only include defined fields in the update
    Object.keys(user).forEach(key => {
      const value = (user as any)[key];
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    if (user.password) {
      updateData.password = await bcrypt.hash(user.password, 10);
    }

    // Update computed fields if relevant data changed
    if (user.firstName || user.lastName) {
      const currentUser = await this.getUser(id);
      if (currentUser) {
        const firstName = user.firstName || currentUser.firstName;
        const lastName = user.lastName || currentUser.lastName;
        updateData.fullName = `${firstName} ${lastName}`;
      }
    }

    if (user.birthDate) {
      updateData.birthYear = new Date(user.birthDate).getFullYear();
    }

    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    // Delete related records first
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, id));
    await db.delete(userTeams).where(eq(userTeams.userId, id));

    // Delete invitations sent by this user
    await db.delete(invitations).where(eq(invitations.invitedBy, id));

    // Update measurements to remove references to this user
    await db.update(measurements)
      .set({
        submittedBy: sql`NULL`,
        verifiedBy: sql`NULL`
      })
      .where(sql`${measurements.submittedBy} = ${id} OR ${measurements.verifiedBy} = ${id}`);

    await db.delete(users).where(eq(users.id, id));
  }

  async getUserOrganizations(userId: string): Promise<any[]> {
    const result: any = await db.select()
      .from(userOrganizations)
      .innerJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
      .where(eq(userOrganizations.userId, userId))
      .orderBy(asc(organizations.name)); // Ensure consistent ordering

    return result.map(({ user_organizations, organizations }: any) => ({
      ...user_organizations,
      organization: organizations
    }));
  }

  async getUserRole(userId: string, organizationId?: string): Promise<string | null> {
    if (organizationId) {
      // Get role from specific organization
      const [result] = await db.select({ role: userOrganizations.role })
        .from(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        ));
      return result?.role || null;
    } else {
      // Check if user is site admin
      const [user] = await db.select({ isSiteAdmin: users.isSiteAdmin })
        .from(users)
        .where(eq(users.id, userId));
      return user?.isSiteAdmin === "true" ? "site_admin" : null;
    }
  }

  async getUserRoles(userId: string, organizationId?: string): Promise<string[]> {
    // Check if user is site admin first
    const user = await this.getUser(userId);
    if (user?.isSiteAdmin === "true") {
      return ["site_admin"];
    }

    if (organizationId) {
      // Get EXACTLY ONE role for user in specific organization
      const result = await db.select({ role: userOrganizations.role })
        .from(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        ))
        .limit(1); // Enforce single role

      const roles = result.length > 0 ? [result[0].role] : [];
      console.log(`User ${userId} roles in org ${organizationId}:`, { roles, foundRecords: result.length });
      return roles;
    } else {
      // Get all organization roles for the user (one per organization maximum)
      const orgRoles = await db.select({
        role: userOrganizations.role,
        organizationId: userOrganizations.organizationId
      })
        .from(userOrganizations)
        .where(eq(userOrganizations.userId, userId));

      // Ensure only one role per organization by grouping and taking first
      const uniqueRoles = new Map();
      orgRoles.forEach(r => {
        if (!uniqueRoles.has(r.organizationId)) {
          uniqueRoles.set(r.organizationId, r.role);
        }
      });

      return Array.from(uniqueRoles.values());
    }
  }

  async getUserTeams(userId: string): Promise<(UserTeam & { team: Team & { organization: Organization } })[]> {
    const result = await db.select()
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(userTeams.userId, userId));

    return result.map(({ user_teams, teams: team, organizations }) => ({
      ...user_teams,
      team: { ...team, organization: organizations }
    }));
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(asc(organizations.name));
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || undefined;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [newOrg] = await db.insert(organizations).values(organization).returning();
    return newOrg;
  }

  async updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization> {
    const [updated] = await db.update(organizations).set(organization).where(eq(organizations.id, id)).returning();
    return updated;
  }

  async deleteOrganization(id: string): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  async getOrganizationUsers(organizationId: string): Promise<(UserOrganization & { user: User })[]> {
    const result = await db.select()
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(eq(userOrganizations.organizationId, organizationId));

    return result.map(({ user_organizations, users: user }) => ({
      ...user_organizations,
      user
    }));
  }

  async getOrganizationProfile(organizationId: string): Promise<Organization & {
    coaches: Array<{ user: User, roles: string[] }>,
    players: (User & { teams: (Team & { organization: Organization })[] })[],
    invitations: Invitation[]
  } | null> {
    const [organization] = await db.select().from(organizations).where(eq(organizationId, organizationId));
    if (!organization) return null;

    // Get users with all their roles grouped
    const allUsers = await this.getOrganizationUsers(organizationId);

    // Group users by userId and collect all their roles
    const userRoleMap = new Map<string, { user: User, roles: string[] }>();

    for (const userOrg of allUsers) {
      const userId = userOrg.user.id;
      if (userRoleMap.has(userId)) {
        userRoleMap.get(userId)!.roles.push(userOrg.role);
      } else {
        userRoleMap.set(userId, {
          user: userOrg.user,
          roles: [userOrg.role]
        });
      }
    }

    // Filter coaches (users with coach or org_admin roles, excluding pure athletes)
    const coaches = Array.from(userRoleMap.values()).filter(
      userWithRoles => userWithRoles.roles.some(role => role === 'coach' || role === 'org_admin')
    );

    // Get athletes via organization filter
    const players = await this.getAthletes({ organizationId });

    // Get pending invitations for this organization
    let organizationInvitations: Invitation[] = [];
    try {
      organizationInvitations = await db.select()
        .from(invitations)
        .where(and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.isUsed, "false"),
          gte(invitations.expiresAt, new Date())
        ));
    } catch (error) {
      console.error("Error fetching organization invitations:", error);
      organizationInvitations = [];
    }

    return {
      ...organization,
      coaches,
      players,
      invitations: organizationInvitations
    };
  }

  async getOrganizationsWithUsers(): Promise<(Organization & { users: (UserOrganization & { user: User })[], invitations: Invitation[] })[]> {
    const organizations = await this.getOrganizations();

    const orgsWithUsers = await Promise.all(
      organizations.map(async (org) => {
        try {
          const users = await this.getOrganizationUsers(org.id);
          const invitations = await this.getOrganizationInvitations(org.id);
          return {
            ...org,
            users,
            invitations
          };
        } catch (error) {
          console.error(`Error processing organization ${org.id}:`, error);
          return {
            ...org,
            users: [],
            invitations: []
          };
        }
      })
    );

    return orgsWithUsers;
  }

  async getOrganizationsWithUsersForUser(userId: string): Promise<(Organization & { users: (UserOrganization & { user: User })[], invitations: Invitation[] })[]> {
    // Get organizations where the user is a member
    const userOrgs = await db.select()
      .from(userOrganizations)
      .where(eq(userOrganizations.userId, userId));

    const orgIds = userOrgs.map(uo => uo.organizationId);

    if (orgIds.length === 0) {
      return [];
    }

    // Get organizations data
    const orgsData = await db.select()
      .from(organizations)
      .where(inArray(organizations.id, orgIds));

    const orgsWithUsers = await Promise.all(
      orgsData.map(async (org) => {
        const users = await this.getOrganizationUsers(org.id);
        const invitations = await this.getOrganizationInvitations(org.id);
        return {
          ...org,
          users,
          invitations
        };
      })
    );

    return orgsWithUsers;
  }

  async getOrganizationInvitations(organizationId: string): Promise<Invitation[]> {
    try {
      const result = await db.select({
        id: invitations.id,
        email: invitations.email,
        firstName: invitations.firstName,
        lastName: invitations.lastName,
        organizationId: invitations.organizationId,
        teamIds: invitations.teamIds,
        role: invitations.role,
        token: invitations.token,
        invitedBy: invitations.invitedBy,
        isUsed: invitations.isUsed,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt
      })
        .from(invitations)
        .where(eq(invitations.organizationId, organizationId))
        .orderBy(desc(invitations.createdAt));

      return result;
    } catch (error) {
      console.error("Error in getOrganizationInvitations:", error);
      return [];
    }
  }

  async updateInvitation(id: string, invitation: Partial<InsertInvitation>): Promise<Invitation> {
    const [updated] = await db.update(invitations).set(invitation).where(eq(invitations.id, id)).returning();
    return updated;
  }

  async deleteInvitation(invitationId: string): Promise<void> {
    await db.delete(invitations)
      .where(eq(invitations.id, invitationId));
  }

  async getInvitationById(invitationId: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations)
      .where(eq(invitations.id, invitationId));
    return invitation || undefined;
  }

  // Teams
  async getTeams(organizationId?: string): Promise<(Team & { organization: Organization })[]> {
    let query = db.select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .orderBy(asc(teams.name));

    if (organizationId) {
      query = query.where(eq(teams.organizationId, organizationId)) as any;
    }

    const result: any[] = await query;
    return result.map(({ teams: team, organizations: org }) => ({
      ...team,
      organization: org
    }));
  }

  async getTeam(id: string): Promise<(Team & { organization: Organization }) | undefined> {
    const result: any[] = await db.select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, id));

    if (result.length === 0) return undefined;

    const { teams: team, organizations: org } = result[0];
    return { ...team, organization: org };
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db.insert(teams).values({
      name: team.name,
      organizationId: team.organizationId!,
      level: team.level || null,
      notes: team.notes || null
    }).returning();
    return newTeam;
  }

  async updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team> {
    const [updated] = await db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // User Management
  async addUserToOrganization(userId: string, organizationId: string, role: string): Promise<UserOrganization> {
    // Validate that role is organization-specific only
    if (!['org_admin', 'coach', 'athlete'].includes(role)) {
      throw new Error(`Invalid organization role: ${role}. Must be org_admin, coach, or athlete`);
    }

    // First remove any existing roles for this user in this organization
    await db.delete(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ));

    // Then insert the new single role
    const [userOrg] = await db.insert(userOrganizations).values({
      userId,
      organizationId,
      role
    }).returning();

    return userOrg;
  }

  async addUserToTeam(userId: string, teamId: string): Promise<UserTeam> {
    const [userTeam] = await db.insert(userTeams).values({
      userId,
      teamId
    }).returning();
    return userTeam;
  }

  async removeUserFromOrganization(userId: string, organizationId: string): Promise<void> {
    await db.delete(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ));
  }

  async updateUserOrganizationRole(userId: string, organizationId: string, role: string): Promise<void> {
    // Validate that role is organization-specific only
    if (!['org_admin', 'coach', 'athlete'].includes(role)) {
      throw new Error(`Invalid organization role: ${role}. Must be org_admin, coach, or athlete`);
    }

    // Use addUserToOrganization to ensure single role per organization
    await this.addUserToOrganization(userId, organizationId, role);
  }

  // Validation function to ensure single role constraint
  async validateUserRoleConstraint(userId: string): Promise<{ valid: boolean; violations: string[] }> {
    const violations: string[] = [];

    // Get all user-organization relationships
    const userOrgRelations = await db.select()
      .from(userOrganizations)
      .where(eq(userOrganizations.userId, userId));

    // Group by organization and check for multiple roles
    const orgRoleMap = new Map<string, string[]>();

    for (const relation of userOrgRelations) {
      if (!orgRoleMap.has(relation.organizationId)) {
        orgRoleMap.set(relation.organizationId, []);
      }
      orgRoleMap.get(relation.organizationId)!.push(relation.role);
    }

    // Check for violations
    for (const [orgId, roles] of orgRoleMap.entries()) {
      if (roles.length > 1) {
        const org = await this.getOrganization(orgId);
        violations.push(`User has ${roles.length} roles in organization "${org?.name || orgId}": ${roles.join(', ')}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  async removeUserFromTeam(userId: string, teamId: string): Promise<void> {
    await db.delete(userTeams)
      .where(and(
        eq(userTeams.userId, userId),
        eq(userTeams.teamId, teamId)
      ));
  }

  // Invitations
  async createInvitation(invitation: InsertInvitation): Promise<Invitation> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const [newInvitation] = await db.insert(invitations).values({
      ...invitation,
      token,
      expiresAt
    }).returning();
    return newInvitation;
  }



  async getInvitation(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations)
      .where(and(
        eq(invitations.token, token),
        eq(invitations.isUsed, "false"),
        gte(invitations.expiresAt, new Date())
      ));
    return invitation || undefined;
  }

  async acceptInvitation(token: string, userInfo: { email: string; username: string; password: string; firstName: string; lastName: string }): Promise<{ user: User }> {
    const invitation = await this.getInvitation(token);
    if (!invitation) throw new Error("Invalid or expired invitation");

    // Check if user already exists
    let user = await this.getUserByEmail(invitation.email);

    if (user) {
      // User exists - update their info
      const updateData: any = {
        password: await bcrypt.hash(userInfo.password, 10),
        username: userInfo.username,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName
      };

      await db.update(users)
        .set(updateData)
        .where(eq(users.email, invitation.email));

      // Get updated user
      user = await this.getUserByEmail(invitation.email);
      if (!user) throw new Error("Failed to update existing user");
    } else {
      // Create new user
      const createUserData = {
        username: userInfo.username,
        email: userInfo.email,
        password: userInfo.password,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName
      };

      user = await this.createUser(createUserData);
    }

    // Add user to organization with the invitation role (this will remove any existing roles first)
    await this.addUserToOrganization(user.id, invitation.organizationId, invitation.role);

    // Add user to teams if specified
    if (invitation.teamIds && invitation.teamIds.length > 0) {
      for (const teamId of invitation.teamIds) {
        try {
          await this.addUserToTeam(user.id, teamId);
        } catch (error) {
          // May already be in team - that's okay
          console.log("User may already be in team:", error);
        }
      }
    }

    // Mark the invitation as used
    await db.update(invitations)
      .set({ isUsed: "true" })
      .where(eq(invitations.token, token));

    return { user };
  }

  // Athletes (users with athlete role)
  async getPlayers(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
  }): Promise<User[]> {
    return this.getAthletes(filters);
  }

  async getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
  }): Promise<User[]> {
    // For "none" team filter, use a simpler query
    if (filters?.teamId === 'none') {
      const conditions = [eq(userOrganizations.role, 'athlete')];

      if (filters?.organizationId) {
        conditions.push(eq(userOrganizations.organizationId, filters.organizationId));
      }

      if (filters?.search) {
        conditions.push(sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${'%' + filters.search + '%'}`);
      }

      if (filters?.birthYearFrom && filters?.birthYearTo) {
        conditions.push(
          and(
            gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom),
            lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo)
          )
        );
      } else if (filters?.birthYearFrom) {
        conditions.push(gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom));
      } else if (filters?.birthYearTo) {
        conditions.push(lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo));
      }

      const result = await db
        .select()
        .from(users)
        .leftJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .where(and(
          ...conditions,
          sql`${users.id} NOT IN (SELECT ${userTeams.userId} FROM ${userTeams} WHERE ${userTeams.userId} IS NOT NULL)`
        ))
        .orderBy(asc(users.lastName), asc(users.firstName));

      return result.map(row => row.users);
    }

    // For regular queries, select only users and use distinct
    const conditions = [eq(userOrganizations.role, 'athlete')];

    if (filters?.birthYearFrom && filters?.birthYearTo) {
      conditions.push(
        and(
          gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom),
          lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo)
        )
      );
    } else if (filters?.birthYearFrom) {
      conditions.push(gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom));
    } else if (filters?.birthYearTo) {
      conditions.push(lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo));
    }

    if (filters?.search) {
      conditions.push(sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${'%' + filters.search + '%'}`);
    }

    if (filters?.organizationId) {
      conditions.push(eq(userOrganizations.organizationId, filters.organizationId));
    }

    if (filters?.teamId && filters.teamId !== 'none') {
      conditions.push(eq(userTeams.teamId, filters.teamId));
    }

    const result = await db
      .selectDistinct({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        fullName: users.fullName,
        birthDate: users.birthDate,
        birthYear: users.birthYear,
        graduationYear: users.graduationYear,
        school: users.school,
        phoneNumbers: users.phoneNumbers,
        sports: users.sports,
        height: users.height,
        weight: users.weight,
        isSiteAdmin: users.isSiteAdmin,
        isActive: users.isActive,
        createdAt: users.createdAt
      })
      .from(users)
      .leftJoin(userTeams, eq(users.id, userTeams.userId))
      .leftJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...conditions))
      .orderBy(asc(users.lastName), asc(users.firstName));

    return result;
  }

  async getAthlete(id: string): Promise<User | undefined> {
    return this.getUser(id);
  }

  async createAthlete(athlete: Partial<InsertUser>): Promise<User> {
    return this.createUser({
      ...athlete,
      username: athlete.username || `athlete_${Date.now()}`,
      email: athlete.email || `temp_${Date.now()}@temp.local`,
      firstName: athlete.firstName || "",
      lastName: athlete.lastName || "",
      password: "INVITATION_PENDING"
    } as InsertUser);
  }

  async updateAthlete(id: string, athlete: Partial<InsertUser>): Promise<User> {
    return this.updateUser(id, athlete);
  }

  async deleteAthlete(id: string): Promise<void> {
    return this.deleteUser(id);
  }

  async getPlayer(id: string): Promise<(User & { teams: (Team & { organization: Organization })[] }) | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    const userTeams = await this.getUserTeams(user.id);

    // Transform user to player format for backward compatibility
    const player = {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
      birthYear: user.birthDate ? new Date(user.birthDate).getFullYear() : 0,
      emails: [user.email],
      teams: userTeams.map(ut => ut.team)
    };

    return player;
  }

  async createPlayer(player: Partial<InsertUser>): Promise<User> {
    // Generate a temporary username for the athlete
    const username = `athlete_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Use primary email or generate one
    const email = (player.emails && player.emails.length > 0) ? player.emails[0] : `${username}@temp.local`;

    const [newUser] = await db.insert(users).values({
      username,
      email,
      firstName: player.firstName,
      lastName: player.lastName,
      birthDate: player.birthday || player.birthDate,
      graduationYear: player.graduationYear,
      school: player.school,
      sports: player.sports,
      phoneNumbers: player.phoneNumbers,
      height: player.height,
      weight: player.weight,
      // role: "athlete", // Role field doesn't exist on users table
      password: "INVITATION_PENDING", // Will be set when they accept invitation
      isActive: "true"
    }).returning();

    // Add to teams if specified
    if (player.teamIds && player.teamIds.length > 0) {
      for (const teamId of player.teamIds) {
        await this.addUserToTeam(newUser.id, teamId);
      }
    }

    // Transform to player format for return
    const playerResult = {
      ...newUser,
      fullName: `${newUser.firstName} ${newUser.lastName}`,
      birthYear: newUser.birthDate ? new Date(newUser.birthDate).getFullYear() : 0,
      emails: [newUser.email],
      teams: []
    };

    return playerResult;
  }

  async updatePlayer(id: string, player: Partial<InsertUser>): Promise<User> {
    const updateData: any = { ...player };

    // Update full name if first or last name changed
    let finalFirstName: string | undefined;
    let finalLastName: string | undefined;

    if (player.firstName || player.lastName) {
      const existing = await this.getPlayer(id);
      if (existing) {
        finalFirstName = player.firstName || existing.firstName;
        finalLastName = player.lastName || existing.lastName;
        updateData.fullName = `${finalFirstName} ${finalLastName}`;
      }
    }

    // Calculate birth year if birthday changed
    if (player.birthday) {
      updateData.birthYear = new Date(player.birthday).getFullYear();
    }

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    // Update teams if specified
    if (player.teamIds !== undefined) {
      await this.setPlayerTeams(id, player.teamIds);
    }

    // Update any existing user records if name or emails changed
    if ((player.firstName || player.lastName || player.emails) && finalFirstName && finalLastName) {
      // Get current player emails (either updated or existing)
      const currentEmails = player.emails || (await this.getPlayer(id))?.emails || [];

      for (const email of currentEmails) {
        try {
          await db.update(users)
            .set({
              firstName: finalFirstName,
              lastName: finalLastName
            })
            .where(eq(users.email, email));
        } catch (error) {
          // Log but don't fail if user update fails
          console.log(`Could not update user record for email ${email}:`, error);
        }
      }
    }

    return updated;
  }

  async deletePlayer(id: string): Promise<void> {
    // Use a transaction to ensure all deletions happen atomically
    await db.transaction(async (tx) => {
      // Delete all user-team relationships
      await tx.delete(userTeams).where(eq(userTeams.userId, id));

      // Delete all user-organization relationships
      await tx.delete(userOrganizations).where(eq(userOrganizations.userId, id));

      // Delete all measurements for this user
      await tx.delete(measurements).where(eq(measurements.userId, id));

      // Delete all invitations for this user
      await tx.delete(invitations).where(eq(invitations.invitedBy, id));

      // Finally, delete the user record
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async getPlayerByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(
        eq(users.firstName, firstName),
        eq(users.lastName, lastName),
        sql`EXTRACT(YEAR FROM ${users.birthDate}) = ${birthYear}`
      ));

    if (!user) return undefined;

    return {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
      birthYear: user.birthDate ? new Date(user.birthDate).getFullYear() : 0,
      emails: [user.email],
      teams: []
    };
  }

  // Player Teams (now using userTeams)
  async getPlayerTeams(playerId: string): Promise<(Team & { organization: Organization })[]> {
    const result = await db.select()
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(userTeams.userId, playerId));

    return result.map(({ teams: team, organizations }) => ({
      ...team,
      organization: organizations
    }));
  }

  async addPlayerToTeam(playerId: string, teamId: string): Promise<UserTeam> {
    return await this.addUserToTeam(playerId, teamId);
  }

  async removePlayerFromTeam(playerId: string, teamId: string): Promise<void> {
    return await this.removeUserFromTeam(playerId, teamId);
  }

  async setPlayerTeams(playerId: string, teamIds: string[]): Promise<void> {
    // Remove existing teams
    await db.delete(userTeams).where(eq(userTeams.userId, playerId));

    // Add new teams
    if (teamIds.length > 0) {
      await db.insert(userTeams).values(
        teamIds.map(teamId => ({ userId: playerId, teamId }))
      );
    }
  }

  // Measurements
  async getMeasurements(filters?: {
    userId?: string;
    teamIds?: string[];
    organizationId?: string;
    metric?: string;
    dateFrom?: string;
    dateTo?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    ageFrom?: number;
    ageTo?: number;
    search?: string;
    sport?: string;
    includeUnverified?: boolean;
  }): Promise<any[]> {
    let query = db.select()
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id));

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(measurements.userId, filters.userId));
    }
    if (filters?.metric) {
      conditions.push(eq(measurements.metric, filters.metric));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(measurements.date, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(measurements.date, filters.dateTo));
    }
    if (filters?.birthYearFrom) {
      conditions.push(gte(users.birthYear, filters.birthYearFrom));
    }
    if (filters?.birthYearTo) {
      conditions.push(lte(users.birthYear, filters.birthYearTo));
    }
    if (filters?.search) {
      conditions.push(sql`${users.fullName} ILIKE ${'%' + filters.search + '%'}`);
    }
    if (filters?.ageFrom) {
      conditions.push(gte(measurements.age, filters.ageFrom));
    }
    if (filters?.ageTo) {
      conditions.push(lte(measurements.age, filters.ageTo));
    }
    if (!filters?.includeUnverified) {
      conditions.push(eq(measurements.isVerified, "true"));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query.orderBy(desc(measurements.date), desc(measurements.createdAt));

    // Get teams for each user and additional user info
    const measurementsWithDetails = await Promise.all(
      result.map(async ({ measurements: measurement, users: user }) => {
        const userTeams = await this.getUserTeams(user.id);

        let submittedBy;
        if (measurement.submittedBy) {
          const [submitter] = await db.select().from(users).where(eq(users.id, measurement.submittedBy));
          submittedBy = submitter;
        }

        let verifiedBy;
        if (measurement.verifiedBy) {
          const [verifier] = await db.select().from(users).where(eq(users.id, measurement.verifiedBy));
          verifiedBy = verifier;
        }

        return {
          ...measurement,
          user: { ...user, teams: userTeams.map(ut => ut.team) },
          submittedBy,
          verifiedBy
        };
      })
    );

    // Apply team/organization filters
    let filteredMeasurements = measurementsWithDetails;

    if (filters?.teamIds && filters.teamIds.length > 0) {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.teams.some(team => filters.teamIds!.includes(team.id))
      );
    }

    if (filters?.organizationId) {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.teams.some(team => team.organization.id === filters.organizationId)
      );
    }

    // Filter by sport if specified
    if (filters?.sport && filters.sport !== "all") {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.sports?.includes(filters.sport!)
      );
    }

    return filteredMeasurements;
  }

  async getMeasurement(id: string): Promise<Measurement | undefined> {
    const [measurement] = await db.select().from(measurements).where(eq(measurements.id, id));
    return measurement || undefined;
  }

  async createMeasurement(measurement: InsertMeasurement): Promise<Measurement> {
    // Calculate age and units based on metric
    const user = await this.getUser(measurement.userId);
    if (!user) throw new Error("User not found");

    const measurementDate = new Date(measurement.date);
    let age = measurementDate.getFullYear() - (user.birthYear || 0);

    // Use birthDate for more precise age calculation if available
    if (user.birthDate) {
      const birthDate = new Date(user.birthDate);
      const birthdayThisYear = new Date(measurementDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
      if (measurementDate < birthdayThisYear) {
        age -= 1;
      }
    }

    const units = measurement.metric === "FLY10_TIME" || measurement.metric === "T_TEST" || measurement.metric === "DASH_40YD" ? "s" :
                  measurement.metric === "RSI" ? "ratio" : "in";

    // Get submitter info to determine if auto-verify
    const [submitter] = await db.select().from(users).where(eq(users.id, measurement.submittedBy));

    // Check if submitter is site admin or has coach/org_admin role in any organization
    let isCoach = submitter?.isSiteAdmin === "true";
    if (!isCoach && submitter) {
      const submitterRoles = await this.getUserRoles(submitter.id);
      isCoach = submitterRoles.includes("coach") || submitterRoles.includes("org_admin");
    }

    const [newMeasurement] = await db.insert(measurements).values({
      userId: measurement.userId,
      submittedBy: measurement.submittedBy,
      date: measurement.date,
      metric: measurement.metric,
      value: measurement.value.toString(),
      notes: measurement.notes,
      flyInDistance: measurement.flyInDistance?.toString(),
      age,
      units,
      isVerified: isCoach ? "true" : "false",
      verifiedBy: isCoach ? measurement.submittedBy : undefined
    }).returning();

    return newMeasurement;
  }

  async updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement> {
    const updateData: any = {};
    if (measurement.userId) updateData.userId = measurement.userId;
    if (measurement.submittedBy) updateData.submittedBy = measurement.submittedBy;
    if (measurement.date) updateData.date = measurement.date;
    if (measurement.metric) updateData.metric = measurement.metric;
    if (measurement.value !== undefined) updateData.value = measurement.value.toString();
    if (measurement.notes !== undefined) updateData.notes = measurement.notes;
    if (measurement.flyInDistance !== undefined) updateData.flyInDistance = measurement.flyInDistance?.toString();

    const [updated] = await db.update(measurements).set(updateData).where(eq(measurements.id, id)).returning();
    return updated;
  }

  async deleteMeasurement(id: string): Promise<void> {
    await db.delete(measurements).where(eq(measurements.id, id));
  }

  async verifyMeasurement(id: string, verifiedBy: string): Promise<Measurement> {
    const [updated] = await db.update(measurements)
      .set({
        isVerified: "true",
        verifiedBy
      })
      .where(eq(measurements.id, id))
      .returning();
    return updated;
  }

  // Analytics
  async getUserStats(userId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }> {
    return this.getPlayerStats(userId);
  }

  async getPlayerStats(userId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }> {
    const measurements = await this.getMeasurements({ userId, includeUnverified: false });

    const fly10Times = measurements
      .filter(m => m.metric === "FLY10_TIME")
      .map(m => parseFloat(m.value));
    const verticalJumps = measurements
      .filter(m => m.metric === "VERTICAL_JUMP")
      .map(m => parseFloat(m.value));

    return {
      bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
      bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
      measurementCount: measurements.length
    };
  }

  async getTeamStats(organizationId?: string): Promise<Array<{
    teamId: string;
    teamName: string;
    organizationName: string;
    athleteCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>> {
    const teams = await this.getTeams(organizationId);

    const teamStats = await Promise.all(
      teams.map(async (team) => {
        const athletes = await this.getAthletes({ teamId: team.id });
        const measurements = await this.getMeasurements({ teamIds: [team.id], includeUnverified: false });

        const fly10Times = measurements
          .filter(m => m.metric === "FLY10_TIME")
          .map(m => parseFloat(m.value));
        const verticalJumps = measurements
          .filter(m => m.metric === "VERTICAL_JUMP")
          .map(m => parseFloat(m.value));

        const latestMeasurement = measurements[0]; // Already ordered by date desc

        return {
          teamId: team.id,
          teamName: team.name,
          organizationName: team.organization.name,
          athleteCount: athletes.length,
          bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
          bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
          latestTest: latestMeasurement ? latestMeasurement.date : undefined
        };
      })
    );

    return teamStats;
  }

  async getDashboardStats(organizationId?: string): Promise<{
    totalAthletes: number;
    totalTeams: number;
    bestFly10Today?: { value: number; userName: string };
    bestVerticalToday?: { value: number; userName: string };
  }> {
    const athletes = await this.getAthletes({ organizationId });
    const teams = await this.getTeams(organizationId);

    // Count active athletes (players who have user accounts)
    const allUsers = organizationId
      ? await this.getOrganizationUsers(organizationId)
      : await this.getUsers();

    const today = new Date().toISOString().split('T')[0];
    const todaysMeasurements = await this.getMeasurements({
      dateFrom: today,
      dateTo: today,
      organizationId,
      includeUnverified: false
    });

    const todaysFly10 = todaysMeasurements
      .filter(m => m.metric === "FLY10_TIME")
      .map(m => ({ value: parseFloat(m.value), userName: m.user.fullName }));

    const todaysVertical = todaysMeasurements
      .filter(m => m.metric === "VERTICAL_JUMP")
      .map(m => ({ value: parseFloat(m.value), userName: m.user.fullName }));

    return {
      totalAthletes: athletes.length,
      totalTeams: teams.length,
      bestFly10Today: todaysFly10.length > 0 ? todaysFly10.reduce((best, current) =>
        current.value < best.value ? current : best
      ) : undefined,
      bestVerticalToday: todaysVertical.length > 0 ? todaysVertical.reduce((best, current) =>
        current.value > best.value ? current : best
      ) : undefined
    };
  }
}

export const storage = new DatabaseStorage();