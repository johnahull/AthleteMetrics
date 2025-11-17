-- Migration 0036 Rollback: Drop Site Settings Table
-- Purpose: Rollback site settings table creation
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

DROP TABLE IF EXISTS site_settings CASCADE;
