-- Migration 0147 DOWN: remove measurements.media_url
-- WARNING: drops any stored media links. Idempotent.

ALTER TABLE measurements
  DROP COLUMN IF EXISTS media_url;
