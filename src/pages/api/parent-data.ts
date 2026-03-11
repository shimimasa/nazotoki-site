import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

// Rate limit by code to prevent enumeration
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // per code per hour
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const code = url.searchParams.get('code');
    if (!code || !/^[a-z0-9]{9,16}$/.test(code)) {
      return new Response(
        JSON.stringify({ ok: false, error: '無効なリンクコードです' }),
        { status: 400, headers },
      );
    }

    if (!checkRateLimit(code)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'アクセス制限中です。しばらくお待ちください。' }),
        { status: 429, headers },
      );
    }

    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'サーバー設定エラー' }),
        { status: 500, headers },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Look up student by parent_link_code
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, student_name, class_id, parent_link_code, parent_link_expires_at')
      .eq('parent_link_code', code)
      .maybeSingle();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ ok: false, error: 'リンクが見つかりません。URLを確認してください。' }),
        { status: 404, headers },
      );
    }

    // 2. Check expiration
    if (student.parent_link_expires_at && new Date(student.parent_link_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: false, error: 'このリンクは有効期限切れです。先生にお問い合わせください。' }),
        { status: 410, headers },
      );
    }

    // 3. Fetch class info
    const { data: classInfo } = await supabaseAdmin
      .from('classes')
      .select('name, school_id')
      .eq('id', student.class_id)
      .maybeSingle();

    let schoolName = '';
    if (classInfo?.school_id) {
      const { data: school } = await supabaseAdmin
        .from('schools')
        .select('name')
        .eq('id', classInfo.school_id)
        .maybeSingle();
      schoolName = school?.name || '';
    }

    // 4. Fetch student session logs (class sessions)
    const { data: studentLogs } = await supabaseAdmin
      .from('student_session_logs')
      .select('id, session_log_id, voted_for, vote_reason, is_correct, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // 5. Fetch solo sessions
    const { data: soloSessions } = await supabaseAdmin
      .from('solo_sessions')
      .select('id, scenario_slug, vote, is_correct, rp_earned, completed_at')
      .eq('student_id', student.id)
      .order('completed_at', { ascending: false });

    // 6. Fetch rubric evaluations
    const { data: rubrics } = await supabaseAdmin
      .from('rubric_evaluations')
      .select('id, session_log_id, thinking, expression, collaboration, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          studentName: student.student_name,
          className: classInfo?.name || '',
          schoolName,
          sessionCount: studentLogs?.length || 0,
          soloSessions: soloSessions || [],
          rubrics: rubrics || [],
          recentLogs: (studentLogs || []).slice(0, 5),
        },
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Parent data error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'データの取得中にエラーが発生しました' }),
      { status: 500, headers },
    );
  }
};
