-- Phase 97: Rubric Evaluations
-- Run AFTER phase 84 migrations

CREATE TABLE IF NOT EXISTS rubric_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id),
  student_id UUID NOT NULL REFERENCES students(id),
  session_log_id UUID NOT NULL REFERENCES session_logs(id),
  scenario_slug TEXT NOT NULL,
  thinking SMALLINT NOT NULL CHECK (thinking BETWEEN 1 AND 4),
  expression SMALLINT NOT NULL CHECK (expression BETWEEN 1 AND 4),
  collaboration SMALLINT NOT NULL CHECK (collaboration BETWEEN 1 AND 4),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, session_log_id)
);

-- RLS
ALTER TABLE rubric_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own evaluations"
  ON rubric_evaluations FOR ALL
  USING (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()))
  WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_rubric_evaluations_session ON rubric_evaluations(session_log_id);
CREATE INDEX idx_rubric_evaluations_student ON rubric_evaluations(student_id);
CREATE INDEX idx_rubric_evaluations_teacher ON rubric_evaluations(teacher_id);
