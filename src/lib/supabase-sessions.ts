/**
 * Class CRUD, Session Logs, GM Memo, Feedback, Assignments (teacher-side)
 * Phase 114: Split from monolithic supabase.ts
 */
import { supabase } from './supabase-client';
import type {
  ClassRow, ClassWithStats, SessionLogRecord, SessionLogRow,
  SessionFeedbackRow, AssignmentRow, AssignmentInsert,
  SessionTemplateRow, SessionTemplateInsert, SessionTemplateUpdate,
} from './supabase-client';

// --- Class CRUD ---

export async function fetchClasses(teacherId: string): Promise<ClassWithStats[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const classIds = data.map((c: ClassRow) => c.id);
  const [sessionRes, studentRes] = await Promise.all([
    supabase.from('session_logs').select('class_id').in('class_id', classIds),
    supabase.from('students').select('class_id').in('class_id', classIds),
  ]);

  const sessionCounts: Record<string, number> = {};
  const studentCounts: Record<string, number> = {};
  (sessionRes.data || []).forEach((r: { class_id: string }) => {
    sessionCounts[r.class_id] = (sessionCounts[r.class_id] || 0) + 1;
  });
  (studentRes.data || []).forEach((r: { class_id: string }) => {
    studentCounts[r.class_id] = (studentCounts[r.class_id] || 0) + 1;
  });

  return data.map((c: ClassRow) => ({
    ...c,
    session_count: sessionCounts[c.id] || 0,
    student_count: studentCounts[c.id] || 0,
  }));
}

export async function createClass(teacherId: string, className: string, gradeLabel: string, description: string, schoolId?: string | null): Promise<ClassRow | null> {
  if (!supabase) return null;
  const row: Record<string, unknown> = {
    teacher_id: teacherId,
    class_name: className,
    grade_label: gradeLabel || null,
    description: description || null,
  };
  if (schoolId) row.school_id = schoolId;
  const { data, error } = await supabase
    .from('classes')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('Failed to create class:', error); return null; }
  return data;
}

export async function updateClass(classId: string, updates: { class_name?: string; grade_label?: string; description?: string }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('classes').update(updates).eq('id', classId);
  if (error) { console.error('Failed to update class:', error); return false; }
  return true;
}

export async function deleteClass(classId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  if (error) { console.error('Failed to delete class:', error); return false; }
  return true;
}

// --- GM Memo functions ---

export async function saveGmMemo(slug: string, memoText: string, teacherId?: string | null) {
  if (!supabase) return;

  if (teacherId) {
    const { data: existing } = await supabase
      .from('gm_memos')
      .select('id')
      .eq('scenario_slug', slug)
      .eq('teacher_id', teacherId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('gm_memos')
        .update({ memo_text: memoText, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) console.error('Failed to update GM memo:', error);
    } else {
      const { error } = await supabase
        .from('gm_memos')
        .insert({
          scenario_slug: slug,
          memo_text: memoText,
          teacher_id: teacherId,
          updated_at: new Date().toISOString(),
        });
      if (error) console.error('Failed to insert GM memo:', error);
    }
  } else {
    const { error } = await supabase.from('gm_memos').upsert(
      {
        scenario_slug: slug,
        memo_text: memoText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scenario_slug' },
    );
    if (error) console.error('Failed to save GM memo:', error);
  }
}

export async function loadGmMemo(slug: string, teacherId?: string | null): Promise<string | null> {
  if (!supabase) return null;

  if (teacherId) {
    const { data } = await supabase
      .from('gm_memos')
      .select('memo_text')
      .eq('scenario_slug', slug)
      .eq('teacher_id', teacherId)
      .single();
    if (data) return data.memo_text;

    const { data: legacy } = await supabase
      .from('gm_memos')
      .select('memo_text')
      .eq('scenario_slug', slug)
      .is('teacher_id', null)
      .single();
    return legacy?.memo_text || null;
  }

  const { data, error } = await supabase
    .from('gm_memos')
    .select('memo_text')
    .eq('scenario_slug', slug)
    .is('teacher_id', null)
    .single();
  if (error || !data) return null;
  return data.memo_text;
}

// --- Session Log functions ---

export async function saveSessionLog(log: SessionLogRecord): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('session_logs').insert(log).select('id').single();
  if (error) { console.error('Failed to save session log:', error); return null; }
  return data?.id || null;
}

export async function fetchSessionLogs(teacherId?: string | null): Promise<SessionLogRow[]> {
  if (!supabase) return [];
  let query = supabase
    .from('session_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (teacherId) {
    query = query.eq('teacher_id', teacherId);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch session logs:', error);
    return [];
  }
  return data || [];
}

export async function fetchSessionLogsByClass(classId: string): Promise<SessionLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function fetchSessionLogById(id: string): Promise<SessionLogRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Failed to fetch session log:', error);
    return null;
  }
  return data;
}

