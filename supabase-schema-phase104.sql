-- Phase 104: AI Analysis Cache table
-- 教員のClaude API分析結果をキャッシュするテーブル

-- ai_analysis_cache
CREATE TABLE IF NOT EXISTS ai_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('vote_analysis', 'solo_feedback', 'class_insight')),
  result_json JSONB NOT NULL,
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens INT,
  output_tokens INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, cache_key, analysis_type)
);

ALTER TABLE ai_analysis_cache ENABLE ROW LEVEL SECURITY;

-- RLS: Teachers can only access their own cache
DROP POLICY IF EXISTS "Teachers can manage own cache" ON ai_analysis_cache;
CREATE POLICY "Teachers can manage own cache"
  ON ai_analysis_cache FOR ALL
  USING (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()))
  WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE auth_user_id = auth.uid()));
