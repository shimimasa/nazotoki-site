import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// --- Auth & Teacher Profile ---

export interface TeacherProfile {
  id: string;
  auth_user_id: string;
  display_name: string;
  created_at: string;
}

export async function signUp(email: string, password: string, displayName: string): Promise<{ teacher: TeacherProfile | null; error: string | null }> {
  if (!supabase) return { teacher: null, error: 'Supabase not configured' };
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError || !authData.user) return { teacher: null, error: authError?.message || 'Sign up failed' };

  const { data: teacher, error: profileError } = await supabase
    .from('teachers')
    .insert({ auth_user_id: authData.user.id, display_name: displayName })
    .select()
    .single();
  if (profileError) return { teacher: null, error: profileError.message };
  return { teacher, error: null };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message || null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentTeacher(): Promise<TeacherProfile | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('teachers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();
  return data || null;
}

export function onAuthStateChange(callback: (teacher: TeacherProfile | null) => void) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      const teacher = await getCurrentTeacher();
      callback(teacher);
    } else if (event === 'SIGNED_OUT') {
      callback(null);
    }
  });
  return { unsubscribe: () => subscription.unsubscribe() };
}

// --- Class CRUD ---

export interface ClassRow {
  id: string;
  teacher_id: string;
  class_name: string;
  grade_label: string | null;
  description: string | null;
  created_at: string;
}

export interface ClassWithStats extends ClassRow {
  session_count: number;
  student_count: number;
}

export async function fetchClasses(teacherId: string): Promise<ClassWithStats[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  // Get session counts and student counts
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

export async function createClass(teacherId: string, className: string, gradeLabel: string, description: string): Promise<ClassRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('classes')
    .insert({
      teacher_id: teacherId,
      class_name: className,
      grade_label: gradeLabel || null,
      description: description || null,
    })
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

// --- Student CRUD ---

export interface StudentRow {
  id: string;
  class_id: string;
  student_name: string;
  created_at: string;
}

export async function fetchStudents(classId: string): Promise<StudentRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });
  if (error) { console.error('Failed to fetch students:', error); return []; }
  return data || [];
}

export async function addStudent(classId: string, studentName: string): Promise<StudentRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('students')
    .insert({ class_id: classId, student_name: studentName })
    .select()
    .single();
  if (error) { console.error('Failed to add student:', error); return null; }
  return data;
}

export async function addStudentsBulk(classId: string, names: string[]): Promise<StudentRow[]> {
  if (!supabase || names.length === 0) return [];
  const rows = names.map((n) => ({ class_id: classId, student_name: n }));
  const { data, error } = await supabase.from('students').insert(rows).select();
  if (error) { console.error('Failed to bulk add students:', error); return []; }
  return data || [];
}

export async function deleteStudent(studentId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('students').delete().eq('id', studentId);
  if (error) { console.error('Failed to delete student:', error); return false; }
  return true;
}

// --- Student Session Logs ---

export interface StudentSessionLogRow {
  id: string;
  session_log_id: string;
  student_id: string;
  voted_for: string | null;
  vote_reason: string | null;
  is_correct: boolean | null;
  created_at: string;
}

export interface StudentSessionLogInsert {
  session_log_id: string;
  student_id: string;
  voted_for?: string;
  vote_reason?: string;
  is_correct?: boolean;
}

export async function saveStudentSessionLogs(logs: StudentSessionLogInsert[]): Promise<boolean> {
  if (!supabase || logs.length === 0) return false;
  const { error } = await supabase.from('student_session_logs').insert(logs);
  if (error) { console.error('Failed to save student session logs:', error); return false; }
  return true;
}

export async function fetchStudentSessionLogs(sessionLogId: string): Promise<StudentSessionLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('student_session_logs')
    .select('*')
    .eq('session_log_id', sessionLogId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function fetchStudentHistory(studentId: string): Promise<(StudentSessionLogRow & { session_log: SessionLogRow })[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('student_session_logs')
    .select('*, session_log:session_logs(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch student history:', error); return []; }
  return (data || []).map((row: any) => ({
    ...row,
    session_log: row.session_log as SessionLogRow,
  }));
}

export interface SessionRecord {
  teacher_name: string;
  slug: string;
  scenario_title: string;
  environment: 'classroom' | 'dayservice' | 'home';
  player_count: number;
  started_at: string;
  completed_at?: string;
  phase_durations?: Record<string, number>;
}

