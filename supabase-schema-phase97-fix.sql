-- Phase 97 Fix: Strengthen RLS + UNIQUE constraint for rubric_evaluations
-- Addresses Codex review M1: cross-tenant integrity hole
-- Run AFTER phase 97 migration

-- 1. Drop old unique constraint and add teacher-scoped one
ALTER TABLE rubric_evaluations
  DROP CONSTRAINT IF EXISTS rubric_evaluations_student_id_session_log_id_key;

ALTER TABLE rubric_evaluations
  ADD CONSTRAINT rubric_evaluations_teacher_student_session_key
  UNIQUE(teacher_id, student_id, session_log_id);

-- 2. Replace RLS policy with ownership-chain verification
DROP POLICY IF EXISTS "Teachers can manage own evaluations" ON rubric_evaluations;

CREATE POLICY "Teachers can manage own evaluations"
  ON rubric_evaluations FOR ALL
  USING (
    teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid())
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = teacher_id
    )
    AND session_log_id IN (
      SELECT sl.id FROM session_logs sl
      WHERE sl.teacher_id = teacher_id
    )
  )
  WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid())
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = teacher_id
    )
    AND session_log_id IN (
      SELECT sl.id FROM session_logs sl
      WHERE sl.teacher_id = teacher_id
    )
  );

-- 3. Fix lesson_plans RLS with class ownership verification
DROP POLICY IF EXISTS "Teachers can manage own plans" ON lesson_plans;

CREATE POLICY "Teachers can manage own plans"
  ON lesson_plans FOR ALL
  USING (
    teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid())
    AND class_id IN (
      SELECT c.id FROM classes c
      WHERE c.teacher_id = teacher_id
    )
  )
  WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid())
    AND class_id IN (
      SELECT c.id FROM classes c
      WHERE c.teacher_id = teacher_id
    )
  );
