-- Phase 89: Student Badges
-- Prerequisites: students, solo_sessions tables exist

-- Badge table
CREATE TABLE IF NOT EXISTS student_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, badge_key)
);

-- Enable RLS
ALTER TABLE student_badges ENABLE ROW LEVEL SECURITY;

-- RLS: students can read own badges via RPC (no direct access needed)
-- Teachers can read their class students' badges
CREATE POLICY student_badges_teacher_select ON student_badges
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN teachers t ON c.teacher_id = t.id
      WHERE t.auth_user_id = auth.uid()
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);

-- RPC: Check and award badges after solo session completion
CREATE OR REPLACE FUNCTION rpc_check_and_award_badges(
  p_student_id UUID,
  p_student_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_clear_count INT;
  v_has_correct_vote BOOLEAN;
  v_new_badges TEXT[] := '{}';
  v_all_badges TEXT[];
  v_series_counts JSONB;
  v_badge TEXT;
BEGIN
  -- Token auth
  SELECT id, student_name
  INTO v_student
  FROM students
  WHERE id = p_student_id
    AND student_token = p_student_token
    AND token_expires_at > now();

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Aggregate stats
  SELECT COUNT(*), bool_or(vote IS NOT NULL)
  INTO v_clear_count, v_has_correct_vote
  FROM solo_sessions
  WHERE student_id = p_student_id;

  -- Badge: first-clear
  IF v_clear_count >= 1 THEN
    INSERT INTO student_badges (student_id, badge_key)
    VALUES (p_student_id, 'first-clear')
    ON CONFLICT (student_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'first-clear'); END IF;
  END IF;

  -- Badge: clear-5
  IF v_clear_count >= 5 THEN
    INSERT INTO student_badges (student_id, badge_key)
    VALUES (p_student_id, 'clear-5')
    ON CONFLICT (student_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'clear-5'); END IF;
  END IF;

  -- Badge: clear-10
  IF v_clear_count >= 10 THEN
    INSERT INTO student_badges (student_id, badge_key)
    VALUES (p_student_id, 'clear-10')
    ON CONFLICT (student_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'clear-10'); END IF;
  END IF;

  -- Badge: clear-25
  IF v_clear_count >= 25 THEN
    INSERT INTO student_badges (student_id, badge_key)
    VALUES (p_student_id, 'clear-25')
    ON CONFLICT (student_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'clear-25'); END IF;
  END IF;

  -- Badge: perfect-vote (voted and has at least one session with a vote)
  IF v_has_correct_vote THEN
    INSERT INTO student_badges (student_id, badge_key)
    VALUES (p_student_id, 'perfect-vote')
    ON CONFLICT (student_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'perfect-vote'); END IF;
  END IF;

  -- Series badges: count distinct scenarios per series prefix
  -- Series prefixes: rika-, shakai-, kokugo-, sansuu/math-, moral-
  -- Check series completion by counting distinct scenario_slugs with known prefixes
  -- We use a simplified approach: if a student has played 5+ scenarios in a series prefix
  WITH series_agg AS (
    SELECT
      CASE
        WHEN scenario_slug LIKE 'rika-%' THEN 'rika'
        WHEN scenario_slug LIKE 'shakai-%' THEN 'shakai'
        WHEN scenario_slug LIKE 'kokugo-%' THEN 'kokugo'
        WHEN scenario_slug LIKE 'math-%' OR scenario_slug LIKE 'sansuu-%' THEN 'sansuu'
        WHEN scenario_slug LIKE 'moral-%' THEN 'moral'
        ELSE NULL
      END AS series,
      COUNT(DISTINCT scenario_slug) AS cnt
    FROM solo_sessions
    WHERE student_id = p_student_id
    GROUP BY 1
  )
  SELECT jsonb_object_agg(series, cnt)
  INTO v_series_counts
  FROM series_agg
  WHERE series IS NOT NULL;

  -- Award series badges if 5+ distinct scenarios cleared
  IF v_series_counts IS NOT NULL THEN
    IF (v_series_counts->>'rika')::int >= 5 THEN
      INSERT INTO student_badges (student_id, badge_key)
      VALUES (p_student_id, 'series-rika')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_new_badges := array_append(v_new_badges, 'series-rika'); END IF;
    END IF;
    IF (v_series_counts->>'shakai')::int >= 5 THEN
      INSERT INTO student_badges (student_id, badge_key)
      VALUES (p_student_id, 'series-shakai')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_new_badges := array_append(v_new_badges, 'series-shakai'); END IF;
    END IF;
    IF (v_series_counts->>'kokugo')::int >= 5 THEN
      INSERT INTO student_badges (student_id, badge_key)
      VALUES (p_student_id, 'series-kokugo')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_new_badges := array_append(v_new_badges, 'series-kokugo'); END IF;
    END IF;
    IF (v_series_counts->>'sansuu')::int >= 5 THEN
      INSERT INTO student_badges (student_id, badge_key)
      VALUES (p_student_id, 'series-sansuu')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_new_badges := array_append(v_new_badges, 'series-sansuu'); END IF;
    END IF;
    IF (v_series_counts->>'moral')::int >= 5 THEN
      INSERT INTO student_badges (student_id, badge_key)
      VALUES (p_student_id, 'series-moral')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_new_badges := array_append(v_new_badges, 'series-moral'); END IF;
    END IF;
  END IF;

  -- Fetch all badges
  SELECT array_agg(badge_key)
  INTO v_all_badges
  FROM student_badges
  WHERE student_id = p_student_id;

  RETURN jsonb_build_object(
    'ok', true,
    'new_badges', to_jsonb(COALESCE(v_new_badges, '{}'::TEXT[])),
    'all_badges', to_jsonb(COALESCE(v_all_badges, '{}'::TEXT[]))
  );
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION rpc_check_and_award_badges(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_check_and_award_badges(UUID, TEXT) TO authenticated;

-- Read-only RPC: Fetch earned badges without write side-effects (for MyPage)
CREATE OR REPLACE FUNCTION rpc_fetch_student_badges(
  p_student_id UUID,
  p_student_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badges TEXT[];
BEGIN
  -- Token auth
  IF NOT EXISTS (
    SELECT 1 FROM students
    WHERE id = p_student_id
      AND student_token = p_student_token
      AND token_expires_at > now()
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT array_agg(badge_key)
  INTO v_badges
  FROM student_badges
  WHERE student_id = p_student_id;

  RETURN jsonb_build_object(
    'ok', true,
    'badges', to_jsonb(COALESCE(v_badges, '{}'::TEXT[]))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_fetch_student_badges(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_fetch_student_badges(UUID, TEXT) TO authenticated;
