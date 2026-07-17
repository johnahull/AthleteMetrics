import {
  organizations, teams, users, measurements, userOrganizations, userTeams, invitations, auditLogs, emailVerificationTokens, accountLinkingTokens, passwordResetTokens, athleteProfiles,
  siteMetrics, organizationMetrics,
  siteBenchmarks, customBenchmarks, organizationBenchmarks,
  siteSettings, reports,
  wellnessTemplates, wellnessRequests, wellnessResponses,
  goals, goalStatusEnum,
  achievementDefinitions, userAchievements,
  membershipRequests,
  events, eventRegistrations, eventInvitations, eventMetrics,
  type Organization, type Team, type Measurement, type User, type UserOrganization, type UserTeam, type Invitation, type AuditLog, type EmailVerificationToken,
  type SiteMetric, type OrganizationMetric,
  type SiteBenchmark, type CustomBenchmark, type OrganizationBenchmark, type OrganizationBenchmarkWithDetails,
  type InsertOrganization, type InsertTeam, type InsertMeasurement, type InsertUser, type InsertUserOrganization, type InsertUserTeam, type InsertInvitation, type InsertAuditLog,
  type InsertSiteMetric, type InsertOrganizationMetric,
  type InsertSiteBenchmark, type InsertCustomBenchmark, type InsertOrganizationBenchmark,
  type UpdateSiteMetric, type UpdateOrganizationMetric,
  type UpdateSiteBenchmark, type UpdateCustomBenchmark, type UpdateOrganizationBenchmark,
  type SiteSettings, type Report,
  type WellnessTemplate, type WellnessRequest, type WellnessResponse,
  type Goal, type InsertGoal, type UpdateGoal,
  type AchievementDefinition, type UserAchievement,
  type MembershipRequest,
  type Event, type InsertEvent,
  type EventRegistration, type InsertEventRegistration, type RegistrationStatus,
  type EventInvitation, type InsertEventInvitation, type EventInvitationStatus,
  type EventMetric, type InsertEventMetric,
  insertUserSchema,
  type OrganizationType,
  type InsertOAuthUser,
  securityEvents,
  type SecurityEvent,
} from "@shared/schema";
import type { WellnessTrend } from "@shared/wellness-types";
import { db } from "./db";
import { wellnessRepository, type WellnessTrend as RepoWellnessTrend } from "./repositories/wellness-repository";
import { eq, desc, asc, and, gte, lte, gt, inArray, sql, arrayContains, or, isNull, isNotNull, exists, ne, SQL } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { hashToken } from "./lib/token-hash";
import { BCRYPT_SALT_ROUNDS } from "@shared/constants";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "./lib/pg-error";

/**
 * Helper function to create a WHERE condition that excludes soft-deleted users.
 * This prevents code duplication of `sql`${users.deletedAt} IS NULL`` across multiple methods.
 *
 * Usage: .where(and(eq(users.id, id), whereUserNotDeleted()))
 */
function whereUserNotDeleted(): SQL {
  return sql`${users.deletedAt} IS NULL`;
}

