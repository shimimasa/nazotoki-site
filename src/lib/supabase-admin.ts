/**
 * School Management, Admin Functions, Teacher Invitations, Role Audit
 * Phase 114: Split from monolithic supabase.ts
 */
import { supabase } from './supabase-client';
import type {
  SchoolRow, SchoolProfileUpdate, ClassRow, ClassWithStats, SessionLogRow,
  SchoolTeacher, TeacherRole, RoleChangeLog, RoleChangeLogQuery, PaginatedRoleChangeLogs,
  TeacherInvitationRow, InvitationPreview, InvitationConsumeResult, StudentWithClass,
} from './supabase-client';
import { fetchAllStudentsForTeacher } from './supabase-students';

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

export async function updateSchoolProfile(schoolId: string, updates: SchoolProfileUpdate): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('schools')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', schoolId);
  if (error) { console.error('Failed to update school profile:', error); return false; }
  return true;
}

export async function assignTeacherSchool(teacherId: string, schoolId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('teachers')
    .update({ school_id: schoolId })
    .eq('id', teacherId);
  if (error) { console.error('Failed to assign school:', error); return false; }
  return true;
}

export async function ensureTeacherSchool(teacherId: string, teacherName: string): Promise<string | null> {
  if (!supabase) return null;
  const { data: teacher } = await supabase
    .from('teachers')
    .select('school_id')
    .eq('id', teacherId)
    .single();
  if (teacher?.school_id) return teacher.school_id;

  const school = await createSchool(`${teacherName}の学校`);
  if (!school) return null;

  const ok = await assignTeacherSchool(teacherId, school.id);
  if (!ok) return null;

  return school.id;
}

// --- School-scoped fetch functions ---

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

export async function fetchSchoolSessionLogs(schoolId: string): Promise<SessionLogRow[]> {
  if (!supabase) return [];
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

export async function fetchSchoolTeachers(schoolId: string): Promise<SchoolTeacher[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teachers')
    .select('id, display_name, role, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true });
  if (error) { console.error('Failed to fetch school teachers:', error); return []; }
  const teachers = (data || []) as Array<Omit<SchoolTeacher, 'role'> & { role: TeacherRole | null }>;
  return teachers.map((t) => ({
    ...t,
    role: t.role || 'teacher',
  }));
}

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

export async function fetchRoleChangeLogs(schoolId: string, limit = 20): Promise<RoleChangeLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('role_change_logs')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
    console.error('Failed to fetch role change logs:', error);
    return [];
  }
  return data || [];
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

export async function previewTeacherInvitation(token: string): Promise<InvitationPreview> {
  if (!supabase) return { valid: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('preview_teacher_invitation', {
    invite_token: token,
  });
  if (error) return { valid: false, error: error.message };
  return data as InvitationPreview;
}

export async function consumeTeacherInvitation(token: string): Promise<InvitationConsumeResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('consume_teacher_invitation', {
    invite_token: token,
  });
  if (error) return { ok: false, error: error.message };
  return data as InvitationConsumeResult;
}

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
