import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchSoloSessionsForStudents,
  fetchRubricEvaluationsByStudents,
  fetchStudentHistory,
  type SoloSessionRow,
  type RubricEvaluationRow,
  type StudentRow,
  type SessionLogRow,
} from '../../lib/supabase';

interface Props {
  student: StudentRow;
  className: string;
  schoolName?: string;
  sessions: SessionLogRow[];
  onBack: () => void;
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

function getSeries(slug: string): string {
  if (slug.startsWith('science-file')) return 'サイエンス・ファイル';
  if (slug.startsWith('shakai-file')) return '社会科ファイル';
  if (slug.startsWith('kokugo-mystery')) return '国語ミステリー';
  if (slug.startsWith('suiri-puzzle')) return '推理パズル';
  if (slug.startsWith('moral-dilemma')) return 'モラルジレンマ';
  return 'ナゾトキ探偵団';
}

export default function ParentReport({ student, className, schoolName, sessions, onBack }: Props) {
  const [soloSessions, setSoloSessions] = useState<SoloSessionRow[]>([]);
  const [rubrics, setRubrics] = useState<RubricEvaluationRow[]>([]);
  const [studentSessionCount, setStudentSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSoloSessionsForStudents([student.id]),
      fetchRubricEvaluationsByStudents([student.id]),
      fetchStudentHistory(student.id),
    ]).then(([solo, rub, history]) => {
      setSoloSessions(solo);
      setRubrics(rub);
      setStudentSessionCount(history.length);
      setLoading(false);
    });
  }, [student.id]);

  const totalRp = useMemo(() => soloSessions.reduce((sum, s) => sum + (s.rp_earned || 0), 0), [soloSessions]);
  const rank = getRank(totalRp);

  const subjectAccuracy = useMemo(() => {
    const subjects = ['理科', '社会', '国語', '算数', '道徳'];
    const subjectMap: Record<string, { correct: number; total: number }> = {};
    for (const sub of subjects) subjectMap[sub] = { correct: 0, total: 0 };
    for (const s of soloSessions) {
      const sub = getSubject(s.scenario_slug);
      if (subjectMap[sub]) {
        subjectMap[sub].total++;
        if (s.vote) subjectMap[sub].correct++;
      }
    }
    return subjects.map((sub) => ({
      subject: sub,
      rate: subjectMap[sub].total > 0 ? Math.round((subjectMap[sub].correct / subjectMap[sub].total) * 100) : 0,
      count: subjectMap[sub].total,
    }));
  }, [soloSessions]);

  const seriesDistribution = useMemo(() => {
    const seriesMap: Record<string, number> = {};
    for (const s of soloSessions) {
      const series = getSeries(s.scenario_slug);
      seriesMap[series] = (seriesMap[series] || 0) + 1;
    }
    return Object.entries(seriesMap).sort((a, b) => b[1] - a[1]);
  }, [soloSessions]);

  const maxSeriesCount = useMemo(() => Math.max(...seriesDistribution.map(([, c]) => c), 1), [seriesDistribution]);

  const today = new Date().toLocaleDateString('ja-JP');

  if (loading) {
    return <div class="text-center py-12 text-gray-400">読み込み中...</div>;
  }

  return (
    <div>
      {/* Screen-only buttons */}
      <div class="flex items-center gap-3 mb-4 print:hidden">
        <button onClick={onBack} class="text-amber-600 font-bold hover:text-amber-700">
          ← 戻る
        </button>
        <button
          onClick={() => window.print()}
          class="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
        >
          印刷
        </button>
      </div>

      {/* Report content */}
      <div class="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:shadow-none print:p-4">
        {/* Header */}
        <div class="text-center mb-6 pb-4 border-b-2 border-gray-300">
          <h1 class="text-xl font-black">学習進捗レポート</h1>
          <div class="text-sm text-gray-600 mt-2">
            {schoolName && <span>{schoolName} / </span>}
            <span>{className}</span>
          </div>
          <div class="text-lg font-bold mt-2">{student.student_name}</div>
          <div class="text-xs text-gray-400 mt-1">出力日: {today}</div>
        </div>

        {/* Summary Cards */}
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="text-center p-3 bg-blue-50 rounded-lg">
            <div class="text-2xl font-black text-blue-600">{studentSessionCount}</div>
            <div class="text-xs text-gray-600">セッション参加</div>
          </div>
          <div class="text-center p-3 bg-amber-50 rounded-lg">
            <div class="text-2xl font-black text-amber-600">{soloSessions.length}</div>
            <div class="text-xs text-gray-600">ソロクリア</div>
          </div>
          <div class="text-center p-3 bg-green-50 rounded-lg">
            <div class="text-2xl font-black text-green-600">{totalRp}</div>
            <div class="text-xs text-gray-600">累計RP</div>
          </div>
          <div class="text-center p-3 bg-purple-50 rounded-lg">
            <div class="text-lg">{rank.icon}</div>
            <div class="text-xs font-bold text-purple-700">{rank.name}</div>
          </div>
        </div>

        {/* Rubric averages (if available) */}
        {rubrics.length > 0 && (
          <div class="mb-6">
            <h3 class="font-bold text-sm mb-3">観点別評価（平均）</h3>
            {(['thinking', 'expression', 'collaboration'] as const).map((field) => {
              const avg = rubrics.reduce((s, r) => s + r[field], 0) / rubrics.length;
              const pct = (avg / 4) * 100;
              const label = field === 'thinking' ? '思考力' : field === 'expression' ? '表現力' : '協働力';
              const grade = avg >= 3.5 ? 'A' : avg >= 2.5 ? 'B' : avg >= 1.5 ? 'C' : 'D';
              return (
                <div key={field} class="flex items-center gap-2 mb-2">
                  <div class="w-16 text-xs font-medium text-gray-600">{label}</div>
                  <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      class={`h-full rounded-full ${avg >= 3 ? 'bg-green-400' : avg >= 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div class="w-12 text-xs font-bold text-right">{grade} ({avg.toFixed(1)})</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Subject Accuracy */}
        <div class="mb-6">
          <h3 class="font-bold text-sm mb-3">教科別プレイ数</h3>
          {subjectAccuracy.map((sa) => (
            <div key={sa.subject} class="flex items-center gap-2 mb-2">
              <div class="w-12 text-xs font-medium text-gray-600">{sa.subject}</div>
              <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  class="bg-amber-400 h-full rounded-full"
                  style={{ width: `${sa.count > 0 ? Math.max((sa.count / Math.max(...subjectAccuracy.map((s) => s.count), 1)) * 100, 5) : 0}%` }}
                />
              </div>
              <div class="w-10 text-xs text-gray-500 text-right">{sa.count}回</div>
            </div>
          ))}
        </div>

        {/* Series Distribution */}
        {seriesDistribution.length > 0 && (
          <div class="mb-6">
            <h3 class="font-bold text-sm mb-3">シリーズ別プレイ分布</h3>
            {seriesDistribution.map(([series, count]) => (
              <div key={series} class="flex items-center gap-2 mb-2">
                <div class="w-32 text-xs font-medium text-gray-600 truncate">{series}</div>
                <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    class="bg-indigo-400 h-full rounded-full"
                    style={{ width: `${(count / maxSeriesCount) * 100}%` }}
                  />
                </div>
                <div class="w-10 text-xs text-gray-500 text-right">{count}回</div>
              </div>
            ))}
          </div>
        )}

        {/* Teacher Comment */}
        <div class="mb-6">
          <h3 class="font-bold text-sm mb-2">先生からのコメント</h3>
          <textarea
            value={comment}
            onInput={(e: Event) => setComment((e.target as HTMLTextAreaElement).value)}
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm print:hidden"
            rows={3}
            placeholder="保護者向けのコメントを入力..."
          />
          {comment && (
            <div class="hidden print:block text-sm text-gray-800 border border-gray-200 rounded-lg p-3">
              {comment}
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="text-center pt-4 border-t border-gray-200 text-xs text-gray-400">
          ナゾトキ探偵団 学習進捗レポート — {today}
        </div>
      </div>
    </div>
  );
}