// --- Orphaned Session Logs ---

export async function fetchOrphanedLogs(): Promise<SessionLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .is('teacher_id', null)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch orphaned logs:', error); return []; }
  return data || [];
}

export async function claimOrphanedLogs(logIds: string[], teacherId: string): Promise<number> {
  if (!supabase || logIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('session_logs')
    .update({ teacher_id: teacherId })
    .in('id', logIds)
    .is('teacher_id', null)
    .select('id');
  if (error) { console.error('Failed to claim orphaned logs:', error); return 0; }
  return data?.length || 0;
}

// --- Session Feedback (Phase 91) ---

export async function fetchSessionFeedback(sessionRunId: string): Promise<SessionFeedbackRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_feedback')
    .select('*')
    .eq('session_run_id', sessionRunId)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    return [];
  }
  return data || [];
}

// Phase 119: Fetch all feedback for teacher's sessions (Go/No-Go KPI)
export async function fetchAllTeacherFeedback(): Promise<SessionFeedbackRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_feedback')
    .select('id, session_run_id, participant_id, fun_rating, difficulty_rating, comment, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    return [];
  }
  return data || [];
}

// --- Assignments (Phase 78, teacher-side) ---

export async function fetchAssignments(classId: string): Promise<AssignmentRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch assignments:', error); return []; }
  return data || [];
}

export async function createAssignment(assignment: AssignmentInsert): Promise<AssignmentRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('assignments')
    .insert(assignment)
    .select()
    .single();
  if (error) { console.error('Failed to create assignment:', error); return null; }
  return data;
}

export async function deleteAssignment(assignmentId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (error) { console.error('Failed to delete assignment:', error); return false; }
  return true;
}

// --- Session Templates (Phase 164 / D1) ---

/**
 * Fetch all session templates for a teacher, newest first.
 * RLS ensures only the teacher's own templates are returned.
 */
export async function fetchSessionTemplates(teacherId: string): Promise<SessionTemplateRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_templates')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false });
  if (error) { console.error('Failed to fetch session templates:', error); return []; }
  return (data || []) as SessionTemplateRow[];
}

export async function createSessionTemplate(template: SessionTemplateInsert): Promise<SessionTemplateRow | null> {
  if (!supabase) return null;
  // Normalize: empty string class_id → null (FK)
  const row: SessionTemplateInsert = {
    ...template,
    class_id: template.class_id || null,
  };
  const { data, error } = await supabase
    .from('session_templates')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('Failed to create session template:', error); return null; }
  return data as SessionTemplateRow;
}

export async function updateSessionTemplate(
  templateId: string,
  updates: SessionTemplateUpdate,
): Promise<boolean> {
  if (!supabase) return false;
  const patch: SessionTemplateUpdate = { ...updates };
  if (patch.class_id === undefined) delete patch.class_id;
  else if (!patch.class_id) patch.class_id = null;
  const { error } = await supabase
    .from('session_templates')
    .update(patch)
    .eq('id', templateId);
  if (error) { console.error('Failed to update session template:', error); return false; }
  return true;
}

export async function deleteSessionTemplate(templateId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('session_templates')
    .delete()
    .eq('id', templateId);
  if (error) { console.error('Failed to delete session template:', error); return false; }
  return true;
}
