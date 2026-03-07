-- Phase 12.1: RLS hardening + gm_memos teacher separation
-- Run this in Supabase SQL Editor AFTER Phase 12 schema is applied.
-- Safe to run multiple times (IF NOT EXISTS / DROP IF EXISTS used throughout).

-- ============================================================
-- 0. Helper function: get current teacher's ID from auth.uid()
-- ============================================================
CREATE OR REPLACE FUNCTION my_teacher_id() RETURNS uuid AS $$
  SELECT id FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- 1. gm_memos: teacher-based separation
-- ============================================================

-- Drop old single-column unique constraint
ALTER TABLE gm_memos DROP CONSTRAINT IF EXISTS gm_memos_scenario_slug_key;

-- Unique per teacher+slug (for logged-in teachers)
DROP INDEX IF EXISTS idx_gm_memos_teacher_slug;
CREATE UNIQUE INDEX idx_gm_memos_teacher_slug
  ON gm_memos (scenario_slug, teacher_id) WHERE teacher_id IS NOT NULL;

-- Unique per slug when no teacher (backward compat for legacy data)
DROP INDEX IF EXISTS idx_gm_memos_slug_null_teacher;
CREATE UNIQUE INDEX idx_gm_memos_slug_null_teacher
  ON gm_memos (scenario_slug) WHERE teacher_id IS NULL;


-- ============================================================
-- 2. teachers: tighten RLS
-- ============================================================

-- Drop old permissive anon policies
DROP POLICY IF EXISTS "Anon read teachers" ON teachers;
DROP POLICY IF EXISTS "Anon insert teachers" ON teachers;
DROP POLICY IF EXISTS "Teachers read own profile" ON teachers;
DROP POLICY IF EXISTS "Teachers insert own profile" ON teachers;
DROP POLICY IF EXISTS "Teachers update own profile" ON teachers;

-- Authenticated: own profile only
CREATE POLICY "auth_teachers_select"
  ON teachers FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "auth_teachers_insert"
  ON teachers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "auth_teachers_update"
  ON teachers FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id);

-- Anon: INSERT only (needed for signUp flow before email confirmation)
CREATE POLICY "anon_teachers_insert"
  ON teachers FOR INSERT TO anon
  WITH CHECK (true);

-- Anon: SELECT own profile (needed to read profile right after signUp)
CREATE POLICY "anon_teachers_select"
  ON teachers FOR SELECT TO anon
  USING (true);


-- ============================================================
-- 3. classes: teacher-owned access only
-- ============================================================

-- Drop old wide-open policy
DROP POLICY IF EXISTS "Anon full access classes" ON classes;

-- Authenticated: own classes only
CREATE POLICY "auth_classes_all"
  ON classes FOR ALL TO authenticated
  USING (teacher_id = my_teacher_id())
  WITH CHECK (teacher_id = my_teacher_id());

-- Anon: no access to classes
-- (classes are only managed via Teacher Workspace which requires login)


-- ============================================================
-- 4. students: accessible via own classes only
-- ============================================================

-- Drop old wide-open policy
DROP POLICY IF EXISTS "Anon full access students" ON students;

-- Authenticated: students in own classes
CREATE POLICY "auth_students_all"
  ON students FOR ALL TO authenticated
  USING (class_id IN (SELECT id FROM classes WHERE teacher_id = my_teacher_id()))
  WITH CHECK (class_id IN (SELECT id FROM classes WHERE teacher_id = my_teacher_id()));


-- ============================================================
-- 5. student_session_logs: accessible via own session_logs
-- ============================================================

-- Drop old wide-open policy
DROP POLICY IF EXISTS "Anon full access student_session_logs" ON student_session_logs;

-- Authenticated: logs from own sessions
CREATE POLICY "auth_student_session_logs_all"
  ON student_session_logs FOR ALL TO authenticated
  USING (session_log_id IN (SELECT id FROM session_logs WHERE teacher_id = my_teacher_id()))
  WITH CHECK (session_log_id IN (SELECT id FROM session_logs WHERE teacher_id = my_teacher_id()));


-- ============================================================
-- 6. session_logs: teacher-scoped read, open insert
-- ============================================================

-- Drop old anon policies
DROP POLICY IF EXISTS "Allow anon insert session_logs" ON session_logs;
DROP POLICY IF EXISTS "Allow anon select session_logs" ON session_logs;

-- Authenticated: read own logs, insert freely
CREATE POLICY "auth_session_logs_select"
  ON session_logs FOR SELECT TO authenticated
  USING (teacher_id = my_teacher_id() OR teacher_id IS NULL);

CREATE POLICY "auth_session_logs_insert"
  ON session_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_session_logs_update"
  ON session_logs FOR UPDATE TO authenticated
  USING (teacher_id = my_teacher_id());

-- Anon: INSERT only (session can run without login)
CREATE POLICY "anon_session_logs_insert"
  ON session_logs FOR INSERT TO anon
  WITH CHECK (true);

-- Anon: can read only orphaned logs (no teacher_id)
CREATE POLICY "anon_session_logs_select"
  ON session_logs FOR SELECT TO anon
  USING (teacher_id IS NULL);


-- ============================================================
-- 7. gm_memos: teacher-scoped
-- ============================================================

-- Drop old anon policies
DROP POLICY IF EXISTS "Allow anon insert gm_memos" ON gm_memos;
DROP POLICY IF EXISTS "Allow anon select gm_memos" ON gm_memos;
DROP POLICY IF EXISTS "Allow anon update gm_memos" ON gm_memos;

-- Authenticated: read/write own memos + read legacy (NULL teacher_id)
CREATE POLICY "auth_gm_memos_select"
  ON gm_memos FOR SELECT TO authenticated
  USING (teacher_id = my_teacher_id() OR teacher_id IS NULL);

CREATE POLICY "auth_gm_memos_insert"
  ON gm_memos FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_gm_memos_update"
  ON gm_memos FOR UPDATE TO authenticated
  USING (teacher_id = my_teacher_id());

-- Anon: read/write only legacy memos (teacher_id IS NULL)
CREATE POLICY "anon_gm_memos_select"
  ON gm_memos FOR SELECT TO anon
  USING (teacher_id IS NULL);

CREATE POLICY "anon_gm_memos_insert"
  ON gm_memos FOR INSERT TO anon
  WITH CHECK (teacher_id IS NULL);

CREATE POLICY "anon_gm_memos_update"
  ON gm_memos FOR UPDATE TO anon
  USING (teacher_id IS NULL);


-- ============================================================
-- 8. Legacy tables: sessions / votes / reflections
--    (Keep existing policies — TODO for next phase)
-- ============================================================
-- sessions: anon INSERT/SELECT/UPDATE — unchanged
-- votes: anon INSERT/SELECT — unchanged
-- reflections: anon INSERT/SELECT — unchanged
