-- Phase 99: Lesson Plans
-- Run AFTER phase 97 migration

CREATE TABLE IF NOT EXISTS lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  scenario_slug TEXT NOT NULL,
  planned_date DATE NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own plans"
  ON lesson_plans FOR ALL
  USING (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()))
  WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_lesson_plans_teacher ON lesson_plans(teacher_id);
CREATE INDEX idx_lesson_plans_date ON lesson_plans(planned_date);
CREATE INDEX idx_lesson_plans_class ON lesson_plans(class_id);
