import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const prerender = false;

// In-memory rate limit (resets on cold start — acceptable for Vercel serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // per teacher per hour
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(teacherId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(teacherId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(teacherId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

interface VoteDataItem {
  studentName: string;
  votedFor: string;
  reason: string;
}

interface AnalysisPattern {
  studentLabel: string;
  votedFor: string;
  reason: string;
  pattern: 'logical' | 'emotional' | 'evidence-based' | 'speculative';
  quality: number;
  explanation: string;
}

interface AnalysisResult {
  patterns: AnalysisPattern[];
  summary: string;
  distribution: Record<string, number>;
}

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    // 1. Check required env vars
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicApiKey = import.meta.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'AI分析が設定されていません' }),
        { status: 500, headers },
      );
    }

    // 2. Verify teacher JWT from Authorization header
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

    // 3. Verify user is a teacher AND admin
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!teacher) {
      return new Response(
        JSON.stringify({ ok: false, error: '教員アカウントが必要です' }),
        { status: 403, headers },
      );
    }

    if (teacher.role !== 'admin') {
      return new Response(
        JSON.stringify({ ok: false, error: '管理者権限が必要です' }),
        { status: 403, headers },
      );
    }

    // 4. Parse request body
    const body = await request.json();
    const { sessionLogId, voteData } = body as {
      sessionLogId?: string;
      voteData?: VoteDataItem[];
    };

    if (!sessionLogId || !voteData || voteData.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: '投票データが必要です' }),
        { status: 400, headers },
      );
    }

    // 5. Check cache (before rate limit — cached reads are free)
    const { data: cached } = await supabaseAdmin
      .from('ai_analysis_cache')
      .select('result_json')
      .eq('teacher_id', teacher.id)
      .eq('cache_key', sessionLogId)
      .eq('analysis_type', 'vote_analysis')
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({ ok: true, result: cached.result_json, cached: true }),
        { status: 200, headers },
      );
    }

    // 6. Rate limit check (only for uncached requests that hit Claude API)
    if (!checkRateLimit(teacher.id)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'レート制限に達しました。1時間後にお試しください。' }),
        { status: 429, headers },
      );
    }

    // 7. Anonymize student names for privacy
    const anonymized = voteData.map((v, i) => ({
      label: `生徒${String.fromCharCode(65 + i)}`,
      votedFor: v.votedFor,
      reason: v.reason || '（理由なし）',
    }));

    // 8. Call Claude API (Haiku for cost/speed)
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const prompt = `以下は小中学生の推理ゲーム（教育マダミス）の投票理由です。各生徒の思考パターンを分析してください。

投票データ:
${anonymized.map((a) => `- ${a.label}: ${a.votedFor}に投票「${a.reason}」`).join('\n')}

以下のJSON形式で回答してください（JSONのみ、説明不要）:
{
  "patterns": [
    {
      "studentLabel": "生徒A",
      "votedFor": "投票先",
      "reason": "理由の要約",
      "pattern": "logical|emotional|evidence-based|speculative",
      "quality": 1-5,
      "explanation": "この生徒の推論の特徴を1文で"
    }
  ],
  "summary": "クラス全体の思考傾向を2-3文で",
  "distribution": {
    "logical": 数,
    "emotional": 数,
    "evidence-based": 数,
    "speculative": 数
  }
}

分類基準:
- logical: 証拠と論理を組み合わせて推論している
- emotional: 感情や直感に基づいて判断している
- evidence-based: 具体的な証拠を引用して論じている
- speculative: 推測や仮説ベースで考えている

品質スコア基準:
1: 根拠なし（「なんとなく」等）
2: 曖昧な根拠（「怪しいから」等）
3: 1つの根拠を挙げている
4: 複数の根拠を挙げている
5: 複数の証拠+論理的推論を組み合わせている`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: 'あなたは教育分析の専門家です。小中学生の思考力を正確に分析し、構造化JSONで回答してください。JSONのみを出力し、マークダウンのコードブロックは使わないでください。',
      messages: [{ role: 'user', content: prompt }],
    });

    // 9. Parse and validate response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let rawResult: unknown;
    try {
      rawResult = JSON.parse(responseText);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        rawResult = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('AI応答のJSON解析に失敗しました');
      }
    }

    // Schema validation & clamping
    const parsed = rawResult as Record<string, unknown>;
    const VALID_PATTERNS = new Set(['logical', 'emotional', 'evidence-based', 'speculative']);

    const patterns: AnalysisPattern[] = Array.isArray(parsed.patterns)
      ? parsed.patterns.map((p: Record<string, unknown>) => ({
          studentLabel: String(p.studentLabel || ''),
          votedFor: String(p.votedFor || ''),
          reason: String(p.reason || ''),
          pattern: VALID_PATTERNS.has(String(p.pattern)) ? String(p.pattern) as AnalysisPattern['pattern'] : 'speculative',
          quality: Math.max(1, Math.min(5, Math.round(Number(p.quality) || 1))),
          explanation: String(p.explanation || ''),
        }))
      : [];

    const distribution: Record<string, number> = {};
    if (parsed.distribution && typeof parsed.distribution === 'object') {
      for (const key of ['logical', 'emotional', 'evidence-based', 'speculative']) {
        distribution[key] = Math.max(0, Math.round(Number((parsed.distribution as Record<string, unknown>)[key]) || 0));
      }
    } else {
      // Derive from patterns
      for (const p of patterns) {
        distribution[p.pattern] = (distribution[p.pattern] || 0) + 1;
      }
    }

    const result: AnalysisResult = {
      patterns,
      summary: String(parsed.summary || 'AI分析の要約を取得できませんでした'),
      distribution,
    };

    // 10. Map anonymized labels back to real names
    const nameMap = new Map(anonymized.map((a, i) => [a.label, voteData[i].studentName]));
    result.patterns = result.patterns.map((p) => ({
      ...p,
      studentLabel: nameMap.get(p.studentLabel) || p.studentLabel,
    }));

    // 11. Cache result
    await supabaseAdmin.from('ai_analysis_cache').upsert({
      teacher_id: teacher.id,
      cache_key: sessionLogId,
      analysis_type: 'vote_analysis',
      result_json: result,
      model_used: message.model,
      input_tokens: message.usage?.input_tokens || null,
      output_tokens: message.usage?.output_tokens || null,
    }, { onConflict: 'teacher_id,cache_key,analysis_type' });

    return new Response(
      JSON.stringify({ ok: true, result, cached: false }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Analyze votes error:', err);
    const message = err instanceof Error ? err.message : 'AI分析中にエラーが発生しました';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers },
    );
  }
};
