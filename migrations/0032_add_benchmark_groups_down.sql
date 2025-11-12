-- Rollback migration 0032: Remove benchmark group tables

DROP TABLE IF EXISTS "custom_benchmark_group_members";
DROP TABLE IF EXISTS "site_benchmark_group_members";
DROP TABLE IF EXISTS "custom_benchmark_groups";
DROP TABLE IF EXISTS "site_benchmark_groups";
