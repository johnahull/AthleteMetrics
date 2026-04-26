/**
 * Database Enums
 *
 * All PostgreSQL enum type definitions used across the schema.
 * Extracted from schema.ts for better organization.
 */

/**
 * Organization type enum for multi-tenant filtering
 * @see organization-type-utils.ts for utilities and constants related to organization types
 */
export const organizationTypeEnum = ['youth', 'high_school', 'college', 'club', 'private_facility', 'elite_academy'] as const;

/**
 * Metric type enum for determining if metrics are better when higher/lower or just tracked
 * - lower_is_better: Decreasing values = improvement (e.g., FLY10_TIME, DASH_40YD)
 * - higher_is_better: Increasing values = improvement (e.g., VERTICAL_JUMP, TOP_SPEED)
 * - tracking: No better/worse direction, just informational (e.g., HEIGHT, WEIGHT)
 */
export const metricTypeEnum = ['lower_is_better', 'higher_is_better', 'tracking'] as const;

/**
 * Sport code enum for metric sport associations
 * These codes correspond to the 'code' field in the site_sports table
 */
export const sportCodeEnum = ['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'BASEBALL', 'FOOTBALL', 'HOCKEY', 'LACROSSE'] as const;

/**
 * Membership request status enum
 */
export const membershipRequestStatusEnum = ['pending', 'approved', 'rejected', 'cancelled'] as const;

/**
 * Membership request discovery method enum
 */
export const membershipRequestDiscoveryMethodEnum = ['join_code', 'directory', 'direct_link'] as const;

/**
 * Achievement category enum
 */
export const achievementCategoryEnum = ['performance', 'consistency', 'improvement', 'goal'] as const;

/**
 * Achievement rarity enum
 */
export const achievementRarityEnum = ['common', 'rare', 'epic', 'legendary'] as const;

/**
 * Goal type enum
 */
export const goalTypeEnum = ['target_value', 'improvement_percentage', 'consistency'] as const;

/**
 * Goal status enum
 */
export const goalStatusEnum = ['active', 'achieved', 'missed', 'abandoned'] as const;

/**
 * Link status enum for global athlete linking
 */
export const linkStatusEnum = ['pending', 'confirmed', 'rejected', 'revoked'] as const;

/**
 * Link type enum for global athlete linking
 */
export const linkTypeEnum = ['auto_email', 'auto_import', 'athlete_claimed', 'org_proposed', 'admin_forced'] as const;

/**
 * Actor type enum for audit logging
 */
export const actorTypeEnum = ['athlete', 'org_admin', 'site_admin', 'system'] as const;

/**
 * Claim status enum for global athlete claims
 */
export const claimStatusEnum = ["pending", "verified", "expired", "cancelled"] as const;

/**
 * Notification type enum for categorizing push notifications
 */
export const notificationTypeEnum = [
  'wellness_survey',      // Coach sends wellness survey to athletes
  'wellness_digest',      // Daily digest of at-risk athletes for coaches
  'new_measurement',      // New performance data logged for athlete
  'team_announcement',    // Coach broadcasts to team
  'report_shared',        // Coach shares performance report with athlete
] as const;

/**
 * Notification delivery status enum
 */
export const notificationDeliveryStatusEnum = ['pending', 'delivered', 'failed', 'expired'] as const;

/**
 * Notification channel enum
 */
export const notificationChannelEnum = ['push', 'email'] as const;

/**
 * Event visibility enum
 */
export const eventVisibilityEnum = ['org_private', 'public', 'invite_only'] as const;

/**
 * Event status enum
 */
export const eventStatusEnum = ['draft', 'published', 'active', 'completed', 'cancelled'] as const;

/**
 * Registration mode enum
 */
export const registrationModeEnum = ['open', 'request_approval', 'invitation_only'] as const;

/**
 * Results visibility enum
 */
export const resultsVisibilityEnum = ['immediate', 'after_event', 'manual'] as const;

/**
 * Registration status enum
 */
export const registrationStatusEnum = ['pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'checked_in', 'completed'] as const;

/**
 * Event invitation status enum
 */
export const eventInvitationStatusEnum = ['pending', 'accepted', 'declined', 'expired', 'cancelled'] as const;

/**
 * Waiver submission status enum (Jotform webhook intake)
 * - received: payload accepted and persisted, processing not yet finished
 * - processed: athlete record created/matched and waiver linked successfully
 * - failed: processing raised an error after persisting the raw payload
 */
export const waiverSubmissionStatusEnum = ['received', 'processed', 'failed'] as const;
export type WaiverSubmissionStatus = (typeof waiverSubmissionStatusEnum)[number];
