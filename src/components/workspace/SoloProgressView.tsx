import { useState, useEffect } from 'preact/hooks';
import {
  fetchSoloSessionsForStudents,
  type SoloSessionRow,
  type StudentRow,
} from '../../lib/supabase';

interface Props {
  students: StudentRow[];
}

// Rank definitions (same as MyPage)
const RANKS = [
  { name: '見習い', minRp: 0 },
  { name: '新人', minRp: 150 },
  { name: '一人前', minRp: 500 },
  { name: 'ベテラン', minRp: 1500 },
  { name: '名探偵', minRp: 3000 },
  { name: '伝説', minRp: 5000 },
];

function getRankName(totalRp: number): string {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalRp >= RANKS[i].minRp) return RANKS[i].name;
  }
  return RANKS[0].name;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface StudentSoloSummary {
  student: StudentRow;
  sessions: SoloSessionRow[];
  totalRp: number;
  uniqueScenarios: number;
  rank: string;
  lastPlayedAt: string | null;
}

export default function SoloProgressView({ students }: Props) {
  const [soloSessions, setSoloSessions] = useState<SoloSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'rp' | 'scenarios' | 'recent'>('rp');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  useEffect(() => {
    const ids = students.map(s => s.id);
    fetchSoloSessionsForStudents(ids).then(sessions => {
      setSoloSessions(sessions);
      setLoading(false);
    });
  }, [students]);

  if (loading) {
    return <div class="text-center py-8 text-gray-400">読み込み中...</div>;
  }

  // Build per-student summaries
  const sessionsByStudent = new Map<string, SoloSessionRow[]>();
  for (const s of soloSessions) {
    if (!sessionsByStudent.has(s.student_id)) sessionsByStudent.set(s.student_id, []);
    sessionsByStudent.get(s.student_id)!.push(s);
  }

  const summaries: StudentSoloSummary[] = students.map(student => {
    const sessions = sessionsByStudent.get(student.id) || [];
    const totalRp = sessions.reduce((sum, s) => sum + (s.rp_earned || 0), 0);
    const uniqueScenarios = new Set(sessions.map(s => s.scenario_slug)).size;
    const lastPlayedAt = sessions.length > 0 ? sessions[0].completed_at || sessions[0].created_at : null;
    return {
      student,
      sessions,
      totalRp,
      uniqueScenarios,
      rank: getRankName(totalRp),
      lastPlayedAt,
    };
  });

  // Sort
  const sorted = [...summaries].sort((a, b) => {
    if (sortBy === 'rp') return b.totalRp - a.totalRp;
    if (sortBy === 'scenarios') return b.uniqueScenarios - a.uniqueScenarios;
    if (sortBy === 'recent') {
      if (!a.lastPlayedAt && !b.lastPlayedAt) return 0;
      if (!a.lastPlayedAt) return 1;
      if (!b.lastPlayedAt) return -1;
      return new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime();
    }
    return a.student.student_name.localeCompare(b.student.student_name);
  });

  // Class-wide stats
  const totalStudents = students.length;
  const playedStudents = summaries.filter(s => s.sessions.length > 0).length;
  const classTotalRp = summaries.reduce((sum, s) => sum + s.totalRp, 0);
  const classAvgRp = totalStudents > 0 ? Math.round(classTotalRp / totalStudents) : 0;
  const classTotalSessions = soloSessions.length;

  // Student detail view
  if (selectedStudent) {
    const summary = summaries.find(s => s.student.id === selectedStudent);
    if (summary) {
      return (
        <div class="space-y-4">
          <button
            onClick={() => setSelectedStudent(null)}
            class="text-amber-600 font-bold hover:text-amber-700"
          >
            &larr; ソロ進捗一覧に戻る
          </button>

          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h2 class="text-2xl font-black">{summary.student.student_name}</h2>
            <div class="flex gap-4 mt-3 text-sm">
              <span>ランク: <strong class="text-amber-600">{summary.rank}</strong></span>
              <span>累計: <strong class="text-amber-600">{summary.totalRp} RP</strong></span>
              <span>クリア: <strong class="text-blue-600">{summary.uniqueScenarios}</strong></span>
              <span>プレイ: <strong class="text-gray-600">{summary.sessions.length} 回</strong></span>
            </div>
          </div>

          {summary.sessions.length === 0 ? (
            <div class="text-center py-8 text-gray-400">
              <p class="font-bold">まだソロモードのプレイ記録がありません</p>
            </div>
          ) : (
            <div class="space-y-2">
              {summary.sessions.map(s => (
                <div key={s.id} class="bg-white rounded-xl border border-gray-200 p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <p class="font-bold text-gray-900">{s.scenario_slug}</p>
                      <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {s.completed_at && <span>{formatDate(s.completed_at)}</span>}
                        {s.duration_seconds != null && (
                          <span>{Math.floor(s.duration_seconds / 60)}分{s.duration_seconds % 60}秒</span>
                        )}
                        {s.vote && <span>投票: {s.vote}</span>}
                      </div>
                      {s.vote_reason && (
                        <p class="text-xs text-gray-400 mt-1">理由: 「{s.vote_reason}」</p>
                      )}
                    </div>
                    <span class="text-sm font-black text-amber-600 shrink-0">{s.rp_earned} RP</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div class="space-y-4">
      {/* Class-wide stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="プレイ済み" value={`${playedStudents}/${totalStudents}`} />
        <StatCard label="クラス平均RP" value={String(classAvgRp)} />
        <StatCard label="総プレイ回数" value={String(classTotalSessions)} />
        <StatCard label="クラス合計RP" value={String(classTotalRp)} />
      </div>

      {/* Sort controls */}
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500 font-bold">並べ替え:</span>
        {([
          ['rp', 'RP順'],
          ['scenarios', 'クリア数'],
          ['recent', '最近プレイ'],
          ['name', '名前順'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            class={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              sortBy === key
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Student list */}
      {students.length === 0 ? (
        <div class="text-center py-8 text-gray-400">
          <p class="font-bold">生徒が登録されていません</p>
        </div>
      ) : (
        <div class="space-y-2">
          {sorted.map(({ student, totalRp, uniqueScenarios, rank, sessions, lastPlayedAt }) => (
            <button
              key={student.id}
              onClick={() => setSelectedStudent(student.id)}
              class="w-full text-left flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-amber-300 transition-colors"
            >
              <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-sm font-black text-amber-700 shrink-0">
                {student.student_name.charAt(0)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-bold text-gray-900 truncate">{student.student_name}</p>
                  <span class="text-xs text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                    {rank}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span>{totalRp} RP</span>
                  <span>{uniqueScenarios} クリア</span>
                  <span>{sessions.length} 回</span>
                  {lastPlayedAt && <span>最終: {formatDate(lastPlayedAt)}</span>}
                </div>
              </div>
              {/* Mini progress bar */}
              <div class="w-16 shrink-0">
                <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-amber-400 rounded-full"
                    style={{ width: `${Math.min(100, (uniqueScenarios / 100) * 100)}%` }}
                  />
                </div>
                <p class="text-[10px] text-gray-400 text-right mt-0.5">{uniqueScenarios}/100</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div class="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <p class="text-xl font-black text-amber-600">{value}</p>
      <p class="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
