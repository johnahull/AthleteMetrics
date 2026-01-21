-- Rollback: Remove report_shares.shared_by index
DROP INDEX CONCURRENTLY IF EXISTS report_shares_shared_by_idx;
