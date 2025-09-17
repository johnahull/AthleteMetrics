import {
  organizations, teams, users, measurements, userOrganizations, userTeams, invitations,
  type Organization, type Team, type Measurement, type User, type UserOrganization, type UserTeam, type Invitation,
  type InsertOrganization, type InsertTeam, type InsertMeasurement, type InsertUser, type InsertUserOrganization, type InsertUserTeam, type InsertInvitation
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql, arrayContains, or, isNull, exists, ne } from "drizzle-orm";
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
  archiveTeam(id: string, archiveDate: Date, season: string): Promise<Team>;
  unarchiveTeam(id: string): Promise<Team>;
  updateTeamMembership(teamId: string, userId: string, membershipData: { leftAt?: Date; season?: string }): Promise<any>;

  // User Management
  addUserToOrganization(userId: string, organizationId: string, role: string): Promise<UserOrganization>;
  addUserToTeam(userId: string, teamId: string): Promise<UserTeam>;
  removeUserFromOrganization(userId: string, organizationId: string): Promise<void>;
  removeUserFromTeam(userId: string, teamId: string): Promise<void>;

  // Invitations
  createInvitation(data: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    organizationId: string;
    teamIds?: string[];
    role: string;
    invitedBy: string;
    playerId?: string;
    expiresAt: Date;
  }): Promise<Invitation>;
  getInvitation(token: string): Promise<Invitation | undefined>;
  updateInvitation(id: string, invitation: Partial<InsertInvitation>): Promise<Invitation>;
  acceptInvitation(token: string, userInfo: { email: string; username: string; password: string; firstName: string; lastName: string }): Promise<{ user: User }>;

  // Athletes (users with athlete role)
  getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
  }): Promise<(User & { teams: (Team & { organization: Organization })[] })[]>;
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
  createMeasurement(measurement: InsertMeasurement, submittedBy: string): Promise<Measurement>;
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
    activeAthletes: number;
    totalTeams: number;
    bestFLY10_TIMELast30Days?: { value: number; userName: string };
    bestVERTICAL_JUMPLast30Days?: { value: number; userName: string };
    bestAGILITY_505Last30Days?: { value: number; userName: string };
    bestAGILITY_5105Last30Days?: { value: number; userName: string };
    bestT_TESTLast30Days?: { value: number; userName: string };
    bestDASH_40YDLast30Days?: { value: number; userName: string };
    bestRSILast30Days?: { value: number; userName: string };
  }>;

  // Enhanced Authentication Methods
  findUserById(userId: string): Promise<User | null>;
  resetLoginAttempts(userId: string): Promise<void>;
  incrementLoginAttempts(userId: string, attempts: number): Promise<void>;
  lockAccount(userId: string, lockUntil: Date): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
  createLoginSession(session: any): Promise<void>;
  findLoginSession(token: string): Promise<any>;
  updateSessionActivity(sessionId: string): Promise<void>;
  revokeLoginSession(token: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
  updateUserBackupCodes(userId: string, codes: string[]): Promise<void>;
  createSecurityEvent(event: any): Promise<void>;
  getUserSecurityEvents(userId: string, limit: number): Promise<any[]>;
  getSecurityEventsByIP(ipAddress: string, timeWindow: number): Promise<any[]>;
  getRecentEmailChanges(userId: string, timeWindow: number): Promise<any[]>;
  getRecentPasswordResets(email: string, timeWindow: number): Promise<any[]>;
  createPasswordResetToken(token: any): Promise<void>;
  findPasswordResetToken(token: string): Promise<any>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  updatePasswordChangedAt(userId: string): Promise<void>;
  createEmailVerificationToken(token: any): Promise<void>;
  findEmailVerificationToken(token: string): Promise<any>;
  markEmailAsVerified(userId: string, email: string): Promise<void>;
  markEmailVerificationTokenUsed(token: string): Promise<void>;
  getUserRole(userId: string, organizationId: string): Promise<string | null>;
  updateUserRole(userId: string, organizationId: string, role: string): Promise<boolean>;
  getUsersByOrganization(organizationId: string): Promise<any[]>;
  getUserActivityStats(userId: string, organizationId: string): Promise<any>;
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
    const [user] = await db.select().from(users).where(arrayContains(users.emails, [email]));
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(arrayContains(users.emails, [email]));
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

    // Ensure emails array is properly set
    const emails = user.emails || [`${user.username || 'user'}@temp.local`];

    const [newUser] = await db.insert(users).values({
      ...user,
      emails,
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

  async getInvitations(): Promise<Invitation[]> {
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

  async getUserRole(userId: string, organizationId: string): Promise<string | null> {
    // Get role from specific organization
    const [result] = await db.select({ role: userOrganizations.role })
      .from(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ));
    return result?.role || null;
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
      console.log(`User roles query: found ${result.length} records`);
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

    const mappedResult = result.map(({ user_teams, teams: team, organizations }) => ({
      ...user_teams,
      team: { ...team, organization: organizations }
    }));

    if (result.length > 0) {
      console.log(`User teams query: found ${result.length} team(s)`);
    }

    return mappedResult;
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
    athletes: (User & { teams: (Team & { organization: Organization })[] })[],
    invitations: Invitation[]
  } | null> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
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
    const athletes = await this.getAthletes({ organizationId });

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
      athletes: athletes as any,
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
        playerId: invitations.playerId,
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

    // Build conditions array to exclude archived teams
    const conditions = [];
    
    if (organizationId) {
      conditions.push(eq(teams.organizationId, organizationId));
    }
    
    // Always exclude archived teams
    conditions.push(ne(teams.isArchived, "true"));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
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

  /**
   * Archives a team and marks all current team memberships as inactive
   * @param id Team ID to archive
   * @param archiveDate Date when the team was archived (affects measurement context)
   * @param season Final season designation for the team (e.g., "2024-Fall Soccer")
   * @returns Promise<Team> The archived team object
   * @throws Error if team not found or archive operation fails
   */
  async archiveTeam(id: string, archiveDate: Date, season: string): Promise<Team> {
    // Use transaction to ensure atomicity of archive operations
    return await db.transaction(async (tx) => {
      const [archived] = await tx.update(teams)
        .set({
          isArchived: "true",
          archivedAt: archiveDate,
          season: season
        })
        .where(eq(teams.id, id))
        .returning();
      
      // Mark all current team memberships as inactive
      await tx.update(userTeams)
        .set({
          isActive: "false",
          leftAt: archiveDate,
          season: season
        })
        .where(and(
          eq(userTeams.teamId, id),
          eq(userTeams.isActive, "true")
        ));
      
      return archived;
    });
  }

  /**
   * Unarchives a team by setting isArchived to false and clearing archivedAt
   * Note: This does NOT automatically reactivate team memberships - 
   * users must be explicitly re-added to prevent old measurements from 
   * affecting current analytics
   * @param id Team ID to unarchive
   * @returns Promise<Team> The unarchived team object
   * @throws Error if team not found or unarchive operation fails
   */
  async unarchiveTeam(id: string): Promise<Team> {
    const [unarchived] = await db.update(teams)
      .set({
        isArchived: "false",
        archivedAt: null
      })
      .where(eq(teams.id, id))
      .returning();
    
    // Note: We don't automatically reactivate team memberships when unarchiving
    // This is intentional - users should be explicitly re-added to teams
    // to prevent accidentally including old measurements in current analytics
    
    return unarchived;
  }

  async updateTeamMembership(teamId: string, userId: string, membershipData: { leftAt?: Date; season?: string }): Promise<any> {
    const [updated] = await db.update(userTeams)
      .set({
        leftAt: membershipData.leftAt,
        season: membershipData.season,
        isActive: membershipData.leftAt ? "false" : "true"
      })
      .where(and(
        eq(userTeams.teamId, teamId),
        eq(userTeams.userId, userId)
      ))
      .returning();
    
    return updated;
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
    try {
      // Check if user has an active membership in this team
      const existingActiveAssignment = await db.select()
        .from(userTeams)
        .where(and(
          eq(userTeams.userId, userId),
          eq(userTeams.teamId, teamId),
          eq(userTeams.isActive, "true")
        ));

      if (existingActiveAssignment.length > 0) {
        console.log('User already has active assignment to team');
        return existingActiveAssignment[0];
      }

      // Check if user has an inactive membership that can be reactivated
      const existingInactiveAssignment = await db.select()
        .from(userTeams)
        .where(and(
          eq(userTeams.userId, userId),
          eq(userTeams.teamId, teamId),
          eq(userTeams.isActive, "false")
        ));

      if (existingInactiveAssignment.length > 0) {
        // Reactivate the membership
        const [reactivated] = await db.update(userTeams)
          .set({
            isActive: "true",
            leftAt: null,
            joinedAt: new Date() // New join date
          })
          .where(eq(userTeams.id, existingInactiveAssignment[0].id))
          .returning();
        
        console.log('User membership reactivated');
        return reactivated;
      }

      // Create new membership
      const [userTeam] = await db.insert(userTeams).values({
        userId,
        teamId,
        joinedAt: new Date(),
        isActive: "true"
      }).returning();

      console.log('User added to team successfully');
      return userTeam;
    } catch (error) {
      console.error(`Error adding user ${userId} to team ${teamId}:`, error);
      throw error;
    }
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
    for (const [orgId, roles] of Array.from(orgRoleMap.entries())) {
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
    // Mark membership as inactive instead of deleting (temporal approach)
    await db.update(userTeams)
      .set({
        isActive: "false",
        leftAt: new Date()
      })
      .where(and(
        eq(userTeams.userId, userId),
        eq(userTeams.teamId, teamId),
        eq(userTeams.isActive, "true")
      ));
  }

  // Invitations
  async createInvitation(data: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    organizationId: string;
    teamIds?: string[];
    role: string;
    invitedBy: string;
    playerId?: string;
    expiresAt: Date;
  }): Promise<Invitation> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const [invitation] = await db.insert(invitations).values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      organizationId: data.organizationId,
      teamIds: data.teamIds || [],
      role: data.role,
      invitedBy: data.invitedBy,
      playerId: data.playerId, // Store athlete ID consistently
      token,
      expiresAt,
    }).returning();
    return invitation;
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

    // Always create a new user - email addresses are not unique identifiers for athletes
    const createUserData = {
      username: userInfo.username,
      emails: [invitation.email],
      password: userInfo.password,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      role: invitation.role as "site_admin" | "org_admin" | "coach" | "athlete" // Use the role from the invitation
    };

    const user = await this.createUser(createUserData);

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

  // Athletes (users with athlete role) - consolidated from legacy getPlayers

  async getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
    gender?: string;
  }): Promise<(User & { teams: (Team & { organization: Organization })[] })[]> {
    // For "none" team filter, get athletes not assigned to any team within the organization
    if (filters?.teamId === 'none') {
      const conditions = [eq(userOrganizations.role, 'athlete')];

      // Organization filter is required for "none" team filter to work properly
      if (filters?.organizationId) {
        conditions.push(eq(userOrganizations.organizationId, filters.organizationId));
      } else {
        // If no organization specified, return empty array since we need org context
        return [];
      }

      if (filters?.search) {
        conditions.push(sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${'%' + filters.search + '%'}`);
      }

      if (filters?.birthYearFrom && filters?.birthYearTo) {
        conditions.push(gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom));
        conditions.push(lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo));
      } else if (filters?.birthYearFrom) {
        conditions.push(gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom));
      } else if (filters?.birthYearTo) {
        conditions.push(lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo));
      }

      if (filters?.gender && filters.gender !== "all") {
        conditions.push(eq(users.gender, filters.gender as "Male" | "Female" | "Not Specified"));
      }

      const result = await db
        .select()
        .from(users)
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .where(and(
          ...conditions,
          sql`${users.id} NOT IN (SELECT ${userTeams.userId} FROM ${userTeams} WHERE ${userTeams.userId} IS NOT NULL)`
        ))
        .orderBy(asc(users.lastName), asc(users.firstName));

      // For "none" team filter, athletes should have empty teams array
      return result.map(row => ({
        ...row.users,
        teams: []
      }));
    }

    // For regular queries, get athletes with their team information
    const conditions = [eq(userOrganizations.role, 'athlete')];

    if (filters?.birthYearFrom && filters?.birthYearTo) {
      conditions.push(gte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearFrom));
      conditions.push(lte(sql`EXTRACT(YEAR FROM ${users.birthDate})`, filters.birthYearTo));
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

    // Get athletes first with optimized batched query approach
    const athleteQuery = db
      .select()
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...conditions))
      .orderBy(asc(users.lastName), asc(users.firstName));

    const athleteResults = await athleteQuery;
    const athletes = athleteResults.map(row => row.users);

    // If no athletes found, return empty array
    if (athletes.length === 0) {
      return [];
    }

    // Batch fetch all teams for all athletes in a single query
    // Filter for active team memberships and non-archived teams
    const athleteIds = athletes.map(a => a.id);
    const userTeamsResults = await db
      .select()
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(and(
        inArray(userTeams.userId, athleteIds),
        eq(userTeams.isActive, "true"),
        or(isNull(userTeams.leftAt), gte(userTeams.leftAt, new Date())),
        eq(teams.isArchived, "false")
      ));

    // Build a map of user ID to teams array
    const userTeamsMap = new Map<string, (Team & { organization: Organization })[]>();

    // Initialize empty arrays for all athletes
    athletes.forEach(athlete => {
      userTeamsMap.set(athlete.id, []);
    });

    // Populate the map with team data
    userTeamsResults.forEach(row => {
      const userId = row.user_teams.userId;
      const team = {
        ...row.teams,
        organization: row.organizations
      };

      if (!userTeamsMap.has(userId)) {
        userTeamsMap.set(userId, []);
      }
      userTeamsMap.get(userId)!.push(team);
    });

    // Create final result with teams attached
    const athletesWithTeams = athletes.map(athlete => ({
      ...athlete,
      teams: userTeamsMap.get(athlete.id) || []
    }));

    const result = athletesWithTeams;

    // Apply team filter
    if (filters?.teamId && filters.teamId !== 'none') {
      return result.filter(athlete => 
        athlete.teams.some((team: any) => team.id === filters.teamId)
      );
    }

    return result;
  }

  // Legacy methods for backward compatibility - delegate to athlete methods

  async getAthlete(id: string): Promise<(User & { teams: (Team & { organization: Organization })[] }) | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    const userTeams = await this.getUserTeams(user.id);

    // Transform user to athlete format for backward compatibility
    const athlete = {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
      birthYear: user.birthDate ? new Date(user.birthDate).getFullYear() : 0,
      teams: userTeams.map(ut => ut.team)
    };

    return athlete;
  }

  async createAthlete(athlete: Partial<InsertUser>): Promise<User> {
    // Generate a temporary username for the athlete
    const username = `athlete_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Use primary email or generate one
    const emails = (athlete.emails && athlete.emails.length > 0) ? athlete.emails : [`${username}@temp.local`];

    // Create new user directly without checking for existing emails
    const [newUser] = await db.insert(users).values({
      username,
      emails, // Ensure emails array is always provided
      firstName: athlete.firstName!,
      lastName: athlete.lastName!,
      birthDate: athlete.birthDate || null,
      graduationYear: athlete.graduationYear || null,
      school: athlete.school || null,
      sports: athlete.sports || null,
      phoneNumbers: athlete.phoneNumbers || null,
      height: athlete.height || null,
      weight: athlete.weight || null,
      fullName: `${athlete.firstName} ${athlete.lastName}`,
      birthYear: athlete.birthDate ? new Date(athlete.birthDate).getFullYear() : null,
      password: "INVITATION_PENDING", // Will be set when they accept invitation
      isActive: athlete.isActive ?? "true" // Use provided value or default to active
    }).returning();

    // Determine organization for athlete association
    let organizationId: string | undefined = (athlete as any).organizationId;

    // Add to teams if specified and determine organization from first team if not already set
    if (athlete.teamIds && athlete.teamIds.length > 0) {
      for (const teamId of athlete.teamIds) {
        try {
          await this.addUserToTeam(newUser.id, teamId);
          console.log('Athlete added to team successfully');
        } catch (error) {
          console.error(`Failed to add athlete ${newUser.id} to team ${teamId}:`, error);
        }

        // Get the organization from the first team if not already specified
        if (!organizationId) {
          const team = await this.getTeam(teamId);
          if (team) {
            organizationId = team.organization.id;
          }
        }
      }
    }

    // Associate athlete with organization (required for proper listing)
    if (organizationId) {
      await this.addUserToOrganization(newUser.id, organizationId, "athlete");
    } else {
      console.warn(`Created athlete ${newUser.id} without organization association`);
    }

    // Transform to athlete format for return
    const athleteResult = {
      ...newUser,
      fullName: `${newUser.firstName} ${newUser.lastName}`,
      birthYear: newUser.birthDate ? new Date(newUser.birthDate).getFullYear() : 0,
      emails: newUser.emails,
      teams: []
    };

    return athleteResult;
  }

  async updateAthlete(id: string, athlete: Partial<InsertUser>): Promise<User> {
    const updateData: any = { ...athlete };

    // Update full name if first or last name changed
    let finalFirstName: string | undefined;
    let finalLastName: string | undefined;

    if (athlete.firstName || athlete.lastName) {
      const existing = await this.getAthlete(id);
      if (existing) {
        finalFirstName = athlete.firstName || existing.firstName;
        finalLastName = athlete.lastName || existing.lastName;
        updateData.fullName = `${finalFirstName} ${finalLastName}`;
      }
    }

    // Calculate birth year if birthDate changed
    if (athlete.birthDate) {
      updateData.birthYear = new Date(athlete.birthDate).getFullYear();
    }

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    // Update teams if specified
    if (athlete.teamIds !== undefined) {
      await this.setAthleteTeams(id, athlete.teamIds);
    }

    // Update any existing user records if name changed
    if ((athlete.firstName || athlete.lastName) && finalFirstName && finalLastName) {
      // Update the user record directly by ID
      try {
        await db.update(users)
          .set({
            firstName: finalFirstName,
            lastName: finalLastName,
            fullName: `${finalFirstName} ${finalLastName}`
          })
          .where(eq(users.id, id));
      } catch (error) {
        // Log but don't fail if user update fails
        console.log('Could not update user record:', (error as Error).message);
      }
    }

    return updated;
  }

  async deleteAthlete(id: string): Promise<void> {
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

  async getAthleteByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<User | undefined> {
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
      birthYear: user.birthDate ? new Date(user.birthDate).getFullYear() : 0
    } as any;
  }

  // Athlete Teams (now using userTeams)
  async getAthleteTeams(athleteId: string): Promise<(Team & { organization: Organization })[]> {
    const result = await db.select()
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(userTeams.userId, athleteId));

    return result.map(({ teams: team, organizations }) => ({
      ...team,
      organization: organizations
    }));
  }

  async addAthleteToTeam(athleteId: string, teamId: string): Promise<UserTeam> {
    return await this.addUserToTeam(athleteId, teamId);
  }

  async removeAthleteFromTeam(athleteId: string, teamId: string): Promise<void> {
    return await this.removeUserFromTeam(athleteId, teamId);
  }

  async setAthleteTeams(athleteId: string, teamIds: string[]): Promise<void> {
    // Remove existing teams
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));

    // Add new teams
    if (teamIds.length > 0) {
      await db.insert(userTeams).values(
        teamIds.map(teamId => ({ userId: athleteId, teamId }))
      );
    }
  }

  // Measurements
  async getMeasurements(filters?: {
    userId?: string;
    athleteId?: string;
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
    gender?: string;
    position?: string;
    includeUnverified?: boolean;
  }): Promise<any[]> {
    // Optimized query with all joins to eliminate N+1
    const query = db.select({
      // Measurement fields
      id: measurements.id,
      userId: measurements.userId,
      submittedBy: measurements.submittedBy,
      verifiedBy: measurements.verifiedBy,
      isVerified: measurements.isVerified,
      date: measurements.date,
      age: measurements.age,
      metric: measurements.metric,
      value: measurements.value,
      units: measurements.units,
      flyInDistance: measurements.flyInDistance,
      notes: measurements.notes,
      createdAt: measurements.createdAt,
      // User data with teams aggregated
      user: sql<any>`jsonb_build_object(
        'id', ${users.id},
        'firstName', ${users.firstName},
        'lastName', ${users.lastName},
        'fullName', ${users.fullName},
        'birthYear', ${users.birthYear},
        'sports', ${users.sports},
        'teams', COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', ${teams.id},
              'name', ${teams.name},
              'organization', jsonb_build_object(
                'id', ${organizations.id},
                'name', ${organizations.name}
              )
            )
          ) FILTER (WHERE ${teams.id} IS NOT NULL),
          '[]'
        )
      )`,
      // Submitter and verifier info
      submitterInfo: sql<any>`submitter_info.first_name || ' ' || submitter_info.last_name`,
      verifierInfo: sql<any>`verifier_info.first_name || ' ' || verifier_info.last_name`
    })
    .from(measurements)
    .innerJoin(users, eq(measurements.userId, users.id))
    // Use direct team relationship when available, fall back to temporal logic
    .leftJoin(teams, or(
      // Direct team relationship (preferred)
      eq(measurements.teamId, teams.id),
      // Fallback: temporal logic for measurements without direct team context
      and(
        or(isNull(measurements.teamId), eq(measurements.teamId, "")), // No direct team context
        exists(
          db.select({ id: userTeams.id })
            .from(userTeams)
            .where(and(
              eq(userTeams.userId, users.id),
              eq(userTeams.teamId, teams.id),
              lte(userTeams.joinedAt, measurements.date),
              or(
                isNull(userTeams.leftAt),
                gte(userTeams.leftAt, measurements.date)
              )
            ))
        )
      )
    ))
    .leftJoin(userTeams, and(
      eq(users.id, userTeams.userId),
      eq(userTeams.teamId, teams.id)
    ))
    .leftJoin(organizations, eq(teams.organizationId, organizations.id))
    .leftJoin(sql`${users} AS submitter_info`, sql`${measurements.submittedBy} = submitter_info.id`)
    .leftJoin(sql`${users} AS verifier_info`, sql`${measurements.verifiedBy} = verifier_info.id`);

    const conditions = [];
    if (filters?.userId || filters?.athleteId) {
      const targetUserId = filters.userId || filters.athleteId;
      if (targetUserId) {
        conditions.push(eq(measurements.userId, targetUserId));
      }
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
    
    // Team filtering - use direct team relationship when available for better performance
    if (filters?.teamIds && filters.teamIds.length > 0) {
      conditions.push(or(
        inArray(measurements.teamId, filters.teamIds), // Direct team relationship (preferred)
        and(
          or(isNull(measurements.teamId), eq(measurements.teamId, "")), // Fallback for measurements without direct team context
          exists(
            db.select({ id: userTeams.id })
              .from(userTeams)
              .where(and(
                eq(userTeams.userId, users.id),
                inArray(userTeams.teamId, filters.teamIds),
                lte(userTeams.joinedAt, measurements.date),
                or(
                  isNull(userTeams.leftAt),
                  gte(userTeams.leftAt, measurements.date)
                )
              ))
          )
        )
      ));
    }
    
    // Organization filtering - filter by user's organization membership, not team organization
    // Use EXISTS subquery to prevent duplicates from multiple org memberships
    if (filters?.organizationId) {
      conditions.push(exists(
        db.select({ id: userOrganizations.id })
          .from(userOrganizations)
          .where(and(
            eq(userOrganizations.userId, users.id),
            eq(userOrganizations.organizationId, filters.organizationId)
          ))
      ));
    }

    let finalQuery = query;
    if (conditions.length > 0) {
      finalQuery = query.where(and(...conditions)) as any;
    }

    const result = await finalQuery
      .groupBy(
        measurements.id, 
        users.id, 
        sql`submitter_info.first_name`,
        sql`submitter_info.last_name`,
        sql`verifier_info.first_name`,
        sql`verifier_info.last_name`
      )
      .orderBy(desc(measurements.date), desc(measurements.createdAt));

    // Apply remaining filters (team/org filtering now done in query for better performance)
    let filteredMeasurements = result;

    // Filter by sport if specified
    if (filters?.sport && filters.sport !== "all") {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.sports?.includes(filters.sport!)
      );
    }

    // Filter by gender if specified
    if (filters?.gender && filters.gender !== "all") {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.gender === filters.gender
      );
    }

    // Filter by position if specified
    if (filters?.position && filters.position !== "all") {
      filteredMeasurements = filteredMeasurements.filter(measurement =>
        measurement.user.positions?.includes(filters.position!)
      );
    }

    return filteredMeasurements;
  }

  async getMeasurement(id: string): Promise<Measurement | undefined> {
    const [measurement] = await db.select().from(measurements).where(eq(measurements.id, id));
    return measurement || undefined;
  }

  async getAthleteActiveTeamsAtDate(userId: string, measurementDate: Date): Promise<Array<{
    teamId: string;
    teamName: string;
    season: string | null;
    organizationId: string;
    organizationName: string;
  }>> {
    const activeTeams = await db.select({
      teamId: teams.id,
      teamName: teams.name,
      season: teams.season,
      organizationId: teams.organizationId,
      organizationName: organizations.name,
    })
    .from(userTeams)
    .innerJoin(teams, eq(userTeams.teamId, teams.id))
    .innerJoin(organizations, eq(teams.organizationId, organizations.id))
    .where(and(
      eq(userTeams.userId, userId),
      lte(userTeams.joinedAt, measurementDate),
      or(
        isNull(userTeams.leftAt),
        gte(userTeams.leftAt, measurementDate)
      ),
      eq(userTeams.isActive, "true"),
      eq(teams.isArchived, "false") // Only include non-archived teams
    ));

    return activeTeams;
  }

  async createMeasurement(measurement: InsertMeasurement, submittedBy: string): Promise<Measurement> {
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

    // Auto-populate team context if not explicitly provided
    let teamId = measurement.teamId;
    let season = measurement.season;
    let teamContextAuto = "true";

    if (!teamId || teamId.trim() === "") {
      // Get athlete's active teams at measurement date
      const activeTeams = await this.getAthleteActiveTeamsAtDate(measurement.userId, measurementDate);
      
      if (activeTeams.length === 1) {
        // Single team - auto-assign
        teamId = activeTeams[0].teamId;
        season = activeTeams[0].season || undefined;
        teamContextAuto = "true";
        console.log(`Auto-assigned measurement to team: ${activeTeams[0].teamName} (${season || 'no season'})`);
      } else if (activeTeams.length > 1) {
        // Multiple teams - cannot auto-assign, will need manual selection
        console.log(`Athlete is on ${activeTeams.length} teams - team context not auto-assigned`);
        teamContextAuto = "false";
      } else {
        // No active teams - measurement without team context
        console.log('Athlete has no active teams - measurement created without team context');
        teamContextAuto = "false";
      }
    } else {
      // Team was explicitly provided
      teamContextAuto = "false";
    }

    // Get submitter info to determine if auto-verify
    const [submitter] = await db.select().from(users).where(eq(users.id, submittedBy));

    // Check if submitter is site admin or has coach/org_admin role in any organization
    let isCoach = submitter?.isSiteAdmin === "true";
    if (!isCoach && submitter) {
      const submitterRoles = await this.getUserRoles(submitter.id);
      isCoach = submitterRoles.includes("coach") || submitterRoles.includes("org_admin");
    }

    const [newMeasurement] = await db.insert(measurements).values({
      userId: measurement.userId,
      submittedBy: submittedBy,
      date: measurement.date,
      metric: measurement.metric,
      value: measurement.value.toString(),
      notes: measurement.notes,
      flyInDistance: measurement.flyInDistance?.toString(),
      age,
      units,
      isVerified: isCoach ? "true" : "false",
      verifiedBy: isCoach ? submittedBy : undefined,
      teamId: teamId || null,
      season: season || null,
      teamContextAuto: teamContextAuto
    }).returning();

    return newMeasurement;
  }

  async updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement> {
    const updateData: any = {};
    if (measurement.userId) updateData.userId = measurement.userId;
    // submittedBy cannot be updated after creation
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
    return this.getAthleteStats(userId);
  }

  async getAthleteStats(userId: string): Promise<{
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
    // Always require organization context for team stats to prevent cross-org data leakage
    if (!organizationId) {
      return [];
    }

    const teams = await this.getTeams(organizationId);
    console.log(`getTeamStats: Found ${teams.length} teams for org ${organizationId}:`, teams.map(t => t.name));

    const teamStats = await Promise.all(
      teams.map(async (team) => {
        // Ensure athletes are filtered by organization as well
        const athletes = await this.getAthletes({ teamId: team.id, organizationId: team.organizationId });
        const measurements = await this.getMeasurements({ 
          teamIds: [team.id], 
          organizationId: team.organizationId,
          includeUnverified: false 
        });

        const fly10Times = measurements
          .filter(m => m.metric === "FLY10_TIME")
          .map(m => parseFloat(m.value));
        const verticalJumps = measurements
          .filter(m => m.metric === "VERTICAL_JUMP")
          .map(m => parseFloat(m.value));

        const latestMeasurement = measurements[0]; // Already ordered by date desc

        const teamStat = {
          teamId: team.id,
          teamName: team.name,
          organizationName: team.organization.name,
          athleteCount: athletes.length,
          bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
          bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
          latestTest: latestMeasurement ? latestMeasurement.date : undefined
        };
        console.log(`Team stat for ${team.name}:`, teamStat);
        return teamStat;
      })
    );

    console.log(`getTeamStats: Returning ${teamStats.length} team stats:`, teamStats.map(ts => `${ts.teamName} (${ts.athleteCount} athletes)`));
    return teamStats;
  }

  async getDashboardStats(organizationId?: string): Promise<{
    totalAthletes: number;
    activeAthletes: number;
    totalTeams: number;
    bestFLY10_TIMELast30Days?: { value: number; userName: string };
    bestVERTICAL_JUMPLast30Days?: { value: number; userName: string };
    bestAGILITY_505Last30Days?: { value: number; userName: string };
    bestAGILITY_5105Last30Days?: { value: number; userName: string };
    bestT_TESTLast30Days?: { value: number; userName: string };
    bestDASH_40YDLast30Days?: { value: number; userName: string };
    bestRSILast30Days?: { value: number; userName: string };
  }> {
    const athletes = await this.getAthletes({ organizationId });
    const teams = await this.getTeams(organizationId);

    // Count athletes in the organization
    const totalAthletes = athletes.length;

    // Active athletes are those with active user accounts (not just invitation pending)
    const activeAthletes = athletes.filter(athlete => 
      athlete.isActive === "true" && athlete.password !== "INVITATION_PENDING"
    ).length;

    // Get measurements from last 30 days instead of just today
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const recentMeasurements = await this.getMeasurements({
      dateFrom: thirtyDaysAgo,
      dateTo: today,
      organizationId,
      includeUnverified: false
    });

    // Define all available metrics and whether lower is better
    const metrics = [
      { key: 'FLY10_TIME', lowerIsBetter: true },
      { key: 'VERTICAL_JUMP', lowerIsBetter: false },
      { key: 'AGILITY_505', lowerIsBetter: true },
      { key: 'AGILITY_5105', lowerIsBetter: true },
      { key: 'T_TEST', lowerIsBetter: true },
      { key: 'DASH_40YD', lowerIsBetter: true },
      { key: 'RSI', lowerIsBetter: false }
    ];

    // Count only active (non-archived) teams
    const activeTeams = teams.filter(team => team.isArchived !== "true");

    // Calculate best for each metric
    const bestMetrics: any = {
      totalAthletes,
      activeAthletes,
      totalTeams: activeTeams.length
    };

    metrics.forEach(({ key, lowerIsBetter }) => {
      const metricMeasurements = recentMeasurements
        .filter(m => m.metric === key)
        .map(m => ({ value: parseFloat(m.value), userName: m.user.fullName }));

      if (metricMeasurements.length > 0) {
        const bestResult = lowerIsBetter 
          ? metricMeasurements.reduce((best, current) => current.value < best.value ? current : best)
          : metricMeasurements.reduce((best, current) => current.value > best.value ? current : best);
        
        bestMetrics[`best${key}Last30Days`] = bestResult;
      }
    });

    return bestMetrics;
  }

  // Enhanced Authentication Methods Implementation
  async findUserById(userId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || null;
  }

  async resetLoginAttempts(userId: string): Promise<void> {
    await db.update(users)
      .set({ loginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId));
  }

  async incrementLoginAttempts(userId: string, attempts: number): Promise<void> {
    await db.update(users)
      .set({ loginAttempts: attempts })
      .where(eq(users.id, userId));
  }

  async lockAccount(userId: string, lockUntil: Date): Promise<void> {
    await db.update(users)
      .set({ lockedUntil: lockUntil })
      .where(eq(users.id, userId));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  // Simplified implementations - these would need proper schema tables
  async createLoginSession(session: any): Promise<void> {
    // Would need loginSessions table implementation
    console.log('Creating login session:', session.userId);
  }

  async findLoginSession(token: string): Promise<any> {
    // Would need loginSessions table implementation
    return null;
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    // Would need loginSessions table implementation
    console.log('Updating session activity:', sessionId);
  }

  async revokeLoginSession(token: string): Promise<void> {
    // Would need loginSessions table implementation
    console.log('Revoking login session:', token);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    // Would need loginSessions table implementation
    console.log('Revoking all sessions for user:', userId);
  }

  async updateUserBackupCodes(userId: string, codes: string[]): Promise<void> {
    await db.update(users)
      .set({ backupCodes: codes })
      .where(eq(users.id, userId));
  }

  async createSecurityEvent(event: any): Promise<void> {
    // Would need securityEvents table implementation
    console.log('Creating security event:', event.eventType);
  }

  async getUserSecurityEvents(userId: string, limit: number): Promise<any[]> {
    // Would need securityEvents table implementation
    return [];
  }

  async getSecurityEventsByIP(ipAddress: string, timeWindow: number): Promise<any[]> {
    // Would need securityEvents table implementation
    return [];
  }

  async getRecentEmailChanges(userId: string, timeWindow: number): Promise<any[]> {
    // Would need emailChanges table implementation
    return [];
  }

  async getRecentPasswordResets(email: string, timeWindow: number): Promise<any[]> {
    // Would need passwordResets table implementation
    return [];
  }

  async createPasswordResetToken(token: any): Promise<void> {
    // Would need passwordResetTokens table implementation
    console.log('Creating password reset token for user:', token.userId);
  }

  async findPasswordResetToken(token: string): Promise<any> {
    // Would need passwordResetTokens table implementation
    return null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    // Would need passwordResetTokens table implementation
    console.log('Marking password reset token as used:', token);
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));
  }

  async updatePasswordChangedAt(userId: string): Promise<void> {
    await db.update(users)
      .set({ lastLoginAt: new Date() }) // Using lastLoginAt as placeholder
      .where(eq(users.id, userId));
  }

  async createEmailVerificationToken(token: any): Promise<void> {
    // Would need emailVerificationTokens table implementation
    console.log('Creating email verification token for user:', token.userId);
  }

  async findEmailVerificationToken(token: string): Promise<any> {
    // Would need emailVerificationTokens table implementation
    return null;
  }

  async markEmailAsVerified(userId: string, email: string): Promise<void> {
    await db.update(users)
      .set({ isEmailVerified: 'true' })
      .where(eq(users.id, userId));
  }

  async markEmailVerificationTokenUsed(token: string): Promise<void> {
    // Would need emailVerificationTokens table implementation
    console.log('Marking email verification token as used:', token);
  }


  async updateUserRole(userId: string, organizationId: string, role: string): Promise<boolean> {
    try {
      await db.update(userOrganizations)
        .set({ role })
        .where(and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        ));
      return true;
    } catch {
      return false;
    }
  }

  async getUsersByOrganization(organizationId: string): Promise<any[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      emails: users.emails,
      role: userOrganizations.role
    })
    .from(users)
    .leftJoin(userOrganizations, eq(users.id, userOrganizations.userId))
    .where(eq(userOrganizations.organizationId, organizationId));
    
    return result;
  }

  async getUserActivityStats(userId: string, organizationId: string): Promise<any> {
    // Would need proper activity tracking
    return {
      measurementsCreated: 0,
      teamsManaged: 0
    };
  }

}

export const storage = new DatabaseStorage();