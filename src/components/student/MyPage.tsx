import { useState, useEffect, useMemo } from 'preact/hooks';
import { supabase, fetchStudentAssignments, fetchClassLeaderboard, fetchStudentBadges, fetchStudentStreak, BADGE_DEFS, type StudentAssignment, type LeaderboardEntry } from '../../lib/supabase';
import GrowthReport from './GrowthReport';
import CollectionBook from './CollectionBook';
import { isUnlocked, getUnlockThreshold } from '../../lib/unlock';
import { useFontSize } from '../../lib/use-font-size';

// --- Types ---

interface ScenarioMeta {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  volume: number;
  difficulty: string;
  subject: string;
  thumbnailUrl?: string;
  characterNames: string[];
  evidenceTitles: string[];
}

interface SoloSessionRecord {
  id: string;
  scenario_slug: string;
  completed_at: string;
  duration_seconds: number;
  vote: string | null;
  rp_earned: number;
}

interface Props {
  scenarios: ScenarioMeta[];
  seriesConfig: Record<string, { name: string; emoji: string; color: string }>;
}

// --- Constants ---

const LS_STUDENT_ID = 'nazotoki-student-id';
const LS_STUDENT_TOKEN = 'nazotoki-student-token';
const LS_STUDENT_NAME = 'nazotoki-student-name';
const LS_STUDENT_LOGIN_ID = 'nazotoki-student-login-id';

const RANKS = [
  { name: '見習い探偵', minRp: 0, icon: '🔍' },
  { name: '新人探偵', minRp: 150, icon: '🔎' },
  { name: '一人前探偵', minRp: 500, icon: '🕵️' },
  { name: 'ベテラン探偵', minRp: 1500, icon: '🎩' },
  { name: '名探偵', minRp: 3000, icon: '⭐' },
  { name: '伝説の探偵', minRp: 5000, icon: '👑' },
];

function getRank(totalRp: number) {
  let current = RANKS[0];
  let nextRank: typeof RANKS[0] | null = RANKS[1] || null;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalRp >= RANKS[i].minRp) {
      current = RANKS[i];
      nextRank = RANKS[i + 1] || null;
      break;
    }
  }
  return { current, nextRank };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isPastDue(dateStr: string): boolean {
  const due = new Date(dateStr + 'T23:59:59');
  return due < new Date();
}

// --- Component ---

