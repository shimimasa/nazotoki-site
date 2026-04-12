-- ==========================================================================
-- Phase 164 (D1): Session Templates
--
-- Adds the session_templates table so teachers can save named presets
-- (scenario × class × player count × environment) and start sessions in
-- one tap from PrepPhase.
--
-- Run order: After supabase-schema-phase131.sql
-- Dependencies: teachers (phase 12), classes (phase 12)
-- ==========================================================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  scenario_slug text NOT NULL,
  scenario_title text NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  player_count int NOT NULL DEFAULT 4 CHECK (player_count > 0 AND player_count <= 40),
  environment text NOT NULL DEFAULT 'classroom'
    CHECK (environment IN ('classroom', 'dayservice', 'home')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_templates_teacher
  ON public.session_templates(teacher_id);

CREATE INDEX IF NOT EXISTS idx_session_templates_updated
  ON public.session_templates(teacher_id, updated_at DESC);

-- 2) Row Level Security
ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select_own" ON public.session_templates;
CREATE POLICY "templates_select_own"
  ON public.session_templates
  FOR SELECT
  USING (
    teacher_id = (SELECT id FROM public.teachers WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "templates_insert_own" ON public.session_templates;
CREATE POLICY "templates_insert_own"
  ON public.session_templates
  FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT id FROM public.teachers WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "templates_update_own" ON public.session_templates;
CREATE POLICY "templates_update_own"
  ON public.session_templates
  FOR UPDATE
  USING (
    teacher_id = (SELECT id FROM public.teachers WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    teacher_id = (SELECT id FROM public.teachers WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "templates_delete_own" ON public.session_templates;
CREATE POLICY "templates_delete_own"
  ON public.session_templates
  FOR DELETE
  USING (
    teacher_id = (SELECT id FROM public.teachers WHERE auth_user_id = auth.uid())
  );

-- 3) Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.session_templates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_templates_updated_at ON public.session_templates;
CREATE TRIGGER trg_session_templates_updated_at
  BEFORE UPDATE ON public.session_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.session_templates_set_updated_at();
