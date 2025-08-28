import { teams, players, measurements, users, playerTeams, type Team, type Player, type Measurement, type User, type InsertTeam, type InsertPlayer, type InsertMeasurement, type InsertUser, type PlayerTeam, type InsertPlayerTeam } from "@shared/schema";
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
  getPlayers(filters?: { teamId?: string; birthYearFrom?: number; birthYearTo?: number; search?: string }): Promise<(Player & { teams: Team[] })[]>;
  getPlayer(id: string): Promise<(Player & { teams: Team[] }) | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
  getPlayerByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<Player | undefined>;

  // Player Teams
  getPlayerTeams(playerId: string): Promise<Team[]>;
  addPlayerToTeam(playerId: string, teamId: string): Promise<PlayerTeam>;
  removePlayerFromTeam(playerId: string, teamId: string): Promise<void>;
  setPlayerTeams(playerId: string, teamIds: string[]): Promise<void>;

  // Measurements
  getMeasurements(filters?: { 
    playerId?: string; 
    teamIds?: string[]; 
    metric?: string; 
    dateFrom?: string; 
    dateTo?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }): Promise<(Measurement & { player: Player & { teams: Team[] } })[]>;
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
  async getPlayers(filters?: { teamId?: string; birthYearFrom?: number; birthYearTo?: number; search?: string }): Promise<(Player & { teams: Team[] })[]> {
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

    let query = db.select().from(players);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const playersResult = await query.orderBy(asc(players.lastName), asc(players.firstName));
    
    // Get teams for each player
    const playersWithTeams = await Promise.all(
      playersResult.map(async (player) => {
        const playerTeams = await this.getPlayerTeams(player.id);
        return { ...player, teams: playerTeams };
      })
    );

    // Filter by team if specified
    if (filters?.teamId) {
      return playersWithTeams.filter(player => 
        player.teams.some(team => team.id === filters.teamId)
      );
    }

    return playersWithTeams;
  }

  async getPlayer(id: string): Promise<(Player & { teams: Team[] }) | undefined> {
    const [player] = await db.select()
      .from(players)
      .where(eq(players.id, id));
    
    if (!player) return undefined;
    
    const playerTeams = await this.getPlayerTeams(id);
    return { ...player, teams: playerTeams };
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const { teamIds, ...playerData } = player;
    const fullName = `${player.firstName} ${player.lastName}`;
    
    const [newPlayer] = await db.insert(players).values({
      ...playerData,
      fullName,
    }).returning();

    // Add player to teams if any are specified
    if (teamIds && teamIds.length > 0) {
      await this.setPlayerTeams(newPlayer.id, teamIds);
    }

    return newPlayer;
  }

  async updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player> {
    const { teamIds, ...playerData } = player;
    const updateData: any = { ...playerData };
    
    if (player.firstName || player.lastName) {
      // Fetch current player to build full name
      const current = await this.getPlayer(id);
      if (current) {
        updateData.fullName = `${player.firstName || current.firstName} ${player.lastName || current.lastName}`;
      }
    }
    
    const [updatedPlayer] = await db.update(players).set(updateData).where(eq(players.id, id)).returning();
    
    // Update team associations if provided (empty array removes all teams)
    if (teamIds !== undefined) {
      await this.setPlayerTeams(id, teamIds);
    }
    
    return updatedPlayer;
  }

  async deletePlayer(id: string): Promise<void> {
    await db.delete(players).where(eq(players.id, id));
  }

  async getPlayerByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<Player | undefined> {
    const [player] = await db.select()
      .from(players)
      .where(and(eq(players.firstName, firstName), eq(players.lastName, lastName), eq(players.birthYear, birthYear)));
    return player || undefined;
  }

  // Player Teams
  async getPlayerTeams(playerId: string): Promise<Team[]> {
    const result = await db.select()
      .from(playerTeams)
      .innerJoin(teams, eq(playerTeams.teamId, teams.id))
      .where(eq(playerTeams.playerId, playerId));
    
    return result.map(({ teams: team }) => team);
  }

  async addPlayerToTeam(playerId: string, teamId: string): Promise<PlayerTeam> {
    const [newPlayerTeam] = await db.insert(playerTeams).values({
      playerId,
      teamId,
    }).returning();
    return newPlayerTeam;
  }

  async removePlayerFromTeam(playerId: string, teamId: string): Promise<void> {
    await db.delete(playerTeams)
      .where(and(eq(playerTeams.playerId, playerId), eq(playerTeams.teamId, teamId)));
  }

  async setPlayerTeams(playerId: string, teamIds: string[]): Promise<void> {
    // Remove all existing team associations
    await db.delete(playerTeams).where(eq(playerTeams.playerId, playerId));
    
    // Add new team associations
    if (teamIds.length > 0) {
      const values = teamIds.map(teamId => ({ playerId, teamId }));
      await db.insert(playerTeams).values(values);
    }
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
    search?: string;
    sport?: string;
  }): Promise<(Measurement & { player: Player & { teams: Team[] } })[]> {
    let query = db.select()
      .from(measurements)
      .innerJoin(players, eq(measurements.playerId, players.id));
    
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

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query.orderBy(desc(measurements.date), desc(measurements.createdAt));
    
    // Get teams for each player and filter by team if needed
    const measurementsWithTeams = await Promise.all(
      result.map(async ({ measurements: measurement, players: player }) => {
        const playerTeams = await this.getPlayerTeams(player.id);
        return {
          ...measurement,
          player: { ...player, teams: playerTeams }
        };
      })
    );

    // Filter by team if specified
    let filteredMeasurements = measurementsWithTeams;
    
    if (filters?.teamIds && filters.teamIds.length > 0) {
      filteredMeasurements = filteredMeasurements.filter(measurement => 
        measurement.player.teams.some(team => filters.teamIds!.includes(team.id))
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
    const units = measurement.metric === "VERTICAL_JUMP" ? "in" : measurement.metric === "RSI" ? "" : "s";
    
    // Get the player's data to calculate age at measurement date
    const [player] = await db.select({ 
      birthYear: players.birthYear, 
      birthday: players.birthday 
    }).from(players).where(eq(players.id, measurement.playerId));
    
    if (!player) {
      throw new Error("Player not found");
    }
    
    const measurementDate = new Date(measurement.date);
    
    // Use player's birthday if available for precise age calculation, otherwise use birth year
    let ageAtMeasurement;
    if (player.birthday) {
      const birthday = new Date(player.birthday);
      ageAtMeasurement = measurementDate.getFullYear() - birthday.getFullYear();
      
      // Adjust if birthday hasn't occurred yet this year for the measurement date
      const measurementMonth = measurementDate.getMonth();
      const measurementDay = measurementDate.getDate();
      const birthdayMonth = birthday.getMonth();
      const birthdayDay = birthday.getDate();
      
      if (measurementMonth < birthdayMonth || (measurementMonth === birthdayMonth && measurementDay < birthdayDay)) {
        ageAtMeasurement--;
      }
    } else {
      // Fall back to birth year calculation
      ageAtMeasurement = measurementDate.getFullYear() - player.birthYear;
    }
    
    const [newMeasurement] = await db.insert(measurements).values({
      ...measurement,
      age: ageAtMeasurement,
      value: measurement.value.toString(),
      flyInDistance: measurement.flyInDistance?.toString(),
      units,
    }).returning();
    return newMeasurement;
  }

  async updateMeasurement(id: string, measurement: Partial<InsertMeasurement>): Promise<Measurement> {
    const updateData: any = { ...measurement };
    if (measurement.metric) {
      updateData.units = measurement.metric === "VERTICAL_JUMP" ? "in" : measurement.metric === "RSI" ? "" : "s";
    }
    if (measurement.value !== undefined) {
      updateData.value = measurement.value.toString();
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
      // Get players for this team using the junction table
      const teamPlayerRecords = await db.select({
        playerId: playerTeams.playerId
      })
      .from(playerTeams)
      .where(eq(playerTeams.teamId, team.id));
      
      const playerIds = teamPlayerRecords.map(p => p.playerId);
      
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
        playerCount: playerIds.length,
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
