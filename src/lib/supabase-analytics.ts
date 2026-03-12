/**
 * Analytics, Reports, Rubrics, Lesson Plans, Solo Progress, AI Cache
 * Phase 114: Split from monolithic supabase.ts
 */
import { supabase } from './supabase-client';
import type {
  StudentLogSummary, MonthlyReportRow,
  SoloSessionRow, RubricEvaluationRow, RubricEvaluationUpsert,
  LessonPlanRow, LessonPlanInsert, AiAnalysisCacheRow,
} from './supabase-client';

// --- Analytics: student log summaries ---

export async function fetchStudentLogSummaries(studentIds: string[]): Promise<StudentLogSummary[]> {
  if (!supabase || studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('student_session_logs')
    .select('student_id, is_correct, vote_reason, created_at')
    .in('student_id', studentIds);
  if (error) { console.error('Failed to fetch student log summaries:', error); return []; }
  return data || [];
}

// --- Monthly Reports ---

export async function fetchMonthlyReports(teacherId: string): Promise<MonthlyReportRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
      console.error('Failed to fetch monthly reports:', error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function saveMonthlyReport(
  teacherId: string,
  year: number,
  month: number,
  summaryJson: Record<string, unknown>,
  insightsJson: Record<string, unknown>,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('monthly_reports')
      .upsert(
        {
          teacher_id: teacherId,
          year,
          month,
          summary_json: summaryJson,
          insights_json: insightsJson,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'teacher_id,year,month' },
      );
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return false;
      console.error('Failed to save monthly report:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// --- Solo Progress (Phase 80) ---

export async function fetchSoloSessionsForStudents(studentIds: string[]): Promise<SoloSessionRow[]> {
  if (!supabase || studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('solo_sessions')
    .select('id, student_id, scenario_slug, completed_at, duration_seconds, vote, vote_reason, is_correct, rp_earned, created_at')
    .in('student_id', studentIds)
    .order('completed_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    console.error('Failed to fetch solo sessions:', error);
    return [];
  }
  return data || [];
}

// --- Rubric Evaluations (Phase 97) ---

export async function fetchRubricEvaluations(sessionLogId: string): Promise<RubricEvaluationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('rubric_evaluations')
    .select('*')
    .eq('session_log_id', sessionLogId)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    return [];
  }
  return data || [];
}

export async function fetchRubricEvaluationsByStudents(studentIds: string[]): Promise<RubricEvaluationRow[]> {
  if (!supabase || studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('rubric_evaluations')
    .select('*')
    .in('student_id', studentIds)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    return [];
  }
  return data || [];
}

export async function upsertRubricEvaluations(evaluations: RubricEvaluationUpsert[]): Promise<boolean> {
  if (!supabase || evaluations.length === 0) return false;
  const { error } = await supabase
    .from('rubric_evaluations')
    .upsert(evaluations, { onConflict: 'teacher_id,student_id,session_log_id' });
  if (error) {
    console.error('Failed to upsert rubric evaluations:', error);
    return false;
  }
  return true;
}

// --- Lesson Plans (Phase 99) ---

export async function fetchLessonPlans(teacherId: string): Promise<LessonPlanRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('lesson_plans')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('planned_date', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    return [];
  }
  return data || [];
}

export async function createLessonPlan(plan: LessonPlanInsert): Promise<LessonPlanRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert(plan)
    .select()
    .single();
  if (error) {
    console.error('Failed to create lesson plan:', error);
    return null;
  }
  return data;
}

export async function updateLessonPlan(id: string, updates: Partial<Pick<LessonPlanRow, 'scenario_slug' | 'planned_date' | 'notes' | 'status'>>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('lesson_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('Failed to update lesson plan:', error);
    return false;
  }
  return true;
}

export async function deleteLessonPlan(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('lesson_plans')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Failed to delete lesson plan:', error);
    return false;
  }
  return true;
}

// --- AI Analysis Cache (Phase 104) ---

export async function fetchAiAnalysisCache(
  teacherId: string,
  cacheKey: string,
  analysisType: string,
): Promise<AiAnalysisCacheRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ai_analysis_cache')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('cache_key', cacheKey)
    .eq('analysis_type', analysisType)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null;
    return null;
  }
  return data;
}

export async function upsertAiAnalysisCache(row: {
  teacher_id: string;
  cache_key: string;
  analysis_type: string;
  result_json: unknown;
  model_used: string;
  input_tokens?: number;
  output_tokens?: number;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('ai_analysis_cache')
    .upsert(row, { onConflict: 'teacher_id,cache_key,analysis_type' });
  if (error) {
    console.error('Failed to upsert ai analysis cache:', error);
    return false;
  }
  return true;
}
