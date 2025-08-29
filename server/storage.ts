import { 
  organizations, teams, players, measurements, users, userOrganizations, userTeams, invitations, playerTeams,
  type Organization, type Team, type Player, type Measurement, type User, type UserOrganization, type UserTeam, type Invitation,
  type InsertOrganization, type InsertTeam, type InsertPlayer, type InsertMeasurement, type InsertUser, type InsertUserOrganization, type InsertUserTeam, type InsertInvitation,
  type PlayerTeam, type InsertPlayerTeam
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

export interface IStorage {
  // Authentication & Users
  authenticateUser(email: string, password: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  acceptInvitation(token: string, userInfo: { email: string; password: string; firstName: string; lastName: string }): Promise<User>;

  // Players (legacy athletes)
  getPlayers(filters?: { 
    teamId?: string; 
    organizationId?: string;
    birthYearFrom?: number; 
    birthYearTo?: number; 
    search?: string 
  }): Promise<(Player & { teams: (Team & { organization: Organization })[] })[]>;
  getPlayer(id: string): Promise<(Player & { teams: (Team & { organization: Organization })[] }) | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
  getPlayerByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<Player | undefined>;

  // Player Teams
  getPlayerTeams(playerId: string): Promise<(Team & { organization: Organization })[]>;
  addPlayerToTeam(playerId: string, teamId: string): Promise<PlayerTeam>;
  removePlayerFromTeam(playerId: string, teamId: string): Promise<void>;
  setPlayerTeams(playerId: string, teamIds: string[]): Promise<void>;

  // Measurements
  getMeasurements(filters?: { 
    playerId?: string; 
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
    player: Player & { teams: (Team & { organization: Organization })[] };
    submittedBy: User;
    verifiedBy?: User;
  })[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement): Promise<Measurement>;
  updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<void>;
  verifyMeasurement(id: string, verifiedBy: string): Promise<Measurement>;

  // Analytics
  getPlayerStats(playerId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }>;
  getTeamStats(organizationId?: string): Promise<Array<{
    teamId: string;
    teamName: string;
    organizationName: string;
    playerCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>>;
  getDashboardStats(organizationId?: string): Promise<{
    totalPlayers: number;
    totalTeams: number;
    bestFly10Today?: { value: number; playerName: string };
    bestVerticalToday?: { value: number; playerName: string };
  }>;
}

export class DatabaseStorage implements IStorage {
  // Authentication & Users
  async authenticateUser(email: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const [newUser] = await db.insert(users).values({
      ...user,
      password: hashedPassword
    }).returning();
    return newUser;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.lastName), asc(users.firstName));
  }

  async getSiteAdminUsers(): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.role, "site_admin"))
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
    const updateData: any = { ...user };
    if (user.password) {
      updateData.password = await bcrypt.hash(user.password, 10);
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
    await db.delete(users).where(eq(users.id, id));
  }

  async getUserOrganizations(userId: string): Promise<any[]> {
    const result: any = await db.select()
      .from(userOrganizations)
      .innerJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
      .where(eq(userOrganizations.userId, userId));
    
    return result.map(({ user_organizations, organizations }: any) => ({
      ...user_organizations,
      organization: organizations
    }));
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
    coaches: (UserOrganization & { user: User })[], 
    players: (Player & { teams: (Team & { organization: Organization })[] })[] 
  } | null> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!organization) return null;

    // Get users (coaches and other roles)
    const allUsers = await this.getOrganizationUsers(organizationId);
    const coaches = allUsers.filter(userOrg => userOrg.role === 'coach' || userOrg.role === 'org_admin');
    
    // Get players via organization filter
    const players = await this.getPlayers({ organizationId });
    
    return {
      ...organization,
      coaches,
      players
    };
  }

  async getOrganizationsWithUsers(): Promise<(Organization & { users: (UserOrganization & { user: User })[], invitations: Invitation[] })[]> {
    const organizations = await this.getOrganizations();
    
    const orgsWithUsers = await Promise.all(
      organizations.map(async (org) => {
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
    const result = await db.select()
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(desc(invitations.createdAt));
    
    return result;
  }

  async deleteInvitation(invitationId: string): Promise<void> {
    await db.delete(invitations)
      .where(eq(invitations.id, invitationId));
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
    const result = await db.select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, id));
    
    if (result.length === 0) return undefined;
    
    const { teams: team, organizations } = result[0];
    return { ...team, organization: organizations };
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
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

  async acceptInvitation(token: string, userInfo: { email: string; password: string; firstName: string; lastName: string }): Promise<User> {
    const invitation = await this.getInvitation(token);
    if (!invitation) throw new Error("Invalid or expired invitation");

    // Create user
    const user = await this.createUser({
      ...userInfo,
      role: invitation.role as "site_admin" | "org_admin" | "coach" | "athlete"
    });

    // Add user to organization
    await this.addUserToOrganization(user.id, invitation.organizationId, invitation.role);

    // Add user to teams if specified
    if (invitation.teamIds && invitation.teamIds.length > 0) {
      for (const teamId of invitation.teamIds) {
        await this.addUserToTeam(user.id, teamId);
      }
    }

    // If user is an athlete, also create a player record
    if (user.role === "athlete") {
      const player = await this.createPlayer({
        firstName: user.firstName,
        lastName: user.lastName,
        birthYear: new Date().getFullYear() - 18, // Default age, can be updated later
        school: "",
        sports: [],
        emails: [user.email]
      });
      
      // Add player to teams if specified
      if (invitation.teamIds && invitation.teamIds.length > 0) {
        for (const teamId of invitation.teamIds) {
          await this.addPlayerToTeam(player.id, teamId);
        }
      }
    }

    // Mark invitation as used
    await db.update(invitations).set({ isUsed: "true" }).where(eq(invitations.token, token));

    return user;
  }

  // Players (legacy athletes)
  async getPlayers(filters?: { 
    teamId?: string; 
    organizationId?: string;
    birthYearFrom?: number; 
    birthYearTo?: number; 
    search?: string 
  }): Promise<(Player & { teams: (Team & { organization: Organization })[] })[]> {
    let query = db.select().from(players);
    const conditions = [];

    if (filters?.birthYearFrom) {
      conditions.push(gte(players.birthYear, filters.birthYearFrom));
    }
    if (filters?.birthYearTo) {
      conditions.push(lte(players.birthYear, filters.birthYearTo));
    }
    if (filters?.search) {
      conditions.push(sql`${players.fullName} ILIKE ${'%' + filters.search + '%'}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query.orderBy(asc(players.lastName), asc(players.firstName));
    
    // Get teams for each player with organization info
    const playersWithTeams = await Promise.all(
      result.map(async (player) => {
        const playerTeams = await this.getPlayerTeams(player.id);
        return {
          ...player,
          teams: playerTeams
        };
      })
    );

    // Apply team/organization filters
    let filteredPlayers = playersWithTeams;
    if (filters?.teamId) {
      filteredPlayers = filteredPlayers.filter(player => 
        player.teams.some(team => team.id === filters.teamId)
      );
    }
    if (filters?.organizationId) {
      filteredPlayers = filteredPlayers.filter(player => 
        player.teams.some(team => team.organization.id === filters.organizationId)
      );
    }

    return filteredPlayers;
  }

  async getPlayer(id: string): Promise<(Player & { teams: (Team & { organization: Organization })[] }) | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    if (!player) return undefined;

    const playerTeams = await this.getPlayerTeams(player.id);
    return { ...player, teams: playerTeams };
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const fullName = `${player.firstName} ${player.lastName}`;
    const [newPlayer] = await db.insert(players).values({
      ...player,
      fullName
    }).returning();
    
    // Add to teams if specified
    if (player.teamIds && player.teamIds.length > 0) {
      await this.setPlayerTeams(newPlayer.id, player.teamIds);
    }
    
    return newPlayer;
  }

  async updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player> {
    const updateData: any = { ...player };
    if (player.firstName || player.lastName) {
      const existing = await this.getPlayer(id);
      if (existing) {
        const firstName = player.firstName || existing.firstName;
        const lastName = player.lastName || existing.lastName;
        updateData.fullName = `${firstName} ${lastName}`;
      }
    }
    
    const [updated] = await db.update(players).set(updateData).where(eq(players.id, id)).returning();
    
    // Update teams if specified
    if (player.teamIds !== undefined) {
      await this.setPlayerTeams(id, player.teamIds);
    }
    
    return updated;
  }

  async deletePlayer(id: string): Promise<void> {
    await db.delete(players).where(eq(players.id, id));
  }

  async getPlayerByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players)
      .where(and(
        eq(players.firstName, firstName),
        eq(players.lastName, lastName),
        eq(players.birthYear, birthYear)
      ));
    return player || undefined;
  }

  // Player Teams
  async getPlayerTeams(playerId: string): Promise<(Team & { organization: Organization })[]> {
    const result = await db.select()
      .from(playerTeams)
      .innerJoin(teams, eq(playerTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(playerTeams.playerId, playerId));

    return result.map(({ teams: team, organizations }) => ({
      ...team,
      organization: organizations
    }));
  }

  async addPlayerToTeam(playerId: string, teamId: string): Promise<PlayerTeam> {
    const [playerTeam] = await db.insert(playerTeams).values({
      playerId,
      teamId
    }).returning();
    return playerTeam;
  }

  async removePlayerFromTeam(playerId: string, teamId: string): Promise<void> {
    await db.delete(playerTeams)
      .where(and(
        eq(playerTeams.playerId, playerId),
        eq(playerTeams.teamId, teamId)
      ));
  }

  async setPlayerTeams(playerId: string, teamIds: string[]): Promise<void> {
    // Remove existing teams
    await db.delete(playerTeams).where(eq(playerTeams.playerId, playerId));
    
    // Add new teams
    if (teamIds.length > 0) {
      await db.insert(playerTeams).values(
        teamIds.map(teamId => ({ playerId, teamId }))
      );
    }
  }

  // Measurements
  async getMeasurements(filters?: { 
    playerId?: string; 
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
      .innerJoin(players, eq(measurements.playerId, players.id))
      .innerJoin(users, eq(measurements.submittedBy, users.id));
    
    const conditions = [];
    if (filters?.playerId) {
      conditions.push(eq(measurements.playerId, filters.playerId));
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
      conditions.push(gte(players.birthYear, filters.birthYearFrom));
    }
    if (filters?.birthYearTo) {
      conditions.push(lte(players.birthYear, filters.birthYearTo));
    }
    if (filters?.search) {
      conditions.push(sql`${players.fullName} ILIKE ${'%' + filters.search + '%'}`);
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
    
    // Get teams for each player and additional user info
    const measurementsWithDetails = await Promise.all(
      result.map(async ({ measurements: measurement, players: player, users: submittedBy }) => {
        const playerTeams = await this.getPlayerTeams(player.id);
        
        let verifiedBy;
        if (measurement.verifiedBy) {
          const [verifier] = await db.select().from(users).where(eq(users.id, measurement.verifiedBy));
          verifiedBy = verifier;
        }
        
        return {
          ...measurement,
          player: { ...player, teams: playerTeams },
          submittedBy,
          verifiedBy
        };
      })
    );

    // Apply team/organization filters
    let filteredMeasurements = measurementsWithDetails;
    
    if (filters?.teamIds && filters.teamIds.length > 0) {
      filteredMeasurements = filteredMeasurements.filter(measurement => 
        measurement.player.teams.some(team => filters.teamIds!.includes(team.id))
      );
    }

    if (filters?.organizationId) {
      filteredMeasurements = filteredMeasurements.filter(measurement => 
        measurement.player.teams.some(team => team.organization.id === filters.organizationId)
      );
    }

    // Filter by sport if specified
    if (filters?.sport && filters.sport !== "all") {
      filteredMeasurements = filteredMeasurements.filter(measurement => 
        measurement.player.sports?.includes(filters.sport!)
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
    const player = await this.getPlayer(measurement.playerId);
    if (!player) throw new Error("Player not found");

    const measurementDate = new Date(measurement.date);
    let age = measurementDate.getFullYear() - player.birthYear;
    
    // Use birthday for more precise age calculation if available
    if (player.birthday) {
      const birthday = new Date(player.birthday);
      const birthdayThisYear = new Date(measurementDate.getFullYear(), birthday.getMonth(), birthday.getDate());
      if (measurementDate < birthdayThisYear) {
        age -= 1;
      }
    }

    const units = measurement.metric === "FLY10_TIME" || measurement.metric === "T_TEST" || measurement.metric === "DASH_40YD" ? "s" : 
                  measurement.metric === "RSI" ? "ratio" : "in";

    // Get submitter info to determine if auto-verify
    const [submitter] = await db.select().from(users).where(eq(users.id, measurement.submittedBy));
    const isCoach = submitter?.role === "coach" || submitter?.role === "org_admin" || submitter?.role === "site_admin";
    
    const [newMeasurement] = await db.insert(measurements).values({
      playerId: measurement.playerId,
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
    if (measurement.playerId) updateData.playerId = measurement.playerId;
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
  async getPlayerStats(playerId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }> {
    const measurements = await this.getMeasurements({ playerId, includeUnverified: false });
    
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
    playerCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>> {
    const teams = await this.getTeams(organizationId);
    
    const teamStats = await Promise.all(
      teams.map(async (team) => {
        const players = await this.getPlayers({ teamId: team.id });
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
          playerCount: players.length,
          bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
          bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
          latestTest: latestMeasurement ? latestMeasurement.date : undefined
        };
      })
    );

    return teamStats;
  }

  async getDashboardStats(organizationId?: string): Promise<{
    totalPlayers: number;
    totalTeams: number;
    bestFly10Today?: { value: number; playerName: string };
    bestVerticalToday?: { value: number; playerName: string };
  }> {
    const players = await this.getPlayers({ organizationId });
    const teams = await this.getTeams(organizationId);
    
    const today = new Date().toISOString().split('T')[0];
    const todaysMeasurements = await this.getMeasurements({ 
      dateFrom: today, 
      dateTo: today,
      organizationId,
      includeUnverified: false
    });
    
    const todaysFly10 = todaysMeasurements
      .filter(m => m.metric === "FLY10_TIME")
      .map(m => ({ value: parseFloat(m.value), playerName: m.player.fullName }));
    
    const todaysVertical = todaysMeasurements
      .filter(m => m.metric === "VERTICAL_JUMP")
      .map(m => ({ value: parseFloat(m.value), playerName: m.player.fullName }));
    
    return {
      totalPlayers: players.length,
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