export interface IStorage {
  // Authentication & Users
  authenticateUser(username: string, password: string): Promise<User | null>;
  authenticateUserByEmail(email: string, password: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | undefined>;
  // executor?: pass a transaction handle to run within an existing db.transaction.
  getUsersByEmail(email: string, executor?: any): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | null>;
  getUserByAppleId(appleId: string): Promise<User | null>;
  createUser(user: InsertUser | InsertOAuthUser, executor?: any): Promise<User>;
  getUsers(): Promise<User[]>;
  getUser(id: string, executor?: any): Promise<User | undefined>;
  getUsersBatch(ids: string[]): Promise<Map<string, User>>;
  updateUser(id: string, user: Partial<InsertUser>, executor?: any): Promise<User>;
  deleteUser(id: string): Promise<void>;
  hardDeleteUser(id: string): Promise<void>;
  getUserOrganizations(userId: string): Promise<(UserOrganization & { organization: Organization })[]>;
  getUserTeams(userId: string): Promise<(UserTeam & { team: Team & { organization: Organization } })[]>;

  // Organizations
  getOrganizations(filters?: { includeInactive?: boolean; orgType?: OrganizationType | null }): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationsBatch(ids: string[]): Promise<Map<string, Organization>>;
  getOrganizationByName(name: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization>;
  deleteOrganization(id: string): Promise<void>;
  deactivateOrganization(id: string): Promise<void>;
  reactivateOrganization(id: string): Promise<void>;
  getOrganizationDependencyCounts(id: string): Promise<{ users: number; teams: number; measurements: number }>;
  getOrganizationUsers(organizationId: string): Promise<(UserOrganization & { user: User })[]>;
  getOrganizationProfile(organizationId: string): Promise<Organization & {
    coaches: Array<{ user: User, role: string }>,
    athletes: (User & { teams: (Team & { organization: Organization })[] })[],
    invitations: Invitation[]
  } | null>;
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
  addUserToOrganization(userId: string, organizationId: string, role: string, executor?: any): Promise<UserOrganization>;
  addUserToTeam(userId: string, teamId: string): Promise<UserTeam>;
  removeUserFromOrganization(userId: string, organizationId: string, validateLastAdmin?: boolean): Promise<void>;
  removeUserFromTeam(userId: string, teamId: string): Promise<void>;

  // Optimized queries
  getUsersWithTeamMembershipsByOrganization(organizationId: string, filters?: {
    search?: string;
    role?: string;
    excludeTeam?: string;
    season?: string;
  }): Promise<any[]>;

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
  getInvitationById(id: string): Promise<Invitation | undefined>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getPendingInvitationsByEmail(email: string): Promise<Invitation[]>;
  updateInvitation(id: string, invitation: Partial<Omit<Invitation, 'id' | 'createdAt'>>): Promise<Invitation>;
  acceptInvitation(token: string, userInfo: { email: string; username: string; password: string; firstName: string; lastName: string }): Promise<{ user: User }>;

  // Membership Requests
  createMembershipRequest(data: {
    userId: string;
    organizationId: string;
    discoveryMethod?: 'join_code' | 'directory' | 'direct_link';
  }): Promise<MembershipRequest>;
  getMembershipRequest(id: string): Promise<MembershipRequest | undefined>;
  getMembershipRequestsByOrganization(organizationId: string, filters?: { status?: string }): Promise<(MembershipRequest & { user: User })[]>;
  getMembershipRequestsByUser(userId: string): Promise<(MembershipRequest & { organization: Organization })[]>;
  approveMembershipRequest(id: string, processedBy: string): Promise<MembershipRequest>;
  rejectMembershipRequest(id: string, processedBy: string, reason?: string): Promise<MembershipRequest>;
  cancelMembershipRequest(id: string): Promise<void>;
  hasPendingMembershipRequest(userId: string, organizationId: string): Promise<boolean>;

  // Events
  getEvent(id: string): Promise<Event | null>;
  updateEvent(id: string, data: Partial<Event>): Promise<Event>;
  createEvent(data: InsertEvent): Promise<Event>;
  deleteEvent(id: string): Promise<void>;
  listEvents(filters: { organizationId?: string; status?: string; visibility?: string }): Promise<Event[]>;
  getEventByCode(code: string): Promise<Event | null>;

  // Event Registrations
  createEventRegistration(data: InsertEventRegistration): Promise<EventRegistration>;
  getEventRegistration(eventId: string, userId: string): Promise<EventRegistration | null>;
  getEventRegistrationById(id: string): Promise<EventRegistration | null>;
  updateEventRegistration(id: string, data: Partial<InsertEventRegistration>): Promise<EventRegistration>;
  deleteEventRegistration(id: string): Promise<void>;
  listEventRegistrations(eventId: string, filters?: { status?: RegistrationStatus; limit?: number; offset?: number }): Promise<EventRegistration[]>;
  countEventRegistrations(eventId: string, excludeStatuses?: RegistrationStatus[]): Promise<number>;
  getNextRegistrationNumber(eventId: string): Promise<number>;
  getNextWaitlistPosition(eventId: string): Promise<number>;
  getFirstWaitlistedRegistration(eventId: string): Promise<EventRegistration | null>;
  getUserEventRegistrations(userId: string): Promise<(EventRegistration & { event: Event })[]>;

  // Event Invitations
  createEventInvitation(data: InsertEventInvitation): Promise<EventInvitation>;
  getEventInvitation(id: string): Promise<EventInvitation | null>;
  getEventInvitationByToken(token: string): Promise<EventInvitation | null>;
  getEventInvitationByUserAndEvent(eventId: string, userId: string): Promise<EventInvitation | null>;
  getEventInvitationByEmailAndEvent(eventId: string, email: string): Promise<EventInvitation | null>;
  updateEventInvitation(id: string, data: Partial<InsertEventInvitation>): Promise<EventInvitation>;
  listEventInvitations(eventId: string, filters?: { status?: EventInvitationStatus; limit?: number; offset?: number }): Promise<EventInvitation[]>;
  getUserPendingInvitations(userId: string): Promise<Array<EventInvitation & { event: Event }>>;

  // Public Organization Directory
  getPublicOrganizations(filters?: { search?: string; orgType?: OrganizationType }): Promise<(Organization & { memberCount: number })[]>;
  getOrganizationByJoinCode(joinCode: string): Promise<Organization | undefined>;
  regenerateJoinCode(organizationId: string, customCode?: string): Promise<string>;
  updateOrganizationMembershipSettings(organizationId: string, settings: {
    isPublicDirectory?: boolean;
    allowMembershipRequests?: boolean;
    autoApproveRequests?: boolean;
  }): Promise<Organization>;

  // Unlinked Athletes (for account linking during membership approval)
  getUnlinkedAthletes(organizationId: string): Promise<User[]>;

  // Email Verification
  createEmailVerificationToken(userId: string, email: string): Promise<{ token: string; expiresAt: Date }>;
  verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; email?: string }>;
  getEmailVerificationToken(token: string): Promise<any>;

  // Account Linking (OAuth)
  createAccountLinkingToken(data: any): Promise<void>;
  getAccountLinkingToken(token: string): Promise<any>;
  markAccountLinkingTokenUsed(token: string): Promise<void>;
  incrementAccountLinkingTokenFailedAttempts(token: string): Promise<void>;

  // Athletes (users with athlete role)
  getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
    gender?: string;
    includeUnknownBirthYear?: boolean;
    page?: number;
    limit?: number;
  }): Promise<(User & { teams: (Team & { organization: Organization })[] })[]>;
  getRecentAthletes(filters: {
    organizationId: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    lastMeasurementDate: string;
    lastMeasurementType: string;
    teamName: string | null;
  }>>;
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
    includeUnknownBirthYear?: boolean;
  }): Promise<(Measurement & {
    user: User;
    submittedBy: User;
    verifiedBy?: User;
  })[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement, submittedBy: string, eventContext?: { eventId: string; eventNameSnapshot: string; eventDateSnapshot: string; }): Promise<Measurement>;
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
  revokeAllUserSessions(userId: string, options?: { throwOnError?: boolean }): Promise<number>;
  updateUserBackupCodes(userId: string, codes: string[]): Promise<void>;
  createSecurityEvent(event: Omit<SecurityEvent, 'id' | 'createdAt'>): Promise<void>;
  getUserSecurityEvents(userId: string, limit: number): Promise<any[]>;
  getSecurityEventsByIP(ipAddress: string, timeWindow: number): Promise<any[]>;
  getRecentEmailChanges(userId: string, timeWindow: number): Promise<any[]>;
  getRecentPasswordResets(email: string, timeWindow: number): Promise<any[]>;
  createPasswordResetToken(token: any): Promise<void>;
  findPasswordResetToken(token: string): Promise<any>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  updatePasswordChangedAt(userId: string): Promise<void>;
  createEmailVerificationToken(userId: string, email: string): Promise<{ token: string; expiresAt: Date }>;
  getEmailVerificationToken(token: string): Promise<any>;
  verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; email?: string }>;
  getUserRole(userId: string, organizationId: string): Promise<string | null>;
  getUserRoles(userId: string, organizationId?: string): Promise<string[]>;
  updateUserRole(userId: string, organizationId: string, role: string): Promise<boolean>;
  getUsersByOrganization(organizationId: string): Promise<any[]>;
  getUserActivityStats(userId: string, organizationId: string): Promise<any>;
  getOrganizationInvitations(organizationId: string): Promise<Invitation[]>;

  // Audit Logging
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: string; action?: string; limit?: number }): Promise<AuditLog[]>;

  // Site Metrics (Master Metric Catalog)
  getSiteMetrics(filters?: { includeInactive?: boolean; orgType?: OrganizationType }): Promise<SiteMetric[]>;
  getSiteMetric(code: string): Promise<SiteMetric | undefined>;
  createSiteMetric(metric: InsertSiteMetric, createdBy: string): Promise<SiteMetric>;
  updateSiteMetric(code: string, metric: Partial<UpdateSiteMetric>): Promise<SiteMetric>;
  toggleSiteMetricStatus(code: string, isActive: boolean): Promise<SiteMetric>;
  deleteSiteMetric(code: string): Promise<void>;

  // Organization Metrics (Org-level metric enablement)
  getOrganizationMetrics(organizationId: string, filters?: { enabledOnly?: boolean }): Promise<(OrganizationMetric & { siteMetric: SiteMetric })[]>;
  getOrganizationMetric(organizationId: string, metricCode: string): Promise<OrganizationMetric | undefined>;
  enableMetricForOrganization(organizationId: string, metricCode: string): Promise<OrganizationMetric>;
  disableMetricForOrganization(organizationId: string, metricCode: string): Promise<OrganizationMetric>;
  updateOrganizationMetric(organizationId: string, metricCode: string, data: Partial<UpdateOrganizationMetric>): Promise<OrganizationMetric>;
  bulkEnableMetricsForOrganization(organizationId: string, metricCodes: string[]): Promise<OrganizationMetric[]>;

  // Site Benchmarks (Master Benchmark Catalog)
  getSiteBenchmarks(filters?: { includeInactive?: boolean; orgType?: OrganizationType }): Promise<SiteBenchmark[]>;
  getSiteBenchmark(id: string): Promise<SiteBenchmark | undefined>;
  getSiteBenchmarksByIds(ids: string[]): Promise<SiteBenchmark[]>;
  getSiteBenchmarksByTierGroup(tierGroupId: string): Promise<SiteBenchmark[]>;
  createSiteBenchmark(benchmark: InsertSiteBenchmark, createdBy: string, tx?: any): Promise<SiteBenchmark>;
  updateSiteBenchmark(id: string, benchmark: Partial<UpdateSiteBenchmark>): Promise<SiteBenchmark>;
  toggleSiteBenchmarkStatus(id: string, isActive: boolean): Promise<SiteBenchmark>;
  deleteSiteBenchmark(id: string): Promise<void>;

  // Custom Benchmarks (Org-specific benchmarks)
  getCustomBenchmarksForOrg(organizationId: string, filters?: { includeInactive?: boolean }): Promise<CustomBenchmark[]>;
  getCustomBenchmark(id: string): Promise<CustomBenchmark | undefined>;
  getCustomBenchmarksByTierGroup(organizationId: string, tierGroupId: string): Promise<CustomBenchmark[]>;
  createCustomBenchmark(benchmark: InsertCustomBenchmark, createdBy: string): Promise<CustomBenchmark>;
  updateCustomBenchmark(organizationId: string, benchmarkId: string, benchmark: Partial<UpdateCustomBenchmark>): Promise<CustomBenchmark>;
  deleteCustomBenchmark(organizationId: string, benchmarkId: string): Promise<void>;

  // Tier Groups (for form dropdowns)
  getSiteTierGroups(metricCode?: string): Promise<Array<{ tierGroupId: string; metricCode: string; tierCount: number }>>;
  getCustomTierGroups(organizationId: string, metricCode?: string): Promise<Array<{ tierGroupId: string; metricCode: string; tierCount: number }>>;

  // Organization Benchmarks (Org-level benchmark enablement)
  getOrganizationBenchmarks(organizationId: string, filters?: { includeInactive?: boolean }): Promise<OrganizationBenchmark[]>;
  getOrganizationBenchmarksWithDetails(organizationId: string, filters?: { includeInactive?: boolean }): Promise<OrganizationBenchmarkWithDetails[]>;
  enableBenchmarkForOrg(organizationId: string, benchmarkId: string, benchmarkType: 'site' | 'custom'): Promise<OrganizationBenchmark>;
  disableBenchmarkForOrg(organizationId: string, benchmarkId: string, benchmarkType: 'site' | 'custom'): Promise<OrganizationBenchmark>;

  // Site Settings (Global Settings)
  getSiteSettings(): Promise<SiteSettings | undefined>;
  updateSiteSettings(settings: {
    aiModel?: string;
    wellnessModuleEnabled?: boolean;
    sprintFvEnabled?: boolean;
    updatedBy: string | null;
  }): Promise<SiteSettings>;

  // Reports
  getReport(id: string): Promise<Report | undefined>;
  updateReport(id: string, data: Partial<Report>): Promise<Report>;

  // Wellness Templates
  createWellnessTemplate(template: Partial<WellnessTemplate>): Promise<WellnessTemplate>;
  getWellnessTemplates(organizationId: string, filters?: { activeOnly?: boolean }): Promise<WellnessTemplate[]>;
  getWellnessTemplate(id: string): Promise<WellnessTemplate | undefined>;
  updateWellnessTemplate(id: string, template: Partial<WellnessTemplate>): Promise<WellnessTemplate>;
  deleteWellnessTemplate(id: string): Promise<void>;

  // System Wellness Templates (Admin)
  getSystemWellnessTemplates(): Promise<WellnessTemplate[]>;
  getSystemTemplateUsage(templateId: string): Promise<{ templateId: string; organizationCount: number; cloneCount: number }>;
  createSystemWellnessTemplate(template: Partial<WellnessTemplate>): Promise<WellnessTemplate>;
  updateSystemWellnessTemplate(id: string, template: Partial<WellnessTemplate>): Promise<WellnessTemplate>;
  deleteSystemWellnessTemplate(id: string): Promise<void>;

  // Wellness Requests
  createWellnessRequest(request: Partial<WellnessRequest>): Promise<WellnessRequest>;
  getWellnessRequests(organizationId: string, filters?: { status?: string }): Promise<WellnessRequest[]>;
  getWellnessRequest(id: string): Promise<WellnessRequest | undefined>;
  getWellnessRequestByToken(token: string): Promise<WellnessRequest | undefined>;
  updateWellnessRequest(id: string, request: Partial<WellnessRequest>): Promise<WellnessRequest>;
  deleteWellnessRequest(id: string): Promise<void>;

  // Wellness Responses
  createWellnessResponse(response: Partial<WellnessResponse>): Promise<WellnessResponse>;
  getWellnessResponse(id: string): Promise<WellnessResponse | undefined>;
  getWellnessResponsesByAthlete(userId: string, filters?: { startDate?: string; endDate?: string }): Promise<WellnessResponse[]>;
  getWellnessResponsesByOrganization(organizationId: string, filters?: { startDate?: string; endDate?: string }): Promise<WellnessResponse[]>;

  // Wellness Batch Operations (Performance Optimization)
  getTeamRostersBatch(organizationId: string): Promise<Array<{ teamId: string; userId: string; userFullName: string }>>;
  getWellnessTemplatesBatch(templateIds: string[]): Promise<WellnessTemplate[]>;

  // Wellness Analytics
  getTeamWellnessSummary(teamId: string, filters: { startDate: string; endDate: string }): Promise<any>;
  getAthleteWellnessSummary(userId: string, filters: { startDate: string; endDate: string }): Promise<any>;
  getWellnessTrends(organizationId: string, filters: { startDate: string; endDate: string; questionIds?: string[] }): Promise<WellnessTrend[]>;
  getRequestCompletionRate(organizationId: string, requestId: string): Promise<{ completed: number; total: number; percentage: number }>;

  // Goals
  getGoalsByUser(userId: string, filters?: { status?: string }): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal | undefined>;
  createGoal(goal: InsertGoal): Promise<Goal>;
  updateGoal(id: string, userId: string, goal: Partial<UpdateGoal> & { achievedAt?: Date }): Promise<Goal>;
  deleteGoal(id: string, userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Authentication & Users
  async authenticateUser(username: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.username, username),
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    );
    if (!user) return null;
    // OAuth users may not have a password
    if (!user.password) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async authenticateUserByEmail(email: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(
      and(
        arrayContains(users.emails, [email]),
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    );
    if (!user) return null;
    // OAuth users may not have a password
    if (!user.password) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Use PostgreSQL array search with ANY operator
    const [user] = await db.select().from(users).where(
      and(
        sql`${email} = ANY(${users.emails})`,
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    );
    return user || undefined;
  }

  async getUsersByEmail(email: string, executor: any = db): Promise<User[]> {
    // Use PostgreSQL array search with ANY operator to find ALL users with the email
    // Order by createdAt ASC for deterministic results (oldest user first)
    const matchingUsers = await executor.select().from(users).where(
      and(
        sql`${email} = ANY(${users.emails})`,
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    ).orderBy(asc(users.createdAt));
    return matchingUsers;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.username, username),
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    );
    return user || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.googleId, googleId),
          whereUserNotDeleted()
        )
      )
      .limit(1);
    return user || null;
  }

  async getUserByAppleId(appleId: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.appleId, appleId),
          whereUserNotDeleted()
        )
      )
      .limit(1);
    return user || null;
  }

  async createAccountLinkingToken(data: any): Promise<void> {
    // Store only the hash — the raw token lives solely in the emailed link.
    await db.insert(accountLinkingTokens).values({ ...data, token: hashToken(data.token) });
  }

  async getAccountLinkingToken(token: string): Promise<any | null> {
    const [linkingToken] = await db
      .select()
      .from(accountLinkingTokens)
      .where(eq(accountLinkingTokens.token, hashToken(token)))
      .limit(1);
    return linkingToken || null;
  }

  async markAccountLinkingTokenUsed(token: string): Promise<void> {
    await db
      .update(accountLinkingTokens)
      .set({ usedAt: new Date() })
      .where(eq(accountLinkingTokens.token, hashToken(token)));
  }

  async incrementAccountLinkingTokenFailedAttempts(token: string): Promise<void> {
    await db
      .update(accountLinkingTokens)
      .set({ failedAttempts: sql`${accountLinkingTokens.failedAttempts} + 1` })
      .where(eq(accountLinkingTokens.token, hashToken(token)));
  }

  async createUser(user: InsertUser | InsertOAuthUser, executor: any = db): Promise<User> {
    // Check if this is an OAuth user (has googleId or appleId but no password)
    const isOAuthUser = ((user as any).googleId || (user as any).appleId) && !user.password;

    // For OAuth users, password should be null
    // For invited users, password might be empty - use a placeholder
    let hashedPassword: string | null = null;
    if (!isOAuthUser) {
      const password = user.password || "INVITATION_PENDING";
      hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    }

    // Calculate fullName and birthYear from provided data
    const fullName = `${user.firstName} ${user.lastName}`;
    const birthYear = user.birthDate ? new Date(user.birthDate).getFullYear() : undefined;

    // Ensure emails array is properly set
    const emails = user.emails || [`${user.username || 'user'}@temp.local`];

    // List of actual database columns in users table (excluding id, createdAt, fullName, birthYear which are computed/defaults)
    const validUserColumns = [
      'username', 'emails', 'password', 'firstName', 'lastName',
      'birthDate', 'graduationYear', 'school', 'phoneNumbers', 'sports', 'positions',
      'height', 'weight', 'gender', 'mfaEnabled', 'mfaSecret', 'backupCodes',
      'lastLoginAt', 'loginAttempts', 'lockedUntil', 'isEmailVerified',
      'requiresPasswordChange', 'passwordChangedAt', 'isSiteAdmin', 'isActive',
      'googleId', 'appleId', 'oauthProvider', 'oauthEmail', 'oauthEmailVerified',
      'lastAuthMethod', 'accountLinkedAt',
      // Legal acceptance (role is stored on userOrganizations, not the users table)
      'legalAcceptedAt', 'legalAcceptedVersion',
      // COPPA / minor fields
      'isMinor', 'coppaStatus', 'parentEmail', 'parentConsentId',
    ];

    // Filter to only include valid database columns and non-undefined values
    const cleanedUser: any = {};
    Object.keys(user).forEach(key => {
      const value = (user as any)[key];
      if (value !== undefined && validUserColumns.includes(key)) {
        cleanedUser[key] = value;
      }
    });

    // Build the final insert object with required fields
    const insertData: any = {
      ...cleanedUser,
      emails, // Always override with sanitized emails
      password: hashedPassword, // Set hashed password or null for OAuth users
      fullName, // Always set computed fullName
      ...(birthYear !== undefined && { birthYear }) // Only include birthYear if not undefined
    };

    // Final safety filter to remove any undefined values
    const finalData: any = {};
    Object.keys(insertData).forEach(key => {
      if (insertData[key] !== undefined) {
        finalData[key] = insertData[key];
      }
    });

    const [newUser] = await executor.insert(users).values(finalData).returning();
    return newUser;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users)
      .where(whereUserNotDeleted()) // Exclude soft-deleted users
      .orderBy(asc(users.lastName), asc(users.firstName));
  }

  async getSiteAdminUsers(): Promise<User[]> {
    return await db.select().from(users)
      .where(and(
        eq(users.isSiteAdmin, true),
        whereUserNotDeleted() // Exclude soft-deleted users
      ))
      .orderBy(asc(users.lastName), asc(users.firstName));
  }

  async getInvitations(): Promise<Invitation[]> {
    return await db.select().from(invitations).orderBy(asc(invitations.createdAt));
  }

  async getInvitationsByOrganization(organizationId: string): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(asc(invitations.createdAt));
  }

  async getUser(id: string, executor: any = db): Promise<User | undefined> {
    const [user] = await executor.select().from(users).where(
      and(
        eq(users.id, id),
        whereUserNotDeleted() // Exclude soft-deleted users
      )
    );
    return user || undefined;
  }

  async getUsersBatch(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) {
      return new Map();
    }
    const users = await this.getUsersByIds(ids);
    return new Map(users.map(user => [user.id, user]));
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(users)
      .where(
        and(
          inArray(users.id, userIds),
          whereUserNotDeleted() // Exclude soft-deleted users
        )
      );
  }

  async updateUser(id: string, user: Partial<InsertUser>, executor: any = db): Promise<User> {
    // List of valid database columns that can be updated
    const validUserColumns = [
      'username', 'emails', 'password', 'firstName', 'lastName',
      'birthDate', 'graduationYear', 'school', 'phoneNumbers', 'sports', 'positions',
      'height', 'weight', 'gender', 'mfaEnabled', 'mfaSecret', 'backupCodes',
      'lastLoginAt', 'loginAttempts', 'lockedUntil', 'isEmailVerified',
      'requiresPasswordChange', 'passwordChangedAt', 'isSiteAdmin', 'isActive',
      'googleId', 'appleId', 'oauthProvider', 'oauthEmail', 'oauthEmailVerified',
      'lastAuthMethod', 'accountLinkedAt', 'showPeerComparisons', 'hasCompletedOnboarding',
      'legalAcceptedAt', 'legalAcceptedVersion',
      'isMinor', 'coppaStatus', 'parentEmail', 'parentConsentId', 'coppaConsentConfirmedAt',
    ];

    const updateData: any = {};

    // Only include defined fields that are actual database columns
    Object.keys(user).forEach(key => {
      const value = (user as any)[key];
      if (value !== undefined && validUserColumns.includes(key)) {
        updateData[key] = value;
      }
    });

    if (user.password) {
      updateData.password = await bcrypt.hash(user.password, BCRYPT_SALT_ROUNDS);
    }

    // Update computed fields if relevant data changed
    if (user.firstName || user.lastName) {
      const currentUser = await this.getUser(id, executor);
      if (currentUser) {
        const firstName = user.firstName || currentUser.firstName;
        const lastName = user.lastName || currentUser.lastName;
        updateData.fullName = `${firstName} ${lastName}`;
      }
    }

    if (user.birthDate) {
      updateData.birthYear = new Date(user.birthDate).getFullYear();
    }

    const [updatedUser] = await executor.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  /**
   * Soft deletes a user and handles associated data in an atomic transaction.
   *
   * SOFT DELETE: User record is marked as deleted but preserved
   * - Sets deletedAt timestamp on user record
   * - User account becomes inaccessible but data integrity is maintained
   * - User can be queried with whereUserNotDeleted() to exclude soft-deleted users
   *
   * SOFT DELETIONS (preserved with isActive=false):
   * - User-team relationships (soft deleted for audit trail - set isActive=false and leftAt timestamp)
   *
   * HARD DELETIONS (fully removed):
   * - Sessions (security requirement - explicit revocation)
   * - Email verification tokens (no longer needed)
   * - Athlete profiles (personal metadata)
   *
   * PRESERVED DATA (nullified foreign keys):
   * - User record (soft deleted with deletedAt timestamp)
   * - User-organization relationships (kept to preserve measurement organization context)
   * - Measurements (NEVER TOUCHED - immutable snapshots in time)
   *   - userId, submittedBy, verifiedBy remain as historical references
   * - Audit logs (compliance requirement - immutable audit trail, userId set to NULL)
   * - Invitations (preserve invitation history, foreign keys set to NULL)
   *   - invitedBy set to NULL (preserve invitation record)
   *   - playerId set to NULL (preserve invitation record)
   *   - acceptedBy already handled (set to NULL)
   *   - cancelledBy already handled (set to NULL)
   */
  async deleteUser(id: string): Promise<void> {
    // Use a transaction to ensure all deletions happen atomically
    await db.transaction(async (tx: any) => {
      // Set SERIALIZABLE isolation level to prevent race conditions
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

      // Revoke all active sessions for security (explicit revocation)
      // Note: Schema has onDelete: 'set null', but explicit deletion is more secure
      const { sessions } = await import('@shared/schema');
      await tx.delete(sessions).where(eq(sessions.userId, id));

      // Delete email verification tokens
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));

      // Delete athlete profiles
      await tx.delete(athleteProfiles).where(eq(athleteProfiles.userId, id));

      // SOFT DELETE user-team relationships instead of hard delete
      // This preserves historical team membership for audit trail
      await tx.update(userTeams)
        .set({
          isActive: false,
          leftAt: new Date()
        })
        .where(eq(userTeams.userId, id));

      // PRESERVE user-organization relationships (for measurement context)
      // This enables analytics queries to filter measurements by organization
      // even after user deletion:
      //   measurements → userId → userOrganizations → organizationId
      // Alternative path also works: measurements → teamId → teams.organizationId
      // We keep userOrganizations to support both query patterns
      // Note: userOrganizations are NOT deleted

      // ✅ MEASUREMENTS ARE NEVER TOUCHED - they are immutable snapshots in time
      // userId, submittedBy, and verifiedBy remain as historical references
      // even though the user no longer exists

      // PRESERVE INVITATION HISTORY: Set foreign keys to NULL instead of deleting
      // This maintains a complete audit trail of all invitation activity

      // Update invitations where this user accepted/cancelled them (keep invitation history)
      await tx.update(invitations)
        .set({ acceptedBy: sql`NULL` })
        .where(eq(invitations.acceptedBy, id));

      await tx.update(invitations)
        .set({ cancelledBy: sql`NULL` })
        .where(eq(invitations.cancelledBy, id));

      // Update invitations created BY this user (preserve invitation history)
      await tx.update(invitations)
        .set({ invitedBy: sql`NULL` })
        .where(eq(invitations.invitedBy, id));

      // Update invitations FOR this user (as athlete/playerId) (preserve invitation history)
      await tx.update(invitations)
        .set({ playerId: sql`NULL` })
        .where(eq(invitations.playerId, id));

      // Preserve audit logs for compliance (set userId to null)
      // Schema has onDelete: 'set null' - audit trail must be immutable
      await tx.update(auditLogs)
        .set({ userId: sql`NULL` })
        .where(eq(auditLogs.userId, id));

      // SOFT DELETE: Mark user as deleted and inactive instead of removing the record
      await tx.update(users)
        .set({
          deletedAt: new Date(),
          isActive: false
        })
        .where(eq(users.id, id));
    });
  }

  /**
   * GDPR COMPLIANCE: Permanently delete all user data from the database.
   *
   * This method is ONLY for GDPR "right to erasure" requests or legal compliance.
   * Use deleteUser() for normal account deletion (soft delete).
   *
   * WARNING: This is irreversible and will:
   * - Permanently delete user record
   * - Delete all user-organization relationships
   * - Delete all user-team relationships
   * - Delete all invitations sent by/for/accepted by/cancelled by this user
   * - Delete all athlete profiles
   * - Delete all email verification tokens
   * - Delete all sessions
   * - Set audit logs userId to NULL (preserve compliance trail)
   * - Set measurement foreign keys to NULL (preserve statistical data)
   *
   * IMPORTANT: This does NOT delete measurements themselves (they remain for statistical purposes)
   * but removes the ability to identify the user in those measurements.
   */
  async hardDeleteUser(id: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      // Set SERIALIZABLE isolation level to prevent race conditions
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

      const { sessions } = await import('@shared/schema');

      // Delete all sessions
      await tx.delete(sessions).where(eq(sessions.userId, id));

      // Delete email verification tokens
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));

      // Delete athlete profiles
      await tx.delete(athleteProfiles).where(eq(athleteProfiles.userId, id));

      // Delete user-team relationships
      await tx.delete(userTeams).where(eq(userTeams.userId, id));

      // Delete user-organization relationships
      await tx.delete(userOrganizations).where(eq(userOrganizations.userId, id));

      // Delete all invitations related to this user
      await tx.delete(invitations).where(eq(invitations.invitedBy, id));
      await tx.delete(invitations).where(eq(invitations.playerId, id));
      await tx.delete(invitations).where(eq(invitations.acceptedBy, id));
      await tx.delete(invitations).where(eq(invitations.cancelledBy, id));

      // Preserve audit logs for compliance (set userId to null)
      await tx.update(auditLogs)
        .set({ userId: sql`NULL` })
        .where(eq(auditLogs.userId, id));

      // HARD DELETE: Permanently remove user record
      await tx.delete(users).where(eq(users.id, id));
    });
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
    if (user?.isSiteAdmin === true) {
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
      orgRoles.forEach((r: {role: string | null, organizationId: string}) => {
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

    const mappedResult = result.map(({ user_teams, teams: team, organizations }: { user_teams: UserTeam, teams: Team, organizations: Organization }) => ({
      ...user_teams,
      team: { ...team, organization: organizations }
    }));

    return mappedResult;
  }

  // Organizations
  async getOrganizations(filters?: { includeInactive?: boolean; orgType?: OrganizationType | null }): Promise<Organization[]> {
    const conditions = [];

    // By default, exclude inactive organizations
    if (!filters?.includeInactive) {
      conditions.push(eq(organizations.isActive, true));
    }

    // Filter by organization type if provided
    if (filters?.orgType !== undefined) {
      if (filters.orgType === null) {
        conditions.push(isNull(organizations.orgType));
      } else {
        conditions.push(eq(organizations.orgType, filters.orgType));
      }
    }

    const results = await db
      .select()
      .from(organizations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(organizations.name));

    return results;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || undefined;
  }

  async getOrganizationsBatch(ids: string[]): Promise<Map<string, Organization>> {
    if (ids.length === 0) {
      return new Map();
    }
    const orgs = await db
      .select()
      .from(organizations)
      .where(inArray(organizations.id, ids));
    return new Map(orgs.map(org => [org.id, org]));
  }

  async getOrganizationByName(name: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.name, name));
    return org || undefined;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    // Use transaction to ensure organization and metrics are created atomically
    return await db.transaction(async (tx: any) => {
      // Create the organization
      const [newOrg] = await tx.insert(organizations).values(organization).returning();

      // Get all active site metrics that are available to this organization's type
      const availableMetrics = await this.getSiteMetrics({
        includeInactive: false,
        orgType: newOrg.orgType
      });

      // Create organization_metrics entries for each available metric
      if (availableMetrics.length > 0) {
        const organizationMetricsEntries = availableMetrics.map(metric => ({
          organizationId: newOrg.id,
          metricCode: metric.code,
          isEnabled: true,
          createdAt: new Date(),
        }));

        await tx.insert(organizationMetrics).values(organizationMetricsEntries);
      }

      return newOrg;
    });
  }

  async updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization> {
    const [updated] = await db.update(organizations).set(organization).where(eq(organizations.id, id)).returning();
    return updated;
  }

  async deleteOrganization(id: string): Promise<void> {
    // Use transaction with row-level locking to prevent race conditions
    await db.transaction(async (tx: any) => {
      // 1. Lock the organization row to prevent concurrent modifications
      const org = await tx.select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .for('update'); // Row-level lock

      if (!org || org.length === 0) {
        throw new Error("Organization not found");
      }

      // 2. Re-check dependencies inside transaction (TOCTOU protection)
      const usersResult = await tx.select({ count: sql<number>`count(*)` })
        .from(userOrganizations)
        .where(eq(userOrganizations.organizationId, id));
      const usersCount = Number(usersResult[0]?.count || 0);

      const teamsResult = await tx.select({ count: sql<number>`count(*)` })
        .from(teams)
        .where(eq(teams.organizationId, id));
      const teamsCount = Number(teamsResult[0]?.count || 0);

      const measurementsResult = await tx.select({ count: sql<number>`count(*)` })
        .from(measurements)
        .innerJoin(userOrganizations, eq(measurements.userId, userOrganizations.userId))
        .where(eq(userOrganizations.organizationId, id));
      const measurementsCount = Number(measurementsResult[0]?.count || 0);

      if (usersCount > 0 || teamsCount > 0 || measurementsCount > 0) {
        const errors = [];
        if (usersCount > 0) errors.push(`${usersCount} users`);
        if (teamsCount > 0) errors.push(`${teamsCount} teams`);
        if (measurementsCount > 0) errors.push(`${measurementsCount} measurements`);
        throw new Error(`Cannot delete organization with active dependencies: ${errors.join(', ')}`);
      }

      // 3. Delete organization atomically
      await tx.delete(organizations).where(eq(organizations.id, id));
    });
  }

  async deactivateOrganization(id: string): Promise<void> {
    await db.update(organizations)
      .set({ isActive: false, deletedAt: new Date() })
      .where(eq(organizations.id, id));
  }

  async reactivateOrganization(id: string): Promise<void> {
    await db.update(organizations)
      .set({ isActive: true, deletedAt: null })
      .where(eq(organizations.id, id));
  }

  async getOrganizationDependencyCounts(id: string): Promise<{ users: number; teams: number; measurements: number }> {
    // Execute all counts in a single transaction to prevent race conditions
    // This ensures atomic snapshot of dependency counts
    return await db.transaction(async (tx) => {
      // Count users in organization
      const usersResult = await tx.select({ count: sql<number>`count(*)` })
        .from(userOrganizations)
        .where(eq(userOrganizations.organizationId, id));
      const usersCount = Number(usersResult[0]?.count || 0);

      // Count teams in organization
      const teamsResult = await tx.select({ count: sql<number>`count(*)` })
        .from(teams)
        .where(eq(teams.organizationId, id));
      const teamsCount = Number(teamsResult[0]?.count || 0);

      // Count measurements for users in this organization
      const measurementsResult = await tx.select({ count: sql<number>`count(*)` })
        .from(measurements)
        .innerJoin(userOrganizations, eq(measurements.userId, userOrganizations.userId))
        .where(eq(userOrganizations.organizationId, id));
      const measurementsCount = Number(measurementsResult[0]?.count || 0);

      return {
        users: usersCount,
        teams: teamsCount,
        measurements: measurementsCount,
      };
    });
  }

  async getOrganizationUsers(organizationId: string): Promise<(UserOrganization & { user: User })[]> {
    const result = await db.select()
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(eq(userOrganizations.organizationId, organizationId));

    return result.map(({ user_organizations, users: user }: { user_organizations: UserOrganization, users: User }) => ({
      ...user_organizations,
      user
    }));
  }

  async getOrganizationProfile(organizationId: string): Promise<Organization & {
    coaches: Array<{ user: User, role: string }>,
    athletes: (User & { teams: (Team & { organization: Organization })[] })[],
    invitations: Invitation[]
  } | null> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!organization) return null;

    // Get users with their single role (each user has only one role per organization)
    const allUsers = await this.getOrganizationUsers(organizationId);

    // Map users to include their single role
    const userRoleMap = new Map<string, { user: User, role: string }>();

    for (const userOrg of allUsers) {
      const userId = userOrg.user.id;
      // Each user should only have one role per organization
      if (!userRoleMap.has(userId)) {
        userRoleMap.set(userId, {
          user: userOrg.user,
          role: userOrg.role
        });
      }
    }

    // Filter coaches (users with coach or org_admin roles, excluding pure athletes)
    const coaches = Array.from(userRoleMap.values()).filter(
      userWithRole => userWithRole.role === 'coach' || userWithRole.role === 'org_admin'
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
          eq(invitations.isUsed, false),
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

    const orgIds = userOrgs.map((uo: UserOrganization) => uo.organizationId);

    if (orgIds.length === 0) {
      return [];
    }

    // Get organizations data
    const orgsData = await db.select()
      .from(organizations)
      .where(inArray(organizations.id, orgIds));

    const orgsWithUsers = await Promise.all(
      orgsData.map(async (org: Organization) => {
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
      const result = await db.select()
        .from(invitations)
        .where(eq(invitations.organizationId, organizationId))
        .orderBy(desc(invitations.createdAt));

      return result;
    } catch (error) {
      console.error("Error in getOrganizationInvitations:", error);
      return [];
    }
  }

  async updateInvitation(id: string, invitation: Partial<Omit<Invitation, 'id' | 'createdAt'>>): Promise<Invitation> {
    const [updated] = await db.update(invitations).set(invitation as any).where(eq(invitations.id, id)).returning();
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
    conditions.push(ne(teams.isArchived, true));
    
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
    // Defense in depth - ALWAYS strip organizationId at storage layer
    const { organizationId, ...safeTeamData } = team;

    if (Object.keys(safeTeamData).length === 0) {
      throw new Error("No valid fields to update");
    }

    // Trim whitespace from name if provided
    const normalizedData = {
      ...safeTeamData,
      ...(safeTeamData.name && { name: safeTeamData.name.trim() })
    };

    const [updated] = await db.update(teams)
      .set(normalizedData)
      .where(eq(teams.id, id))
      .returning();

    if (!updated) throw new Error("Team not found");
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    // Delete all team memberships first
    await db.delete(userTeams).where(eq(userTeams.teamId, id));
    
    // Now delete the team
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
    return await db.transaction(async (tx: any) => {
      const [archived] = await tx.update(teams)
        .set({
          isArchived: true,
          archivedAt: archiveDate,
          season: season
        })
        .where(eq(teams.id, id))
        .returning();

      // Mark all current team memberships as inactive
      await tx.update(userTeams)
        .set({
          isActive: false,
          leftAt: archiveDate,
          season: season
        })
        .where(and(
          eq(userTeams.teamId, id),
          eq(userTeams.isActive, true)
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
        isArchived: false,
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
        isActive: membershipData.leftAt ? false : true
      })
      .where(and(
        eq(userTeams.teamId, teamId),
        eq(userTeams.userId, userId)
      ))
      .returning();
    
    return updated;
  }

  // User Management
  async addUserToOrganization(userId: string, organizationId: string, role: string, executor: any = db): Promise<UserOrganization> {
    // Validate that role is organization-specific only
    if (!['org_admin', 'coach', 'athlete'].includes(role)) {
      throw new Error(`Invalid organization role: ${role}. Must be org_admin, coach, or athlete`);
    }

    // First remove any existing roles for this user in this organization
    await executor.delete(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ));

    // Then insert the new single role
    const [userOrg] = await executor.insert(userOrganizations).values({
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
          eq(userTeams.isActive, true)
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
          eq(userTeams.isActive, false)
        ));

      if (existingInactiveAssignment.length > 0) {
        // Reactivate the membership
        const [reactivated] = await db.update(userTeams)
          .set({
            isActive: true,
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
        isActive: true
      }).returning();

      console.log('User added to team successfully');
      return userTeam;
    } catch (error) {
      console.error(`Error adding user ${userId} to team ${teamId}:`, error);
      throw error;
    }
  }

  async removeUserFromOrganization(userId: string, organizationId: string, validateLastAdmin: boolean = false): Promise<void> {
    if (!validateLastAdmin) {
      // Simple deletion without admin validation
      await db.delete(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        ));
      return;
    }

    // Transaction with admin count validation to prevent race conditions (TOCTOU protection)
    await db.transaction(async (tx: any) => {
      // 1. Lock organization row to prevent concurrent admin removals
      await tx.select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');

      // 2. Get current admin count atomically within transaction
      const orgUsers = await tx.select()
        .from(userOrganizations)
        .where(eq(userOrganizations.organizationId, organizationId));

      const adminCount = orgUsers.filter((u: any) => u.role === 'org_admin').length;

      if (adminCount <= 1) {
        throw new Error("Cannot remove the last organization administrator");
      }

      // 3. Delete user from organization atomically
      await tx.delete(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        ));
    });
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
        isActive: false,
        leftAt: new Date()
      })
      .where(and(
        eq(userTeams.userId, userId),
        eq(userTeams.teamId, teamId),
        eq(userTeams.isActive, true)
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
    birthDate?: string | null;
    parentEmail?: string | null;
    expiresAt: Date;
  }): Promise<Invitation> {
    const token = crypto.randomUUID();
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
      birthDate: data.birthDate,
      parentEmail: data.parentEmail,
      token: hashToken(token), // Store only the hash; the raw token is emailed
      expiresAt,
    }).returning();
    // Return the RAW token so the caller can build the invitation link.
    return { ...invitation, token };
  }



  async getInvitation(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations)
      .where(and(
        eq(invitations.token, hashToken(token)),
        eq(invitations.isUsed, false),
        gte(invitations.expiresAt, new Date())
      ));
    return invitation || undefined;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations)
      .where(eq(invitations.token, hashToken(token)));
    return invitation || undefined;
  }

  async getPendingInvitationsByEmail(email: string): Promise<Invitation[]> {
    // Case-insensitive match: OAuth providers often lowercase emails while
    // admins may enter invitations with mixed case.
    return await db.select().from(invitations)
      .where(and(
        sql`LOWER(${invitations.email}) = LOWER(${email})`,
        eq(invitations.isUsed, false),
        isNull(invitations.cancelledAt),
        gte(invitations.expiresAt, new Date()),
      ));
  }

  async acceptInvitation(
    token: string,
    userInfo: {
      email: string;
      username: string;
      password: string;
      firstName: string;
      lastName: string;
      legalAcceptedAt?: string;
      legalAcceptedVersion?: string;
      // COPPA classification computed by the route (age checks live there).
      // Persisted fail-closed inside this transaction so a crash after commit
      // but before VPC initiation still leaves under-13 users login-blocked.
      coppa?: {
        birthDate: string;
        isMinor: boolean;
        under13: boolean;
        parentEmail?: string;
      };
    },
    auditContext?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ user: User; invitation: Invitation }> {
    // Use database transaction with row-level locking to prevent race conditions
    const { user, invitation } = await db.transaction(async (tx: any) => {
      // Lock the invitation row with SELECT FOR UPDATE
      // This prevents concurrent acceptance attempts
      const [invitation] = await tx.select()
        .from(invitations)
        .where(and(
          eq(invitations.token, hashToken(token)),
          eq(invitations.isUsed, false),
          gte(invitations.expiresAt, new Date())
        ))
        .for('update');

      if (!invitation) {
        throw new Error("Invalid or expired invitation");
      }

      let user;

      // Prepare legal acceptance data
      const { getLegalAcceptanceTimestamp, AUDIT_ACTION_LEGAL_ACCEPTED } = await import('@shared/legal-acceptance');
      const legalData = userInfo.legalAcceptedAt ? {
        legalAcceptedAt: new Date(userInfo.legalAcceptedAt),
        legalAcceptedVersion: userInfo.legalAcceptedVersion || getLegalAcceptanceTimestamp()
      } : {};

      // Check if invitation is linked to an existing athlete (playerId)
      if (invitation.playerId) {
        console.log("Invitation linked to existing athlete:", invitation.playerId);

        // Get the existing athlete/user
        const existingUser = await this.getUser(invitation.playerId, tx);

        if (!existingUser) {
          throw new Error("Linked athlete not found");
        }

        // Update the existing user with credentials
        // Note: updateUser will hash the password, so pass the plain password
        const coppaUpdate: Partial<InsertUser> = {};
        if (userInfo.coppa) {
          if (!existingUser.birthDate) {
            coppaUpdate.birthDate = userInfo.coppa.birthDate;
          }
          coppaUpdate.isMinor = userInfo.coppa.isMinor;
          if (userInfo.coppa.isMinor && userInfo.coppa.parentEmail && !existingUser.parentEmail) {
            coppaUpdate.parentEmail = userInfo.coppa.parentEmail;
          }
          // Never downgrade a confirmed consent
          if (userInfo.coppa.under13 && existingUser.coppaStatus !== 'consented') {
            coppaUpdate.coppaStatus = 'pending_consent';
          }
        }
        user = await this.updateUser(invitation.playerId, {
          username: userInfo.username,
          password: userInfo.password,
          isActive: true,
          ...coppaUpdate,
          ...legalData
        }, tx);

        console.log("Updated existing athlete with credentials:", user.id);
      } else {
        // Check if a user with this email already exists
        const existingUsers = await this.getUsersByEmail(invitation.email, tx);

        if (existingUsers.length > 0) {
          // Warn if multiple users found (should be rare after migration)
          if (existingUsers.length > 1) {
            console.warn("[Invitation] Multiple users found with email, using oldest:", {
              email: invitation.email,
              userIds: existingUsers.map(u => u.id),
              userCount: existingUsers.length
            });
          }

          const existingUser = existingUsers[0]; // Use oldest user (deterministic ordering)

          // User exists - add them to new org instead of creating duplicate
          console.log("[Invitation] Found existing user with email:", {
            userId: existingUser.id,
            email: invitation.email,
            invitationOrg: invitation.organizationId
          });

          // Log if provided username differs from existing (username will be preserved)
          if (existingUser.username !== userInfo.username) {
            console.log("[Invitation] Ignoring provided username for existing user:", {
              providedUsername: userInfo.username,
              existingUsername: existingUser.username
            });
          }

          // Build update data: legal acceptance + optional password for OAuth-only users
          const updateData: any = { ...legalData };

          // Update password if user doesn't have one (OAuth-only user)
          if (!existingUser.password) {
            updateData.password = userInfo.password;
            updateData.isActive = true;
            console.log("[Invitation] Updating OAuth-only user with password");
          }

          // COPPA: non-destructive — only classify users who have no birthDate
          // on record; never overwrite an existing birthDate or a confirmed
          // consent, and only fill parentEmail when currently empty.
          if (userInfo.coppa && !existingUser.birthDate) {
            updateData.birthDate = userInfo.coppa.birthDate;
            updateData.isMinor = userInfo.coppa.isMinor;
            if (userInfo.coppa.isMinor && userInfo.coppa.parentEmail && !existingUser.parentEmail) {
              updateData.parentEmail = userInfo.coppa.parentEmail;
            }
            if (userInfo.coppa.under13 && existingUser.coppaStatus !== 'consented') {
              updateData.coppaStatus = 'pending_consent';
            }
          }

          // Only update if there's something to update
          if (Object.keys(updateData).length > 0) {
            user = await this.updateUser(existingUser.id, updateData, tx);
            console.log("[Invitation] Updated existing user for invitation:", user.id);
          } else {
            user = existingUser;
            console.log("[Invitation] Using existing user without updates:", user.id);
          }
        } else {
          // No existing user - create new one (existing code path)
          const createUserData = {
            username: userInfo.username,
            emails: [invitation.email],
            password: userInfo.password,
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            role: invitation.role as "site_admin" | "org_admin" | "coach" | "athlete" | "parent",
            // COPPA: mirror registration (registration-routes.ts) — under-13 is
            // created pending_consent so a failed VPC initiation still leaves
            // the account login-blocked (fail-closed).
            ...(userInfo.coppa ? {
              birthDate: userInfo.coppa.birthDate,
              isMinor: userInfo.coppa.isMinor,
              parentEmail: userInfo.coppa.isMinor ? userInfo.coppa.parentEmail : undefined,
              coppaStatus: (userInfo.coppa.under13 ? 'pending_consent' : 'not_applicable') as 'pending_consent' | 'not_applicable',
            } : {}),
            ...legalData
          };

          console.log("Creating new user with data:", { username: createUserData.username, email: createUserData.emails[0], firstName: createUserData.firstName });

          // Validate user data against schema before creating user
          try {
            insertUserSchema.parse(createUserData);
          } catch (error) {
            console.error("User data validation failed:", error);
            throw error;
          }

          try {
            user = await this.createUser(createUserData, tx);
            console.log("User created successfully:", user.id);
          } catch (error) {
            console.error("Error creating user:", error);
            throw error;
          }
        }
      }

      // Add user to organization with the invitation role
      // Note: addUserToOrganization will automatically replace any existing role for this user in this org
      // Parent role is a user-level role, not an org-level role. Map parent → athlete for org membership.
      // Parents access child data through parentAthleteLinks, not org roles.
      const orgRole = invitation.role === 'parent' ? 'athlete' : invitation.role;
      console.log("[Invitation] Adding user to organization:", {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: orgRole
      });
      await this.addUserToOrganization(user.id, invitation.organizationId, orgRole, tx);

      // NOTE: team membership is added AFTER the transaction commits (see below).
      // It is best-effort (errors are swallowed) and must not run inside the
      // transaction: a swallowed failure would poison the transaction, and a
      // separate-connection insert cannot see the not-yet-committed user.

      // Mark the invitation as used and accepted (using transaction connection)
      await tx.update(invitations)
        .set({
          isUsed: true,
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: user.id
        })
        .where(eq(invitations.token, hashToken(token)));

      // Create audit logs as part of the transaction
      // All audit logs must be inside transaction for atomicity and consistency

      // 1. Legal acceptance audit log (if provided)
      if (userInfo.legalAcceptedAt) {
        await tx.insert(auditLogs).values({
          userId: user.id,
          action: AUDIT_ACTION_LEGAL_ACCEPTED,
          resourceType: 'user',
          resourceId: user.id,
          details: JSON.stringify({
            version: userInfo.legalAcceptedVersion || getLegalAcceptanceTimestamp(),
            acceptedAt: userInfo.legalAcceptedAt,
            method: 'invitation'
          }),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        });
      }

      // 2. Invitation accepted audit log
      // Note: This is separate from legal acceptance - tracks the invitation being used
      await tx.insert(auditLogs).values({
        userId: user.id,
        action: 'invitation_accepted',
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId
        }),
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
      });

      return { user, invitation };
    });

    // Best-effort team membership, AFTER the transaction has committed so the
    // user row is visible on a fresh connection and a failure here cannot roll
    // back the accepted invitation (it is intentionally non-critical).
    if (invitation.teamIds && invitation.teamIds.length > 0) {
      // Sequential (not Promise.all): addUserToTeam is a non-atomic
      // check-then-insert, so concurrent calls for a duplicated team id would
      // race and create duplicate roster rows. De-duplicate and process one at a
      // time. Best-effort: the invitation is already accepted, so a genuine
      // failure (e.g. the team was deleted between invite and acceptance) is
      // logged at error level for remediation but must not block the user.
      for (const teamId of [...new Set(invitation.teamIds)] as string[]) {
        try {
          await this.addUserToTeam(user.id, teamId);
        } catch (error) {
          console.error(
            `[Invitation] Failed to add user ${user.id} to team ${teamId} after acceptance; ` +
            `roster membership was NOT created and may need manual remediation:`,
            error
          );
        }
      }
    }

    return { user, invitation };
  }

  // Email Verification
  async createEmailVerificationToken(userId: string, email: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(emailVerificationTokens).values({
      userId,
      email,
      token: hashToken(token), // Store only the hash; the raw token is emailed
      expiresAt
    });

    // Return the RAW token so the caller can build the verification link.
    return { token, expiresAt };
  }

  async verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; email?: string }> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx: any) => {
      // Lock the row for update to prevent concurrent verification attempts
      const [verificationToken] = await tx.select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.token, hashToken(token)),
          eq(emailVerificationTokens.isUsed, false),
          gte(emailVerificationTokens.expiresAt, new Date())
        ))
        .for('update'); // Row-level lock

      if (!verificationToken) {
        return { success: false };
      }

      // Mark token as used (within same transaction)
      await tx.update(emailVerificationTokens)
        .set({ isUsed: true })
        .where(eq(emailVerificationTokens.token, hashToken(token)));

      // Mark user's email as verified (within same transaction)
      await tx.update(users)
        .set({ isEmailVerified: true })
        .where(eq(users.id, verificationToken.userId));

      return {
        success: true,
        userId: verificationToken.userId,
        email: verificationToken.email
      };
    });
  }

  async getEmailVerificationToken(token: string): Promise<typeof emailVerificationTokens.$inferSelect | undefined> {
    const [verificationToken] = await db.select()
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.token, hashToken(token)),
        eq(emailVerificationTokens.isUsed, false),
        gte(emailVerificationTokens.expiresAt, new Date())
      ));

    return verificationToken || undefined;
  }

  // Membership Requests
  async createMembershipRequest(data: {
    userId: string;
    organizationId: string;
    discoveryMethod?: 'join_code' | 'directory' | 'direct_link';
  }): Promise<MembershipRequest> {
    // Check if organization allows membership requests
    const org = await this.getOrganization(data.organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }
    if (!org.allowMembershipRequests) {
      throw new Error('Organization does not accept membership requests');
    }

    // Check if user already has a pending request
    const hasPending = await this.hasPendingMembershipRequest(data.userId, data.organizationId);
    if (hasPending) {
      throw new Error('You already have a pending membership request for this organization');
    }

    // Check if user is already a member
    const existingMembership = await db.select()
      .from(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, data.userId),
        eq(userOrganizations.organizationId, data.organizationId)
      ))
      .limit(1);

    if (existingMembership.length > 0) {
      throw new Error('You are already a member of this organization');
    }

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // If auto-approve is enabled, approve immediately
    const status = org.autoApproveRequests ? 'approved' : 'pending';

    const insertValues: any = {
      userId: data.userId,
      organizationId: data.organizationId,
      status,
      requestedRole: 'athlete',
      expiresAt,
    };

    // Only set optional fields if they have values
    if (data.discoveryMethod) {
      insertValues.discoveryMethod = data.discoveryMethod;
    }
    if (org.autoApproveRequests) {
      insertValues.processedAt = new Date();
    }

    const [request] = await db.insert(membershipRequests).values(insertValues).returning();

    // If auto-approved, add user to organization immediately
    if (org.autoApproveRequests) {
      await this.addUserToOrganization(data.userId, data.organizationId, 'athlete');
    }

    return request;
  }

  async getMembershipRequest(id: string): Promise<MembershipRequest | undefined> {
    const [request] = await db.select()
      .from(membershipRequests)
      .where(eq(membershipRequests.id, id));
    return request;
  }

  async getMembershipRequestsByOrganization(
    organizationId: string,
    filters?: { status?: string }
  ): Promise<(MembershipRequest & { user: User })[]> {
    const conditions = [eq(membershipRequests.organizationId, organizationId)];
    if (filters?.status) {
      conditions.push(eq(membershipRequests.status, filters.status as any));
    }

    const results = await db.select()
      .from(membershipRequests)
      .innerJoin(users, eq(membershipRequests.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(membershipRequests.createdAt));

    return results.map(r => ({
      ...r.membership_requests,
      user: r.users,
    }));
  }

  async getMembershipRequestsByUser(userId: string): Promise<(MembershipRequest & { organization: Organization })[]> {
    const results = await db.select()
      .from(membershipRequests)
      .innerJoin(organizations, eq(membershipRequests.organizationId, organizations.id))
      .where(eq(membershipRequests.userId, userId))
      .orderBy(desc(membershipRequests.createdAt));

    return results.map(r => ({
      ...r.membership_requests,
      organization: r.organizations,
    }));
  }

  /**
   * Approve a membership request, optionally linking to an existing athlete.
   *
   * When linkToAthleteId is provided:
   * 1. Transfer measurements FROM existing athlete TO requester
   * 2. Transfer team memberships FROM existing athlete TO requester
   * 3. Copy profile data FROM existing athlete TO requester (if requester is missing it)
   * 4. Deactivate the existing athlete (they no longer have login access)
   * 5. Add requester to organization as athlete
   *
   * This is consistent with how invitation acceptance works - the account with
   * login credentials becomes the surviving account.
   */
  async approveMembershipRequest(
    id: string,
    processedBy: string,
    linkToAthleteId?: string
  ): Promise<MembershipRequest> {
    const request = await this.getMembershipRequest(id);
    if (!request) {
      throw new Error('Membership request not found');
    }
    if (request.status !== 'pending') {
      throw new Error('Only pending requests can be approved');
    }

    // Use transaction to ensure atomicity of approval operations
    return await db.transaction(async (tx: any) => {
      // If linking to existing athlete, perform the data transfer
      if (linkToAthleteId) {
        await this.linkAthleteAccounts(
          request.userId,        // requester (with login) - survives
          linkToAthleteId,       // existing athlete (no login) - gets data transferred
          request.organizationId
        );
      }

      // Update request status
      const [updated] = await tx.update(membershipRequests)
        .set({
          status: 'approved',
          processedBy,
          processedAt: new Date(),
        })
        .where(eq(membershipRequests.id, id))
        .returning();

      // Add user to organization.
      // NOTE: full atomicity of approval is NOT yet achieved here — linkAthleteAccounts
      // above transfers measurements/roster and deactivates the old athlete on the
      // pooled db handle, outside this transaction. Rather than thread tx through only
      // this call (a mixed state that could partially roll back and corrupt data), keep
      // it consistent with those writes (no tx). Threading tx through linkAthleteAccounts
      // to make the whole approval atomic is a separate, larger change.
      await this.addUserToOrganization(request.userId, request.organizationId, 'athlete');

      return updated;
    });
  }

  /**
   * Link an existing athlete's data to a new requester account.
   * Transfers measurements, team memberships, and profile data from the
   * existing athlete to the requester, then deactivates the existing athlete.
   *
   * @param requesterId - The user ID of the requester (with login credentials)
   * @param existingAthleteId - The user ID of the existing athlete (no login)
   * @param organizationId - The organization context for the linking
   */
  private async linkAthleteAccounts(
    requesterId: string,
    existingAthleteId: string,
    organizationId: string
  ): Promise<void> {
    // 1. Transfer measurements from existing athlete to requester
    await db.update(measurements)
      .set({ userId: requesterId })
      .where(eq(measurements.userId, existingAthleteId));

    // 2. Transfer team memberships from existing athlete to requester
    // First, get existing team memberships to avoid duplicates
    const existingTeamMemberships = await db.select()
      .from(userTeams)
      .where(eq(userTeams.userId, existingAthleteId));

    for (const membership of existingTeamMemberships) {
      // Check if requester already has this team membership
      const [existing] = await db.select()
        .from(userTeams)
        .where(and(
          eq(userTeams.userId, requesterId),
          eq(userTeams.teamId, membership.teamId)
        ))
        .limit(1);

      if (!existing) {
        // Transfer the team membership
        await db.update(userTeams)
          .set({ userId: requesterId })
          .where(and(
            eq(userTeams.userId, existingAthleteId),
            eq(userTeams.teamId, membership.teamId)
          ));
      } else {
        // Delete the old team membership (requester already has it)
        await db.delete(userTeams)
          .where(and(
            eq(userTeams.userId, existingAthleteId),
            eq(userTeams.teamId, membership.teamId)
          ));
      }
    }

    // 3. Copy profile data from existing athlete to requester (if requester is missing it)
    const [existingAthlete] = await db.select()
      .from(users)
      .where(eq(users.id, existingAthleteId));

    const [requester] = await db.select()
      .from(users)
      .where(eq(users.id, requesterId));

    if (existingAthlete && requester) {
      const profileUpdates: Partial<typeof users.$inferInsert> = {};

      // Copy profile fields if requester is missing them
      if (!requester.birthYear && existingAthlete.birthYear) {
        profileUpdates.birthYear = existingAthlete.birthYear;
      }
      if (!requester.school && existingAthlete.school) {
        profileUpdates.school = existingAthlete.school;
      }
      if (!requester.graduationYear && existingAthlete.graduationYear) {
        profileUpdates.graduationYear = existingAthlete.graduationYear;
      }
      if (!requester.height && existingAthlete.height) {
        profileUpdates.height = existingAthlete.height;
      }
      if (!requester.weight && existingAthlete.weight) {
        profileUpdates.weight = existingAthlete.weight;
      }
      if ((!requester.sports || requester.sports.length === 0) && existingAthlete.sports && existingAthlete.sports.length > 0) {
        profileUpdates.sports = existingAthlete.sports;
      }
      if ((!requester.positions || requester.positions.length === 0) && existingAthlete.positions && existingAthlete.positions.length > 0) {
        profileUpdates.positions = existingAthlete.positions;
      }

      if (Object.keys(profileUpdates).length > 0) {
        await db.update(users)
          .set(profileUpdates)
          .where(eq(users.id, requesterId));
      }
    }

    // 4. Deactivate the existing athlete (they no longer need login access)
    await db.update(users)
      .set({ isActive: false })
      .where(eq(users.id, existingAthleteId));

    // 5. Remove existing athlete from organization (requester will be added later)
    await db.delete(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, existingAthleteId),
        eq(userOrganizations.organizationId, organizationId)
      ));
  }

  async rejectMembershipRequest(id: string, processedBy: string, reason?: string): Promise<MembershipRequest> {
    const request = await this.getMembershipRequest(id);
    if (!request) {
      throw new Error('Membership request not found');
    }
    if (request.status !== 'pending') {
      throw new Error('Only pending requests can be rejected');
    }

    const [updated] = await db.update(membershipRequests)
      .set({
        status: 'rejected',
        processedBy,
        processedAt: new Date(),
        rejectionReason: reason || null,
      })
      .where(eq(membershipRequests.id, id))
      .returning();

    return updated;
  }

  async cancelMembershipRequest(id: string): Promise<void> {
    const request = await this.getMembershipRequest(id);
    if (!request) {
      throw new Error('Membership request not found');
    }
    if (request.status !== 'pending') {
      throw new Error('Only pending requests can be cancelled');
    }

    await db.update(membershipRequests)
      .set({ status: 'cancelled' })
      .where(eq(membershipRequests.id, id));
  }

  async hasPendingMembershipRequest(userId: string, organizationId: string): Promise<boolean> {
    const [existing] = await db.select()
      .from(membershipRequests)
      .where(and(
        eq(membershipRequests.userId, userId),
        eq(membershipRequests.organizationId, organizationId),
        eq(membershipRequests.status, 'pending')
      ))
      .limit(1);
    return !!existing;
  }

  /**
   * Get athletes in an organization that have no login credentials (unlinked).
   * These are athletes that were imported via CSV, manually created, or invited
   * but never set up login credentials. They can be linked to incoming membership
   * requests from users who want to join the organization.
   *
   * Criteria for "unlinked" athlete:
   * - Has role='athlete' in the organization
   * - Has no password (password is NULL)
   * - Has no OAuth credentials (googleId and appleId are NULL)
   */
  async getUnlinkedAthletes(organizationId: string): Promise<User[]> {
    const result = await db.select({
      user: users
    })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(
        eq(userOrganizations.organizationId, organizationId),
        eq(userOrganizations.role, 'athlete'),
        eq(users.isActive, true),
        isNull(users.password),
        isNull(users.googleId),
        isNull(users.appleId)
      ))
      .orderBy(users.fullName);

    return result.map(r => r.user);
  }

  // Public Organization Directory
  async getPublicOrganizations(filters?: { search?: string; orgType?: OrganizationType }): Promise<(Organization & { memberCount: number })[]> {
    const conditions = [
      eq(organizations.isPublicDirectory, true),
      eq(organizations.isActive, true),
      isNull(organizations.deletedAt),
    ];

    if (filters?.orgType) {
      conditions.push(eq(organizations.orgType, filters.orgType));
    }

    // Get organizations
    let query = db.select()
      .from(organizations)
      .where(and(...conditions))
      .orderBy(organizations.name);

    const orgs = await query;

    // If search filter, apply client-side filtering (PostgreSQL ILIKE would be better but keeping it simple)
    let filteredOrgs = orgs;
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filteredOrgs = orgs.filter(org =>
        org.name.toLowerCase().includes(searchLower) ||
        (org.description && org.description.toLowerCase().includes(searchLower)) ||
        (org.location && org.location.toLowerCase().includes(searchLower))
      );
    }

    // Get member counts for each org
    const orgIds = filteredOrgs.map(o => o.id);
    if (orgIds.length === 0) {
      return [];
    }

    const memberCounts = await db.select({
      organizationId: userOrganizations.organizationId,
      count: sql<number>`count(*)::int`,
    })
      .from(userOrganizations)
      .where(inArray(userOrganizations.organizationId, orgIds))
      .groupBy(userOrganizations.organizationId);

    const countMap = new Map(memberCounts.map(mc => [mc.organizationId, mc.count]));

    return filteredOrgs.map(org => ({
      ...org,
      memberCount: countMap.get(org.id) || 0,
    }));
  }

  async getOrganizationByJoinCode(joinCode: string): Promise<Organization | undefined> {
    const [org] = await db.select()
      .from(organizations)
      .where(and(
        eq(organizations.joinCode, joinCode.toUpperCase()),
        eq(organizations.isActive, true),
        isNull(organizations.deletedAt)
      ));
    return org;
  }

  async regenerateJoinCode(organizationId: string, customCode?: string): Promise<string> {
    let newCode: string;

    if (customCode) {
      // Validate custom code: 4-20 chars, alphanumeric only
      const sanitized = customCode.toUpperCase().trim();

      if (sanitized.length < 4 || sanitized.length > 20) {
        throw new Error('Join code must be between 4 and 20 characters');
      }

      if (!/^[A-Z0-9]+$/.test(sanitized)) {
        throw new Error('Join code can only contain letters and numbers');
      }

      newCode = sanitized;
    } else {
      // Generate a new 8-character uppercase hex code
      newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Use database UNIQUE constraint for atomic uniqueness check
    // This prevents race conditions where two requests could pass a pre-check simultaneously
    try {
      await db.update(organizations)
        .set({ joinCode: newCode })
        .where(eq(organizations.id, organizationId));
    } catch (error: any) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (getPgErrorCode(error) === PG_UNIQUE_VIOLATION || error.message?.includes('unique') || error.message?.includes('duplicate')) {
        throw new Error('This join code is already in use by another organization');
      }
      throw error;
    }

    return newCode;
  }

  async updateOrganizationMembershipSettings(
    organizationId: string,
    settings: {
      isPublicDirectory?: boolean;
      allowMembershipRequests?: boolean;
      autoApproveRequests?: boolean;
    }
  ): Promise<Organization> {
    const [updated] = await db.update(organizations)
      .set(settings)
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!updated) {
      throw new Error('Organization not found');
    }

    return updated;
  }

  // Events
  async getEvent(id: string): Promise<Event | null> {
    const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return result[0] || null;
  }

  async updateEvent(id: string, data: Partial<Event>): Promise<Event> {
    const result = await db.update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    if (!result[0]) throw new Error(`Event ${id} not found`);
    return result[0];
  }

  async createEvent(data: InsertEvent): Promise<Event> {
    const result = await db.insert(events).values(data).returning();
    return result[0];
  }

  async deleteEvent(id: string): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async listEvents(filters: { organizationId?: string; status?: string; visibility?: string } = {}): Promise<Event[]> {
    const conditions = [];
    if (filters.organizationId) conditions.push(eq(events.organizationId, filters.organizationId));
    if (filters.status) conditions.push(eq(events.status, filters.status as any));
    if (filters.visibility) conditions.push(eq(events.visibility, filters.visibility as any));

    return db.select().from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.startDate));
  }

  async getEventByCode(code: string): Promise<Event | null> {
    // Case-insensitive lookup using UPPER() on both sides
    const result = await db.select().from(events)
      .where(sql`UPPER(${events.eventCode}) = UPPER(${code})`)
      .limit(1);
    return result[0] || null;
  }

  // Event Registrations

  async createEventRegistration(data: InsertEventRegistration): Promise<EventRegistration> {
    const result = await db.insert(eventRegistrations).values(data).returning();
    return result[0];
  }

  async getEventRegistration(eventId: string, userId: string): Promise<EventRegistration | null> {
    const result = await db.select().from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.userId, userId)
      ))
      .limit(1);
    return result[0] || null;
  }

  async getEventRegistrationById(id: string): Promise<EventRegistration | null> {
    const result = await db.select().from(eventRegistrations)
      .where(eq(eventRegistrations.id, id))
      .limit(1);
    return result[0] || null;
  }

  async updateEventRegistration(id: string, data: Partial<InsertEventRegistration>): Promise<EventRegistration> {
    const result = await db.update(eventRegistrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(eventRegistrations.id, id))
      .returning();
    if (!result[0]) throw new Error(`Event registration ${id} not found`);
    return result[0];
  }

  async deleteEventRegistration(id: string): Promise<void> {
    await db.delete(eventRegistrations).where(eq(eventRegistrations.id, id));
  }

  async listEventRegistrations(eventId: string, filters?: { status?: RegistrationStatus; limit?: number; offset?: number }): Promise<EventRegistration[]> {
    const conditions = [eq(eventRegistrations.eventId, eventId)];
    if (filters?.status) {
      conditions.push(eq(eventRegistrations.status, filters.status));
    }

    let query = db.select().from(eventRegistrations)
      .where(and(...conditions))
      .orderBy(asc(eventRegistrations.registrationNumber));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async countEventRegistrations(eventId: string, excludeStatuses?: RegistrationStatus[]): Promise<number> {
    const conditions = [eq(eventRegistrations.eventId, eventId)];
    if (excludeStatuses && excludeStatuses.length > 0) {
      for (const status of excludeStatuses) {
        conditions.push(ne(eventRegistrations.status, status));
      }
    }

    const result = await db.select({ count: sql<number>`count(*)` })
      .from(eventRegistrations)
      .where(and(...conditions));
    return Number(result[0]?.count || 0);
  }

  async getNextRegistrationNumber(eventId: string): Promise<number> {
    const result = await db.select({ max: sql<number>`coalesce(max(${eventRegistrations.registrationNumber}), 0)` })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId));
    return (result[0]?.max || 0) + 1;
  }

  async getNextWaitlistPosition(eventId: string): Promise<number> {
    const result = await db.select({ max: sql<number>`coalesce(max(${eventRegistrations.waitlistPosition}), 0)` })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.status, 'waitlisted')
      ));
    return (result[0]?.max || 0) + 1;
  }

  async getFirstWaitlistedRegistration(eventId: string): Promise<EventRegistration | null> {
    const result = await db.select().from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.status, 'waitlisted')
      ))
      .orderBy(asc(eventRegistrations.waitlistPosition))
      .limit(1);
    return result[0] || null;
  }

  async getUserEventRegistrations(userId: string): Promise<(EventRegistration & { event: Event })[]> {
    const result = await db.select({
      registration: eventRegistrations,
      event: events,
    })
      .from(eventRegistrations)
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .where(eq(eventRegistrations.userId, userId))
      .orderBy(desc(events.startDate));

    return result.map(row => ({
      ...row.registration,
      event: row.event,
    }));
  }

  // Event Invitations

  async createEventInvitation(data: InsertEventInvitation): Promise<EventInvitation> {
    const result = await db.insert(eventInvitations).values(data).returning();
    return result[0];
  }

  async getEventInvitation(id: string): Promise<EventInvitation | null> {
    const result = await db.select().from(eventInvitations)
      .where(eq(eventInvitations.id, id))
      .limit(1);
    return result[0] || null;
  }

  async getEventInvitationByToken(token: string): Promise<EventInvitation | null> {
    const result = await db.select().from(eventInvitations)
      .where(eq(eventInvitations.token, token))
      .limit(1);
    return result[0] || null;
  }

  async getEventInvitationByUserAndEvent(eventId: string, userId: string): Promise<EventInvitation | null> {
    const result = await db.select().from(eventInvitations)
      .where(and(
        eq(eventInvitations.eventId, eventId),
        eq(eventInvitations.userId, userId)
      ))
      .limit(1);
    return result[0] || null;
  }

  async getEventInvitationByEmailAndEvent(eventId: string, email: string): Promise<EventInvitation | null> {
    const result = await db.select().from(eventInvitations)
      .where(and(
        eq(eventInvitations.eventId, eventId),
        eq(eventInvitations.email, email)
      ))
      .limit(1);
    return result[0] || null;
  }

  async updateEventInvitation(id: string, data: Partial<InsertEventInvitation>): Promise<EventInvitation> {
    const result = await db.update(eventInvitations)
      .set(data)
      .where(eq(eventInvitations.id, id))
      .returning();
    if (!result[0]) throw new Error(`Event invitation ${id} not found`);
    return result[0];
  }

  async listEventInvitations(eventId: string, filters?: { status?: EventInvitationStatus; limit?: number; offset?: number }): Promise<EventInvitation[]> {
    const conditions = [eq(eventInvitations.eventId, eventId)];
    if (filters?.status) {
      conditions.push(eq(eventInvitations.status, filters.status));
    }

    let query = db.select().from(eventInvitations)
      .where(and(...conditions))
      .orderBy(desc(eventInvitations.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async getUserPendingInvitations(userId: string): Promise<Array<EventInvitation & { event: Event }>> {
    const now = new Date();

    const result = await db.select({
      invitation: eventInvitations,
      event: events,
    })
      .from(eventInvitations)
      .innerJoin(events, eq(eventInvitations.eventId, events.id))
      .where(and(
        eq(eventInvitations.userId, userId),
        eq(eventInvitations.status, 'pending'),
        gt(eventInvitations.expiresAt, now)
      ))
      .orderBy(events.startDate);

    return result.map(row => ({
      ...row.invitation,
      event: row.event,
    }));
  }

  // Athletes (users with athlete role) - consolidated from legacy getPlayers

  async getAthletes(filters?: {
    teamId?: string;
    organizationId?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    search?: string;
    gender?: string;
    includeUnknownBirthYear?: boolean;
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

      // Birth year filtering with conditional NULL handling
      // Note: Only include NULL birthDate users if explicitly requested via includeUnknownBirthYear
      if (filters?.birthYearFrom && filters?.birthYearTo) {
        // When both from and to are specified, combine them into a single OR condition
        // to avoid redundant NULL checks
        if (filters?.includeUnknownBirthYear) {
          conditions.push(
            or(
              and(
                sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
                sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
              )!,
              isNull(users.birthDate)
            )!
          );
        } else {
          conditions.push(
            and(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
            )!
          );
        }
      } else if (filters?.birthYearFrom) {
        if (filters?.includeUnknownBirthYear) {
          conditions.push(
            or(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
              isNull(users.birthDate)
            )!
          );
        } else {
          conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`);
        }
      } else if (filters?.birthYearTo) {
        if (filters?.includeUnknownBirthYear) {
          conditions.push(
            or(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`,
              isNull(users.birthDate)
            )!
          );
        } else {
          conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`);
        }
      }

      if (filters?.gender && filters.gender !== "all") {
        conditions.push(eq(users.gender, filters.gender as "Male" | "Female" | "Not Specified"));
      }

      const result = await db
        .select({
          users: users
        })
        .from(users)
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .where(and(
          ...conditions,
          sql`${users.id} NOT IN (SELECT ${userTeams.userId} FROM ${userTeams} WHERE ${userTeams.userId} IS NOT NULL)`
        ))
        .orderBy(asc(users.lastName), asc(users.firstName));

      // For "none" team filter, athletes should have empty teams array
      return result.map((row: { users: User }) => ({
        ...row.users,
        teams: []
      }));
    }

    // For regular queries, get athletes with their team information
    const conditions = [eq(userOrganizations.role, 'athlete')];

    // Birth year filtering with conditional NULL handling
    // Note: Only include NULL birthDate users if explicitly requested via includeUnknownBirthYear
    if (filters?.birthYearFrom && filters?.birthYearTo) {
      // When both from and to are specified, combine them into a single OR condition
      // to avoid redundant NULL checks
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            and(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
            )!,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(
          and(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
          )!
        );
      }
    } else if (filters?.birthYearFrom) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`);
      }
    } else if (filters?.birthYearTo) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`);
      }
    }

    if (filters?.search) {
      conditions.push(sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${'%' + filters.search + '%'}`);
    }

    if (filters?.gender && filters.gender !== "all") {
      // Validate gender value before using it in the query
      const validGenders = ['Male', 'Female', 'Not Specified'] as const;
      if (!validGenders.includes(filters.gender as any)) {
        throw new Error(`Invalid gender value: ${filters.gender}`);
      }
      conditions.push(eq(users.gender, filters.gender as "Male" | "Female" | "Not Specified"));
    }

    if (filters?.organizationId) {
      conditions.push(eq(userOrganizations.organizationId, filters.organizationId));
    }

    // Get athletes first with optimized batched query approach
    // IMPORTANT: Explicitly select user fields to ensure array fields (emails, phoneNumbers, sports) are properly serialized
    const athleteQuery = db
      .select({
        users: users
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...conditions))
      .orderBy(asc(users.lastName), asc(users.firstName));

    const athleteResults = await athleteQuery;
    const athletes = athleteResults.map((row: { users: User }) => row.users);

    // Debug logging to verify database returns emails
    if (athletes.length > 0) {
      const sampleUser = athletes[0];
      console.log('\n========================================');
      console.log('[STORAGE DEBUG] Sample user from DB query:');
      console.log('ID:', sampleUser.id);
      console.log('Name:', sampleUser.firstName, sampleUser.lastName);
      console.log('Has emails?:', !!sampleUser.emails);
      console.log('Emails type:', Array.isArray(sampleUser.emails) ? 'array' : typeof sampleUser.emails);
      console.log('Emails length:', Array.isArray(sampleUser.emails) ? sampleUser.emails.length : 'N/A');
      console.log('Emails value:', sampleUser.emails);
      console.log('Phone numbers:', sampleUser.phoneNumbers);
      console.log('Sports:', sampleUser.sports);
      console.log('All user keys:', Object.keys(sampleUser).sort());
      console.log('========================================\n');
    }

    // If no athletes found, return empty array
    if (athletes.length === 0) {
      return [];
    }

    // Batch fetch all teams for all athletes in a single query
    // Filter for active team memberships and non-archived teams
    const athleteIds = athletes.map((a: User) => a.id);
    const userTeamsResults = await db
      .select()
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(and(
        inArray(userTeams.userId, athleteIds),
        eq(userTeams.isActive, true),
        or(isNull(userTeams.leftAt), gte(userTeams.leftAt, new Date())),
        eq(teams.isArchived, false),
        filters?.organizationId ? eq(teams.organizationId, filters.organizationId) : undefined
      ));

    // Build a map of user ID to teams array
    const userTeamsMap = new Map<string, (Team & { organization: Organization })[]>();

    // Initialize empty arrays for all athletes
    athletes.forEach((athlete: User) => {
      userTeamsMap.set(athlete.id, []);
    });

    // Populate the map with team data
    userTeamsResults.forEach((row: { user_teams: UserTeam, teams: Team, organizations: Organization }) => {
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
    const athletesWithTeams = athletes.map((athlete: User) => ({
      ...athlete,
      teams: userTeamsMap.get(athlete.id) || []
    }));

    const result = athletesWithTeams;

    // Apply team filter
    if (filters?.teamId && filters.teamId !== 'none') {
      return result.filter((athlete: User & { teams: (Team & { organization: Organization })[] }) =>
        athlete.teams.some((team: Team) => team.id === filters.teamId)
      );
    }

    return result;
  }

  async getRecentAthletes(filters: {
    organizationId: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    lastMeasurementDate: string;
    lastMeasurementType: string;
    teamName: string | null;
  }>> {
    // Validate required organizationId parameter
    if (!filters.organizationId) {
      throw new Error('organizationId is required for getRecentAthletes');
    }

    const limit = filters.limit || 5;

    // Query to get athletes with their most recent measurement
    // Uses ROW_NUMBER() window function to get the latest measurement per athlete
    const result = await db.execute<{
      id: string;
      firstName: string;
      lastName: string;
      avatar: string | null;
      lastMeasurementDate: string;
      lastMeasurementType: string;
      teamName: string | null;
    }>(sql`
      WITH ranked_measurements AS (
        SELECT
          u.id,
          u.first_name as "firstName",
          u.last_name as "lastName",
          NULL as avatar,
          m.date as "lastMeasurementDate",
          m.metric as "lastMeasurementType",
          t.name as "teamName",
          ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY m.date DESC, m.created_at DESC) as rn
        FROM ${users} u
        INNER JOIN ${userOrganizations} uo ON u.id = uo.user_id
        INNER JOIN ${measurements} m ON m.user_id = u.id
        LEFT JOIN ${teams} t ON m.team_id = t.id
        WHERE uo.organization_id = ${filters.organizationId}
          AND uo.role = 'athlete'
          AND u.deleted_at IS NULL
      )
      SELECT id, "firstName", "lastName", avatar, "lastMeasurementDate", "lastMeasurementType", "teamName"
      FROM ranked_measurements
      WHERE rn = 1
      ORDER BY "lastMeasurementDate" DESC, id
      LIMIT ${limit}
    `);

    return result;
  }

  // Legacy methods for backward compatibility - delegate to athlete methods

  async getAthlete(id: string): Promise<(User & { teams: (Team & { organization: Organization })[] }) | undefined> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.id, id),
        isNull(users.deletedAt)
      )
    );
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
    // Generate a placeholder username that will be replaced when they accept the invitation
    // Use email prefix if available, otherwise use name-based username
    let username: string;
    if (athlete.emails && athlete.emails.length > 0 && athlete.emails[0]) {
      // Use email prefix as username placeholder (e.g., "john.doe" from "john.doe@email.com")
      const emailPrefix = athlete.emails[0].split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      username = `${emailPrefix}_pending_${Date.now().toString().slice(-6)}`;
    } else {
      // Fallback to name-based username
      const namePart = `${athlete.firstName}${athlete.lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      username = `${namePart}_pending_${Date.now().toString().slice(-6)}`;
    }

    // Use primary email or generate one
    const emails = (athlete.emails && athlete.emails.length > 0) ? athlete.emails : [`${username}@temp.local`];

    // Build insert object explicitly, omitting undefined fields entirely
    const insertValues: any = {
      username, // This will be replaced when the athlete accepts their invitation
      emails, // Ensure emails array is always provided
      firstName: athlete.firstName!,
      lastName: athlete.lastName!,
      fullName: `${athlete.firstName} ${athlete.lastName}`,
      password: "INVITATION_PENDING", // Will be set when they accept invitation
      isActive: false, // Set to false until they complete registration
      isSiteAdmin: false, // Explicitly set to false
      mfaEnabled: false, // Explicitly set to false
      isEmailVerified: false, // Explicitly set to false
      requiresPasswordChange: false // Explicitly set to false
    };

    // Only add optional fields if they have values
    if (athlete.birthDate) {
      insertValues.birthDate = athlete.birthDate;
      insertValues.birthYear = new Date(athlete.birthDate).getFullYear();
    }
    if (athlete.graduationYear) insertValues.graduationYear = athlete.graduationYear;
    if (athlete.school) insertValues.school = athlete.school;
    if (athlete.sports) insertValues.sports = athlete.sports;
    if (athlete.phoneNumbers) insertValues.phoneNumbers = athlete.phoneNumbers;
    if (athlete.height) insertValues.height = athlete.height;
    if (athlete.weight) insertValues.weight = athlete.weight;
    if (athlete.gender) insertValues.gender = athlete.gender;
    if (athlete.positions) insertValues.positions = athlete.positions;

    const [newUser] = await db.insert(users).values(insertValues).returning();

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
    // List of valid database columns that can be updated
    const validUserColumns = [
      'username', 'emails', 'password', 'firstName', 'lastName',
      'birthDate', 'graduationYear', 'school', 'phoneNumbers', 'sports', 'positions',
      'height', 'weight', 'gender', 'mfaEnabled', 'mfaSecret', 'backupCodes',
      'lastLoginAt', 'loginAttempts', 'lockedUntil', 'isEmailVerified',
      'requiresPasswordChange', 'passwordChangedAt', 'isSiteAdmin', 'isActive',
      'showPeerComparisons', 'hasCompletedOnboarding',
      'parentEmail',
    ];

    // Filter out undefined values and non-database columns to prevent UNDEFINED_VALUE errors
    const updateData: any = {};
    Object.keys(athlete).forEach(key => {
      const value = (athlete as any)[key];
      // Include the field if it is a valid column AND either has a real value or is
      // explicitly null (to support clearing nullable fields like parentEmail).
      if (value !== undefined && validUserColumns.includes(key)) {
        updateData[key] = value;
      }
    });

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

    // Only issue the UPDATE if there is at least one column to write; otherwise
    // just fetch the current record so we can still return it (and still process
    // teamIds below if needed).
    let updated: User | undefined;
    if (Object.keys(updateData).length > 0) {
      [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    } else {
      updated = await this.getUser(id);
    }

    if (!updated) {
      throw new Error(`Athlete ${id} not found`);
    }

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
    await db.transaction(async (tx: any) => {
      // Revoke all active sessions for security (explicit revocation)
      // Note: Schema has onDelete: 'set null', but explicit deletion is more secure
      const { sessions } = await import('@shared/schema');
      await tx.delete(sessions).where(eq(sessions.userId, id));

      // Delete email verification tokens
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));

      // Delete athlete profiles
      await tx.delete(athleteProfiles).where(eq(athleteProfiles.userId, id));

      // Delete all user-team relationships
      await tx.delete(userTeams).where(eq(userTeams.userId, id));

      // Delete all user-organization relationships
      await tx.delete(userOrganizations).where(eq(userOrganizations.userId, id));

      // Delete measurements where user is subject OR submitter
      // Note: submittedBy is NOT NULL, so we must delete rather than set to null
      // This covers both self-submitted measurements and measurements submitted by this user for others
      await tx.delete(measurements).where(
        or(
          eq(measurements.userId, id),
          eq(measurements.submittedBy, id)
        )
      );

      // Update measurements verified by this user (verifiedBy is nullable)
      await tx.update(measurements)
        .set({ verifiedBy: null as any })
        .where(eq(measurements.verifiedBy, id));

      // Update invitations where this user accepted/cancelled them (keep invitation history)
      await tx.update(invitations)
        .set({ acceptedBy: null as any })
        .where(eq(invitations.acceptedBy, id));

      await tx.update(invitations)
        .set({ cancelledBy: null as any })
        .where(eq(invitations.cancelledBy, id));

      // Delete invitations created BY this user
      await tx.delete(invitations).where(eq(invitations.invitedBy, id));

      // Delete invitations FOR this user (as athlete/playerId)
      await tx.delete(invitations).where(eq(invitations.playerId, id));

      // Preserve audit logs for compliance (set userId to null)
      // Schema has onDelete: 'set null' - audit trail must be immutable
      await tx.update(auditLogs)
        .set({ userId: null as any })
        .where(eq(auditLogs.userId, id));

      // Finally, delete the user record
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async getAthleteByNameAndBirthYear(firstName: string, lastName: string, birthYear: number): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(
        eq(users.firstName, firstName),
        eq(users.lastName, lastName),
        sql`EXTRACT(YEAR FROM ${users.birthDate}) = ${birthYear}`,
        isNull(users.deletedAt)
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

    return result.map(({ teams: team, organizations }: { teams: Team, organizations: Organization }) => ({
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
    includeUnknownBirthYear?: boolean;
  }): Promise<any[]> {
    // First, query measurements with user data (no team joins yet)
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
      // Event context fields
      eventId: measurements.eventId,
      eventNameSnapshot: measurements.eventNameSnapshot,
      eventDateSnapshot: measurements.eventDateSnapshot,
      // User data WITHOUT teams for now
      user: sql<any>`jsonb_build_object(
        'id', ${users.id},
        'firstName', ${users.firstName},
        'lastName', ${users.lastName},
        'fullName', ${users.fullName},
        'birthYear', ${users.birthYear},
        'sports', ${users.sports},
        'gender', ${users.gender},
        'positions', ${users.positions}
      )`,
      // Submitter and verifier info
      submitterInfo: sql<any>`submitter_info.first_name || ' ' || submitter_info.last_name`,
      verifierInfo: sql<any>`verifier_info.first_name || ' ' || verifier_info.last_name`
    })
    .from(measurements)
    .leftJoin(users, eq(measurements.userId, users.id))
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
    // Birth year filtering (applied to users table)
    // Note: Only include NULL birthDate users if explicitly requested via includeUnknownBirthYear
    // Uses EXTRACT(YEAR FROM birthDate) as birthDate is the source of truth (birthYear is computed field)
    if (filters?.birthYearFrom) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            isNull(users.birthDate)
          )
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`);
      }
    }
    if (filters?.birthYearTo) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`,
            isNull(users.birthDate)
          )
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`);
      }
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
      conditions.push(eq(measurements.isVerified, true));
    }
    
    // Team filtering - filter by athlete's CURRENT team membership (not historical)
    // This matches the display logic which shows current teams
    if (filters?.teamIds && filters.teamIds.length > 0) {
      conditions.push(
        exists(
          db.select({ id: userTeams.id })
            .from(userTeams)
            .where(and(
              eq(userTeams.userId, users.id),
              inArray(userTeams.teamId, filters.teamIds),
              eq(userTeams.isActive, true),
              or(
                isNull(userTeams.leftAt),
                gte(userTeams.leftAt, new Date())
              )
            ))
        )
      );
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
      .orderBy(desc(measurements.date), desc(measurements.createdAt));

    // If no measurements found, return empty array
    if (result.length === 0) {
      return [];
    }

    // Step 2: Batch fetch teams for each measurement based on the measurement date
    // Build a map of (userId, measurementDate) -> teams
    const userDatePairs = result.map((m: any) => ({
      userId: m.userId,
      date: m.date
    }));

    // Get unique user IDs
    const uniqueUserIds = [...new Set(result.map((m: any) => m.userId as string).filter(Boolean))] as string[];

    // Fetch all team memberships for these users
    type TeamMembership = {
      userId: string;
      teamId: string;
      teamName: string;
      joinedAt: Date;
      leftAt: Date | null;
      organizationId: string;
      organizationName: string;
    };

    // Only query for teams if we have user IDs
    let allUserTeams: TeamMembership[] = [];
    if (uniqueUserIds.length > 0) {
      allUserTeams = await db
        .select({
          userId: userTeams.userId,
          teamId: teams.id,
          teamName: teams.name,
          joinedAt: userTeams.joinedAt,
          leftAt: userTeams.leftAt,
          organizationId: organizations.id,
          organizationName: organizations.name,
        })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .innerJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(and(
          inArray(userTeams.userId, uniqueUserIds),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));
    }

    // Build a map of userId -> array of team memberships
    const userTeamsMap = new Map<string, typeof allUserTeams>();
    allUserTeams.forEach((ut: typeof allUserTeams[0]) => {
      if (!userTeamsMap.has(ut.userId)) {
        userTeamsMap.set(ut.userId, []);
      }
      userTeamsMap.get(ut.userId)!.push(ut);
    });

    // Attach teams to each measurement based on temporal logic
    const measurementsWithTeams = result.map((measurement: any) => {
      const measurementDate = new Date(measurement.date);
      const userMemberships = userTeamsMap.get(measurement.userId) || [];

      // Show currently active teams (not filtered by measurement date)
      // This ensures athletes show with their current team affiliations
      const activeTeamsAtDate = userMemberships.filter((membership: typeof allUserTeams[0]) => {
        // Only filter out if they've explicitly left the team
        const leftDate = membership.leftAt ? new Date(membership.leftAt) : null;
        const now = new Date();
        
        return (!leftDate || leftDate >= now);
      });

      // Build teams array
      const teams = activeTeamsAtDate.map((membership: typeof allUserTeams[0]) => ({
        id: membership.teamId,
        name: membership.teamName,
        organization: {
          id: membership.organizationId,
          name: membership.organizationName,
        },
      }));

      return {
        ...measurement,
        user: {
          ...measurement.user,
          teams,
        },
      };
    });

    // Apply remaining filters (team/org filtering now done in query for better performance)
    let filteredMeasurements = measurementsWithTeams;

    // Filter by sport if specified
    if (filters?.sport && filters.sport !== "all") {
      filteredMeasurements = filteredMeasurements.filter((measurement: any) =>
        measurement.user.sports?.includes(filters.sport!)
      );
    }

    // Filter by gender if specified
    if (filters?.gender && filters.gender !== "all") {
      filteredMeasurements = filteredMeasurements.filter((measurement: any) =>
        measurement.user.gender === filters.gender
      );
    }

    // Filter by position if specified
    if (filters?.position && filters.position !== "all") {
      filteredMeasurements = filteredMeasurements.filter((measurement: any) =>
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
      or(
        isNull(userTeams.leftAt),
        gte(userTeams.leftAt, measurementDate)
      ),
      eq(userTeams.isActive, true),
      eq(teams.isArchived, false) // Only include non-archived teams
    ));

    return activeTeams;
  }

  async createMeasurement(
    measurement: InsertMeasurement,
    submittedBy: string,
    eventContext?: {
      eventId: string;
      eventNameSnapshot: string;
      eventDateSnapshot: string;  // String in 'YYYY-MM-DD' format for Drizzle's date() type
    }
  ): Promise<Measurement> {
    // Calculate age and units based on metric
    const user = await this.getUser(measurement.userId);
    if (!user) throw new Error("User not found");

    const measurementDate = new Date(measurement.date);
    let age = 0;

    // Calculate age from birthDate (source of truth)
    // Note: birthYear field is not reliably maintained
    if (user.birthDate) {
      const birthDate = new Date(user.birthDate);
      age = measurementDate.getFullYear() - birthDate.getFullYear();
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
    let teamContextAuto = true;
    let teamNameSnapshot: string | null = null;
    let organizationId: string | null = null;

    if (!teamId || teamId.trim() === "") {
      // Get athlete's active teams at measurement date
      const activeTeams = await this.getAthleteActiveTeamsAtDate(measurement.userId, measurementDate);

      if (activeTeams.length === 1) {
        // Single team - auto-assign
        teamId = activeTeams[0].teamId;
        season = activeTeams[0].season || undefined;
        teamContextAuto = true;

        // Fetch team details for snapshot
        const team = await this.getTeam(teamId);
        if (team) {
          teamNameSnapshot = team.name;
          organizationId = team.organizationId;
        }

        console.log(`Auto-assigned measurement to team: ${activeTeams[0].teamName} (${season || 'no season'})`);
      } else if (activeTeams.length > 1) {
        // Multiple teams - cannot auto-assign, will need manual selection
        console.log(`Athlete is on ${activeTeams.length} teams - team context not auto-assigned`);
        teamContextAuto = false;
      } else {
        // No active teams - measurement without team context
        console.log('Athlete has no active teams - measurement created without team context');
        teamContextAuto = false;
      }
    } else {
      // Team was explicitly provided - fetch team details for snapshot
      teamContextAuto = false;
      const team = await this.getTeam(teamId);
      if (team) {
        teamNameSnapshot = team.name;
        organizationId = team.organizationId;
      }
    }

    // Get submitter info to determine if auto-verify
    const [submitter] = await db.select().from(users).where(
      and(
        eq(users.id, submittedBy),
        isNull(users.deletedAt)
      )
    );

    // Check if submitter is site admin or has coach/org_admin role in any organization
    let isCoach = submitter?.isSiteAdmin === true;
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
      isVerified: isCoach ? true : false,
      verifiedBy: isCoach ? submittedBy : undefined,
      teamId: teamId || null,
      teamNameSnapshot: teamNameSnapshot || null,
      organizationId: organizationId || null,
      season: season || null,
      teamContextAuto: teamContextAuto,
      // Event context (for measurements taken at events)
      eventId: eventContext?.eventId ?? null,
      eventNameSnapshot: eventContext?.eventNameSnapshot ?? null,
      eventDateSnapshot: eventContext?.eventDateSnapshot ?? null,
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
        isVerified: true,
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
      athlete.isActive === true && athlete.password !== "INVITATION_PENDING"
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
    const activeTeams = teams.filter(team => team.isArchived !== true);

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
    const [user] = await db.select().from(users).where(
      and(
        eq(users.id, userId),
        isNull(users.deletedAt)
      )
    );
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

  async revokeAllUserSessions(userId: string, options?: { throwOnError?: boolean; tx?: any }): Promise<number> {
    // Revoke all sessions for a user by deleting them from the session store
    // Sessions are stored with userId in a dedicated column (not JSONB)
    const { sessions } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    // SECURITY: Default to fail-secure (throwOnError = true)
    // Critical operations like password changes MUST ensure session revocation succeeds
    const throwOnError = options?.throwOnError ?? true;
    const dbConnection = options?.tx || db; // Use transaction if provided, otherwise use global db

    try {
      // Delete all sessions using the native userId column (10-100x faster than JSONB extraction)
      // Foreign key uses SET NULL on user deletion to require explicit session revocation with audit logging
      const result = await dbConnection.delete(sessions).where(
        eq(sessions.userId, userId)
      ).returning({ sid: sessions.sid });

      const count = result.length;
      console.log(`Revoked ${count} session(s) for user: ${userId}`);
      return count;
    } catch (error) {
      console.error('SECURITY: Failed to revoke user sessions:', error);

      // Create audit log for failed session revocation
      // IMPORTANT: Use separate transaction for failure audit logs to ensure they persist
      // even when the parent transaction rolls back
      try {
        // Always use separate transaction for failure logs to ensure persistence
        const { auditLogs } = await import('@shared/schema');
        await db.insert(auditLogs).values({
          userId,
          action: 'session_revocation_failed',
          resourceType: 'user',
          resourceId: userId,
          details: JSON.stringify({
            error: String(error),
            securityContext: throwOnError ? 'password_sync' : 'general',
            timestamp: new Date().toISOString()
          }),
          ipAddress: '127.0.0.1',
          userAgent: 'System',
        });
      } catch (auditError) {
        // If audit logging fails, just log to console
        console.error('Failed to create audit log for session revocation failure:', auditError);
      }

      // For critical security operations (password changes), session revocation MUST succeed
      if (throwOnError) {
        // Schedule compensating transaction to clean up zombie sessions
        // This runs outside the main transaction to handle edge cases where
        // transaction rollback leaves orphaned sessions (e.g., network failures)
        this.scheduleZombieSessionCleanup(userId);
        throw new Error(`Failed to revoke sessions for user ${userId}: ${error}`);
      }

      // For non-critical operations, session revocation is best-effort
      return 0;
    }
  }

  async updateUserBackupCodes(userId: string, codes: string[]): Promise<void> {
    await db.update(users)
      .set({ backupCodes: codes })
      .where(eq(users.id, userId));
  }

  async createSecurityEvent(event: Omit<SecurityEvent, 'id' | 'createdAt'>): Promise<void> {
    // Validate event data with Zod schema before insertion
    // This ensures type safety and prevents invalid data from reaching the database
    try {
      const { createSecurityEventSchema } = await import('@shared/enhanced-auth-schema');
      const validated = createSecurityEventSchema.parse(event);
      await db.insert(securityEvents).values(validated);
    } catch (error) {
      // Log validation errors but don't propagate (fire-and-forget pattern)
      console.error('[security:audit] Failed to create security event:', error);
      throw error; // Re-throw to maintain error handling contract
    }
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
    // Store only the SHA-256 hash — the raw token lives solely in the emailed link.
    await db.insert(passwordResetTokens).values({
      userId: token.userId,
      tokenHash: hashToken(token.token),
      expiresAt: token.expiresAt,
      ipAddress: token.ipAddress ?? null,
      userAgent: token.userAgent ?? null,
    });
  }

  async findPasswordResetToken(token: string): Promise<any> {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
      .limit(1);
    return row ?? null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)));
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

  async updateUserRole(userId: string, organizationId: string, role: string): Promise<boolean> {
    try {
      // Use transaction with row-level locking to prevent race conditions (TOCTOU)
      // SELECT ... FOR UPDATE acquires an exclusive lock on the row, preventing
      // concurrent modifications until the transaction completes
      await db.transaction(async (tx) => {
        // Lock the row for update to prevent concurrent role changes
        await tx.execute(sql`
          SELECT * FROM ${userOrganizations}
          WHERE ${userOrganizations.userId} = ${userId}
          AND ${userOrganizations.organizationId} = ${organizationId}
          FOR UPDATE
        `);

        // Now update the role within the same transaction
        await tx.update(userOrganizations)
          .set({ role })
          .where(and(
            eq(userOrganizations.userId, userId),
            eq(userOrganizations.organizationId, organizationId)
          ));
      });
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

  /**
   * Optimized method to fetch users with team memberships in a single query to avoid N+1 problem
   * This replaces the individual getUserTeams calls for each user
   */
  async getUsersWithTeamMembershipsByOrganization(organizationId: string, filters?: {
    search?: string;
    role?: string;
    excludeTeam?: string;
    season?: string;
  }): Promise<any[]> {
    console.log('Using optimized getUsersWithTeamMembershipsByOrganization query');

    // Build WHERE conditions for user filtering
    const userConditions = [eq(userOrganizations.organizationId, organizationId)];

    if (filters?.role) {
      userConditions.push(eq(userOrganizations.role, filters.role));
    }

    if (filters?.search) {
      const searchLower = `%${filters.search.toLowerCase()}%`;
      userConditions.push(
        or(
          sql`LOWER(${users.firstName}) LIKE ${searchLower}`,
          sql`LOWER(${users.lastName}) LIKE ${searchLower}`,
          sql`LOWER(${users.firstName} || ' ' || ${users.lastName}) LIKE ${searchLower}`
        )!
      );
    }

    // Step 1: Get all users in the organization
    const usersQuery = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        fullName: users.fullName,
        emails: users.emails,
        birthDate: users.birthDate,
        birthYear: users.birthYear,
        graduationYear: users.graduationYear,
        school: users.school,
        phoneNumbers: users.phoneNumbers,
        sports: users.sports,
        positions: users.positions,
        height: users.height,
        weight: users.weight,
        gender: users.gender,
        role: userOrganizations.role,
        createdAt: users.createdAt
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...userConditions))
      .orderBy(asc(users.lastName), asc(users.firstName));

    if (usersQuery.length === 0) {
      return [];
    }

    const userIds = usersQuery.map((user: any) => user.id);

    // Step 2: Get all team memberships for these users in a single query
    const teamMembershipConditions = [
      inArray(userTeams.userId, userIds),
      eq(userTeams.isActive, true),
      eq(teams.isArchived, false)
    ];

    if (filters?.excludeTeam) {
      teamMembershipConditions.push(ne(teams.id, filters.excludeTeam));
    }

    if (filters?.season) {
      teamMembershipConditions.push(eq(userTeams.season, filters.season));
    }

    const teamMemberships = await db
      .select({
        userId: userTeams.userId,
        teamId: userTeams.teamId,
        teamName: teams.name,
        isActive: userTeams.isActive,
        season: userTeams.season,
        joinedAt: userTeams.joinedAt,
        leftAt: userTeams.leftAt
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(and(...teamMembershipConditions));

    // Step 3: Group team memberships by user ID for efficient lookup
    const membershipsByUser = new Map<string, any[]>();
    teamMemberships.forEach((membership: any) => {
      if (!membershipsByUser.has(membership.userId)) {
        membershipsByUser.set(membership.userId, []);
      }
      membershipsByUser.get(membership.userId)!.push({
        teamId: membership.teamId,
        teamName: membership.teamName,
        isActive: membership.isActive,
        season: membership.season,
        joinedAt: membership.joinedAt,
        leftAt: membership.leftAt
      });
    });

    // Step 4: Combine users with their team memberships
    const result = usersQuery.map((user: any) => ({
      ...user,
      teamMemberships: membershipsByUser.get(user.id) || []
    }));

    // Apply post-query filters if needed
    let filteredResult = result;

    if (filters?.excludeTeam) {
      filteredResult = result.filter((user: any) => {
        // Exclude users who are active members of the excluded team
        const isOnExcludedTeam = user.teamMemberships.some((membership: any) =>
          membership.teamId === filters.excludeTeam && membership.isActive === true
        );
        return !isOnExcludedTeam;
      });
    }

    if (filters?.season) {
      filteredResult = filteredResult.filter((user: any) => {
        // If no team memberships, include the user
        if (!user.teamMemberships || user.teamMemberships.length === 0) {
          return true;
        }
        // Check if user has any membership in the specified season
        return user.teamMemberships.some((membership: any) =>
          membership.season === filters.season || !membership.season
        );
      });
    }

    console.log(`Optimized query returned ${filteredResult.length} users with team memberships`);
    return filteredResult;
  }

  // Audit Logging
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values(log).returning();
    return auditLog;
  }

  async getAuditLogs(filters?: { userId?: string; action?: string; limit?: number }): Promise<AuditLog[]> {
    const limit = filters?.limit || 100;
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }

    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }

    const query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }

    return await query;
  }

  /**
   * Schedule a compensating transaction to clean up zombie sessions
   * This provides defense-in-depth for the rare case where:
   * 1. Session revocation fails during a password change transaction
   * 2. Transaction rollback succeeds BUT sessions weren't actually deleted
   *    (e.g., network partition, database failover, etc.)
   * 3. User sessions remain active despite failed password change
   *
   * The cleanup runs asynchronously to avoid blocking the main transaction failure path.
   * Uses exponential backoff (5s, 15s, 45s) to handle transient failures.
   */
  private scheduleZombieSessionCleanup(userId: string): void {
    const attemptCleanup = async (attempt: number = 1): Promise<void> => {
      const maxAttempts = 3;
      const backoffDelays = [5000, 15000, 45000]; // 5s, 15s, 45s

      try {
        // Wait before attempting cleanup (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, backoffDelays[attempt - 1]));

        console.log(`SECURITY: Attempting zombie session cleanup for user ${userId} (attempt ${attempt}/${maxAttempts})`);

        // Attempt to revoke sessions outside transaction context
        const revokedCount = await this.revokeAllUserSessions(userId, { throwOnError: false });

        if (revokedCount > 0) {
          console.warn(`SECURITY: Cleaned up ${revokedCount} zombie session(s) for user ${userId}`);

          // Create audit log for successful cleanup
          await this.createAuditLog({
            userId,
            action: 'zombie_sessions_cleaned',
            resourceType: 'user',
            resourceId: userId,
            details: JSON.stringify({
              revokedCount,
              attempt,
              timestamp: new Date().toISOString(),
              reason: 'Compensating cleanup after failed session revocation'
            }),
            ipAddress: '127.0.0.1',
            userAgent: 'System',
          });
        } else {
          console.log(`SECURITY: No zombie sessions found for user ${userId} on attempt ${attempt}`);
        }
      } catch (error) {
        console.error(`SECURITY: Zombie session cleanup attempt ${attempt} failed for user ${userId}:`, error);

        // Retry with exponential backoff if not at max attempts
        if (attempt < maxAttempts) {
          console.log(`SECURITY: Scheduling retry ${attempt + 1}/${maxAttempts} for zombie session cleanup`);
          attemptCleanup(attempt + 1);
        } else {
          console.error(`SECURITY CRITICAL: Failed to clean up zombie sessions after ${maxAttempts} attempts for user ${userId}`);

          // Final failure audit log (best effort - don't await)
          this.createAuditLog({
            userId,
            action: 'zombie_cleanup_failed',
            resourceType: 'user',
            resourceId: userId,
            details: JSON.stringify({
              attempts: maxAttempts,
              lastError: String(error),
              timestamp: new Date().toISOString(),
              recommendation: 'Manual session cleanup required'
            }),
            ipAddress: '127.0.0.1',
            userAgent: 'System',
          }).catch(err => console.error('Failed to log zombie cleanup failure:', err));
        }
      }
    };

    // Start async cleanup (non-blocking)
    attemptCleanup(1);
  }

  // ========================================================================
  // SITE METRICS (Master Metric Catalog)
  // ========================================================================

  async getSiteMetrics(filters?: { includeInactive?: boolean; orgType?: OrganizationType }): Promise<SiteMetric[]> {
    const conditions = [];

    if (!filters?.includeInactive) {
      conditions.push(eq(siteMetrics.isActive, true));
    }

    // Filter by organization type if provided
    // Metrics are available if availableOrgTypes is NULL (available to all) or contains the specified org type
    if (filters?.orgType) {
      conditions.push(
        or(
          isNull(siteMetrics.availableOrgTypes),
          arrayContains(siteMetrics.availableOrgTypes, [filters.orgType])
        )!
      );
    }

    const results = await db
      .select()
      .from(siteMetrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(siteMetrics.displayOrder), asc(siteMetrics.label));

    return results;
  }

  async getSiteMetric(code: string): Promise<SiteMetric | undefined> {
    const [metric] = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, code))
      .limit(1);

    return metric;
  }

  async createSiteMetric(metric: InsertSiteMetric, createdBy: string): Promise<SiteMetric> {
    try {
      const [created] = await db
        .insert(siteMetrics)
        .values({
          ...metric,
          // Convert numeric validation values to strings for decimal columns
          validationMin: metric.validationMin !== undefined ? String(metric.validationMin) : undefined,
          validationMax: metric.validationMax !== undefined ? String(metric.validationMax) : undefined,
          createdBy,
          createdAt: new Date(),
        })
        .returning();

      return created;
    } catch (error: any) {
      // Handle unique constraint violation (duplicate metric code)
      if (getPgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new Error(`Metric with code ${metric.code} already exists`);
      }
      throw error;
    }
  }

  async updateSiteMetric(code: string, metric: Partial<UpdateSiteMetric>): Promise<SiteMetric> {
    const [updated] = await db
      .update(siteMetrics)
      .set({
        ...metric,
        // Convert numeric validation values to strings for decimal columns
        validationMin: metric.validationMin !== undefined ? String(metric.validationMin) : undefined,
        validationMax: metric.validationMax !== undefined ? String(metric.validationMax) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(siteMetrics.code, code))
      .returning();

    if (!updated) {
      throw new Error(`Site metric with code ${code} not found`);
    }

    return updated;
  }

  async toggleSiteMetricStatus(code: string, isActive: boolean): Promise<SiteMetric> {
    const [updated] = await db
      .update(siteMetrics)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(siteMetrics.code, code))
      .returning();

    if (!updated) {
      throw new Error(`Site metric with code ${code} not found`);
    }

    return updated;
  }

  async deleteSiteMetric(code: string): Promise<void> {
    // Check if metric is a system default (cannot be deleted)
    const [metric] = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, code))
      .limit(1);

    if (!metric) {
      throw new Error(`Site metric with code ${code} not found`);
    }

    if (metric.isSystemDefault) {
      throw new Error(`Cannot delete system default metric: ${code}`);
    }

    // Check if metric is used in any measurements
    const [measurementCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(measurements)
      .where(eq(measurements.metric, code));

    if (measurementCount.count > 0) {
      throw new Error(
        `Cannot delete metric ${code}: ${measurementCount.count} measurement(s) exist. ` +
        `Disable the metric instead to hide it from new measurements.`
      );
    }

    // Delete the metric (this will cascade to organization_metrics)
    await db.delete(siteMetrics).where(eq(siteMetrics.code, code));
  }

  // ========================================================================
  // ORGANIZATION METRICS (Org-level metric enablement)
  // ========================================================================

  async getOrganizationMetrics(
    organizationId: string,
    filters?: { enabledOnly?: boolean }
  ): Promise<(OrganizationMetric & { siteMetric: SiteMetric })[]> {
    const conditions = [
      eq(organizationMetrics.organizationId, organizationId),
      eq(siteMetrics.isActive, true) // Only return metrics that are active at site level
    ];

    if (filters?.enabledOnly) {
      conditions.push(eq(organizationMetrics.isEnabled, true));
    }

    const results = await db
      .select()
      .from(organizationMetrics)
      .innerJoin(siteMetrics, eq(organizationMetrics.metricCode, siteMetrics.code))
      .where(and(...conditions))
      .orderBy(
        asc(organizationMetrics.displayOrder),
        asc(siteMetrics.displayOrder),
        asc(siteMetrics.label)
      );

    return results.map(row => ({
      ...row.organization_metrics,
      siteMetric: row.site_metrics,
    }));
  }

  async getOrganizationMetric(
    organizationId: string,
    metricCode: string
  ): Promise<OrganizationMetric | undefined> {
    const [result] = await db
      .select()
      .from(organizationMetrics)
      .where(
        and(
          eq(organizationMetrics.organizationId, organizationId),
          eq(organizationMetrics.metricCode, metricCode)
        )
      )
      .limit(1);

    return result;
  }

  async enableMetricForOrganization(
    organizationId: string,
    metricCode: string
  ): Promise<OrganizationMetric> {
    // Check if already exists
    const existing = await this.getOrganizationMetric(organizationId, metricCode);

    if (existing) {
      // Update to enabled if it exists
      return this.updateOrganizationMetric(organizationId, metricCode, { isEnabled: true });
    }

    // Create new entry
    const [created] = await db
      .insert(organizationMetrics)
      .values({
        organizationId,
        metricCode,
        isEnabled: true,
        createdAt: new Date(),
      })
      .returning();

    return created;
  }

  async disableMetricForOrganization(
    organizationId: string,
    metricCode: string
  ): Promise<OrganizationMetric> {
    return this.updateOrganizationMetric(organizationId, metricCode, { isEnabled: false });
  }

  async updateOrganizationMetric(
    organizationId: string,
    metricCode: string,
    data: Partial<UpdateOrganizationMetric>
  ): Promise<OrganizationMetric> {
    const [updated] = await db
      .update(organizationMetrics)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationMetrics.organizationId, organizationId),
          eq(organizationMetrics.metricCode, metricCode)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(
        `Organization metric not found for org ${organizationId} and metric ${metricCode}`
      );
    }

    return updated;
  }

  async bulkEnableMetricsForOrganization(
    organizationId: string,
    metricCodes: string[]
  ): Promise<OrganizationMetric[]> {
    // Use transaction to ensure atomicity
    return await db.transaction(async (tx: any) => {
      // Validate all metrics exist and are active in a single query
      const activeMetrics = await tx
        .select()
        .from(siteMetrics)
        .where(
          and(
            inArray(siteMetrics.code, metricCodes),
            eq(siteMetrics.isActive, true)
          )
        );

      // Check if all requested metrics were found and are active
      if (activeMetrics.length !== metricCodes.length) {
        const foundCodes = activeMetrics.map((m: any) => m.code);
        const missingCodes = metricCodes.filter(code => !foundCodes.includes(code));
        throw new Error(
          `Some metrics are not found or not active: ${missingCodes.join(', ')}`
        );
      }

      // Enable each metric (upsert to handle existing records)
      const results: OrganizationMetric[] = [];
      for (const metricCode of metricCodes) {
        // Check if already exists
        const [existing] = await tx
          .select()
          .from(organizationMetrics)
          .where(
            and(
              eq(organizationMetrics.organizationId, organizationId),
              eq(organizationMetrics.metricCode, metricCode)
            )
          )
          .limit(1);

        if (existing) {
          // Update to enabled if it exists
          const [updated] = await tx
            .update(organizationMetrics)
            .set({
              isEnabled: true,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(organizationMetrics.organizationId, organizationId),
                eq(organizationMetrics.metricCode, metricCode)
              )
            )
            .returning();
          results.push(updated);
        } else {
          // Create new entry
          const [created] = await tx
            .insert(organizationMetrics)
            .values({
              organizationId,
              metricCode,
              isEnabled: true,
              createdAt: new Date(),
            })
            .returning();
          results.push(created);
        }
      }

      return results;
    });
  }

  // ========================================================================
  // SITE BENCHMARKS (Master benchmark catalog)
  // ========================================================================

  async getSiteBenchmarks(filters?: { includeInactive?: boolean; orgType?: OrganizationType }): Promise<SiteBenchmark[]> {
    const conditions = [];

    if (!filters?.includeInactive) {
      conditions.push(eq(siteBenchmarks.isActive, true));
    }

    // Filter by organization type if provided
    // Benchmarks are applicable if applicableOrgTypes is NULL (applicable to all) or contains the specified org type
    if (filters?.orgType) {
      conditions.push(
        or(
          isNull(siteBenchmarks.applicableOrgTypes),
          arrayContains(siteBenchmarks.applicableOrgTypes, [filters.orgType])
        )!
      );
    }

    const results = await db
      .select()
      .from(siteBenchmarks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(siteBenchmarks.displayOrder), asc(siteBenchmarks.name));

    return results;
  }

  async getSiteBenchmark(id: string): Promise<SiteBenchmark | undefined> {
    const [benchmark] = await db
      .select()
      .from(siteBenchmarks)
      .where(eq(siteBenchmarks.id, id))
      .limit(1);

    return benchmark;
  }

  async getSiteBenchmarksByIds(ids: string[]): Promise<SiteBenchmark[]> {
    if (ids.length === 0) return [];

    const benchmarks = await db
      .select()
      .from(siteBenchmarks)
      .where(inArray(siteBenchmarks.id, ids));

    return benchmarks;
  }

  async getSiteBenchmarksByTierGroup(tierGroupId: string): Promise<SiteBenchmark[]> {
    const benchmarks = await db
      .select()
      .from(siteBenchmarks)
      .where(eq(siteBenchmarks.tierGroupId, tierGroupId))
      .orderBy(siteBenchmarks.tierOrder);

    return benchmarks;
  }

  async createSiteBenchmark(benchmark: InsertSiteBenchmark, createdBy: string, tx?: any): Promise<SiteBenchmark> {
    const dbInstance = tx || db;

    // Build insert values explicitly, only including fields with actual values
    // This prevents Drizzle from inserting NULL for undefined/null fields
    const insertValues: Partial<typeof siteBenchmarks.$inferInsert> = {
      // Required fields
      metricCode: benchmark.metricCode,
      name: benchmark.name,
      comparisonOperator: benchmark.comparisonOperator || 'lte',
      // Control flags with defaults
      // isSystemDefault is omitted from InsertSiteBenchmark type - always false for user-created
      isSystemDefault: false,
      isActive: benchmark.isActive ?? true,
      displayOrder: benchmark.displayOrder ?? 999,
      benchmarkSource: 'static', // User-created benchmarks are always 'static'
      // Metadata
      createdBy,
      createdAt: new Date(),
    };

    // Optional text fields - only include if provided
    if (benchmark.description !== undefined && benchmark.description !== null) {
      insertValues.description = benchmark.description;
    }
    if (benchmark.tierGroupId !== undefined && benchmark.tierGroupId !== null) {
      insertValues.tierGroupId = benchmark.tierGroupId;
    }
    if (benchmark.tierName !== undefined && benchmark.tierName !== null) {
      insertValues.tierName = benchmark.tierName;
    }
    if (benchmark.tierColor !== undefined && benchmark.tierColor !== null) {
      insertValues.tierColor = benchmark.tierColor;
    }
    if (benchmark.color !== undefined && benchmark.color !== null) {
      insertValues.color = benchmark.color;
    }
    if (benchmark.icon !== undefined && benchmark.icon !== null) {
      insertValues.icon = benchmark.icon;
    }
    if (benchmark.gender !== undefined && benchmark.gender !== null) {
      insertValues.gender = benchmark.gender;
    }
    if (benchmark.sport !== undefined && benchmark.sport !== null) {
      insertValues.sport = benchmark.sport;
    }
    if (benchmark.position !== undefined && benchmark.position !== null) {
      insertValues.position = benchmark.position;
    }
    if (benchmark.level !== undefined && benchmark.level !== null) {
      insertValues.level = benchmark.level;
    }

    // Optional numeric fields - convert to string for decimal precision
    if (benchmark.benchmarkValue !== undefined && benchmark.benchmarkValue !== null) {
      insertValues.benchmarkValue = Number(benchmark.benchmarkValue).toFixed(3);
    }
    if (benchmark.minValue !== undefined && benchmark.minValue !== null) {
      insertValues.minValue = Number(benchmark.minValue).toFixed(3);
    }
    if (benchmark.maxValue !== undefined && benchmark.maxValue !== null) {
      insertValues.maxValue = Number(benchmark.maxValue).toFixed(3);
    }
    if (benchmark.tierOrder !== undefined && benchmark.tierOrder !== null) {
      insertValues.tierOrder = benchmark.tierOrder;
    }
    if (benchmark.ageMin !== undefined && benchmark.ageMin !== null) {
      insertValues.ageMin = benchmark.ageMin;
    }
    if (benchmark.ageMax !== undefined && benchmark.ageMax !== null) {
      insertValues.ageMax = benchmark.ageMax;
    }
    if (benchmark.peerPercentileTarget !== undefined && benchmark.peerPercentileTarget !== null) {
      insertValues.peerPercentileTarget = benchmark.peerPercentileTarget;
    }

    // Optional array/object fields
    if (benchmark.applicableOrgTypes !== undefined && benchmark.applicableOrgTypes !== null) {
      insertValues.applicableOrgTypes = benchmark.applicableOrgTypes;
    }
    if (benchmark.peerFilterCriteria !== undefined && benchmark.peerFilterCriteria !== null) {
      insertValues.peerFilterCriteria = benchmark.peerFilterCriteria;
    }

    const [created] = await dbInstance
      .insert(siteBenchmarks)
      .values(insertValues as typeof siteBenchmarks.$inferInsert)
      .returning();

    return created;
  }

  async updateSiteBenchmark(id: string, benchmark: Partial<UpdateSiteBenchmark>): Promise<SiteBenchmark> {
    const [updated] = await db
      .update(siteBenchmarks)
      .set({
        ...benchmark,
        // Convert numeric values to strings for decimal columns with proper precision
        benchmarkValue: benchmark.benchmarkValue !== undefined ? Number(benchmark.benchmarkValue).toFixed(3) : undefined,
        minValue: benchmark.minValue !== undefined ? Number(benchmark.minValue).toFixed(3) : undefined,
        maxValue: benchmark.maxValue !== undefined ? Number(benchmark.maxValue).toFixed(3) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(siteBenchmarks.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Site benchmark with id ${id} not found`);
    }

    return updated;
  }

  async toggleSiteBenchmarkStatus(id: string, isActive: boolean): Promise<SiteBenchmark> {
    const [updated] = await db
      .update(siteBenchmarks)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(siteBenchmarks.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Site benchmark with id ${id} not found`);
    }

    return updated;
  }

  async deleteSiteBenchmark(id: string): Promise<void> {
    // Delete the benchmark in a single query with WHERE clause checking isSystemDefault
    // This prevents TOCTOU race condition and ensures atomicity
    const deleted = await db
      .delete(siteBenchmarks)
      .where(
        and(
          eq(siteBenchmarks.id, id),
          eq(siteBenchmarks.isSystemDefault, false)
        )
      )
      .returning();

    if (!deleted || deleted.length === 0) {
      // Check if benchmark exists and is a system default
      const [benchmark] = await db
        .select()
        .from(siteBenchmarks)
        .where(eq(siteBenchmarks.id, id))
        .limit(1);

      if (!benchmark) {
        throw new Error(`Site benchmark with id ${id} not found`);
      }

      if (benchmark.isSystemDefault) {
        throw new Error(`Cannot delete system default benchmark: ${id}`);
      }

      // If we get here, something else prevented the delete
      throw new Error(`Failed to delete site benchmark: ${id}`);
    }
  }

  // ========================================================================
  // CUSTOM BENCHMARKS (Org-created benchmarks)
  // ========================================================================

  async getCustomBenchmarksForOrg(organizationId: string, filters?: { includeInactive?: boolean }): Promise<CustomBenchmark[]> {
    const conditions = [eq(customBenchmarks.organizationId, organizationId)];

    if (!filters?.includeInactive) {
      conditions.push(eq(customBenchmarks.isActive, true));
    }

    const results = await db
      .select()
      .from(customBenchmarks)
      .where(and(...conditions))
      .orderBy(asc(customBenchmarks.displayOrder), asc(customBenchmarks.name));

    return results;
  }

  async getCustomBenchmark(id: string): Promise<CustomBenchmark | undefined> {
    const result = await db
      .select()
      .from(customBenchmarks)
      .where(eq(customBenchmarks.id, id))
      .limit(1);

    return result[0];
  }

  async getCustomBenchmarksByTierGroup(organizationId: string, tierGroupId: string): Promise<CustomBenchmark[]> {
    const benchmarks = await db
      .select()
      .from(customBenchmarks)
      .where(
        and(
          eq(customBenchmarks.organizationId, organizationId),
          eq(customBenchmarks.tierGroupId, tierGroupId)
        )
      )
      .orderBy(customBenchmarks.tierOrder);

    return benchmarks;
  }

  async createCustomBenchmark(benchmark: InsertCustomBenchmark, createdBy: string): Promise<CustomBenchmark> {
    const [created] = await db
      .insert(customBenchmarks)
      .values({
        ...benchmark,
        // Convert numeric values to strings for decimal columns with proper precision
        benchmarkValue: benchmark.benchmarkValue !== undefined ? Number(benchmark.benchmarkValue).toFixed(3) : undefined,
        minValue: benchmark.minValue !== undefined ? Number(benchmark.minValue).toFixed(3) : undefined,
        maxValue: benchmark.maxValue !== undefined ? Number(benchmark.maxValue).toFixed(3) : undefined,
        createdBy,
        createdAt: new Date(),
      })
      .returning();

    return created;
  }

  async updateCustomBenchmark(organizationId: string, id: string, benchmark: Partial<UpdateCustomBenchmark>): Promise<CustomBenchmark> {
    const [updated] = await db
      .update(customBenchmarks)
      .set({
        ...benchmark,
        // Convert numeric values to strings for decimal columns with proper precision
        benchmarkValue: benchmark.benchmarkValue !== undefined ? Number(benchmark.benchmarkValue).toFixed(3) : undefined,
        minValue: benchmark.minValue !== undefined ? Number(benchmark.minValue).toFixed(3) : undefined,
        maxValue: benchmark.maxValue !== undefined ? Number(benchmark.maxValue).toFixed(3) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customBenchmarks.id, id),
          eq(customBenchmarks.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Custom benchmark with id ${id} not found for organization ${organizationId}`);
    }

    return updated;
  }

  async deleteCustomBenchmark(organizationId: string, id: string): Promise<void> {
    const result = await db
      .delete(customBenchmarks)
      .where(
        and(
          eq(customBenchmarks.id, id),
          eq(customBenchmarks.organizationId, organizationId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error(`Custom benchmark with id ${id} not found for organization ${organizationId}`);
    }
  }

  // ========================================================================
  // TIER GROUPS (for form dropdowns)
  // ========================================================================

  async getSiteTierGroups(metricCode?: string): Promise<Array<{ tierGroupId: string; metricCode: string; tierCount: number }>> {
    const conditions = [isNotNull(siteBenchmarks.tierGroupId)];

    if (metricCode) {
      conditions.push(eq(siteBenchmarks.metricCode, metricCode));
    }

    const results = await db
      .select({
        tierGroupId: siteBenchmarks.tierGroupId,
        metricCode: siteBenchmarks.metricCode,
        tierCount: sql<number>`count(*)`.as('tier_count'),
      })
      .from(siteBenchmarks)
      .where(and(...conditions))
      .groupBy(siteBenchmarks.tierGroupId, siteBenchmarks.metricCode);

    return results.map(r => ({
      tierGroupId: r.tierGroupId!,
      metricCode: r.metricCode,
      tierCount: Number(r.tierCount),
    }));
  }

  async getCustomTierGroups(organizationId: string, metricCode?: string): Promise<Array<{ tierGroupId: string; metricCode: string; tierCount: number }>> {
    const conditions = [
      eq(customBenchmarks.organizationId, organizationId),
      isNotNull(customBenchmarks.tierGroupId),
    ];

    if (metricCode) {
      conditions.push(eq(customBenchmarks.metricCode, metricCode));
    }

    const results = await db
      .select({
        tierGroupId: customBenchmarks.tierGroupId,
        metricCode: customBenchmarks.metricCode,
        tierCount: sql<number>`count(*)`.as('tier_count'),
      })
      .from(customBenchmarks)
      .where(and(...conditions))
      .groupBy(customBenchmarks.tierGroupId, customBenchmarks.metricCode);

    return results.map(r => ({
      tierGroupId: r.tierGroupId!,
      metricCode: r.metricCode,
      tierCount: Number(r.tierCount),
    }));
  }

  // Organization Benchmarks Enablement

  async getOrganizationBenchmarks(organizationId: string, filters?: { includeInactive?: boolean }): Promise<OrganizationBenchmark[]> {
    const conditions = [eq(organizationBenchmarks.organizationId, organizationId)];

    if (!filters?.includeInactive) {
      conditions.push(eq(organizationBenchmarks.isEnabled, true));
    }

    return await db
      .select()
      .from(organizationBenchmarks)
      .where(and(...conditions))
      .orderBy(asc(organizationBenchmarks.createdAt));
  }

  async getOrganizationBenchmarksWithDetails(organizationId: string, filters?: { includeInactive?: boolean }): Promise<OrganizationBenchmarkWithDetails[]> {
    const conditions = [eq(organizationBenchmarks.organizationId, organizationId)];

    if (!filters?.includeInactive) {
      conditions.push(eq(organizationBenchmarks.isEnabled, true));
    }

    // Fetch site benchmarks with JOIN
    const siteBenchmarksResults = await db
      .select({
        // Organization benchmark fields
        id: organizationBenchmarks.id,
        organizationId: organizationBenchmarks.organizationId,
        benchmarkId: organizationBenchmarks.benchmarkId,
        benchmarkType: organizationBenchmarks.benchmarkType,
        isEnabled: organizationBenchmarks.isEnabled,
        customName: organizationBenchmarks.customName,
        displayOrder: organizationBenchmarks.displayOrder,
        createdAt: organizationBenchmarks.createdAt,
        updatedAt: organizationBenchmarks.updatedAt,
        // Site benchmark details
        name: siteBenchmarks.name,
        metricCode: siteBenchmarks.metricCode,
        description: siteBenchmarks.description,
        benchmarkValue: siteBenchmarks.benchmarkValue,
        comparisonOperator: siteBenchmarks.comparisonOperator,
        minValue: siteBenchmarks.minValue,
        maxValue: siteBenchmarks.maxValue,
        gender: siteBenchmarks.gender,
        ageMin: siteBenchmarks.ageMin,
        ageMax: siteBenchmarks.ageMax,
        position: siteBenchmarks.position,
        level: siteBenchmarks.level,
        isActive: siteBenchmarks.isActive,
        tierGroupId: siteBenchmarks.tierGroupId,
        tierName: siteBenchmarks.tierName,
        tierOrder: siteBenchmarks.tierOrder,
        tierColor: siteBenchmarks.tierColor,
      })
      .from(organizationBenchmarks)
      .innerJoin(siteBenchmarks, eq(organizationBenchmarks.benchmarkId, siteBenchmarks.id))
      .where(and(
        eq(organizationBenchmarks.benchmarkType, 'site'),
        ...conditions
      ))
      .orderBy(asc(organizationBenchmarks.createdAt));

    // Fetch custom benchmarks with JOIN
    const customBenchmarksResults = await db
      .select({
        // Organization benchmark fields
        id: organizationBenchmarks.id,
        organizationId: organizationBenchmarks.organizationId,
        benchmarkId: organizationBenchmarks.benchmarkId,
        benchmarkType: organizationBenchmarks.benchmarkType,
        isEnabled: organizationBenchmarks.isEnabled,
        customName: organizationBenchmarks.customName,
        displayOrder: organizationBenchmarks.displayOrder,
        createdAt: organizationBenchmarks.createdAt,
        updatedAt: organizationBenchmarks.updatedAt,
        // Custom benchmark details
        name: customBenchmarks.name,
        metricCode: customBenchmarks.metricCode,
        description: customBenchmarks.description,
        benchmarkValue: customBenchmarks.benchmarkValue,
        comparisonOperator: customBenchmarks.comparisonOperator,
        minValue: customBenchmarks.minValue,
        maxValue: customBenchmarks.maxValue,
        gender: customBenchmarks.gender,
        ageMin: customBenchmarks.ageMin,
        ageMax: customBenchmarks.ageMax,
        position: customBenchmarks.position,
        level: customBenchmarks.level,
        isActive: customBenchmarks.isActive,
        tierGroupId: customBenchmarks.tierGroupId,
        tierName: customBenchmarks.tierName,
        tierOrder: customBenchmarks.tierOrder,
        tierColor: customBenchmarks.tierColor,
      })
      .from(organizationBenchmarks)
      .innerJoin(customBenchmarks, eq(organizationBenchmarks.benchmarkId, customBenchmarks.id))
      .where(and(
        eq(organizationBenchmarks.benchmarkType, 'custom'),
        ...conditions
      ))
      .orderBy(asc(organizationBenchmarks.createdAt));

    // Combine and format results
    const allResults = [...siteBenchmarksResults, ...customBenchmarksResults];

    // Convert to OrganizationBenchmarkWithDetails type
    return allResults.map(row => ({
      ...row,
      benchmarkValue: row.benchmarkValue ? Number(row.benchmarkValue) : null,
      minValue: row.minValue ? Number(row.minValue) : null,
      maxValue: row.maxValue ? Number(row.maxValue) : null,
      comparisonOperator: row.comparisonOperator as 'lte' | 'gte' | 'eq' | 'range',
      gender: row.gender as 'Male' | 'Female' | 'Not Specified' | null,
      level: row.level as 'college' | 'high_school' | 'club' | null,
    }));
  }

  async enableBenchmarkForOrg(organizationId: string, benchmarkId: string, benchmarkType: 'site' | 'custom'): Promise<OrganizationBenchmark> {
    // 1. Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(benchmarkId)) {
      throw new Error(`Invalid benchmark ID format: ${benchmarkId}`);
    }
    if (!uuidRegex.test(organizationId)) {
      throw new Error(`Invalid organization ID format: ${organizationId}`);
    }

    // 2. Validate that the benchmark exists and ownership (for custom)
    if (benchmarkType === 'site') {
      const benchmark = await this.getSiteBenchmark(benchmarkId);
      if (!benchmark) {
        throw new Error(`Site benchmark not found: ${benchmarkId}`);
      }
    } else {
      const benchmark = await this.getCustomBenchmark(benchmarkId);
      if (!benchmark) {
        throw new Error(`Custom benchmark not found: ${benchmarkId}`);
      }
      // CRITICAL: Verify ownership for custom benchmarks
      if (benchmark.organizationId !== organizationId) {
        throw new Error(`Custom benchmark ${benchmarkId} does not belong to organization ${organizationId}`);
      }
    }

    // Check if already exists
    const [existing] = await db
      .select()
      .from(organizationBenchmarks)
      .where(
        and(
          eq(organizationBenchmarks.organizationId, organizationId),
          eq(organizationBenchmarks.benchmarkId, benchmarkId),
          eq(organizationBenchmarks.benchmarkType, benchmarkType)
        )
      )
      .limit(1);

    if (existing) {
      // If already exists, just update to enabled
      const [updated] = await db
        .update(organizationBenchmarks)
        .set({
          isEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(organizationBenchmarks.id, existing.id))
        .returning();
      return updated;
    }

    // Use transaction with advisory lock to prevent race condition in display order assignment
    // Advisory lock ensures only one transaction at a time can assign display_order for this organization
    return await db.transaction(async (tx) => {
      // Acquire advisory lock for this organization (automatically released at transaction end)
      // Use hash of organizationId UUID to get a stable integer key
      const orgIdHash = organizationId.split('-').reduce((acc, part) => acc + parseInt(part, 16), 0);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${orgIdHash})`);

      // Now safely compute next display order (protected by advisory lock)
      const existingBenchmarks = await tx
        .select({ displayOrder: organizationBenchmarks.displayOrder })
        .from(organizationBenchmarks)
        .where(eq(organizationBenchmarks.organizationId, organizationId));

      // Compute max display order locally
      const maxDisplayOrder = existingBenchmarks.length > 0
        ? Math.max(...existingBenchmarks.map((b: { displayOrder: number | null }) => b.displayOrder ?? 0))
        : 0;

      const nextDisplayOrder = maxDisplayOrder + 1;

      // Create new enablement record with unique display order
      const [created] = await tx
        .insert(organizationBenchmarks)
        .values({
          organizationId,
          benchmarkId,
          benchmarkType,
          isEnabled: true,
          displayOrder: nextDisplayOrder,
          createdAt: new Date(),
        })
        .returning();

      return created;
    });
  }

  async disableBenchmarkForOrg(organizationId: string, benchmarkId: string, benchmarkType: 'site' | 'custom'): Promise<OrganizationBenchmark> {
    const [updated] = await db
      .update(organizationBenchmarks)
      .set({
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationBenchmarks.organizationId, organizationId),
          eq(organizationBenchmarks.benchmarkId, benchmarkId),
          eq(organizationBenchmarks.benchmarkType, benchmarkType)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Organization benchmark not found for organization ${organizationId} and benchmark ${benchmarkId}`);
    }

    return updated;
  }

  async updateOrganizationBenchmarkSettings(organizationId: string, benchmarkId: string, benchmarkType: 'site' | 'custom', settings: Partial<UpdateOrganizationBenchmark>): Promise<OrganizationBenchmark> {
    const [updated] = await db
      .update(organizationBenchmarks)
      .set({
        ...settings,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationBenchmarks.organizationId, organizationId),
          eq(organizationBenchmarks.benchmarkId, benchmarkId),
          eq(organizationBenchmarks.benchmarkType, benchmarkType)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Organization benchmark not found for organization ${organizationId} and benchmark ${benchmarkId}`);
    }

    return updated;
  }

  // Evaluation Queries

  async getApplicableBenchmarks(
    organizationId: string,
    metricCode: string,
    athleteAttributes: {
      gender?: string;
      age?: number;
      sport?: string;
      position?: string;
      level?: string;
    }
  ): Promise<(SiteBenchmark | CustomBenchmark)[]> {
    // Build filter conditions for athlete attributes
    const buildAttributeFilters = (tableName: typeof siteBenchmarks | typeof customBenchmarks) => {
      const conditions: SQL[] = [
        eq(tableName.metricCode, metricCode),
        eq(tableName.isActive, true)
      ];

      // Gender filter: NULL OR matches
      if (athleteAttributes.gender) {
        conditions.push(
          or(
            isNull(tableName.gender),
            eq(tableName.gender, athleteAttributes.gender)
          )!
        );
      }

      // Age filter: (ageMin IS NULL OR ageMin <= age) AND (ageMax IS NULL OR ageMax >= age)
      // Business Rule: If athlete age is undefined/NULL (no birth year), age-constrained
      // benchmarks will NOT match. Only benchmarks with NULL age bounds will match.
      // This ensures we don't compare athletes without age data against age-specific targets.
      if (athleteAttributes.age !== undefined) {
        conditions.push(
          or(
            isNull(tableName.ageMin),
            lte(tableName.ageMin, athleteAttributes.age)
          )!
        );
        conditions.push(
          or(
            isNull(tableName.ageMax),
            gte(tableName.ageMax, athleteAttributes.age)
          )!
        );
      }

      // Sport filter: NULL OR matches
      if (athleteAttributes.sport) {
        conditions.push(
          or(
            isNull(tableName.sport),
            eq(tableName.sport, athleteAttributes.sport)
          )!
        );
      }

      // Position filter: NULL OR matches
      if (athleteAttributes.position) {
        conditions.push(
          or(
            isNull(tableName.position),
            eq(tableName.position, athleteAttributes.position)
          )!
        );
      }

      // Level filter: NULL OR matches
      if (athleteAttributes.level) {
        conditions.push(
          or(
            isNull(tableName.level),
            eq(tableName.level, athleteAttributes.level)
          )!
        );
      }

      return conditions;
    };

    // Get enabled site benchmarks for this organization
    const enabledSiteBenchmarks = await db
      .select({
        benchmark: siteBenchmarks,
        orgBenchmark: organizationBenchmarks
      })
      .from(organizationBenchmarks)
      .innerJoin(
        siteBenchmarks,
        and(
          eq(organizationBenchmarks.benchmarkId, siteBenchmarks.id),
          eq(organizationBenchmarks.benchmarkType, 'site')
        )
      )
      .where(
        and(
          eq(organizationBenchmarks.organizationId, organizationId),
          eq(organizationBenchmarks.isEnabled, true),
          ...buildAttributeFilters(siteBenchmarks)
        )
      );

    // Get enabled custom benchmarks for this organization
    const enabledCustomBenchmarks = await db
      .select({
        benchmark: customBenchmarks,
        orgBenchmark: organizationBenchmarks
      })
      .from(organizationBenchmarks)
      .innerJoin(
        customBenchmarks,
        and(
          eq(organizationBenchmarks.benchmarkId, customBenchmarks.id),
          eq(organizationBenchmarks.benchmarkType, 'custom')
        )
      )
      .where(
        and(
          eq(organizationBenchmarks.organizationId, organizationId),
          eq(organizationBenchmarks.isEnabled, true),
          eq(customBenchmarks.organizationId, organizationId), // Security: ensure custom benchmark belongs to org
          ...buildAttributeFilters(customBenchmarks)
        )
      );

    // Combine results (UNION)
    const allBenchmarks = [
      ...enabledSiteBenchmarks.map(row => row.benchmark),
      ...enabledCustomBenchmarks.map(row => row.benchmark)
    ];

    return allBenchmarks;
  }

  // ==================== Site Settings ====================

  async getSiteSettings(): Promise<SiteSettings | undefined> {
    const [settings] = await db.select().from(siteSettings).limit(1);
    return settings || undefined;
  }

  async updateSiteSettings(settings: {
    aiModel?: string;
    wellnessModuleEnabled?: boolean;
    sprintFvEnabled?: boolean;
    updatedBy: string | null;
  }): Promise<SiteSettings> {
    // Singleton pattern - check if settings exist
    const existing = await this.getSiteSettings();

    if (existing) {
      // Update existing settings - only update fields that are provided
      const updateData: any = {
        updatedAt: new Date(),
        updatedBy: settings.updatedBy,
      };

      if (settings.aiModel !== undefined) {
        updateData.aiModel = settings.aiModel;
      }

      if (settings.wellnessModuleEnabled !== undefined) {
        updateData.wellnessModuleEnabled = settings.wellnessModuleEnabled;
      }

      if (settings.sprintFvEnabled !== undefined) {
        updateData.sprintFvEnabled = settings.sprintFvEnabled;
      }

      const [updated] = await db
        .update(siteSettings)
        .set(updateData)
        .where(eq(siteSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new settings
      const [created] = await db
        .insert(siteSettings)
        .values({
          aiModel: settings.aiModel || 'gpt-5-nano',
          wellnessModuleEnabled: settings.wellnessModuleEnabled ?? true,
          sprintFvEnabled: settings.sprintFvEnabled ?? false,
          updatedBy: settings.updatedBy,
        })
        .returning();
      return created;
    }
  }

  // ==================== Reports ====================

  async getReport(id: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report || undefined;
  }

  async updateReport(id: string, data: Partial<Report>): Promise<Report> {
    const [updated] = await db
      .update(reports)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Report ${id} not found`);
    }

    return updated;
  }

  // ==================== Wellness Templates ====================
  // Delegated to WellnessRepository for maintainability

  async createWellnessTemplate(template: Partial<WellnessTemplate>): Promise<WellnessTemplate> {
    return wellnessRepository.createWellnessTemplate(template);
  }

  async getWellnessTemplates(organizationId: string, filters?: { activeOnly?: boolean }): Promise<WellnessTemplate[]> {
    return wellnessRepository.getWellnessTemplates(organizationId, filters);
  }

  async getWellnessTemplate(id: string): Promise<WellnessTemplate | undefined> {
    return wellnessRepository.getWellnessTemplate(id);
  }

  async updateWellnessTemplate(id: string, template: Partial<WellnessTemplate>): Promise<WellnessTemplate> {
    return wellnessRepository.updateWellnessTemplate(id, template);
  }

  async deleteWellnessTemplate(id: string): Promise<void> {
    return wellnessRepository.deleteWellnessTemplate(id);
  }

  // ==================== System Wellness Templates (Admin) ====================
  // Delegated to WellnessRepository

  async getSystemWellnessTemplates(): Promise<WellnessTemplate[]> {
    return wellnessRepository.getSystemWellnessTemplates();
  }

  async getSystemTemplateUsage(templateId: string): Promise<{ templateId: string; organizationCount: number; cloneCount: number }> {
    return wellnessRepository.getSystemTemplateUsage(templateId);
  }

  async createSystemWellnessTemplate(template: Partial<WellnessTemplate>): Promise<WellnessTemplate> {
    return wellnessRepository.createSystemWellnessTemplate(template);
  }

  async updateSystemWellnessTemplate(id: string, template: Partial<WellnessTemplate>): Promise<WellnessTemplate> {
    return wellnessRepository.updateSystemWellnessTemplate(id, template);
  }

  async deleteSystemWellnessTemplate(id: string): Promise<void> {
    return wellnessRepository.deleteSystemWellnessTemplate(id);
  }

  // ==================== Wellness Requests ====================
  // Delegated to WellnessRepository for maintainability

  async createWellnessRequest(request: Partial<WellnessRequest>): Promise<WellnessRequest> {
    return wellnessRepository.createWellnessRequest(request);
  }

  async getWellnessRequests(organizationId: string, filters?: { status?: string }): Promise<WellnessRequest[]> {
    return wellnessRepository.getWellnessRequests(organizationId, filters);
  }

  async getWellnessRequestsByOrganizations(
    organizationIds: string[],
    filters?: { status?: string }
  ): Promise<WellnessRequest[]> {
    return wellnessRepository.getWellnessRequestsByOrganizations(organizationIds, filters);
  }

  async getWellnessRequest(id: string): Promise<WellnessRequest | undefined> {
    return wellnessRepository.getWellnessRequest(id);
  }

  async getWellnessRequestByToken(token: string): Promise<WellnessRequest | undefined> {
    return wellnessRepository.getWellnessRequestByToken(token);
  }

  async updateWellnessRequest(id: string, request: Partial<WellnessRequest>): Promise<WellnessRequest> {
    return wellnessRepository.updateWellnessRequest(id, request);
  }

  async deleteWellnessRequest(id: string): Promise<void> {
    return wellnessRepository.deleteWellnessRequest(id);
  }

  // ==================== Wellness Responses ====================
  // Delegated to WellnessRepository for maintainability

  async createWellnessResponse(response: Partial<WellnessResponse>): Promise<WellnessResponse> {
    return wellnessRepository.createWellnessResponse(response);
  }

  async getWellnessResponse(id: string): Promise<WellnessResponse | undefined> {
    return wellnessRepository.getWellnessResponse(id);
  }

  async getWellnessResponsesByAthlete(userId: string, filters?: { startDate?: string; endDate?: string }): Promise<WellnessResponse[]> {
    return wellnessRepository.getWellnessResponsesByAthlete(userId, filters);
  }

  async getWellnessResponsesByOrganization(organizationId: string, filters?: { startDate?: string; endDate?: string }): Promise<WellnessResponse[]> {
    return wellnessRepository.getWellnessResponsesByOrganization(organizationId, filters);
  }

  // ==================== Wellness Batch Operations (Performance Optimization) ====================
  // Delegated to WellnessRepository for maintainability

  /**
   * Batch fetch all team rosters for an organization in a single query
   * Optimizes dashboard performance by avoiding N+1 queries
   */
  async getTeamRostersBatch(organizationId: string): Promise<Array<{ teamId: string; userId: string; userFullName: string }>> {
    return wellnessRepository.getTeamRostersBatch(organizationId);
  }

  /**
   * Batch fetch multiple wellness templates in a single query
   * Optimizes dashboard performance by avoiding sequential template lookups
   */
  async getWellnessTemplatesBatch(templateIds: string[]): Promise<WellnessTemplate[]> {
    return wellnessRepository.getWellnessTemplatesBatch(templateIds);
  }

  // ==================== Wellness Analytics ====================
  // Delegated to WellnessRepository for maintainability

  async getTeamWellnessSummary(teamId: string, filters: { startDate: string; endDate: string }): Promise<any> {
    return wellnessRepository.getTeamWellnessSummary(teamId, filters);
  }

  async getAthleteWellnessSummary(userId: string, filters: { startDate: string; endDate: string }): Promise<any> {
    return wellnessRepository.getAthleteWellnessSummary(userId, filters);
  }

  /**
   * Get wellness trends aggregated at database level using PostgreSQL JSON functions
   */
  async getWellnessTrends(organizationId: string, filters: { startDate: string; endDate: string; questionIds?: string[] }): Promise<WellnessTrend[]> {
    return wellnessRepository.getWellnessTrends(organizationId, filters);
  }

  /**
   * Calculate accurate completion rate for a wellness request
   */
  async getRequestCompletionRate(
    organizationId: string,
    requestId: string
  ): Promise<{ completed: number; total: number; percentage: number }> {
    return wellnessRepository.getRequestCompletionRate(organizationId, requestId);
  }

  // Goals
  async getGoalsByUser(userId: string, filters?: { status?: typeof goalStatusEnum[number] }): Promise<Goal[]> {
    const conditions: SQL[] = [eq(goals.userId, userId)];

    if (filters?.status) {
      conditions.push(eq(goals.status, filters.status));
    }

    return await db
      .select()
      .from(goals)
      .where(and(...conditions))
      .orderBy(desc(goals.createdAt));
  }

  async getGoal(id: string): Promise<Goal | undefined> {
    const [goal] = await db
      .select()
      .from(goals)
      .where(eq(goals.id, id));

    return goal || undefined;
  }

  async createGoal(goal: InsertGoal): Promise<Goal> {
    const [newGoal] = await db
      .insert(goals)
      .values({
        userId: goal.userId,
        metric: goal.metric,
        goalType: goal.goalType,
        targetValue: goal.targetValue.toString(),
        baselineValue: goal.baselineValue.toString(),
        currentValue: (goal.currentValue ?? goal.baselineValue).toString(),
        targetDate: goal.targetDate,
        status: goal.status,
        notes: goal.notes,
      })
      .returning();

    return newGoal;
  }

  async updateGoal(id: string, userId: string, goal: Partial<UpdateGoal> & { achievedAt?: Date }): Promise<Goal> {
    // Build the update object, converting numbers to strings for decimal columns
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (goal.metric !== undefined) updateData.metric = goal.metric;
    if (goal.goalType !== undefined) updateData.goalType = goal.goalType;
    if (goal.targetValue !== undefined) updateData.targetValue = goal.targetValue.toString();
    if (goal.baselineValue !== undefined) updateData.baselineValue = goal.baselineValue.toString();
    if (goal.currentValue !== undefined) updateData.currentValue = goal.currentValue.toString();
    if (goal.targetDate !== undefined) updateData.targetDate = goal.targetDate;
    if (goal.status !== undefined) updateData.status = goal.status;
    if (goal.notes !== undefined) updateData.notes = goal.notes;
    if (goal.achievedAt !== undefined) updateData.achievedAt = goal.achievedAt;

    const [updatedGoal] = await db
      .update(goals)
      .set(updateData)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning();

    if (!updatedGoal) {
      throw new Error(`Goal with id ${id} not found or access denied`);
    }

    return updatedGoal;
  }

  async deleteGoal(id: string, userId: string): Promise<void> {
    const result = await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId))).returning();
    if (result.length === 0) {
      throw new Error(`Goal with id ${id} not found or access denied`);
    }
  }

  // Achievement methods
  async getAchievementDefinitions(filters?: { isActive?: boolean }): Promise<AchievementDefinition[]> {
    const conditions: SQL[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(achievementDefinitions.isActive, filters.isActive));
    }

    return await db
      .select()
      .from(achievementDefinitions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(achievementDefinitions.category, achievementDefinitions.createdAt);
  }

  async getAchievementDefinitionByCode(code: string): Promise<AchievementDefinition | undefined> {
    const [definition] = await db
      .select()
      .from(achievementDefinitions)
      .where(eq(achievementDefinitions.code, code))
      .limit(1);

    return definition || undefined;
  }

  async getUserAchievements(userId: string, organizationId: string): Promise<(UserAchievement & { achievement: AchievementDefinition })[]> {
    return await db
      .select({
        id: userAchievements.id,
        userId: userAchievements.userId,
        organizationId: userAchievements.organizationId,
        achievementId: userAchievements.achievementId,
        unlockedAt: userAchievements.unlockedAt,
        metadata: userAchievements.metadata,
        achievement: achievementDefinitions,
      })
      .from(userAchievements)
      .innerJoin(achievementDefinitions, eq(userAchievements.achievementId, achievementDefinitions.id))
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.organizationId, organizationId)
      ))
      .orderBy(desc(userAchievements.unlockedAt));
  }

  async checkAchievementExists(userId: string, organizationId: string, achievementCode: string): Promise<boolean> {
    const definition = await this.getAchievementDefinitionByCode(achievementCode);
    if (!definition) {
      return false;
    }

    const [existing] = await db
      .select()
      .from(userAchievements)
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.organizationId, organizationId),
        eq(userAchievements.achievementId, definition.id)
      ))
      .limit(1);

    return !!existing;
  }

  async awardAchievement(
    userId: string,
    organizationId: string,
    achievementCode: string,
    metadata?: any
  ): Promise<UserAchievement> {
    // Validate user belongs to organization
    const userOrgs = await this.getUserOrganizations(userId);
    const belongsToOrg = userOrgs.some(uo => uo.organizationId === organizationId);
    if (!belongsToOrg) {
      throw new Error(`User ${userId} does not belong to organization ${organizationId}`);
    }

    const definition = await this.getAchievementDefinitionByCode(achievementCode);
    if (!definition) {
      throw new Error(`Achievement definition not found: ${achievementCode}`);
    }

    // Use onConflictDoNothing to handle race conditions gracefully
    const [newAchievement] = await db
      .insert(userAchievements)
      .values({
        userId,
        organizationId,
        achievementId: definition.id,
        metadata: metadata || null,
      })
      .onConflictDoNothing({
        target: [userAchievements.userId, userAchievements.achievementId],
      })
      .returning();

    // If insert was skipped due to conflict, fetch existing achievement
    if (!newAchievement) {
      const [existing] = await db
        .select()
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, definition.id)
        ))
        .limit(1);
      return existing;
    }

    return newAchievement;
  }

  // ============================================================
  // Event Metrics Methods
  // ============================================================

  /**
   * Get a site metric by code (alias for getSiteMetric, returns null instead of undefined)
   */
  async getSiteMetricByCode(code: string): Promise<SiteMetric | null> {
    const metric = await this.getSiteMetric(code);
    return metric ?? null;
  }

  /**
   * Create an event metric (add a metric to an event)
   */
  async createEventMetric(data: InsertEventMetric): Promise<EventMetric> {
    const [metric] = await db
      .insert(eventMetrics)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();

    return metric;
  }

  /**
   * Get a specific event metric
   */
  async getEventMetric(eventId: string, metricCode: string): Promise<EventMetric | null> {
    const [metric] = await db
      .select()
      .from(eventMetrics)
      .where(and(
        eq(eventMetrics.eventId, eventId),
        eq(eventMetrics.metricCode, metricCode)
      ))
      .limit(1);

    return metric ?? null;
  }

  /**
   * Update an event metric
   */
  async updateEventMetric(eventId: string, metricCode: string, data: Partial<InsertEventMetric>): Promise<EventMetric> {
    const [metric] = await db
      .update(eventMetrics)
      .set(data)
      .where(and(
        eq(eventMetrics.eventId, eventId),
        eq(eventMetrics.metricCode, metricCode)
      ))
      .returning();

    if (!metric) {
      throw new Error(`Event metric ${metricCode} not found for event ${eventId}`);
    }

    return metric;
  }

  /**
   * Delete an event metric
   */
  async deleteEventMetric(eventId: string, metricCode: string): Promise<void> {
    await db
      .delete(eventMetrics)
      .where(and(
        eq(eventMetrics.eventId, eventId),
        eq(eventMetrics.metricCode, metricCode)
      ));
  }

  /**
   * List all metrics for an event
   */
  async listEventMetrics(eventId: string): Promise<EventMetric[]> {
    const metrics = await db
      .select()
      .from(eventMetrics)
      .where(eq(eventMetrics.eventId, eventId))
      .orderBy(asc(eventMetrics.displayOrder));

    return metrics;
  }

  /**
   * Get the maximum display order for event metrics
   */
  async getMaxDisplayOrder(eventId: string): Promise<number> {
    const [result] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${eventMetrics.displayOrder}), 0)` })
      .from(eventMetrics)
      .where(eq(eventMetrics.eventId, eventId));

    return result?.maxOrder ?? 0;
  }
}

export const storage = new DatabaseStorage();