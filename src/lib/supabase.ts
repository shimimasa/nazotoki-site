import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// --- Auth & Teacher Profile ---

export type TeacherRole = 'teacher' | 'admin';
export type SubscriptionPlan = 'free' | 'standard' | 'school';

export type GroupRole = 'group_admin' | null;

export interface TeacherProfile {
  id: string;
  auth_user_id: string;
  display_name: string;
  school_id: string | null;
  role: TeacherRole;
  group_role: GroupRole;
  subscription_plan: SubscriptionPlan;
  subscription_status: string;
  created_at: string;
}

// --- Plan limits (Phase 109) ---

const PLAN_LIMITS = {
  free: { maxClasses: 1, maxScenarios: 10, aiAnalysis: false },
  standard: { maxClasses: Infinity, maxScenarios: Infinity, aiAnalysis: true },
  school: { maxClasses: Infinity, maxScenarios: Infinity, aiAnalysis: true },
} as const;

export function getPlanLimits(plan: SubscriptionPlan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function isPremiumFeature(plan: SubscriptionPlan): boolean {
  return plan === 'standard' || plan === 'school';
}

// --- School Group (Phase 110) ---

export interface SchoolGroupRow {
  id: string;
  name: string;
  contact_email: string | null;
  created_at: string;
}

// --- School ---

export type SchoolType = 'elementary' | 'junior_high' | 'high' | 'combined' | 'special_needs' | 'other';

export interface SchoolRow {
  id: string;
  name: string;
  school_type: SchoolType | null;
  address: string | null;
  principal_name: string | null;
  phone_number: string | null;
  website_url: string | null;
  contact_email: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolProfileUpdate {
  name?: string;
  school_type?: SchoolType | null;
  address?: string | null;
  principal_name?: string | null;
  phone_number?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
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

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
  return { error: error?.message || null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message || null };
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
  if (data) {
    // Ensure role/plan fallback for pre-migration data
    return { ...data, role: data.role || 'teacher', group_role: data.group_role || null, subscription_plan: data.subscription_plan || 'free', subscription_status: data.subscription_status || 'active' };
  }
  // OAuth first login: auto-create teacher profile from auth user metadata
  const meta = user.user_metadata || {};
  const displayName = meta.full_name || meta.name || user.email?.split('@')[0] || '先生';
  const { data: newTeacher, error: insertError } = await supabase
    .from('teachers')
    .insert({ auth_user_id: user.id, display_name: displayName })
    .select()
    .single();
  if (insertError) {
    console.error('Auto-create teacher failed:', insertError);
    return null;
  }
  return { ...newTeacher, role: newTeacher.role || 'teacher', subscription_plan: newTeacher.subscription_plan || 'free', subscription_status: newTeacher.subscription_status || 'active' };
}

export function detectSchoolDomain(email: string): string | null {
  const match = email.match(/@(.+)$/);
  if (!match) return null;
  const domain = match[1];
  // Japanese school domains: *.ed.jp, *.ac.jp
  if (domain.endsWith('.ed.jp') || domain.endsWith('.ac.jp')) {
    // Extract school name from domain (e.g., "shimizu.ed.jp" → "shimizu")
    const parts = domain.split('.');
    return parts[0] || null;
  }
  return null;
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

// --- Student CRUD ---

export interface StudentRow {
  id: string;
  class_id: string;
  student_name: string;
  login_id: string | null;
  pin_hash: string | null;
  student_token: string | null;
  token_expires_at: string | null;
  parent_link_code: string | null;
  parent_link_expires_at: string | null;
  created_at: string;
}

// --- Student Auth (PIN-based, Phase 74) ---

export interface StudentCredential {
  student_id: string;
  student_name: string;
  login_id: string;
  pin: string | null;
  already_exists: boolean;
}

export interface StudentLoginResult {
  student_id: string;
  student_name: string;
  class_id: string;
  login_id: string;
  student_token: string;
  token_expires_at: string;
}

const LS_STUDENT_ID = 'nazotoki-student-id';
const LS_STUDENT_TOKEN = 'nazotoki-student-token';

export async function studentLogin(loginId: string, pin: string): Promise<{ data: StudentLoginResult | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('rpc_student_login', {
    p_login_id: loginId,
    p_pin: pin,
  });
  if (error) return { data: null, error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { data: null, error: result.error as string };
  return { data: result as unknown as StudentLoginResult, error: null };
}

export async function verifyStudentToken(): Promise<{ student_id: string; student_name: string; class_id: string; login_id: string } | null> {
  if (!supabase) return null;
  const savedId = typeof window !== 'undefined' ? localStorage.getItem(LS_STUDENT_ID) : null;
  const savedToken = typeof window !== 'undefined' ? localStorage.getItem(LS_STUDENT_TOKEN) : null;
  if (!savedId || !savedToken) return null;
  const { data } = await supabase.rpc('rpc_verify_student_token', {
    p_student_id: savedId,
    p_token: savedToken,
  });
  const result = data as Record<string, unknown> | null;
  if (!result || result.error) return null;
  return result as unknown as { student_id: string; student_name: string; class_id: string; login_id: string };
}

export async function generateStudentCredentials(classId: string): Promise<{ credentials: StudentCredential[] | null; error: string | null }> {
  if (!supabase) return { credentials: null, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('rpc_generate_student_credentials', {
    p_class_id: classId,
  });
  if (error) return { credentials: null, error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { credentials: null, error: result.error as string };
  return { credentials: result.credentials as StudentCredential[], error: null };
}

export async function resetStudentPin(studentId: string): Promise<{ login_id: string; pin: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('rpc_reset_student_pin', {
    p_student_id: studentId,
  });
  if (error) return null;
  const result = data as Record<string, unknown>;
  if (result.error) return null;
  return { login_id: result.login_id as string, pin: result.pin as string };
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

// --- Parent Link (Phase 108) ---

export async function generateParentLink(studentId: string): Promise<{ code: string; expiresAt: string } | null> {
  if (!supabase) return null;
  const code = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36])
    .join('');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('students')
    .update({ parent_link_code: code, parent_link_expires_at: expiresAt })
    .eq('id', studentId);
  if (error) { console.error('Failed to generate parent link:', error); return null; }
  return { code, expiresAt };
}

export async function revokeParentLink(studentId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('students')
    .update({ parent_link_code: null, parent_link_expires_at: null })
    .eq('id', studentId);
  if (error) { console.error('Failed to revoke parent link:', error); return false; }
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
  reflections?: string[] | null;
  environment?: string | null;
  player_count?: number | null;
  teacher_name?: string | null;
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
  reflections: string[] | null;
  environment: string | null;
  player_count: number | null;
  teacher_name: string | null;
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

// --- Orphaned Session Logs (teacher_id IS NULL) ---

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

// --- Analytics: bulk fetch for teacher-wide student analysis ---

export interface StudentWithClass {
  id: string;
  student_name: string;
  class_id: string;
  class_name: string;
}

export async function fetchAllStudentsForTeacher(classIds: string[]): Promise<StudentWithClass[]> {
  if (!supabase || classIds.length === 0) return [];
  const { data, error } = await supabase
    .from('students')
    .select('id, student_name, class_id, classes(class_name)')
    .in('class_id', classIds)
    .order('student_name');
  if (error) { console.error('Failed to fetch all students:', error); return []; }
  return (data || []).map((row: any) => ({
    id: row.id,
    student_name: row.student_name,
    class_id: row.class_id,
    class_name: row.classes?.class_name || '',
  }));
}

export interface StudentLogSummary {
  student_id: string;
  is_correct: boolean | null;
  vote_reason: string | null;
  created_at: string;
}

export async function fetchStudentLogSummaries(studentIds: string[]): Promise<StudentLogSummary[]> {
  if (!supabase || studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('student_session_logs')
    .select('student_id, is_correct, vote_reason, created_at')
    .in('student_id', studentIds);
  if (error) { console.error('Failed to fetch student log summaries:', error); return []; }
  return data || [];
}

// --- Monthly Reports (optional persistence) ---

export interface MonthlyReportRow {
  id: string;
  teacher_id: string;
  year: number;
  month: number;
  summary_json: Record<string, unknown>;
  insights_json: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

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
      // Table may not exist yet — graceful fallback
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

// --- School functions ---

export async function fetchSchool(schoolId: string): Promise<SchoolRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', schoolId)
    .single();
  if (error) { console.error('Failed to fetch school:', error); return null; }
  return data;
}

export async function createSchool(name: string): Promise<SchoolRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('schools')
    .insert({ name })
    .select()
    .single();
  if (error) { console.error('Failed to create school:', error); return null; }
  return data;
}

export async function updateSchoolName(schoolId: string, name: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('schools')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', schoolId);
  if (error) { console.error('Failed to update school:', error); return false; }
  return true;
}

/** Update school profile fields (admin only at UI level) */
export async function updateSchoolProfile(schoolId: string, updates: SchoolProfileUpdate): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('schools')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', schoolId);
  if (error) { console.error('Failed to update school profile:', error); return false; }
  return true;
}

/** Assign a school to the current teacher (for initial setup) */
export async function assignTeacherSchool(teacherId: string, schoolId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('teachers')
    .update({ school_id: schoolId })
    .eq('id', teacherId);
  if (error) { console.error('Failed to assign school:', error); return false; }
  return true;
}

/** Create a school and assign it to the teacher in one step */
export async function ensureTeacherSchool(teacherId: string, teacherName: string): Promise<string | null> {
  if (!supabase) return null;
  // Check if teacher already has a school
  const { data: teacher } = await supabase
    .from('teachers')
    .select('school_id')
    .eq('id', teacherId)
    .single();
  if (teacher?.school_id) return teacher.school_id;

  // Create a new school
  const school = await createSchool(`${teacherName}の学校`);
  if (!school) return null;

  // Assign to teacher
  const ok = await assignTeacherSchool(teacherId, school.id);
  if (!ok) return null;

  return school.id;
}

// --- School-scoped fetch functions ---

/** Fetch all classes belonging to a school */
export async function fetchSchoolClasses(schoolId: string): Promise<ClassWithStats[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const classIds = data.map((c: ClassRow) => c.id);
  if (classIds.length === 0) return data.map((c: ClassRow) => ({ ...c, session_count: 0, student_count: 0 }));

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

/** Fetch all session logs for classes belonging to a school */
export async function fetchSchoolSessionLogs(schoolId: string): Promise<SessionLogRow[]> {
  if (!supabase) return [];
  // Get all class IDs for this school
  const { data: classData } = await supabase
    .from('classes')
    .select('id')
    .eq('school_id', schoolId);
  if (!classData || classData.length === 0) return [];

  const classIds = classData.map((c: { id: string }) => c.id);
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .in('class_id', classIds)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch school session logs:', error); return []; }
  return data || [];
}

/** Fetch all students for classes belonging to a school */
export async function fetchSchoolStudents(schoolId: string): Promise<StudentWithClass[]> {
  if (!supabase) return [];
  const { data: classData } = await supabase
    .from('classes')
    .select('id')
    .eq('school_id', schoolId);
  if (!classData || classData.length === 0) return [];

  const classIds = classData.map((c: { id: string }) => c.id);
  return fetchAllStudentsForTeacher(classIds);
}

// --- Admin: School teacher management ---

export interface SchoolTeacher {
  id: string;
  display_name: string;
  role: TeacherRole;
  created_at: string;
}

/** Fetch teachers in the same school (admin only — requires admin_teachers_select RLS) */
export async function fetchSchoolTeachers(schoolId: string): Promise<SchoolTeacher[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teachers')
    .select('id, display_name, role, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true });
  if (error) { console.error('Failed to fetch school teachers:', error); return []; }
  return (data || []).map((t: any) => ({
    ...t,
    role: t.role || 'teacher',
  }));
}

/** Update a teacher's role via secure RPC (admin only) */
export async function updateTeacherRole(
  targetTeacherId: string,
  newRole: TeacherRole,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('update_teacher_role', {
    target_teacher_id: targetTeacherId,
    new_role: newRole,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as string;
  if (result === 'ok') return { ok: true };
  return { ok: false, error: result };
}

// --- Admin: Role Change Audit Logs ---

export interface RoleChangeLog {
  id: string;
  school_id: string;
  actor_teacher_id: string;
  target_teacher_id: string;
  action: string;
  before_role: string;
  after_role: string;
  created_at: string;
}

/** Fetch role change audit logs for a school (admin only — requires admin_role_change_logs_select RLS) */
export async function fetchRoleChangeLogs(schoolId: string, limit = 20): Promise<RoleChangeLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('role_change_logs')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Table may not exist yet — graceful fallback
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    console.error('Failed to fetch role change logs:', error);
    return [];
  }
  return data || [];
}

/** Paginated fetch of role change audit logs with filters (admin only) */
export interface RoleChangeLogQuery {
  schoolId: string;
  page?: number;
  pageSize?: number;
  actorTeacherId?: string;
  targetTeacherId?: string;
  roleChange?: 'promoted' | 'demoted';
}

export interface PaginatedRoleChangeLogs {
  items: RoleChangeLog[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export async function fetchRoleChangeLogsPaginated(params: RoleChangeLogQuery): Promise<PaginatedRoleChangeLogs> {
  const empty: PaginatedRoleChangeLogs = { items: [], totalCount: 0, page: 1, pageSize: 20 };
  if (!supabase) return empty;

  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('role_change_logs')
    .select('*', { count: 'exact' })
    .eq('school_id', params.schoolId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.actorTeacherId) {
    query = query.eq('actor_teacher_id', params.actorTeacherId);
  }
  if (params.targetTeacherId) {
    query = query.eq('target_teacher_id', params.targetTeacherId);
  }
  if (params.roleChange === 'promoted') {
    query = query.eq('before_role', 'teacher').eq('after_role', 'admin');
  } else if (params.roleChange === 'demoted') {
    query = query.eq('before_role', 'admin').eq('after_role', 'teacher');
  }

  const { data, error, count } = await query;
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return empty;
    console.error('Failed to fetch paginated role change logs:', error);
    return empty;
  }
  return {
    items: data || [],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

// --- Admin: Teacher Invitations ---

export interface TeacherInvitationRow {
  id: string;
  school_id: string;
  invited_by_teacher_id: string;
  invite_email: string | null;
  token: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  used_by_teacher_id: string | null;
  created_at: string;
}

export interface InvitationPreview {
  valid: boolean;
  error?: string;
  school_name?: string;
  expires_at?: string;
}

export interface InvitationConsumeResult {
  ok: boolean;
  error?: string;
  status?: 'joined' | 'already_member';
}

/** Fetch invitations for a school (admin only) */
export async function fetchTeacherInvitations(schoolId: string): Promise<TeacherInvitationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teacher_invitations')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    console.error('Failed to fetch invitations:', error);
    return [];
  }
  return data || [];
}

/** Create a teacher invitation via RPC (admin only) */
export async function createTeacherInvitation(
  inviteEmail?: string | null,
): Promise<{ ok: boolean; token?: string; expiresAt?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('create_teacher_invitation', {
    invite_email: inviteEmail || null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { ok: false, error: result.error as string };
  return {
    ok: true,
    token: result.token as string,
    expiresAt: result.expires_at as string,
  };
}

/** Preview an invitation (minimal info, no admin required) */
export async function previewTeacherInvitation(token: string): Promise<InvitationPreview> {
  if (!supabase) return { valid: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('preview_teacher_invitation', {
    invite_token: token,
  });
  if (error) return { valid: false, error: error.message };
  return data as InvitationPreview;
}

/** Consume an invitation (authenticated user accepts) */
export async function consumeTeacherInvitation(token: string): Promise<InvitationConsumeResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('consume_teacher_invitation', {
    invite_token: token,
  });
  if (error) return { ok: false, error: error.message };
  return data as InvitationConsumeResult;
}

/** Send invitation email via server API (client-side helper) */
export async function sendInvitationEmail(params: {
  email: string;
  inviteLink: string;
  schoolName: string;
  expiresAt: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/send-invitation-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch {
    return { ok: false, error: 'メール送信リクエストに失敗しました' };
  }
}

// --- Assignments (Phase 78) ---

export interface AssignmentRow {
  id: string;
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  scenario_title: string;
  description: string;
  due_date: string | null;
  created_at: string;
}

export interface AssignmentInsert {
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  scenario_title: string;
  description?: string;
  due_date?: string | null;
}

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

export interface StudentAssignment {
  id: string;
  scenario_slug: string;
  scenario_title: string;
  description: string;
  due_date: string | null;
  created_at: string;
  completed: boolean;
  rp_earned: number;
}

export async function fetchStudentAssignments(
  studentId: string,
  studentToken: string,
): Promise<{ assignments: StudentAssignment[]; error?: string }> {
  if (!supabase) return { assignments: [], error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('rpc_fetch_student_assignments', {
    p_student_id: studentId,
    p_student_token: studentToken,
  });
  if (error) return { assignments: [], error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { assignments: [], error: result.error as string };
  return { assignments: (result.assignments as StudentAssignment[]) || [] };
}

// --- Badge Definitions (Phase 89) ---

export const BADGE_DEFS: { key: string; icon: string; label: string; description: string }[] = [
  { key: 'first-clear', icon: '\uD83D\uDD30', label: '\u521D\u30AF\u30EA\u30A2', description: '\u521D\u3081\u3066\u306E\u30B7\u30CA\u30EA\u30AA\u3092\u30AF\u30EA\u30A2' },
  { key: 'clear-5', icon: '\u2B50', label: '5\u56DE\u30AF\u30EA\u30A2', description: '5\u3064\u306E\u30B7\u30CA\u30EA\u30AA\u3092\u30AF\u30EA\u30A2' },
  { key: 'clear-10', icon: '\uD83C\uDF1F', label: '10\u56DE\u30AF\u30EA\u30A2', description: '10\u500B\u306E\u30B7\u30CA\u30EA\u30AA\u3092\u30AF\u30EA\u30A2' },
  { key: 'clear-25', icon: '\uD83D\uDCAB', label: '25\u56DE\u30AF\u30EA\u30A2', description: '25\u500B\u306E\u30B7\u30CA\u30EA\u30AA\u3092\u30AF\u30EA\u30A2' },
  { key: 'perfect-vote', icon: '\uD83C\uDFAF', label: '\u63A8\u7406\u767A\u8868', description: '\u6295\u7968\u3067\u63A8\u7406\u3092\u767A\u8868\u3057\u305F' },
  { key: 'series-rika', icon: '\uD83D\uDD2C', label: '\u7406\u79D1\u30DE\u30B9\u30BF\u30FC', description: '\u7406\u79D1\u30B7\u30EA\u30FC\u30BA\u3092\u5168\u30AF\u30EA\u30A2' },
  { key: 'series-shakai', icon: '\uD83C\uDFDB\uFE0F', label: '\u793E\u4F1A\u30DE\u30B9\u30BF\u30FC', description: '\u793E\u4F1A\u30B7\u30EA\u30FC\u30BA\u3092\u5168\u30AF\u30EA\u30A2' },
  { key: 'series-kokugo', icon: '\uD83D\uDCD6', label: '\u56FD\u8A9E\u30DE\u30B9\u30BF\u30FC', description: '\u56FD\u8A9E\u30B7\u30EA\u30FC\u30BA\u3092\u5168\u30AF\u30EA\u30A2' },
  { key: 'series-sansuu', icon: '\uD83D\uDD22', label: '\u7B97\u6570\u30DE\u30B9\u30BF\u30FC', description: '\u7B97\u6570\u30B7\u30EA\u30FC\u30BA\u3092\u5168\u30AF\u30EA\u30A2' },
  { key: 'series-moral', icon: '\uD83D\uDC9B', label: '\u9053\u5FB3\u30DE\u30B9\u30BF\u30FC', description: '\u9053\u5FB3\u30B7\u30EA\u30FC\u30BA\u3092\u5168\u30AF\u30EA\u30A2' },
];

export async function checkAndAwardBadges(
  studentId: string,
  studentToken: string,
): Promise<{ new_badges: string[]; all_badges: string[]; error?: string }> {
  if (!supabase) return { new_badges: [], all_badges: [], error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('rpc_check_and_award_badges', {
    p_student_id: studentId,
    p_student_token: studentToken,
  });
  if (error) return { new_badges: [], all_badges: [], error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { new_badges: [], all_badges: [], error: result.error as string };
  return {
    new_badges: (result.new_badges as string[]) || [],
    all_badges: (result.all_badges as string[]) || [],
  };
}

/** Read-only badge fetch for MyPage (no write side-effects) */
export async function fetchStudentBadges(
  studentId: string,
  studentToken: string,
): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('rpc_fetch_student_badges', {
    p_student_id: studentId,
    p_student_token: studentToken,
  });
  if (error) return [];
  const result = data as Record<string, unknown>;
  if (result.error) return [];
  return (result.badges as string[]) || [];
}

// --- Streak (Phase 90) ---

export interface StreakInfo {
  streak: number;
  multiplier: number;
}

export async function fetchStudentStreak(
  studentId: string,
  studentToken: string,
): Promise<StreakInfo> {
  if (!supabase) return { streak: 0, multiplier: 1.0 };
  const { data, error } = await supabase.rpc('rpc_fetch_student_streak', {
    p_student_id: studentId,
    p_student_token: studentToken,
  });
  if (error) return { streak: 0, multiplier: 1.0 };
  const result = data as Record<string, unknown>;
  if (result.error) return { streak: 0, multiplier: 1.0 };
  return {
    streak: (result.streak as number) || 0,
    multiplier: (result.multiplier as number) || 1.0,
  };
}

// --- Class Leaderboard (Phase 88) ---

export interface LeaderboardEntry {
  rank: number;
  student_name: string;
  total_rp: number;
  clear_count: number;
  is_me: boolean;
}

export async function fetchClassLeaderboard(
  studentId: string,
  studentToken: string,
): Promise<{ leaderboard: LeaderboardEntry[]; error?: string }> {
  if (!supabase) return { leaderboard: [], error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('rpc_fetch_class_leaderboard', {
    p_student_id: studentId,
    p_student_token: studentToken,
  });
  if (error) return { leaderboard: [], error: error.message };
  const result = data as Record<string, unknown>;
  if (result.error) return { leaderboard: [], error: result.error as string };
  return { leaderboard: (result.leaderboard as LeaderboardEntry[]) || [] };
}

// --- Session Feedback (Phase 91, teacher-side) ---

export interface SessionFeedbackRow {
  id: string;
  session_run_id: string;
  participant_id: string;
  fun_rating: number;
  difficulty_rating: number;
  comment: string;
  created_at: string;
}

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

// --- Solo Progress (Phase 80, teacher-side) ---

export interface SoloSessionRow {
  id: string;
  student_id: string;
  scenario_slug: string;
  completed_at: string | null;
  duration_seconds: number | null;
  vote: string | null;
  vote_reason: string | null;
  rp_earned: number;
  created_at: string;
}

export async function fetchSoloSessionsForStudents(studentIds: string[]): Promise<SoloSessionRow[]> {
  if (!supabase || studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('solo_sessions')
    .select('id, student_id, scenario_slug, completed_at, duration_seconds, vote, vote_reason, rp_earned, created_at')
    .in('student_id', studentIds)
    .order('completed_at', { ascending: false });
  if (error) {
    // Table may not exist yet
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    console.error('Failed to fetch solo sessions:', error);
    return [];
  }
  return data || [];
}

// --- Rubric Evaluations (Phase 97) ---

export interface RubricEvaluationRow {
  id: string;
  teacher_id: string;
  student_id: string;
  session_log_id: string;
  scenario_slug: string;
  thinking: number;
  expression: number;
  collaboration: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface RubricEvaluationUpsert {
  teacher_id: string;
  student_id: string;
  session_log_id: string;
  scenario_slug: string;
  thinking: number;
  expression: number;
  collaboration: number;
  comment?: string;
}

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

export interface LessonPlanRow {
  id: string;
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  planned_date: string;
  notes: string;
  status: 'planned' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface LessonPlanInsert {
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  planned_date: string;
  notes?: string;
}

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

export interface AiAnalysisCacheRow {
  id: string;
  teacher_id: string;
  cache_key: string;
  analysis_type: 'vote_analysis' | 'solo_feedback' | 'class_insight';
  result_json: unknown;
  model_used: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

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
