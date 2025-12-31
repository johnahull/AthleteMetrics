/**
 * Schema Constants
 *
 * Constants used across the database schema and validation.
 */

// AI Coaching Insights constants
export const MAX_INSIGHTS_LENGTH = 10000;

// Metric type constants (legacy compatibility)
export const MetricType = {
  FLY10_TIME: 'FLY10_TIME',
  VERTICAL_JUMP: 'VERTICAL_JUMP',
  AGILITY_505: 'AGILITY_505',
  AGILITY_5105: 'AGILITY_5105',
  T_TEST: 'T_TEST',
  DASH_40YD: 'DASH_40YD',
  TOP_SPEED: 'TOP_SPEED',
  RSI: 'RSI',
} as const;

// Note: There's also a MetricType type alias in types.ts for the metricTypeEnum

// Valid metrics for analytics with optimization hints
// Defines metric types: lower_is_better, higher_is_better, tracking
export const VALID_METRICS = [
  { key: 'FLY10_TIME', metricType: 'lower_is_better' },
  { key: 'VERTICAL_JUMP', metricType: 'higher_is_better' },
  { key: 'AGILITY_505', metricType: 'lower_is_better' },
  { key: 'AGILITY_5105', metricType: 'lower_is_better' },
  { key: 'T_TEST', metricType: 'lower_is_better' },
  { key: 'DASH_40YD', metricType: 'lower_is_better' },
  { key: 'RSI', metricType: 'higher_is_better' },
  { key: 'TOP_SPEED', metricType: 'higher_is_better' },
  { key: 'HEIGHT', metricType: 'tracking' },
  { key: 'WEIGHT', metricType: 'tracking' },
] as const;

// Team level constants
export const TeamLevel = {
  CLUB: "Club",
  HS: "HS",
  COLLEGE: "College",
} as const;

// Gender constants
export const Gender = {
  MALE: "Male",
  FEMALE: "Female",
  NOT_SPECIFIED: "Not Specified",
} as const;

// Soccer position constants
export const SoccerPosition = {
  FORWARD: "F",
  MIDFIELDER: "M",
  DEFENDER: "D",
  GOALKEEPER: "GK",
} as const;

// Sport constants
export const Sport = {
  SOCCER: "Soccer",
} as const;

export const AVAILABLE_SPORTS = Object.values(Sport);

// User role constants
export const UserRole = {
  ATHLETE: "athlete",
  COACH: "coach",
  ADMIN: "admin",
} as const;

// Invitation constants
export const INVITATION_PENDING_PASSWORD = 'INVITATION_PENDING';

// Organization role constants
export const OrganizationRole = {
  ADMIN: "admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

// Organization type constants
export const OrganizationType = {
  YOUTH: 'youth',
  HIGH_SCHOOL: 'high_school',
  COLLEGE: 'college',
  CLUB: 'club',
  PRIVATE_FACILITY: 'private_facility',
  ELITE_ACADEMY: 'elite_academy',
} as const;

// AI Model constants
export const AI_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'gpt-4o',
  'gpt-4o-mini'
] as const;
