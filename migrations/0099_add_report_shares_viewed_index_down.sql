/**
 * Rollback migration 0099: Remove partial index for unread report queries
 */

DROP INDEX IF EXISTS report_shares_athlete_unviewed_idx;
