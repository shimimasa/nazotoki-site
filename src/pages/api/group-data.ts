import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'サーバー設定エラー' }),
        { status: 500, headers },
      );
    }

    // Verify teacher JWT
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: '認証が必要です' }),
        { status: 401, headers },
      );
    }

    const token = authHeader.slice(7);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: '認証に失敗しました' }),
        { status: 401, headers },
      );
    }

    // Verify group_admin role
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id, school_id, group_role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!teacher || teacher.group_role !== 'group_admin') {
      return new Response(
        JSON.stringify({ ok: false, error: 'グループ管理者権限が必要です' }),
        { status: 403, headers },
      );
    }

    // Get group_id from teacher's school
    if (!teacher.school_id) {
      return new Response(
        JSON.stringify({ ok: false, error: '学校に所属していません' }),
        { status: 404, headers },
      );
    }

    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('group_id')
      .eq('id', teacher.school_id)
      .maybeSingle();

    if (!school?.group_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'グループに所属していません' }),
        { status: 404, headers },
      );
    }

    // Fetch group info
    const { data: group } = await supabaseAdmin
      .from('school_groups')
      .select('id, name, contact_email')
      .eq('id', school.group_id)
      .maybeSingle();

    // Fetch all schools in group
    const { data: schools } = await supabaseAdmin
      .from('schools')
      .select('id, name, school_type')
      .eq('group_id', school.group_id)
      .order('name');

    const schoolIds = (schools || []).map((s: { id: string }) => s.id);

    // Fetch stats per school: teacher count, class count, session count, student count
    const schoolStats = await Promise.all(
      schoolIds.map(async (sid: string) => {
        const [teachers, classes, sessions, students] = await Promise.all([
          supabaseAdmin.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', sid),
          supabaseAdmin.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', sid),
          supabaseAdmin.from('session_logs').select('id', { count: 'exact', head: true }).in(
            'class_id',
            (await supabaseAdmin.from('classes').select('id').eq('school_id', sid)).data?.map((c: { id: string }) => c.id) || ['__none__'],
          ),
          supabaseAdmin.from('students').select('id', { count: 'exact', head: true }).in(
            'class_id',
            (await supabaseAdmin.from('classes').select('id').eq('school_id', sid)).data?.map((c: { id: string }) => c.id) || ['__none__'],
          ),
        ]);
        return {
          schoolId: sid,
          teacherCount: teachers.count || 0,
          classCount: classes.count || 0,
          sessionCount: sessions.count || 0,
          studentCount: students.count || 0,
        };
      }),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          group: group || { id: school.group_id, name: '不明', contact_email: null },
          schools: (schools || []).map((s: { id: string; name: string; school_type: string | null }) => {
            const stats = schoolStats.find((st) => st.schoolId === s.id);
            return {
              ...s,
              teacherCount: stats?.teacherCount || 0,
              classCount: stats?.classCount || 0,
              sessionCount: stats?.sessionCount || 0,
              studentCount: stats?.studentCount || 0,
            };
          }),
        },
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Group data error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'グループデータの取得に失敗しました' }),
      { status: 500, headers },
    );
  }
};
