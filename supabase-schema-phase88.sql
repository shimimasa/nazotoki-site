-- Phase 88: Class Leaderboard RPC
-- Prerequisites: solo_sessions, students tables exist

-- RPC: Fetch class leaderboard (top 20 by total RP, anonymized)
CREATE OR REPLACE FUNCTION rpc_fetch_class_leaderboard(
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
  v_class_id UUID;
  v_result JSONB;
BEGIN
  -- Token auth
  SELECT id, class_id, student_name
  INTO v_student
  FROM students
  WHERE id = p_student_id
    AND student_token = p_student_token
    AND token_expires_at > now();

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  v_class_id := v_student.class_id;

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_class');
  END IF;

  -- Aggregate leaderboard: top 20 classmates by total RP
  SELECT jsonb_build_object(
    'ok', true,
    'leaderboard', COALESCE(jsonb_agg(row_data ORDER BY rn), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'rank', rn,
        'student_name', CASE
          WHEN s.id = p_student_id THEN s.student_name
          ELSE format('探偵%s', rn)
        END,
        'total_rp', COALESCE(agg.total_rp, 0),
        'clear_count', COALESCE(agg.clear_count, 0),
        'is_me', (s.id = p_student_id)
      ) AS row_data,
      rn
    FROM (
      SELECT
        s2.id AS student_id,
        COALESCE(SUM(ss.rp_earned), 0) AS total_rp,
        COUNT(ss.id) AS clear_count,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(ss.rp_earned), 0) DESC, MIN(ss.completed_at) ASC) AS rn
      FROM students s2
      LEFT JOIN solo_sessions ss ON ss.student_id = s2.id
      WHERE s2.class_id = v_class_id
      GROUP BY s2.id
    ) agg
    JOIN students s ON s.id = agg.student_id
    WHERE agg.rn <= 20
  ) sub;

  RETURN v_result;
END;
$$;

-- Grant execute to anon (token-authenticated)
GRANT EXECUTE ON FUNCTION rpc_fetch_class_leaderboard(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_fetch_class_leaderboard(UUID, TEXT) TO authenticated;
