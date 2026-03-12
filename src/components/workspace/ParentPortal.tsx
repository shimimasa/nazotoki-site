import { useState, useEffect, useMemo } from 'preact/hooks';

interface SoloSession {
  id: string;
  scenario_slug: string;
  vote: string | null;
  is_correct: boolean | null;
  rp_earned: number | null;
  completed_at: string | null;
}

interface RubricEval {
  id: string;
  session_log_id: string;
  thinking: number;
  expression: number;
  collaboration: number;
  created_at: string;
}

interface ParentData {
  studentName: string;
  className: string;
  schoolName: string;
  sessionCount: number;
  soloSessions: SoloSession[];
  rubrics: RubricEval[];
  recentLogs: { id: string; created_at: string }[];
}

interface Props {
  code: string;
}

const RANKS = [
  { name: '見習い探偵', minRp: 0, icon: '🔍' },
  { name: '新人探偵', minRp: 150, icon: '🔎' },
  { name: '一人前探偵', minRp: 500, icon: '🕵️' },
  { name: 'ベテラン探偵', minRp: 1500, icon: '🎩' },
  { name: '名探偵', minRp: 3000, icon: '⭐' },
  { name: '伝説の探偵', minRp: 5000, icon: '👑' },
];

function getRank(rp: number) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (rp >= RANKS[i].minRp) return RANKS[i];
  }
  return RANKS[0];
}

function getSubject(slug: string): string {
  if (slug.startsWith('science-file')) return '理科';
  if (slug.startsWith('shakai-file')) return '社会';
  if (slug.startsWith('kokugo-mystery')) return '国語';
  if (slug.startsWith('suiri-puzzle')) return '算数';
  if (slug.startsWith('moral-dilemma')) return '道徳';
  return '総合';
}

export default function ParentPortal({ code }: Props) {
  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('リンクコードが指定されていません');
      setLoading(false);
      return;
    }
    fetch(`/api/parent-data?code=${encodeURIComponent(code)}`)
      .then(res => res.json())
      .then(json => {
        if (!json.ok) {
          setError(json.error || 'データの取得に失敗しました');
        } else {
          setData(json.data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('通信エラーが発生しました');
        setLoading(false);
      });
  }, [code]);

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">📊</div>
        <p class="font-bold">読み込み中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div class="max-w-md mx-auto text-center py-16">
        <div class="text-5xl mb-4">😔</div>
        <h2 class="text-xl font-black text-gray-800 mb-2">ページを表示できません</h2>
        <p class="text-gray-500 mb-6">{error || 'データが見つかりませんでした'}</p>
        <a href="/" class="text-amber-600 font-bold hover:underline">
          トップページに戻る
        </a>
      </div>
    );
  }

  return <ParentDashboard data={data} />;
}

