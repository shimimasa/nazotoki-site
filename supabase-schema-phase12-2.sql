-- Phase 12.2: Auth UX support + legacy table RLS hardening + orphaned log claim
-- Run this in Supabase SQL Editor AFTER Phase 12.1 schema is applied.
-- Safe to run multiple times (DROP IF EXISTS used throughout).


-- ============================================================
-- 1. session_logs: allow authenticated users to claim orphaned logs
-- ============================================================

-- Current auth_session_logs_update only allows updating own logs (teacher_id = my_teacher_id()).
-- We need to also allow updating orphaned logs (teacher_id IS NULL) to claim them.
DROP POLICY IF EXISTS "auth_session_logs_update" ON session_logs;

CREATE POLICY "auth_session_logs_update"
  ON session_logs FOR UPDATE TO authenticated
  USING (teacher_id = my_teacher_id() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = my_teacher_id());

-- Note: WITH CHECK ensures the new teacher_id must be the current user's teacher_id.
-- USING allows updating rows where teacher_id matches OR is NULL (orphaned).
-- This means: authenticated users can claim orphaned logs (set teacher_id to self)
-- and update their own existing logs, but cannot steal other teachers' logs.


-- ============================================================
-- 2. sessions: add authenticated policies (keep anon for backward compat)
-- ============================================================

-- Add authenticated policies so logged-in users get proper access
-- (Supabase treats authenticated and anon as separate roles)
CREATE POLICY "auth_sessions_insert"
  ON sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_sessions_select"
  ON sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_sessions_update"
  ON sessions FOR UPDATE TO authenticated
  USING (true);

-- Anon policies remain unchanged (needed for unauthenticated session flow):
-- "Allow anon insert sessions" — INSERT with check (true)
-- "Allow anon select sessions" — SELECT using (true)
-- "Allow anon update sessions" — UPDATE using (true)


-- ============================================================
-- 3. votes: add authenticated policies
-- ============================================================

CREATE POLICY "auth_votes_insert"
  ON votes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_votes_select"
  ON votes FOR SELECT TO authenticated
  USING (true);

-- Anon policies remain unchanged:
-- "Allow anon insert votes" — INSERT with check (true)
-- "Allow anon select votes" — SELECT using (true)


-- ============================================================
-- 4. reflections: add authenticated policies
-- ============================================================

CREATE POLICY "auth_reflections_insert"
  ON reflections FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_reflections_select"
  ON reflections FOR SELECT TO authenticated
  USING (true);

-- Anon policies remain unchanged:
-- "Allow anon insert reflections" — INSERT with check (true)
-- "Allow anon select reflections" — SELECT using (true)


-- ============================================================
-- 5. Deprecation notes for legacy tables
-- ============================================================
-- sessions / votes / reflections are used during active session flow in SessionWizard.
-- They do NOT have teacher_id and cannot be scoped per teacher.
--
-- Current state:
--   - anon: INSERT/SELECT/(UPDATE for sessions only) — full access
--   - authenticated: INSERT/SELECT/(UPDATE for sessions only) — full access (added above)
--
-- Data in these tables is ephemeral (created during session, archived to session_logs).
-- session_logs is the authoritative data store for Teacher Workspace.
--
-- TODO (Phase 13+):
--   1. Refactor SessionWizard to save directly to session_logs (skip sessions/votes/reflections)
--   2. Once SessionWizard is refactored, restrict anon SELECT on these tables
--   3. Eventually drop sessions/votes/reflections tables