export interface VoteRecord {
  session_id: string;
  voter_name: string;
  suspect_name: string;
  is_correct: boolean;
}

export interface ReflectionRecord {
  session_id: string;
  content: string;
}

export async function createSession(data: SessionRecord) {
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from('sessions')
    .insert(data)
    .select('id')
    .single();
  if (error) {
    console.error('Failed to create session:', error);
    return null;
  }
  return row.id as string;
}

export async function completeSession(
  sessionId: string,
  phaseDurations: Record<string, number>,
) {
  if (!supabase) return;
  await supabase
    .from('sessions')
    .update({
      completed_at: new Date().toISOString(),
      phase_durations: phaseDurations,
    })
    .eq('id', sessionId);
}

export async function saveVotes(votes: VoteRecord[]) {
  if (!supabase || votes.length === 0) return;
  await supabase.from('votes').insert(votes);
}

export async function saveReflections(reflections: ReflectionRecord[]) {
  if (!supabase || reflections.length === 0) return;
  await supabase.from('reflections').insert(reflections);
}

// --- GM Memo functions ---

export async function saveGmMemo(slug: string, memoText: string, teacherId?: string | null) {
  if (!supabase) return;

  if (teacherId) {
    // Teacher-aware save: check if exists, then insert or update
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
    // Legacy: upsert without teacher_id (backward compat)
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
    // Try teacher-specific memo first
    const { data } = await supabase
      .from('gm_memos')
      .select('memo_text')
      .eq('scenario_slug', slug)
      .eq('teacher_id', teacherId)
      .single();
    if (data) return data.memo_text;

    // Fall back to legacy memo (teacher_id IS NULL)
    const { data: legacy } = await supabase
      .from('gm_memos')
      .select('memo_text')
      .eq('scenario_slug', slug)
      .is('teacher_id', null)
      .single();
    return legacy?.memo_text || null;
  }

  // No teacher: legacy behavior
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

export interface SessionLogRecord {
  scenario_slug: string;
  scenario_title: string;
  start_time: string | null;
  end_time: string;
  duration: number | null;
  phase_durations: Record<string, number>;
  vote_results: Record<string, string>;
  vote_reasons: Record<string, string>;
  discovered_evidence: number[];
  twist_revealed: boolean;
  correct_players: string[] | null;
  gm_memo: string;
  teacher_id?: string | null;
  class_id?: string | null;
}

export async function saveSessionLog(log: SessionLogRecord): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('session_logs').insert(log).select('id').single();
  if (error) { console.error('Failed to save session log:', error); return null; }
  return data?.id || null;
}

// --- Session Logs query functions ---

export interface SessionLogRow {
  id: string;
  scenario_slug: string;
  scenario_title: string | null;
  start_time: string | null;
  end_time: string | null;
  duration: number | null;
  phase_durations: Record<string, number> | null;
  vote_results: Record<string, string> | null;
  vote_reasons: Record<string, string> | null;
  discovered_evidence: number[] | null;
  twist_revealed: boolean;
  correct_players: string[] | null;
  gm_memo: string | null;
  teacher_id: string | null;
  class_id: string | null;
  created_at: string;
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

export async function fetchSessionLogById(
  id: string,
): Promise<SessionLogRow | null> {
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

// --- Dashboard query functions ---

export interface SessionRow {
  id: string;
  teacher_name: string;
  slug: string;
  scenario_title: string;
  environment: string;
  player_count: number;
  started_at: string;
  completed_at: string | null;
  phase_durations: Record<string, number> | null;
  created_at: string;
}

export interface VoteRow {
  id: string;
  session_id: string;
  voter_name: string;
  suspect_name: string;
  is_correct: boolean;
}

export interface ReflectionRow {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
}

export async function fetchSessions(): Promise<SessionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) {
    console.error('Failed to fetch sessions:', error);
    return [];
  }
  return data || [];
}

export async function fetchSessionDetail(sessionId: string) {
  if (!supabase) return null;
  const [sessionRes, votesRes, reflectionsRes] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', sessionId).single(),
    supabase.from('votes').select('*').eq('session_id', sessionId),
    supabase.from('reflections').select('*').eq('session_id', sessionId),
  ]);
  if (sessionRes.error) return null;
  return {
    session: sessionRes.data as SessionRow,
    votes: (votesRes.data || []) as VoteRow[],
    reflections: (reflectionsRes.data || []) as ReflectionRow[],
  };
}
