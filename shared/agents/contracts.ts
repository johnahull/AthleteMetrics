/**
 * Agent contracts and interfaces for each domain agent
 */

import { BaseAgent, AgentContext, AgentResult } from './types';

// ============================================================================
// DATABASE AGENT
// ============================================================================

export interface DatabaseAgent extends BaseAgent {
  // Query operations
  query<T>(sql: string, params?: any[], context?: AgentContext): Promise<AgentResult<T[]>>;
  queryOne<T>(sql: string, params?: any[], context?: AgentContext): Promise<AgentResult<T | null>>;

  // Transaction management
  transaction<T>(callback: (tx: any) => Promise<T>, context?: AgentContext): Promise<AgentResult<T>>;

  // Connection management
  getConnection(): Promise<any>;
  releaseConnection(connection: any): Promise<void>;
}

// ============================================================================
// SECURITY AGENT
// ============================================================================

export interface SecurityAgent extends BaseAgent {
  // Input sanitization
  sanitizeInput(input: any, rules?: SanitizationRules, context?: AgentContext): Promise<AgentResult<any>>;
  validateInput(input: any, schema: any, context?: AgentContext): Promise<AgentResult<boolean>>;

  // Permission checking
  checkPermission(action: string, resource: string, context: AgentContext): Promise<AgentResult<boolean>>;

  // Rate limiting
  checkRateLimit(key: string, limit: number, window: number, context?: AgentContext): Promise<AgentResult<boolean>>;

  // CSRF protection
  generateCSRFToken(context: AgentContext): Promise<AgentResult<string>>;
  validateCSRFToken(token: string, context: AgentContext): Promise<AgentResult<boolean>>;
}

export interface SanitizationRules {
  maxLength?: number;
  allowedChars?: string;
  stripHTML?: boolean;
  normalizeSpaces?: boolean;
}

// ============================================================================
// AUTHENTICATION AGENT
// ============================================================================

export interface AuthenticationAgent extends BaseAgent {
  // Basic authentication
  login(email: string, password: string, context?: AgentContext): Promise<AgentResult<AuthSession>>;
  logout(sessionId: string, context?: AgentContext): Promise<AgentResult<void>>;

  // Session management
  validateSession(sessionId: string, context?: AgentContext): Promise<AgentResult<AuthSession>>;
  refreshSession(sessionId: string, context?: AgentContext): Promise<AgentResult<AuthSession>>;

  // Password management
  changePassword(userId: string, oldPassword: string, newPassword: string, context?: AgentContext): Promise<AgentResult<void>>;
  resetPassword(email: string, context?: AgentContext): Promise<AgentResult<void>>;
  confirmPasswordReset(token: string, newPassword: string, context?: AgentContext): Promise<AgentResult<void>>;

  // MFA
  enableMFA(userId: string, context?: AgentContext): Promise<AgentResult<MFASetup>>;
  verifyMFA(userId: string, code: string, context?: AgentContext): Promise<AgentResult<boolean>>;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  permissions: string[];
  expiresAt: Date;
  mfaVerified: boolean;
}

export interface MFASetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

// ============================================================================
// ORGANIZATION AGENT
// ============================================================================

export interface OrganizationAgent extends BaseAgent {
  // Organization management
  createOrganization(data: CreateOrganizationData, context: AgentContext): Promise<AgentResult<Organization>>;
  updateOrganization(id: string, data: UpdateOrganizationData, context: AgentContext): Promise<AgentResult<Organization>>;
  deleteOrganization(id: string, context: AgentContext): Promise<AgentResult<void>>;

  // Organization queries
  getOrganization(id: string, context: AgentContext): Promise<AgentResult<Organization>>;
  getUserOrganizations(userId: string, context: AgentContext): Promise<AgentResult<Organization[]>>;

  // Member management
  addMember(orgId: string, userId: string, role: string, context: AgentContext): Promise<AgentResult<void>>;
  removeMember(orgId: string, userId: string, context: AgentContext): Promise<AgentResult<void>>;
  updateMemberRole(orgId: string, userId: string, role: string, context: AgentContext): Promise<AgentResult<void>>;
}

