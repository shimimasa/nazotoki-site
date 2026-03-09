-- Phase 15: Drop legacy tables (sessions / votes / reflections)
-- Run this in Supabase SQL Editor AFTER Phase 14 has been applied.
--
-- Prerequisites:
--   1. Phase 14 applied (RLS policies removed, backfill completed)
--   2. App code confirmed to have ZERO references to these tables
--   3. All historical data backfilled into session_logs
--
-- This migration is DESTRUCTIVE and IRREVERSIBLE.
-- Take a DB backup before running.


-- ============================================================
-- SECTION 1: PRE-DROP VERIFICATION
-- Run these queries FIRST to confirm safe to drop.
-- ============================================================

-- 1a. Count rows in legacy tables vs session_logs
-- Ensure session_logs has >= sessions rows (backfill complete)
SELECT 'sessions' AS table_name, COUNT(*) AS row_count FROM sessions
UNION ALL
SELECT 'votes', COUNT(*) FROM votes
UNION ALL
SELECT 'reflections', COUNT(*) FROM reflections
UNION ALL
SELECT 'session_logs', COUNT(*) FROM session_logs;

-- 1b. Verify no RLS policies remain on legacy tables
-- (Phase 14 should have removed all)
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('sessions', 'votes', 'reflections');
-- Expected: 0 rows

-- 1c. Verify no foreign keys FROM other tables point to sessions/votes/reflections
-- (only votes/reflections reference sessions, and we drop them first)
SELECT
  tc.table_name AS referencing_table,
  kcu.column_name AS referencing_column,
  ccu.table_name AS referenced_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('sessions', 'votes', 'reflections')
  AND tc.table_name NOT IN ('sessions', 'votes', 'reflections');
-- Expected: 0 rows (no external tables reference these)


-- ============================================================
-- SECTION 2: DROP TABLES
-- Run this AFTER confirming Section 1 results are safe.
-- Order: children first, then parent.
-- ============================================================

-- Drop indexes first (optional, DROP TABLE removes them, but explicit for clarity)
DROP INDEX IF EXISTS idx_votes_session;
DROP INDEX IF EXISTS idx_reflections_session;
DROP INDEX IF EXISTS idx_sessions_slug;
DROP INDEX IF EXISTS idx_sessions_teacher;
DROP INDEX IF EXISTS idx_sessions_started;

-- Drop child tables (FK references sessions)
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS reflections;

-- Drop parent table
DROP TABLE IF EXISTS sessions;


-- ============================================================
-- SECTION 3: POST-DROP VERIFICATION
-- Run these to confirm successful cleanup.
-- ============================================================

-- 3a. Confirm tables are gone
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sessions', 'votes', 'reflections');
-- Expected: 0 rows

-- 3b. List remaining public tables (should be the clean set)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Expected: classes, gm_memos, session_logs, student_session_logs, students, teachers

-- 3c. Verify session_logs is intact
SELECT COUNT(*) AS total_logs FROM session_logs;

-- 3d. Verify no orphaned references
SELECT COUNT(*) AS student_log_count FROM student_session_logs;
SELECT COUNT(*) AS gm_memo_count FROM gm_memos;
