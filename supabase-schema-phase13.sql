-- Phase 13: Consolidate session data into session_logs
-- Run this in Supabase SQL Editor AFTER Phase 12.2 schema is applied.
-- Safe to run multiple times (IF NOT EXISTS used).


-- ============================================================
-- 1. Add missing columns to session_logs
-- ============================================================

-- Reflections: array of student reflection texts (was in separate 'reflections' table)
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS reflections jsonb;

-- Environment: classroom / dayservice / home (was only in 'sessions' table)
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS environment text;

-- Player count (was only in 'sessions' table)
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS player_count integer;

-- Teacher name for display (was only in 'sessions' table; fallback for anonymous sessions)
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS teacher_name text;


-- ============================================================
-- 2. Legacy tables: sessions / votes / reflections
-- ============================================================
-- These tables are NO LONGER written to by the application (as of Phase 13).
-- They are kept for historical data reference only.
--
-- Existing data remains accessible via direct SQL queries.
-- No new rows will be inserted by the app.
--
-- RLS policies remain as-is (Phase 12.2):
--   sessions: anon + authenticated INSERT/SELECT/UPDATE
--   votes: anon + authenticated INSERT/SELECT
--   reflections: anon + authenticated INSERT/SELECT
--
-- TODO (Phase 14+):
--   1. Migrate historical data from sessions/votes/reflections into session_logs
--      (backfill reflections, environment, player_count, teacher_name)
--   2. Remove anon INSERT policies on sessions/votes/reflections
--   3. Eventually DROP these tables once historical data is fully migrated