export interface Organization {
  id: string;
  name: string;
  type: string;
  description?: string;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationData {
  name: string;
  type: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateOrganizationData {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
}

// ============================================================================
// TEAM AGENT
// ============================================================================

export interface TeamAgent extends BaseAgent {
  // Team management
  createTeam(data: CreateTeamData, context: AgentContext): Promise<AgentResult<Team>>;
  updateTeam(id: string, data: UpdateTeamData, context: AgentContext): Promise<AgentResult<Team>>;
  deleteTeam(id: string, context: AgentContext): Promise<AgentResult<void>>;

  // Team queries
  getTeam(id: string, context: AgentContext): Promise<AgentResult<Team>>;
  getTeamsByOrganization(orgId: string, context: AgentContext): Promise<AgentResult<Team[]>>;

  // Roster management
  addAthleteToTeam(teamId: string, athleteId: string, season: string, context: AgentContext): Promise<AgentResult<void>>;
  removeAthleteFromTeam(teamId: string, athleteId: string, season: string, context: AgentContext): Promise<AgentResult<void>>;
  bulkUpdateRoster(teamId: string, athleteIds: string[], season: string, context: AgentContext): Promise<AgentResult<RosterUpdateResult>>;

  // Team queries
  getTeamRoster(teamId: string, season?: string, context?: AgentContext): Promise<AgentResult<TeamAthlete[]>>;
}

export interface Team {
  id: string;
  name: string;
  sport: string;
  level: string;
  season: string;
  organizationId: string;
  coachId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamData {
  name: string;
  sport: string;
  level: string;
  season: string;
  organizationId: string;
  coachId?: string;
}

export interface UpdateTeamData {
  name?: string;
  sport?: string;
  level?: string;
  coachId?: string;
}

export interface TeamAthlete {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  position?: string;
  joinedAt: Date;
}

export interface RosterUpdateResult {
  added: number;
  removed: number;
  errors: string[];
}

// ============================================================================
// ATHLETE AGENT
// ============================================================================

export interface AthleteAgent extends BaseAgent {
  // Athlete management
  createAthlete(data: CreateAthleteData, context: AgentContext): Promise<AgentResult<Athlete>>;
  updateAthlete(id: string, data: UpdateAthleteData, context: AgentContext): Promise<AgentResult<Athlete>>;
  deleteAthlete(id: string, context: AgentContext): Promise<AgentResult<void>>;

  // Athlete queries
  getAthlete(id: string, context: AgentContext): Promise<AgentResult<Athlete>>;
  searchAthletes(query: AthleteSearchQuery, context: AgentContext): Promise<AgentResult<AthleteSearchResult>>;

  // Photo management
  uploadPhoto(athleteId: string, photo: Buffer, context: AgentContext): Promise<AgentResult<string>>;
  deletePhoto(athleteId: string, context: AgentContext): Promise<AgentResult<void>>;
}

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate?: Date;
  gender?: string;
  height?: number;
  weight?: number;
  sports: string[];
  positions: string[];
  graduationYear?: number;
  school?: string;
  photoUrl?: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAthleteData {
  firstName: string;
  lastName: string;
  email: string;
  birthDate?: Date;
  gender?: string;
  height?: number;
  weight?: number;
  sports?: string[];
  positions?: string[];
  graduationYear?: number;
  school?: string;
  organizationId: string;
}

export interface UpdateAthleteData {
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: Date;
  gender?: string;
  height?: number;
  weight?: number;
  sports?: string[];
  positions?: string[];
  graduationYear?: number;
  school?: string;
}

export interface AthleteSearchQuery {
  term?: string;
  organizationId?: string;
  sport?: string;
  graduationYear?: number;
  limit?: number;
  offset?: number;
}

export interface AthleteSearchResult {
  athletes: Athlete[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// MEASUREMENT AGENT
// ============================================================================

export interface MeasurementAgent extends BaseAgent {
  // Measurement recording
  recordMeasurement(data: MeasurementData, context: AgentContext): Promise<AgentResult<Measurement>>;
  bulkRecordMeasurements(data: MeasurementData[], context: AgentContext): Promise<AgentResult<BulkMeasurementResult>>;

  // Measurement queries
  getMeasurements(athleteId: string, filters?: MeasurementFilters, context?: AgentContext): Promise<AgentResult<Measurement[]>>;
  getLatestMeasurements(athleteId: string, context?: AgentContext): Promise<AgentResult<Record<string, Measurement>>>;

  // Validation and processing
  validateMeasurement(data: MeasurementData, context?: AgentContext): Promise<AgentResult<ValidationResult>>;
  calculateDerivedMetrics(measurements: Measurement[], context?: AgentContext): Promise<AgentResult<DerivedMetrics>>;
}

export interface MeasurementData {
  athleteId: string;
  type: string;
  value: number;
  unit: string;
  date: Date;
  conditions?: string;
  notes?: string;
}

export interface Measurement extends MeasurementData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeasurementFilters {
  types?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface BulkMeasurementResult {
  processed: number;
  errors: number;
  details: Array<{ success: boolean; error?: string; measurementId?: string }>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DerivedMetrics {
  [key: string]: number | string;
}

// ============================================================================
// ANALYTICS AGENT
// ============================================================================

export interface AnalyticsAgent extends BaseAgent {
  // Report generation
  generateReport(type: string, params: ReportParams, context: AgentContext): Promise<AgentResult<Report>>;

  // Chart data
  getChartData(type: string, params: ChartParams, context: AgentContext): Promise<AgentResult<ChartData>>;

  // Statistical analysis
  calculateStats(data: number[], context?: AgentContext): Promise<AgentResult<Statistics>>;
  compareAthletes(athleteIds: string[], metrics: string[], context: AgentContext): Promise<AgentResult<ComparisonResult>>;

  // Trend analysis
  analyzeTrends(athleteId: string, metric: string, timeRange: TimeRange, context: AgentContext): Promise<AgentResult<TrendAnalysis>>;
}

export interface ReportParams {
  athleteIds?: string[];
  teamIds?: string[];
  organizationId?: string;
  metrics?: string[];
  timeRange?: TimeRange;
  filters?: Record<string, any>;
}

export interface ChartParams extends ReportParams {
  chartType: 'line' | 'bar' | 'scatter' | 'box' | 'histogram';
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface Report {
  id: string;
  type: string;
  title: string;
  data: any;
  generatedAt: Date;
  expiresAt?: Date;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }>;
}

export interface Statistics {
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
}

export interface ComparisonResult {
  athletes: Array<{
    id: string;
    name: string;
    metrics: Record<string, number>;
    rank: Record<string, number>;
  }>;
  summary: Statistics;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface TrendAnalysis {
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  correlation: number;
  predictions?: Array<{ date: Date; value: number; confidence: number }>;
}

// ============================================================================
// IMPORT/EXPORT AGENT
// ============================================================================

export interface ImportExportAgent extends BaseAgent {
  // Import operations
  parseCSV(file: Buffer, mapping: ColumnMapping, context: AgentContext): Promise<AgentResult<ParsedData>>;
  validateImportData(data: any[], rules: ValidationRules, context: AgentContext): Promise<AgentResult<ValidationReport>>;
  importData(data: any[], type: string, context: AgentContext): Promise<AgentResult<ImportResult>>;

  // Export operations
  exportData(query: ExportQuery, format: string, context: AgentContext): Promise<AgentResult<ExportResult>>;
  generateTemplate(type: string, context?: AgentContext): Promise<AgentResult<Buffer>>;
}

export interface ColumnMapping {
  [csvColumn: string]: string; // maps to entity field
}

export interface ParsedData {
  headers: string[];
  rows: any[][];
  mapping: ColumnMapping;
  preview: any[];
}

export interface ValidationRules {
  required: string[];
  unique: string[];
  patterns: Record<string, string>;
  ranges: Record<string, { min?: number; max?: number }>;
}

export interface ValidationReport {
  isValid: boolean;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}

export interface ImportResult {
  processed: number;
  created: number;
  updated: number;
  errors: number;
  details: Array<{ action: string; id?: string; error?: string }>;
}

export interface ExportQuery {
  entity: string;
  filters?: Record<string, any>;
  fields?: string[];
  limit?: number;
  orderBy?: string;
}

export interface ExportResult {
  data: Buffer;
  filename: string;
  contentType: string;
  recordCount: number;
}

// ============================================================================
// OCR AGENT
// ============================================================================

export interface OCRAgent extends BaseAgent {
  // Image processing
  processImage(image: Buffer, options: OCROptions, context: AgentContext): Promise<AgentResult<OCRResult>>;
  extractTables(image: Buffer, context: AgentContext): Promise<AgentResult<TableData>>;

  // Template matching
  matchTemplate(image: Buffer, templateId: string, context: AgentContext): Promise<AgentResult<TemplateMatch>>;
  createTemplate(name: string, image: Buffer, regions: TemplateRegion[], context: AgentContext): Promise<AgentResult<Template>>;
}

export interface OCROptions {
  language?: string;
  confidence?: number;
  preprocess?: boolean;
  templateId?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: [number, number, number, number];
  }>;
  lines: Array<{
    text: string;
    confidence: number;
    words: number[];
  }>;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  confidence: number;
}

export interface TemplateRegion {
  name: string;
  type: 'text' | 'number' | 'date';
  bbox: [number, number, number, number];
  required: boolean;
}

export interface Template {
  id: string;
  name: string;
  regions: TemplateRegion[];
  createdAt: Date;
}

export interface TemplateMatch {
  templateId: string;
  confidence: number;
  data: Record<string, any>;
  regions: Array<{
    name: string;
    value: any;
    confidence: number;
  }>;
}

// ============================================================================
// NOTIFICATION AGENT
// ============================================================================

export interface NotificationAgent extends BaseAgent {
  // Email notifications
  sendEmail(to: string[], subject: string, template: string, data: any, context: AgentContext): Promise<AgentResult<void>>;

  // System notifications
  sendNotification(userId: string, type: string, message: string, context: AgentContext): Promise<AgentResult<void>>;

  // Bulk notifications
  sendBulkNotifications(notifications: BulkNotification[], context: AgentContext): Promise<AgentResult<BulkNotificationResult>>;

  // Template management
  getTemplate(name: string, context?: AgentContext): Promise<AgentResult<EmailTemplate>>;
}

export interface BulkNotification {
  userId: string;
  type: string;
  message: string;
  data?: any;
}

export interface BulkNotificationResult {
  sent: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  body: string;
  variables: string[];
}

// ============================================================================
// SEARCH AGENT
// ============================================================================

export interface SearchAgent extends BaseAgent {
  // Global search
  search(query: string, entities: string[], context: AgentContext): Promise<AgentResult<SearchResults>>;

  // Entity-specific search
  searchAthletes(query: string, filters: AthleteSearchFilters, context: AgentContext): Promise<AgentResult<AthleteSearchResults>>;
  searchTeams(query: string, filters: TeamSearchFilters, context: AgentContext): Promise<AgentResult<TeamSearchResults>>;

  // Advanced search
  advancedSearch(criteria: SearchCriteria, context: AgentContext): Promise<AgentResult<SearchResults>>;

  // Search suggestions
  getSuggestions(query: string, entity: string, context: AgentContext): Promise<AgentResult<string[]>>;
}

export interface SearchResults {
  results: Array<{
    entity: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
    data: any;
  }>;
  total: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
}

export interface AthleteSearchFilters {
  organizationId?: string;
  sports?: string[];
  graduationYear?: number;
  teams?: string[];
}

export interface AthleteSearchResults {
  athletes: Athlete[];
  total: number;
  facets: {
    sports: Array<{ value: string; count: number }>;
    graduationYears: Array<{ value: number; count: number }>;
    teams: Array<{ value: string; count: number }>;
  };
}

export interface TeamSearchFilters {
  organizationId?: string;
  sports?: string[];
  levels?: string[];
  seasons?: string[];
}

export interface TeamSearchResults {
  teams: Team[];
  total: number;
  facets: {
    sports: Array<{ value: string; count: number }>;
    levels: Array<{ value: string; count: number }>;
    seasons: Array<{ value: string; count: number }>;
  };
}

export interface SearchCriteria {
  query?: string;
  entities: string[];
  filters: Record<string, any>;
  sort?: string;
  limit?: number;
  offset?: number;
}