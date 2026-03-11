import { useMemo } from 'preact/hooks';

// --- Types (shared with MyPage) ---

interface SoloSessionRecord {
  id: string;
  scenario_slug: string;
  completed_at: string;
  duration_seconds: number;
  vote: string | null;
  rp_earned: number;
}

interface Props {
  sessions: SoloSessionRecord[];
  totalRp: number;
  seriesConfig: Record<string, { name: string; emoji: string; color: string }>;
  scenarioSeriesMap: Map<string, string>; // slug -> series
}

// --- JST helpers ---

const JST_MS = 9 * 60 * 60 * 1000;

/** Get JST Monday 00:00 UTC timestamp for a given Date */
function getJSTMondayMs(date: Date): number {
  const jstMs = date.getTime() + JST_MS;
  const jst = new Date(jstMs);
  const day = jst.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(jstMs);
  monday.setUTCDate(jst.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
}

function formatWeekLabel(mondayMs: number): string {
  const d = new Date(mondayMs);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// --- Component ---

export default function GrowthReport({ sessions, totalRp, seriesConfig, scenarioSeriesMap }: Props) {
  // Weekly RP data (last 8 weeks)
  const weeklyData = useMemo(() => {
    const now = new Date();
    const currentMondayMs = getJSTMondayMs(now);
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const weeks: { label: string; rp: number; clears: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const mondayMs = currentMondayMs - i * weekMs;
      const nextMondayMs = mondayMs + weekMs;
      const label = formatWeekLabel(mondayMs);

      let rp = 0;
      let clears = 0;
      for (const s of sessions) {
        const sessionJstMs = new Date(s.completed_at).getTime() + JST_MS;
        if (sessionJstMs >= mondayMs && sessionJstMs < nextMondayMs) {
          rp += s.rp_earned;
          clears++;
        }
      }
      weeks.push({ label, rp, clears });
    }
    return weeks;
  }, [sessions]);

  // Series distribution
  const seriesStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalRp: number }>();
    for (const s of sessions) {
      const series = scenarioSeriesMap.get(s.scenario_slug);
      if (!series) continue;
      const existing = stats.get(series) || { count: 0, totalRp: 0 };
      existing.count++;
      existing.totalRp += s.rp_earned;
      stats.set(series, existing);
    }
    return Array.from(stats.entries())
      .map(([series, data]) => {
        const cfg = seriesConfig[series];
        return {
          series,
          label: cfg?.name || series,
          emoji: cfg?.emoji || '📚',
          count: data.count,
          avgRp: Math.round(data.totalRp / data.count),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [sessions, scenarioSeriesMap, seriesConfig]);

  // Growth insights
  const insights = useMemo(() => {
    const msgs: string[] = [];

    if (weeklyData.length >= 2) {
      const thisWeek = weeklyData[weeklyData.length - 1];
      const lastWeek = weeklyData[weeklyData.length - 2];

      if (thisWeek.rp > lastWeek.rp && lastWeek.rp > 0) {
        msgs.push(`今週は先週より${thisWeek.rp - lastWeek.rp}RP多く獲得！`);
      } else if (thisWeek.rp > 0 && lastWeek.rp === 0) {
        msgs.push('今週もプレイ開始！この調子！');
      }
      if (thisWeek.clears > lastWeek.clears && lastWeek.clears > 0) {
        msgs.push(`クリア数も先週より${thisWeek.clears - lastWeek.clears}件増加！`);
      }
    }

    if (seriesStats.length >= 3) {
      msgs.push(`${seriesStats.length}シリーズに挑戦中。バランスよく探偵力UP！`);
    }

    const playedSlugs = new Set(sessions.map(s => s.scenario_slug));
    if (playedSlugs.size >= 10) {
      msgs.push(`${playedSlugs.size}シナリオクリア！ベテラン探偵の道を歩んでるよ`);
    } else if (playedSlugs.size >= 5) {
      msgs.push(`${playedSlugs.size}シナリオクリア！いい感じ！`);
    }

    if (msgs.length === 0) {
      msgs.push('もっとプレイして成長を記録しよう！');
    }
    return msgs;
  }, [sessions, weeklyData, seriesStats]);

  // Not enough data
  if (sessions.length < 3) {
    return (
      <div class="text-center py-12 space-y-3">
        <p class="text-4xl">&#128202;</p>
        <p class="text-sm font-bold text-gray-700">もっとプレイしよう！</p>
        <p class="text-xs text-gray-500">3回以上プレイすると成長グラフが見られるよ</p>
      </div>
    );
  }

  const maxWeeklyRp = Math.max(...weeklyData.map(w => w.rp), 1);
  const maxSeriesCount = Math.max(...seriesStats.map(s => s.count), 1);
  const playedSlugs = new Set(sessions.map(s => s.scenario_slug));

  return (
    <div class="space-y-4">
      {/* Growth insights */}
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
        <h3 class="text-sm font-black text-blue-800 mb-2">&#128161; 成長メモ</h3>
        <ul class="space-y-1">
          {insights.map((msg, i) => (
            <li key={i} class="text-xs text-blue-700">
              {msg}
            </li>
          ))}
        </ul>
      </div>

      {/* Weekly RP chart */}
      <div class="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 class="text-sm font-black text-gray-800 mb-3">&#128200; 週別RP</h3>
        <div class="flex items-end gap-1.5" style={{ height: '120px' }}>
          {weeklyData.map((w, i) => (
            <div key={i} class="flex-1 flex flex-col items-center gap-1 h-full">
              <span class="text-[10px] font-bold text-amber-600 h-4">
                {w.rp > 0 ? w.rp : ''}
              </span>
              <div class="flex-1 flex items-end w-full">
                <div
                  class="w-full rounded-t-sm transition-all duration-300"
                  style={{
                    height: w.rp > 0 ? `${Math.max(4, (w.rp / maxWeeklyRp) * 100)}%` : '0%',
                    backgroundColor: i === weeklyData.length - 1 ? '#f59e0b' : '#fcd34d',
                  }}
                />
              </div>
              <span class="text-[10px] text-gray-400 h-4">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cumulative stats */}
      <div class="grid grid-cols-3 gap-2">
        <div class="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p class="text-xl font-black text-amber-700">{totalRp}</p>
          <p class="text-[10px] text-gray-500 mt-0.5">累計RP</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p class="text-xl font-black text-amber-700">{playedSlugs.size}</p>
          <p class="text-[10px] text-gray-500 mt-0.5">クリア数</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p class="text-xl font-black text-amber-700">{sessions.length}</p>
          <p class="text-[10px] text-gray-500 mt-0.5">プレイ回数</p>
        </div>
      </div>

      {/* Series distribution */}
      {seriesStats.length > 0 && (
        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 class="text-sm font-black text-gray-800 mb-3">&#128218; シリーズ別プレイ数</h3>
          <div class="space-y-2.5">
            {seriesStats.map(s => (
              <div key={s.series} class="flex items-center gap-2">
                <span class="text-base w-6 text-center shrink-0">{s.emoji}</span>
                <span class="text-xs font-bold text-gray-700 w-16 shrink-0 truncate">{s.label}</span>
                <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${(s.count / maxSeriesCount) * 100}%` }}
                  />
                </div>
                <span class="text-xs text-gray-500 shrink-0 w-14 text-right">
                  {s.count}回 ({s.avgRp}RP)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
