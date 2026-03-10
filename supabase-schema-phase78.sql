-- ==========================================================================
-- Phase 78: Assignment Delivery (Teacher -> Class)
--
-- Changes:
--   1. CREATE TABLE assignments (teacher assigns scenarios to classes)
--   2. RPC: rpc_fetch_student_assignments (anon, SECURITY DEFINER)
--   3. RLS: teachers can CRUD their own assignments
--
-- Run order: After phase 75 migration
-- ==========================================================================

-- 1. Assignments table
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  scenario_slug text NOT NULL,
  scenario_title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Teachers can manage their own assignments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assignments' AND policyname='teacher_assignments_select') THEN
    CREATE POLICY "teacher_assignments_select" ON assignments FOR SELECT TO authenticated
      USING (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assignments' AND policyname='teacher_assignments_insert') THEN
    CREATE POLICY "teacher_assignments_insert" ON assignments FOR INSERT TO authenticated
      WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assignments' AND policyname='teacher_assignments_delete') THEN
    CREATE POLICY "teacher_assignments_delete" ON assignments FOR DELETE TO authenticated
      USING (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));
  END IF;
END $$;


-- ==========================================================================
-- 2. RPC: rpc_fetch_student_assignments
--    Fetch assignments for a student's class, with completion status.
--    Called by anon (student) with token auth.
-- ==========================================================================
CREATE OR REPLACE FUNCTION rpc_fetch_student_assignments(
  p_student_id uuid,
  p_student_token text
)
RETURNS jsonb AS $$
DECLARE
  v_student record;
BEGIN
  -- Validate student token
  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND student_token = p_student_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_student.token_expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  RETURN jsonb_build_object(
    'assignments', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'scenario_slug', a.scenario_slug,
          'scenario_title', a.scenario_title,
          'description', a.description,
          'due_date', a.due_date,
          'created_at', a.created_at,
          'completed', EXISTS (
            SELECT 1 FROM public.solo_sessions ss
            WHERE ss.student_id = p_student_id
              AND ss.scenario_slug = a.scenario_slug
              AND ss.completed_at IS NOT NULL
          ),
          'rp_earned', (
            SELECT COALESCE(MAX(ss2.rp_earned), 0)
            FROM public.solo_sessions ss2
            WHERE ss2.student_id = p_student_id
              AND ss2.scenario_slug = a.scenario_slug
          )
        ) ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC
      ), '[]'::jsonb)
      FROM public.assignments a
      WHERE a.class_id = v_student.class_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
