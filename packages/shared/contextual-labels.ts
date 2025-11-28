/**
 * Contextual Label System for Organization Types
 *
 * Provides organization-type-specific terminology to make the UI more accurate
 * and natural for different types of sports organizations.
 *
 * @fileoverview Maps organization types to contextual labels for:
 * - Teams/Groups/Squads
 * - Coaches/Trainers
 * - Athletes/Clients
 *
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-15
 */

import type { OrganizationType } from './organization-type-utils';

/**
 * Terminology variants for a single concept (singular and plural forms)
 */
export interface TerminologyVariant {
  readonly singular: string;
  readonly plural: string;
}

/**
 * Complete contextual terminology set for an organization type
 */
export interface ContextualTerminology {
  readonly group: TerminologyVariant;
  readonly coach: TerminologyVariant;
  readonly athlete: TerminologyVariant;
}

/**
 * Contextual labels mapped by organization type
 *
 * Design decisions:
 * - Youth: "Groups" - Less formal, recreational focus
 * - High School/College/Club: "Teams" - Traditional team sports terminology
 * - Private Facility: "Groups" - Training groups or individual clients
 * - Elite Academy: "Squads" - Professional/high-performance terminology
 */
export const CONTEXTUAL_LABELS: Record<OrganizationType, ContextualTerminology> = {
  youth: {
    group: { singular: 'Group', plural: 'Groups' },
    coach: { singular: 'Coach', plural: 'Coaches' },
    athlete: { singular: 'Athlete', plural: 'Athletes' },
  },
  high_school: {
    group: { singular: 'Team', plural: 'Teams' },
    coach: { singular: 'Coach', plural: 'Coaches' },
    athlete: { singular: 'Athlete', plural: 'Athletes' },
  },
  college: {
    group: { singular: 'Team', plural: 'Teams' },
    coach: { singular: 'Coach', plural: 'Coaches' },
    athlete: { singular: 'Athlete', plural: 'Athletes' },
  },
  club: {
    group: { singular: 'Team', plural: 'Teams' },
    coach: { singular: 'Coach', plural: 'Coaches' },
    athlete: { singular: 'Athlete', plural: 'Athletes' },
  },
  private_facility: {
    group: { singular: 'Group', plural: 'Groups' },
    coach: { singular: 'Trainer', plural: 'Trainers' },
    athlete: { singular: 'Client', plural: 'Clients' },
  },
  elite_academy: {
    group: { singular: 'Squad', plural: 'Squads' },
    coach: { singular: 'Coach', plural: 'Coaches' },
    athlete: { singular: 'Athlete', plural: 'Athletes' },
  },
} as const;

/**
 * Default fallback labels when organization type is unavailable
 */
export const DEFAULT_LABELS: ContextualTerminology = {
  group: { singular: 'Team', plural: 'Teams' },
  coach: { singular: 'Coach', plural: 'Coaches' },
  athlete: { singular: 'Athlete', plural: 'Athletes' },
} as const;

/**
 * Get the contextual label for "Team/Group/Squad" based on organization type
 *
 * @param orgType - The organization type (can be null/undefined)
 * @param plural - Whether to return plural form (default: false)
 * @param fallback - Custom fallback if org type is unavailable (default: "Team"/"Teams")
 * @returns The appropriate label for the organization type
 *
 * @example
 * ```typescript
 * getGroupLabel('private_facility', false) // "Group"
 * getGroupLabel('private_facility', true)  // "Groups"
 * getGroupLabel('high_school', false)      // "Team"
 * getGroupLabel('college', true)           // "Teams"
 * getGroupLabel(null, false)               // "Team" (fallback)
 * ```
 */
export function getGroupLabel(
  orgType: OrganizationType | null | undefined,
  plural = false,
  fallback?: string
): string {
  if (!orgType) {
    return fallback ?? (plural ? DEFAULT_LABELS.group.plural : DEFAULT_LABELS.group.singular);
  }

  const labels = CONTEXTUAL_LABELS[orgType];
  return plural ? labels.group.plural : labels.group.singular;
}

/**
 * Get the contextual label for "Coach/Trainer" based on organization type
 *
 * @param orgType - The organization type (can be null/undefined)
 * @param plural - Whether to return plural form (default: false)
 * @param fallback - Custom fallback if org type is unavailable (default: "Coach"/"Coaches")
 * @returns The appropriate label for the organization type
 *
 * @example
 * ```typescript
 * getCoachLabel('private_facility', false) // "Trainer"
 * getCoachLabel('high_school', false)      // "Coach"
 * getCoachLabel(null, true)                // "Coaches" (fallback)
 * ```
 */
export function getCoachLabel(
  orgType: OrganizationType | null | undefined,
  plural = false,
  fallback?: string
): string {
  if (!orgType) {
    return fallback ?? (plural ? DEFAULT_LABELS.coach.plural : DEFAULT_LABELS.coach.singular);
  }

  const labels = CONTEXTUAL_LABELS[orgType];
  return plural ? labels.coach.plural : labels.coach.singular;
}

/**
 * Get the contextual label for "Athlete/Player/Client" based on organization type
 *
 * @param orgType - The organization type (can be null/undefined)
 * @param plural - Whether to return plural form (default: false)
 * @param fallback - Custom fallback if org type is unavailable (default: "Athlete"/"Athletes")
 * @returns The appropriate label for the organization type
 *
 * @example
 * ```typescript
 * getAthleteLabel('private_facility', false) // "Client"
 * getAthleteLabel('club', true)              // "Athletes"
 * getAthleteLabel('college', false)          // "Athlete"
 * getAthleteLabel(null, false)               // "Athlete" (fallback)
 * ```
 */
export function getAthleteLabel(
  orgType: OrganizationType | null | undefined,
  plural = false,
  fallback?: string
): string {
  if (!orgType) {
    return fallback ?? (plural ? DEFAULT_LABELS.athlete.plural : DEFAULT_LABELS.athlete.singular);
  }

  const labels = CONTEXTUAL_LABELS[orgType];
  return plural ? labels.athlete.plural : labels.athlete.singular;
}

/**
 * Get all contextual labels for an organization type at once
 *
 * @param orgType - The organization type (can be null/undefined)
 * @returns Complete terminology set for the organization type
 *
 * @example
 * ```typescript
 * const labels = getContextualLabels('private_facility');
 * console.log(labels.group.singular);   // "Group"
 * console.log(labels.coach.plural);     // "Trainers"
 * console.log(labels.athlete.singular); // "Client"
 * ```
 */
export function getContextualLabels(
  orgType: OrganizationType | null | undefined
): ContextualTerminology {
  if (!orgType) {
    return DEFAULT_LABELS;
  }

  return CONTEXTUAL_LABELS[orgType];
}
