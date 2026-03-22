-- Migration: Add ai_prompt_context column to organizations table
-- Allows each organization to customize AI coaching insights with their own context

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_prompt_context TEXT;