function ParentDashboard({ data }: { data: ParentData }) {
  const totalRp = useMemo(
    () => data.soloSessions.reduce((sum, s) => sum + (s.rp_earned || 0), 0),
    [data.soloSessions],
  );
  const rank = getRank(totalRp);

  const subjectStats = useMemo(() => {
    const subjects = ['理科', '社会', '国語', '算数', '道徳', '総合'];
    const map: Record<string, number> = {};
    for (const sub of subjects) map[sub] = 0;
    for (const s of data.soloSessions) {
      const sub = getSubject(s.scenario_slug);
      map[sub] = (map[sub] || 0) + 1;
    }
    return subjects
      .map(sub => ({ subject: sub, count: map[sub] || 0 }))
      .filter(s => s.count > 0);
  }, [data.soloSessions]);

  const maxSubjectCount = useMemo(
    () => Math.max(...subjectStats.map(s => s.count), 1),
    [subjectStats],
  );

  const rubricAvg = useMemo(() => {
    if (data.rubrics.length === 0) return null;
    const sum = { thinking: 0, expression: 0, collaboration: 0 };
    for (const r of data.rubrics) {
      sum.thinking += r.thinking;
      sum.expression += r.expression;
      sum.collaboration += r.collaboration;
    }
    const n = data.rubrics.length;
    return {
      thinking: sum.thinking / n,
      expression: sum.expression / n,
      collaboration: sum.collaboration / n,
    };
  }, [data.rubrics]);

  const today = new Date().toLocaleDateString('ja-JP');

  return (
    <div class="max-w-2xl mx-auto">
      {/* Header */}
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div class="text-center">
          <div class="text-3xl mb-2">{rank.icon}</div>
          <h1 class="text-xl font-black text-gray-900">{data.studentName} さんの学習記録</h1>
          <div class="text-sm text-gray-500 mt-1">
            {data.schoolName && <span>{data.schoolName} / </span>}
            <span>{data.className}</span>
          </div>
          <div class="inline-block mt-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">
            {rank.name}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-blue-600">{data.sessionCount}</div>
          <div class="text-xs text-gray-500 mt-1">授業参加</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-amber-600">{data.soloSessions.length}</div>
          <div class="text-xs text-gray-500 mt-1">ソロクリア</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-green-600">{totalRp}</div>
          <div class="text-xs text-gray-500 mt-1">累計RP</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-purple-600">
            {data.soloSessions.filter(s => s.is_correct === true).length}
          </div>
          <div class="text-xs text-gray-500 mt-1">正解数</div>
        </div>
      </div>

      {/* Rubric Evaluation */}
      {rubricAvg && (
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 class="text-sm font-black text-gray-800 mb-4">観点別評価（平均）</h2>
          {([
            { key: 'thinking' as const, label: '思考力' },
            { key: 'expression' as const, label: '表現力' },
            { key: 'collaboration' as const, label: '協働力' },
          ]).map(({ key, label }) => {
            const avg = rubricAvg[key];
            const pct = (avg / 4) * 100;
            const grade = avg >= 3.5 ? 'A' : avg >= 2.5 ? 'B' : avg >= 1.5 ? 'C' : 'D';
            return (
              <div key={key} class="flex items-center gap-3 mb-3">
                <div class="w-14 text-xs font-bold text-gray-600">{label}</div>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    class={`h-full rounded-full flex items-center justify-end pr-2 ${
                      avg >= 3 ? 'bg-green-400' : avg >= 2 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.max(pct, 10)}%` }}
                  >
                    <span class="text-xs font-bold text-white">{grade}</span>
                  </div>
                </div>
                <div class="w-10 text-xs font-bold text-gray-500 text-right">{avg.toFixed(1)}</div>
              </div>
            );
          })}
          <p class="text-xs text-gray-400 mt-2">A(3.5以上) B(2.5以上) C(1.5以上) D(1.5未満) — 4段階評価</p>
        </div>
      )}

      {/* Subject Distribution */}
      {subjectStats.length > 0 && (
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 class="text-sm font-black text-gray-800 mb-4">教科別プレイ数</h2>
          {subjectStats.map(({ subject, count }) => (
            <div key={subject} class="flex items-center gap-3 mb-2">
              <div class="w-12 text-xs font-bold text-gray-600">{subject}</div>
              <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  class="bg-amber-400 h-full rounded-full"
                  style={{ width: `${(count / maxSubjectCount) * 100}%` }}
                />
              </div>
              <div class="w-10 text-xs text-gray-500 text-right">{count}回</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      {data.soloSessions.length > 0 && (
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 class="text-sm font-black text-gray-800 mb-4">最近のプレイ履歴</h2>
          <div class="space-y-2">
            {data.soloSessions.slice(0, 5).map((s) => (
              <div key={s.id} class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{s.is_correct === true ? '✅' : s.is_correct === false ? '❌' : '➖'}</span>
                  <span class="text-sm text-gray-700">{getSubject(s.scenario_slug)}</span>
                </div>
                <div class="flex items-center gap-3">
                  {s.rp_earned != null && s.rp_earned > 0 && (
                    <span class="text-xs font-bold text-green-600">+{s.rp_earned}RP</span>
                  )}
                  <span class="text-xs text-gray-400">
                    {s.completed_at ? new Date(s.completed_at).toLocaleDateString('ja-JP') : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div class="text-center py-6 text-xs text-gray-400">
        <p>ナゾトキ探偵団 保護者ポータル — {today}</p>
        <p class="mt-1">このページは先生が発行したリンクからのみアクセスできます</p>
      </div>
    </div>
  );
}
