import { useState, useEffect } from 'preact/hooks';
import {
  fetchSessions,
  fetchSessionDetail,
  type SessionRow,
  type VoteRow,
  type ReflectionRow,
} from '../../lib/supabase';

const ENV_LABELS: Record<string, string> = {
  classroom: '教室',
  dayservice: 'デイサービス',
  home: '家庭',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function totalDuration(pd: Record<string, number> | null): number {
  if (!pd) return 0;
  return Object.values(pd).reduce((a, b) => a + b, 0);
}

const PHASE_LABELS: Record<string, string> = {
  intro: '導入',
  explore: '探索',
  twist: '反転',
  discuss: '議論',
  vote: '投票',
  truth: '真相',
};

// --- Stats Overview ---
function StatsOverview({ sessions }: { sessions: SessionRow[] }) {
  const completed = sessions.filter((s) => s.completed_at);
  const totalTime = completed.reduce(
    (sum, s) => sum + totalDuration(s.phase_durations),
    0,
  );
  const avgTime =
    completed.length > 0 ? Math.round(totalTime / completed.length) : 0;
  const uniqueSlugs = new Set(sessions.map((s) => s.slug)).size;

  const stats = [
    { label: '総セッション数', value: sessions.length },
    { label: '完了', value: completed.length },
    { label: 'シナリオ数', value: uniqueSlugs },
    { label: '平均所要時間', value: formatDuration(avgTime) },
  ];

  return (
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {stats.map((s) => (
        <div
          key={s.label}
          class="bg-white rounded-xl p-4 text-center border border-gray-200"
        >
          <div class="text-2xl font-black text-amber-600">{s.value}</div>
          <div class="text-sm text-gray-500 mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// --- Session List ---
function SessionList({
  sessions,
  onSelect,
}: {
  sessions: SessionRow[];
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div class="py-8">
        <div class="text-center mb-8">
          <div class="text-5xl mb-4">📋</div>
          <p class="text-xl font-black text-gray-700">まだセッション記録がありません</p>
          <p class="text-gray-500 mt-2">セッションを実施すると、ここに記録が蓄積されます</p>
        </div>

        {/* この画面で見られる内容 */}
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
          <h3 class="font-bold text-gray-700 mb-3">📊 ダッシュボードでできること</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex gap-3 items-start">
              <span class="text-lg">⏱</span>
              <div>
                <div class="font-bold text-sm text-gray-700">所要時間の記録</div>
                <div class="text-xs text-gray-500">フェーズごとの時間配分を可視化</div>
              </div>
            </div>
            <div class="flex gap-3 items-start">
              <span class="text-lg">🗳️</span>
              <div>
                <div class="font-bold text-sm text-gray-700">投票結果の記録</div>
                <div class="text-xs text-gray-500">誰が誰に投票したかを保存</div>
              </div>
            </div>
            <div class="flex gap-3 items-start">
              <span class="text-lg">📝</span>
              <div>
                <div class="font-bold text-sm text-gray-700">振り返りテキスト</div>
                <div class="text-xs text-gray-500">子どもたちの感想を一覧表示</div>
              </div>
            </div>
            <div class="flex gap-3 items-start">
              <span class="text-lg">📈</span>
              <div>
                <div class="font-bold text-sm text-gray-700">実施履歴の一覧</div>
                <div class="text-xs text-gray-500">過去のセッションを振り返り</div>
              </div>
            </div>
          </div>
        </div>

        {/* はじめ方 */}
        <div class="bg-amber-50 rounded-xl border-2 border-amber-200 p-6">
          <h3 class="font-bold text-amber-900 mb-3">🎮 始め方</h3>
          <ol class="space-y-2 text-sm text-gray-700">
            <li class="flex gap-2">
              <span class="font-black text-amber-600">1.</span>
              <span><a href="/" class="text-amber-600 font-bold underline">トップページ</a>からシナリオを選ぶ</span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">2.</span>
              <span>「セッションモードで始める」ボタンを押す</span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">3.</span>
              <span>画面の指示に従ってゲームを進行</span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">4.</span>
              <span>完了すると、ここに記録が表示されます</span>
            </li>
          </ol>
          <a href="/"
             class="inline-block mt-4 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-amber-600 transition-colors no-underline text-sm">
            まず1本プレイしてみる →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          class="w-full text-left bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-400 hover:shadow-md transition-all"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-lg truncate">{s.scenario_title}</div>
              <div class="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>{formatDate(s.started_at)}</span>
                <span>{ENV_LABELS[s.environment] || s.environment}</span>
                <span>{s.player_count}人</span>
                {s.teacher_name && <span>{s.teacher_name}</span>}
              </div>
            </div>
            <div class="flex-shrink-0 text-right">
              {s.completed_at ? (
                <span class="inline-block bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                  完了
                </span>
              ) : (
                <span class="inline-block bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">
                  未完了
                </span>
              )}
              {s.phase_durations && (
                <div class="text-sm text-gray-400 mt-1">
                  {formatDuration(totalDuration(s.phase_durations))}
                </div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// --- Session Detail ---
function SessionDetail({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [reflections, setReflections] = useState<ReflectionRow[]>([]);

  useEffect(() => {
    setLoading(true);
    fetchSessionDetail(sessionId).then((result) => {
      if (result) {
        setSession(result.session);
        setVotes(result.votes);
        setReflections(result.reflections);
      }
      setLoading(false);
    });
  }, [sessionId]);

  if (loading) {
    return <div class="text-center py-12 text-gray-400">読み込み中...</div>;
  }

  if (!session) {
    return (
      <div class="text-center py-12 text-gray-500">
        セッションが見つかりません
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <button
        onClick={onBack}
        class="text-amber-600 font-bold hover:text-amber-700"
      >
        ← 一覧に戻る
      </button>

      {/* Header */}
      <div class="bg-white rounded-xl p-6 border border-gray-200">
        <h2 class="text-2xl font-black">{session.scenario_title}</h2>
        <div class="text-sm text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>📅 {formatDate(session.started_at)}</span>
          <span>
            🏫 {ENV_LABELS[session.environment] || session.environment}
          </span>
          <span>👥 {session.player_count}人</span>
          {session.teacher_name && <span>👤 {session.teacher_name}</span>}
          {session.completed_at && (
            <span>⏱ {formatDuration(totalDuration(session.phase_durations))}</span>
          )}
        </div>
      </div>

      {/* Phase Durations */}
      {session.phase_durations && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">フェーズ別所要時間</h3>
          <div class="space-y-2">
            {Object.entries(session.phase_durations).map(([key, secs]) => {
              const total = totalDuration(session.phase_durations);
              const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
              return (
                <div key={key} class="flex items-center gap-3">
                  <div class="w-16 text-sm text-gray-600 font-medium">
                    {PHASE_LABELS[key] || key}
                  </div>
                  <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      class="bg-amber-400 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div class="w-16 text-sm text-gray-500 text-right">
                    {formatDuration(secs)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Votes */}
      {votes.length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">投票結果</h3>
          <div class="space-y-2">
            {votes.map((v) => (
              <div
                key={v.id}
                class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2"
              >
                <span class="font-medium">{v.voter_name}</span>
                <span class="text-gray-400">→</span>
                <span
                  class={`font-bold ${v.is_correct ? 'text-green-600' : 'text-gray-700'}`}
                >
                  {v.suspect_name}
                  {v.is_correct && ' ✓'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reflections */}
      {reflections.length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">振り返り</h3>
          <div class="space-y-3">
            {reflections.map((r) => (
              <div key={r.id} class="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <p class="text-gray-800 whitespace-pre-wrap">{r.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Dashboard ---
export default function Dashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions().then((data) => {
      setSessions(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">📊</div>
        <p class="font-bold">データを読み込み中...</p>
        <p class="text-sm mt-1">セッション履歴を取得しています</p>
      </div>
    );
  }

  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <StatsOverview sessions={sessions} />
      <h2 class="text-xl font-black mb-4">セッション履歴</h2>
      <SessionList sessions={sessions} onSelect={setSelectedId} />
    </div>
  );
}
