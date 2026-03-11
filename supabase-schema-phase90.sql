-- Phase 90: Streak calculation + RP multiplier
-- Extends rpc_save_solo_session to calculate streak and apply RP bonus

-- Helper function: Calculate current streak for a student (JST-based)
CREATE OR REPLACE FUNCTION calc_student_streak(p_student_id UUID)
RETURNS TABLE(current_streak INT, multiplier NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak INT := 0;
  v_check_date DATE;
  v_found BOOLEAN;
BEGIN
  -- Get today in JST (UTC+9)
  v_check_date := (now() AT TIME ZONE 'Asia/Tokyo')::date;

  -- Check if played today
  SELECT EXISTS(
    SELECT 1 FROM solo_sessions
    WHERE student_id = p_student_id
      AND (completed_at AT TIME ZONE 'Asia/Tokyo')::date = v_check_date
  ) INTO v_found;

  IF v_found THEN
    v_streak := 1;
  ELSE
    -- Check if played yesterday (potential streak continuation)
    v_check_date := v_check_date - 1;
    SELECT EXISTS(
      SELECT 1 FROM solo_sessions
      WHERE student_id = p_student_id
        AND (completed_at AT TIME ZONE 'Asia/Tokyo')::date = v_check_date
    ) INTO v_found;

    IF NOT v_found THEN
      -- No play today or yesterday: streak is 0
      current_streak := 0;
      multiplier := 1.0;
      RETURN NEXT;
      RETURN;
    END IF;
    v_streak := 1;
  END IF;

  -- Count backwards from the day before
  LOOP
    v_check_date := v_check_date - 1;
    SELECT EXISTS(
      SELECT 1 FROM solo_sessions
      WHERE student_id = p_student_id
        AND (completed_at AT TIME ZONE 'Asia/Tokyo')::date = v_check_date
    ) INTO v_found;

    IF v_found THEN
      v_streak := v_streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  current_streak := v_streak;

  -- Multiplier table
  IF v_streak >= 14 THEN
    multiplier := 2.0;
  ELSIF v_streak >= 7 THEN
    multiplier := 1.5;
  ELSIF v_streak >= 3 THEN
    multiplier := 1.2;
  ELSE
    multiplier := 1.0;
  END IF;

  RETURN NEXT;
END;
$$;

-- RPC: Fetch streak info for MyPage display
CREATE OR REPLACE FUNCTION rpc_fetch_student_streak(
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
  v_streak_data RECORD;
BEGIN
  -- Token auth
  SELECT id INTO v_student
  FROM students
  WHERE id = p_student_id
    AND student_token = p_student_token
    AND token_expires_at > now();

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_streak_data FROM calc_student_streak(p_student_id);

  RETURN jsonb_build_object(
    'ok', true,
    'streak', v_streak_data.current_streak,
    'multiplier', v_streak_data.multiplier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_fetch_student_streak(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_fetch_student_streak(UUID, TEXT) TO authenticated;