export default function MyPage({ scenarios, seriesConfig }: Props) {
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [totalRp, setTotalRp] = useState(0);
  const [sessions, setSessions] = useState<SoloSessionRecord[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'assignments' | 'catalog' | 'growth' | 'collection' | 'history'>('assignments');
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [streakMultiplier, setStreakMultiplier] = useState(1.0);
  const fontSize = useFontSize();

  useEffect(() => {
    const savedId = localStorage.getItem(LS_STUDENT_ID);
    const savedToken = localStorage.getItem(LS_STUDENT_TOKEN);
    const savedName = localStorage.getItem(LS_STUDENT_NAME);
    const savedLoginId = localStorage.getItem(LS_STUDENT_LOGIN_ID);

    if (!savedId || !savedToken || !supabase) {
      setLoading(false);
      return;
    }

    setStudentName(savedName || '');
    setLoginId(savedLoginId || '');

    supabase
      .rpc('rpc_fetch_solo_history', {
        p_student_id: savedId,
        p_student_token: savedToken,
      })
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false);
          return;
        }
        const result = data as Record<string, unknown>;
        if (result.error) {
          // Token invalid
          localStorage.removeItem(LS_STUDENT_ID);
          localStorage.removeItem(LS_STUDENT_TOKEN);
          localStorage.removeItem(LS_STUDENT_NAME);
          localStorage.removeItem(LS_STUDENT_LOGIN_ID);
          setLoading(false);
          return;
        }

        setAuthenticated(true);
        setTotalRp((result.total_rp as number) || 0);
        setSessions((result.sessions as SoloSessionRecord[]) || []);

        // Fetch assignments + leaderboard + badges (read-only) + streak in parallel
        Promise.all([
          fetchStudentAssignments(savedId!, savedToken!),
          fetchClassLeaderboard(savedId!, savedToken!),
          fetchStudentBadges(savedId!, savedToken!),
          fetchStudentStreak(savedId!, savedToken!),
        ]).then(([assignResult, lbResult, badges, streakResult]) => {
          setAssignments(assignResult.assignments);
          if (assignResult.assignments.length > 0) setActiveTab('assignments');
          if (lbResult.leaderboard.length > 0) setLeaderboard(lbResult.leaderboard);
          if (badges.length > 0) setEarnedBadges(new Set(badges));
          setStreak(streakResult.streak);
          setStreakMultiplier(streakResult.multiplier);
          setLoading(false);
        });
      });
  }, []);

  // Phase 82: Cross-tab logout detection via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_STUDENT_TOKEN && !e.newValue) {
        setAuthenticated(false);
        setLoading(false);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // --- Not logged in ---
  if (!loading && !authenticated) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center p-4">
        <div class="text-center space-y-4 max-w-sm">
          <p class="text-5xl">🔍</p>
          <h1 class="text-xl font-black text-gray-900">ログインが必要です</h1>
          <p class="text-sm text-gray-500">マイページを見るにはログインしてね</p>
          <a
            href="/login"
            class="block w-full py-4 bg-amber-500 text-white rounded-2xl text-lg font-black hover:bg-amber-600 transition-colors text-center"
          >
            ログインする
          </a>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center">
        <p class="text-gray-500 text-lg">読み込み中...</p>
      </div>
    );
  }

  // --- Main ---
  const { current: rank, nextRank } = getRank(totalRp);
  const playedSlugs = new Set(sessions.map(s => s.scenario_slug));
  const playedCount = playedSlugs.size;

  // Progress to next rank
  let progressPct = 100;
  let rpToNext = 0;
  if (nextRank) {
    const rpInRange = totalRp - rank.minRp;
    const rangeTotal = nextRank.minRp - rank.minRp;
    progressPct = Math.min(100, Math.round((rpInRange / rangeTotal) * 100));
    rpToNext = nextRank.minRp - totalRp;
  }

  // Phase 122: Compute suggested next scenario
  const suggestedScenario = useMemo(() => {
    // Priority 1: Pending assignments
    const pending = assignments.filter(a => !playedSlugs.has(a.scenario_slug));
    if (pending.length > 0) {
      const s = scenarios.find(sc => sc.slug === pending[0].scenario_slug);
      if (s) return { scenario: s, reason: 'assignment' as const };
    }
    // Priority 2: Next in the same series as last played
    if (sessions.length > 0) {
      const lastSlug = sessions[0].scenario_slug;
      const lastScenario = scenarios.find(sc => sc.slug === lastSlug);
      if (lastScenario) {
        const nextInSeries = scenarios
          .filter(sc => sc.series === lastScenario.series && sc.volume > lastScenario.volume && !playedSlugs.has(sc.slug))
          .sort((a, b) => a.volume - b.volume)[0];
        if (nextInSeries && isUnlocked(nextInSeries.volume, totalRp, new Set(assignments.map(a => a.scenario_slug)), nextInSeries.slug)) {
          return { scenario: nextInSeries, reason: 'next_in_series' as const };
        }
      }
    }
    // Priority 3: Any unplayed, unlocked scenario
    const unplayed = scenarios
      .filter(sc => !playedSlugs.has(sc.slug) && isUnlocked(sc.volume, totalRp, new Set(assignments.map(a => a.scenario_slug)), sc.slug))
      .sort((a, b) => a.volume - b.volume)[0];
    if (unplayed) return { scenario: unplayed, reason: 'explore' as const };
    return null;
  }, [scenarios, sessions, assignments, playedSlugs, totalRp]);

  // Phase 94: Assigned slugs for unlock bypass
  const assignedSlugs = useMemo(
    () => new Set(assignments.map(a => a.scenario_slug)),
    [assignments],
  );

  // Series groups for catalog
  const seriesKeys = Object.keys(seriesConfig);
  const filteredScenarios =
    seriesFilter === 'all'
      ? scenarios
      : scenarios.filter(s => s.series === seriesFilter);

  return (
    <div class="flex flex-col min-h-[100dvh] bg-gray-50">
      {/* Header */}
      <div class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div class="min-w-0">
          <p class="text-sm font-black text-gray-900 truncate">{studentName}</p>
          <p class="text-xs text-gray-500">ID: {loginId}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            onClick={fontSize.cycle}
            class="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1.5 py-0.5 border border-gray-200 rounded"
            title={`文字サイズ: ${fontSize.label}`}
          >
            Aa:{fontSize.label}
          </button>
          <a
            href="/login"
            class="text-xs text-gray-500 hover:text-gray-600 transition-colors"
          >
            ログアウト
          </a>
        </div>
      </div>

      {/* Rank card */}
      <div class="px-4 pt-4 pb-2">
        <div class="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 rounded-2xl p-5">
          <div class="flex items-center gap-4">
            <div class="text-4xl">{rank.icon}</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-amber-600 font-bold">探偵ランク</p>
              <p class="text-xl font-black text-amber-900">{rank.name}</p>
              <p class="text-2xl font-black text-amber-700 mt-1">
                {totalRp} <span class="text-sm font-bold">RP</span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {nextRank && (
            <div class="mt-3">
              <div class="flex justify-between text-xs text-amber-600 mb-1">
                <span>{rank.name}</span>
                <span>{nextRank.name}まで あと{rpToNext}RP</span>
              </div>
              <div class="w-full h-2.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          {!nextRank && (
            <p class="text-xs text-amber-600 mt-2 font-bold text-center">
              最高ランク達成！
            </p>
          )}

          {/* Stats row */}
          <div class="flex justify-around mt-4 pt-3 border-t border-amber-200">
            <div class="text-center">
              <p class="text-lg font-black text-amber-800">{playedCount}</p>
              <p class="text-xs text-amber-600">クリア済み</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-black text-amber-800">{scenarios.length}</p>
              <p class="text-xs text-amber-600">全シナリオ</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-black text-amber-800">{sessions.length}</p>
              <p class="text-xs text-amber-600">プレイ回数</p>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 122: Next mission card */}
      {suggestedScenario && (
        <div class="px-4 pt-3">
          <a
            href={`/solo/${suggestedScenario.scenario.slug}`}
            class="block bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-4 hover:shadow-md transition-shadow"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-blue-600 mb-1">
                  {suggestedScenario.reason === 'assignment' ? '先生からの課題'
                    : suggestedScenario.reason === 'next_in_series' ? '続きに挑戦'
                    : '新しいシナリオ'}
                </p>
                <p class="text-sm font-black text-gray-900 truncate">{suggestedScenario.scenario.title}</p>
                <div class="flex gap-2 mt-1 text-xs text-gray-500">
                  <span>{suggestedScenario.scenario.subject}</span>
                  <span>{suggestedScenario.scenario.difficulty}</span>
                  {nextRank && <span class="text-amber-600">あと{rpToNext}RPで{nextRank.name}</span>}
                </div>
              </div>
              <div class="shrink-0 ml-3 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                <span class="text-white text-lg font-black">{'\u25B6'}</span>
              </div>
            </div>
          </a>
        </div>
      )}

      {/* Phase 90: Streak banner */}
      {streak > 0 && (
        <div class="px-4 pt-2">
          <div class="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-2xl p-3 flex items-center gap-3">
            <span class="text-2xl">
              {streak >= 7 ? '\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25' : streak >= 3 ? '\uD83D\uDD25\uD83D\uDD25' : '\uD83D\uDD25'}
            </span>
            <div class="flex-1">
              <p class="text-sm font-black text-orange-800">{streak}日連続プレイ中！</p>
              {streakMultiplier > 1.0 && (
                <p class="text-xs text-orange-600">RP x{streakMultiplier} ボーナス適用中</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase 89: Badge display */}
      <div class="px-4 py-2">
        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 class="text-sm font-black text-gray-800 mb-3">獲得バッジ</h3>
          <div class="grid grid-cols-5 gap-2">
            {BADGE_DEFS.map(badge => {
              const earned = earnedBadges.has(badge.key);
              return (
                <div
                  key={badge.key}
                  class={`flex flex-col items-center gap-1 p-2 rounded-xl text-center ${
                    earned ? '' : 'opacity-30 grayscale'
                  }`}
                  title={badge.description}
                >
                  <span class="text-2xl">{earned ? badge.icon : '\uD83D\uDD12'}</span>
                  <span class="text-[10px] font-bold text-gray-700 leading-tight">{badge.label}</span>
                </div>
              );
            })}
          </div>
          <p class="text-xs text-gray-400 mt-2 text-center">
            {earnedBadges.size}/{BADGE_DEFS.length} 獲得
          </p>
        </div>
      </div>

      {/* Phase 88: Class Leaderboard */}
      {leaderboard.length > 0 && (
        <div class="px-4 py-2">
          <div class="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 class="text-sm font-black text-gray-800 mb-3">クラスランキング</h3>
            <div class="space-y-1.5">
              {leaderboard.slice(0, 10).map(entry => {
                const medal = entry.rank === 1 ? '\uD83E\uDD47' : entry.rank === 2 ? '\uD83E\uDD48' : entry.rank === 3 ? '\uD83E\uDD49' : '';
                return (
                  <div
                    key={entry.rank}
                    class={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                      entry.is_me ? 'bg-amber-50 border border-amber-300 font-black' : ''
                    }`}
                  >
                    <span class="w-8 text-center shrink-0">
                      {medal || `${entry.rank}.`}
                    </span>
                    <span class="flex-1 truncate">
                      {entry.student_name}
                      {entry.is_me && <span class="text-xs text-amber-600 ml-1">(自分)</span>}
                    </span>
                    <span class="text-xs text-gray-500 shrink-0">{entry.clear_count}回</span>
                    <span class="font-bold text-amber-600 shrink-0">{entry.total_rp} RP</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab switch */}
      <div class="px-4 py-2 flex gap-2">
        {assignments.length > 0 && (
          <button
            onClick={() => setActiveTab('assignments')}
            class={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
              activeTab === 'assignments'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            課題 ({assignments.filter(a => !a.completed).length})
          </button>
        )}
        <button
          onClick={() => setActiveTab('catalog')}
          class={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'catalog'
              ? 'bg-amber-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          一覧
        </button>
        <button
          onClick={() => setActiveTab('growth')}
          class={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'growth'
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          成長
        </button>
        <button
          onClick={() => setActiveTab('collection')}
          class={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'collection'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          図鑑
        </button>
        <button
          onClick={() => setActiveTab('history')}
          class={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'history'
              ? 'bg-amber-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          履歴
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto px-4 pb-6">
        {activeTab === 'assignments' && (
          <div class="space-y-2">
            {assignments.filter(a => !a.completed).length === 0 && assignments.filter(a => a.completed).length > 0 ? (
              <div class="text-center py-8 space-y-2">
                <p class="text-4xl">&#127942;</p>
                <p class="text-sm font-bold text-gray-700">課題をすべてクリア！</p>
              </div>
            ) : null}
            {/* Incomplete assignments first */}
            {assignments.filter(a => !a.completed).map(a => (
              <a
                key={a.id}
                href={`/solo/${a.scenario_slug}`}
                class="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-blue-200 hover:border-blue-400 transition-colors"
              >
                <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg shrink-0">
                  &#128221;
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-gray-900 truncate">{a.scenario_title}</p>
                  {a.description && (
                    <p class="text-xs text-gray-500 truncate">{a.description}</p>
                  )}
                  {a.due_date && (
                    <p class={`text-xs mt-0.5 font-bold ${
                      isPastDue(a.due_date) ? 'text-red-500' : 'text-blue-500'
                    }`}>
                      締切: {a.due_date}
                    </p>
                  )}
                </div>
                <div class="shrink-0">
                  <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                    未完了
                  </span>
                </div>
              </a>
            ))}
            {/* Completed assignments */}
            {assignments.filter(a => a.completed).map(a => (
              <a
                key={a.id}
                href={`/solo/${a.scenario_slug}`}
                class="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 transition-colors"
              >
                <div class="w-10 h-10 rounded-lg bg-amber-200 flex items-center justify-center text-lg shrink-0">
                  &#10003;
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-amber-800 truncate">{a.scenario_title}</p>
                  {a.description && (
                    <p class="text-xs text-gray-500 truncate">{a.description}</p>
                  )}
                </div>
                <div class="shrink-0">
                  <p class="text-xs font-bold text-amber-600">{a.rp_earned} RP</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {activeTab === 'catalog' && (
          <div class="space-y-3">
            {/* Series filter */}
            <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                onClick={() => setSeriesFilter('all')}
                class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  seriesFilter === 'all'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                すべて
              </button>
              {seriesKeys.map(key => (
                <button
                  key={key}
                  onClick={() => setSeriesFilter(key)}
                  class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    seriesFilter === key
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {seriesConfig[key]?.emoji} {seriesConfig[key]?.name}
                </button>
              ))}
            </div>

            {/* Scenario grid */}
            <div class="grid grid-cols-1 gap-2">
              {filteredScenarios.map(s => {
                const played = playedSlugs.has(s.slug);
                const session = sessions.find(ss => ss.scenario_slug === s.slug);
                const cfg = seriesConfig[s.series];
                const unlocked = isUnlocked(s.volume, totalRp, assignedSlugs, s.slug);
                const rpNeeded = getUnlockThreshold(s.volume) - totalRp;

                if (!unlocked) {
                  return (
                    <div
                      key={s.slug}
                      class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 opacity-60"
                    >
                      <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 bg-gray-200">
                        &#128274;
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-gray-400 truncate">{s.title}</p>
                        <p class="text-xs text-gray-400 truncate">{s.seriesName} / {s.difficulty}</p>
                      </div>
                      <div class="shrink-0 text-right">
                        <p class="text-[10px] text-gray-400">あと{rpNeeded}RP</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <a
                    key={s.slug}
                    href={`/solo/${s.slug}`}
                    class={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      played
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div class={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                      played ? 'bg-amber-200' : 'bg-gray-100'
                    }`}>
                      {played ? '\u2713' : cfg?.emoji || '🔍'}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class={`text-sm font-bold truncate ${
                        played ? 'text-amber-800' : 'text-gray-900'
                      }`}>
                        {s.title}
                      </p>
                      <p class="text-xs text-gray-500 truncate">
                        {s.seriesName} / {s.difficulty}
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      {played && session ? (
                        <p class="text-xs font-bold text-amber-600">{session.rp_earned} RP</p>
                      ) : (
                        <p class="text-xs text-gray-500">未プレイ</p>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'growth' && (
          <GrowthReport
            sessions={sessions}
            totalRp={totalRp}
            seriesConfig={seriesConfig}
            scenarioSeriesMap={new Map(scenarios.map(s => [s.slug, s.series]))}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionBook
            scenarios={scenarios}
            playedSlugs={playedSlugs}
            seriesConfig={seriesConfig}
          />
        )}

        {activeTab === 'history' && (
          <div class="space-y-2">
            {sessions.length === 0 ? (
              <div class="text-center py-12 space-y-3">
                <p class="text-4xl">🔍</p>
                <p class="text-sm text-gray-500">まだプレイしていません</p>
                <a
                  href="/solo/math-01-alibi-amusement"
                  class="inline-block px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors"
                >
                  最初の事件に挑戦！
                </a>
              </div>
            ) : (
              sessions.map(s => {
                const meta = scenarios.find(sc => sc.slug === s.scenario_slug);
                const cfg = meta ? seriesConfig[meta.series] : null;
                return (
                  <a
                    key={s.id}
                    href={`/solo/${s.scenario_slug}`}
                    class="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-amber-300 transition-colors"
                  >
                    <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-lg shrink-0">
                      {cfg?.emoji || '🔍'}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-gray-900 truncate">
                        {meta?.title || s.scenario_slug}
                      </p>
                      <div class="flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatDate(s.completed_at)}</span>
                        <span>{formatDuration(s.duration_seconds)}</span>
                        {s.vote && <span>投票: {s.vote}</span>}
                      </div>
                    </div>
                    <div class="shrink-0">
                      <p class="text-sm font-black text-amber-600">{s.rp_earned} RP</p>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
