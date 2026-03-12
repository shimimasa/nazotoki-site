/**
 * Student CRUD, PIN Auth, Parent Links, Badges, Streaks, Leaderboard
 * Phase 114: Split from monolithic supabase.ts
 */
import { supabase } from './supabase-client';
import type {
  StudentRow, StudentCredential, StudentLoginResult, StudentWithClass,
  StudentSessionLogRow, StudentSessionLogInsert, SessionLogRow,
  StudentAssignment, StreakInfo, LeaderboardEntry,
} from './supabase-client';

// --- Student Auth (PIN-based, Phase 74) ---

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

// --- Student CRUD ---

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
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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

// --- Student Assignments (Phase 78) ---

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

// --- Bulk student fetch (used by analytics & admin) ---

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
