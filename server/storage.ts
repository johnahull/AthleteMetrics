import { teams, players, measurements, users, type Team, type Player, type Measurement, type User, type InsertTeam, type InsertPlayer, type InsertMeasurement, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Teams
  getTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;

  // Players
  getPlayers(filters?: { teamId?: string; birthYearFrom?: number; birthYearTo?: number; search?: string }): Promise<(Player & { team: Team })[]>;
  getPlayer(id: string): Promise<(Player & { team: Team }) | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
  getPlayerByNameAndBirthYear(fullName: string, birthYear: number): Promise<Player | undefined>;

  // Measurements
  getMeasurements(filters?: { 
    playerId?: string; 
    teamIds?: string[]; 
    metric?: string; 
    dateFrom?: string; 
    dateTo?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }): Promise<(Measurement & { player: Player & { team: Team } })[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement): Promise<Measurement>;
  updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<void>;

  // Analytics
  getPlayerStats(playerId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }>;
  getTeamStats(): Promise<Array<{
    teamId: string;
    teamName: string;
    playerCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>>;
  getDashboardStats(): Promise<{
    totalPlayers: number;
    totalTeams: number;
    bestFly10Today?: { value: number; playerName: string };
    bestVerticalToday?: { value: number; playerName: string };
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Teams
  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams).orderBy(asc(teams.name));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  async updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team> {
    const [updatedTeam] = await db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Players
  async getPlayers(filters?: { teamId?: string; birthYearFrom?: number; birthYearTo?: number; search?: string }): Promise<(Player & { team: Team })[]> {
    let query = db.select().from(players).innerJoin(teams, eq(players.teamId, teams.id));
    
    const conditions = [];
    if (filters?.teamId) {
      conditions.push(eq(players.teamId, filters.teamId));
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

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const result = await query.orderBy(asc(players.lastName), asc(players.firstName));
    return result.map(({ players: player, teams: team }) => ({ ...player, team }));
  }

  async getPlayer(id: string): Promise<(Player & { team: Team }) | undefined> {
    const [result] = await db.select()
      .from(players)
      .innerJoin(teams, eq(players.teamId, teams.id))
      .where(eq(players.id, id));
    
    if (!result) return undefined;
    return { ...result.players, team: result.teams };
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const fullName = `${player.firstName} ${player.lastName}`;
    const [newPlayer] = await db.insert(players).values({
      ...player,
      fullName,
    }).returning();
    return newPlayer;
  }

  async updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player> {
    const updateData = { ...player };
    if (player.firstName || player.lastName) {
      // Fetch current player to build full name
      const current = await this.getPlayer(id);
      if (current) {
        updateData.fullName = `${player.firstName || current.firstName} ${player.lastName || current.lastName}`;
      }
    }
    
    const [updatedPlayer] = await db.update(players).set(updateData).where(eq(players.id, id)).returning();
    return updatedPlayer;
  }

  async deletePlayer(id: string): Promise<void> {
    await db.delete(players).where(eq(players.id, id));
  }

  async getPlayerByNameAndBirthYear(fullName: string, birthYear: number): Promise<Player | undefined> {
    const [player] = await db.select()
      .from(players)
      .where(and(eq(players.fullName, fullName), eq(players.birthYear, birthYear)));
    return player || undefined;
  }

  // Measurements
  async getMeasurements(filters?: { 
    playerId?: string; 
    teamIds?: string[]; 
    metric?: string; 
    dateFrom?: string; 
    dateTo?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }): Promise<(Measurement & { player: Player & { team: Team } })[]> {
    let query = db.select()
      .from(measurements)
      .innerJoin(players, eq(measurements.playerId, players.id))
      .innerJoin(teams, eq(players.teamId, teams.id));
    
    const conditions = [];
    if (filters?.playerId) {
      conditions.push(eq(measurements.playerId, filters.playerId));
    }
    if (filters?.teamIds && filters.teamIds.length > 0) {
      conditions.push(inArray(players.teamId, filters.teamIds));
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

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const result = await query.orderBy(desc(measurements.date), desc(measurements.createdAt));
    return result.map(({ measurements: measurement, players: player, teams: team }) => ({
      ...measurement,
      player: { ...player, team }
    }));
  }

  async getMeasurement(id: string): Promise<Measurement | undefined> {
    const [measurement] = await db.select().from(measurements).where(eq(measurements.id, id));
    return measurement || undefined;
  }

  async createMeasurement(measurement: InsertMeasurement): Promise<Measurement> {
    const units = measurement.metric === "FLY10_TIME" ? "s" : "in";
    const [newMeasurement] = await db.insert(measurements).values({
      ...measurement,
      units,
    }).returning();
    return newMeasurement;
  }

  async updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement> {
    const updateData = { ...measurement };
    if (measurement.metric) {
      updateData.units = measurement.metric === "FLY10_TIME" ? "s" : "in";
    }
    
    const [updatedMeasurement] = await db.update(measurements).set(updateData).where(eq(measurements.id, id)).returning();
    return updatedMeasurement;
  }

  async deleteMeasurement(id: string): Promise<void> {
    await db.delete(measurements).where(eq(measurements.id, id));
  }

  // Analytics
  async getPlayerStats(playerId: string): Promise<{
    bestFly10?: number;
    bestVertical?: number;
    measurementCount: number;
  }> {
    const playerMeasurements = await db.select()
      .from(measurements)
      .where(eq(measurements.playerId, playerId));

    const fly10Times = playerMeasurements
      .filter(m => m.metric === "FLY10_TIME")
      .map(m => parseFloat(m.value));
    
    const verticalJumps = playerMeasurements
      .filter(m => m.metric === "VERTICAL_JUMP")
      .map(m => parseFloat(m.value));

    return {
      bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
      bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
      measurementCount: playerMeasurements.length,
    };
  }

  async getTeamStats(): Promise<Array<{
    teamId: string;
    teamName: string;
    playerCount: number;
    bestFly10?: number;
    bestVertical?: number;
    latestTest?: string;
  }>> {
    const teamsData = await db.select().from(teams);
    const result = [];

    for (const team of teamsData) {
      const teamPlayers = await db.select().from(players).where(eq(players.teamId, team.id));
      const playerIds = teamPlayers.map(p => p.id);
      
      if (playerIds.length === 0) {
        result.push({
          teamId: team.id,
          teamName: team.name,
          playerCount: 0,
          bestFly10: undefined,
          bestVertical: undefined,
          latestTest: undefined,
        });
        continue;
      }

      const teamMeasurements = await db.select()
        .from(measurements)
        .where(inArray(measurements.playerId, playerIds))
        .orderBy(desc(measurements.date));

      const fly10Times = teamMeasurements
        .filter(m => m.metric === "FLY10_TIME")
        .map(m => parseFloat(m.value));
      
      const verticalJumps = teamMeasurements
        .filter(m => m.metric === "VERTICAL_JUMP")
        .map(m => parseFloat(m.value));

      result.push({
        teamId: team.id,
        teamName: team.name,
        playerCount: teamPlayers.length,
        bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
        bestVertical: verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
        latestTest: teamMeasurements.length > 0 ? teamMeasurements[0].date : undefined,
      });
    }

    return result;
  }

  async getDashboardStats(): Promise<{
    totalPlayers: number;
    totalTeams: number;
    bestFly10Today?: { value: number; playerName: string };
    bestVerticalToday?: { value: number; playerName: string };
  }> {
    const totalPlayers = await db.select({ count: sql<number>`count(*)` }).from(players);
    const totalTeams = await db.select({ count: sql<number>`count(*)` }).from(teams);

    const today = new Date().toISOString().split('T')[0];
    
    const todayMeasurements = await db.select()
      .from(measurements)
      .innerJoin(players, eq(measurements.playerId, players.id))
      .where(eq(measurements.date, today));

    const todayFly10 = todayMeasurements
      .filter(m => m.measurements.metric === "FLY10_TIME")
      .map(m => ({ value: parseFloat(m.measurements.value), playerName: m.players.fullName }));
    
    const todayVertical = todayMeasurements
      .filter(m => m.measurements.metric === "VERTICAL_JUMP")
      .map(m => ({ value: parseFloat(m.measurements.value), playerName: m.players.fullName }));

    const bestFly10Today = todayFly10.length > 0 
      ? todayFly10.reduce((best, current) => current.value < best.value ? current : best)
      : undefined;
    
    const bestVerticalToday = todayVertical.length > 0
      ? todayVertical.reduce((best, current) => current.value > best.value ? current : best)
      : undefined;

    return {
      totalPlayers: totalPlayers[0].count,
      totalTeams: totalTeams[0].count,
      bestFly10Today,
      bestVerticalToday,
    };
  }
}

export const storage = new DatabaseStorage();
