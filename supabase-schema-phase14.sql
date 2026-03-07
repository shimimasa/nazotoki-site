-- Phase 14: Legacy table cleanup — seal API access + backfill data
-- Run this in Supabase SQL Editor AFTER Phase 13 schema is applied.
-- Safe to run multiple times (idempotent throughout).


-- ============================================================
-- 1. Remove ALL policies on sessions / votes / reflections
--    App no longer reads or writes these tables (Phase 13).
--    RLS stays enabled → API access is fully blocked.
--    SQL Editor (postgres role) bypasses RLS and can still query.
-- ============================================================

-- sessions: 6 policies (3 anon + 3 authenticated)
DROP POLICY IF EXISTS "Allow anon insert sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anon select sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anon update sessions" ON sessions;
DROP POLICY IF EXISTS "auth_sessions_insert" ON sessions;
DROP POLICY IF EXISTS "auth_sessions_select" ON sessions;
DROP POLICY IF EXISTS "auth_sessions_update" ON sessions;

-- votes: 4 policies (2 anon + 2 authenticated)
DROP POLICY IF EXISTS "Allow anon insert votes" ON votes;
DROP POLICY IF EXISTS "Allow anon select votes" ON votes;
DROP POLICY IF EXISTS "auth_votes_insert" ON votes;
DROP POLICY IF EXISTS "auth_votes_select" ON votes;

-- reflections: 4 policies (2 anon + 2 authenticated)
DROP POLICY IF EXISTS "Allow anon insert reflections" ON reflections;
DROP POLICY IF EXISTS "Allow anon select reflections" ON reflections;
DROP POLICY IF EXISTS "auth_reflections_insert" ON reflections;
DROP POLICY IF EXISTS "auth_reflections_select" ON reflections;


-- ============================================================
-- 2. Backfill: UPDATE existing session_logs with missing fields
--    For session_logs that have a matching sessions row
--    (same scenario_slug, start_time within 5 minutes).
--    Only fills NULL columns — never overwrites existing data.
-- ============================================================

-- Step A: Backfill environment, player_count, teacher_name from sessions
UPDATE session_logs sl
SET
  environment = COALESCE(sl.environment, s.environment),
  player_count = COALESCE(sl.player_count, s.player_count),
  teacher_name = COALESCE(sl.teacher_name, s.teacher_name)
FROM sessions s
WHERE sl.scenario_slug = s.slug
  AND sl.start_time IS NOT NULL
  AND s.started_at IS NOT NULL
  AND ABS(EXTRACT(EPOCH FROM (sl.start_time - s.started_at))) < 300
  AND (sl.environment IS NULL OR sl.player_count IS NULL OR sl.teacher_name IS NULL);

-- Step B: Backfill reflections from reflections table
-- Aggregate per session_id, then match via sessions → session_logs
WITH reflection_agg AS (
  SELECT
    r.session_id,
    jsonb_agg(r.content ORDER BY r.created_at) AS reflections_json
  FROM reflections r
  GROUP BY r.session_id
),
matched AS (
  SELECT
    sl.id AS session_log_id,
    ra.reflections_json
  FROM session_logs sl
  JOIN sessions s
    ON sl.scenario_slug = s.slug
    AND sl.start_time IS NOT NULL
    AND s.started_at IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (sl.start_time - s.started_at))) < 300
  JOIN reflection_agg ra ON ra.session_id = s.id
  WHERE sl.reflections IS NULL
)
UPDATE session_logs sl
SET reflections = m.reflections_json
FROM matched m
WHERE sl.id = m.session_log_id;


-- ============================================================
-- 3. Backfill: INSERT new session_logs for orphaned sessions
--    (sessions that have NO matching session_log)
-- ============================================================

WITH unmatched_sessions AS (
  SELECT s.*
  FROM sessions s
  WHERE NOT EXISTS (
    SELECT 1 FROM session_logs sl
    WHERE sl.scenario_slug = s.slug
      AND sl.start_time IS NOT NULL
      AND s.started_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (sl.start_time - s.started_at))) < 300
  )
),
vote_agg AS (
  SELECT
    v.session_id,
    jsonb_object_agg(v.voter_name, v.suspect_name) AS vote_results,
    jsonb_agg(
      CASE WHEN v.is_correct THEN v.voter_name ELSE NULL END
    ) FILTER (WHERE v.is_correct) AS correct_arr
  FROM votes v
  GROUP BY v.session_id
),
refl_agg AS (
  SELECT
    r.session_id,
    jsonb_agg(r.content ORDER BY r.created_at) AS reflections_json
  FROM reflections r
  GROUP BY r.session_id
)
INSERT INTO session_logs (
  scenario_slug,
  scenario_title,
  start_time,
  end_time,
  duration,
  phase_durations,
  vote_results,
  correct_players,
  reflections,
  environment,
  player_count,
  teacher_name,
  twist_revealed
)
SELECT
  us.slug,
  us.scenario_title,
  us.started_at,
  us.completed_at,
  CASE
    WHEN us.started_at IS NOT NULL AND us.completed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (us.completed_at - us.started_at))::integer
    ELSE NULL
  END,
  us.phase_durations,
  va.vote_results,
  va.correct_arr,
  ra.reflections_json,
  us.environment,
  us.player_count,
  us.teacher_name,
  false
FROM unmatched_sessions us
LEFT JOIN vote_agg va ON va.session_id = us.id
LEFT JOIN refl_agg ra ON ra.session_id = us.id;


-- ============================================================
-- 4. Summary & next steps
-- ============================================================
-- After running this migration:
--
-- [DONE] sessions/votes/reflections are sealed from API access
-- [DONE] Historical data backfilled into session_logs
--
-- These tables are now "dead weight" — data exists but is
-- inaccessible from the app and fully duplicated in session_logs.
--
-- Phase 15+ (when ready):
--   DROP TABLE IF EXISTS reflections;  -- CASCADE from sessions
--   DROP TABLE IF EXISTS votes;        -- CASCADE from sessions
--   DROP TABLE IF EXISTS sessions;
--
-- Prerequisites for DROP:
--   1. Verify backfill completeness:
--      SELECT COUNT(*) FROM sessions;
--      SELECT COUNT(*) FROM session_logs;
--   2. Confirm no external tools query these tables
--   3. Take a DB backup before DROP
