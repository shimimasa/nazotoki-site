import { useMemo } from 'preact/hooks';

interface Props {
  voteResults: Record<string, string>;
  voteReasons: Record<string, string> | null | undefined;
  correctPlayers: string[] | null | undefined;
}

export default function VoteSummary({ voteResults, voteReasons, correctPlayers }: Props) {
  const entries = Object.entries(voteResults);
  const correctSet = new Set(correctPlayers || []);

  const stats = useMemo(() => {
    // Vote distribution by suspect
    const suspectCounts: Record<string, number> = {};
    for (const [, suspect] of entries) {
      suspectCounts[suspect] = (suspectCounts[suspect] || 0) + 1;
    }

    // Accuracy rate — correct_players contains voter IDs who voted correctly
    const correctCount = entries.filter(
      ([voter]) => correctSet.has(voter),
    ).length;
    const accuracy = entries.length > 0 ? Math.round((correctCount / entries.length) * 100) : 0;

    // Reason stats
    const reasons = entries
      .map(([voter]) => voteReasons?.[voter])
      .filter((r): r is string => !!r && r.trim() !== '');
    const reasonRate = entries.length > 0 ? Math.round((reasons.length / entries.length) * 100) : 0;
    const avgReasonLength = reasons.length > 0
      ? Math.round(reasons.reduce((sum, r) => sum + r.length, 0) / reasons.length)
      : 0;

    // Reason length distribution
    const shortReasons = reasons.filter((r) => r.length < 20).length;
    const midReasons = reasons.filter((r) => r.length >= 20 && r.length < 50).length;
    const longReasons = reasons.filter((r) => r.length >= 50).length;

    return {
      suspectCounts,
      correctCount,
      accuracy,
      reasons,
      reasonRate,
      avgReasonLength,
      shortReasons,
      midReasons,
      longReasons,
    };
  }, [entries, voteReasons, correctSet]);

  const sortedSuspects = Object.entries(stats.suspectCounts).sort((a, b) => b[1] - a[1]);
  const maxVotes = sortedSuspects.length > 0 ? sortedSuspects[0][1] : 0;

  return (
    <div class="space-y-5">
      {/* Accuracy & overview */}
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
          <div class="text-2xl font-black text-blue-600">{stats.accuracy}%</div>
          <div class="text-xs text-gray-500 font-bold">正解率</div>
        </div>
        <div class="bg-green-50 rounded-lg p-3 text-center border border-green-100">
          <div class="text-2xl font-black text-green-600">{stats.reasonRate}%</div>
          <div class="text-xs text-gray-500 font-bold">理由記入率</div>
        </div>
        <div class="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
          <div class="text-2xl font-black text-amber-600">{stats.avgReasonLength}<span class="text-sm">字</span></div>
          <div class="text-xs text-gray-500 font-bold">理由平均文字数</div>
        </div>
      </div>

      {/* Vote distribution bar chart */}
      <div>
        <h4 class="text-sm font-bold text-gray-700 mb-2">投票先分布</h4>
        <div class="space-y-2">
          {sortedSuspects.map(([suspect, count]) => {
            const pct = maxVotes > 0 ? Math.round((count / entries.length) * 100) : 0;
            const barWidth = maxVotes > 0 ? Math.round((count / maxVotes) * 100) : 0;
            // Derive correct suspect: the suspect that correct voters chose
            const correctSuspect = entries.find(([v]) => correctSet.has(v))?.[1] || null;
            const isCorrectSuspect = suspect === correctSuspect;
            return (
              <div key={suspect} class="flex items-center gap-3">
                <div class="w-24 text-sm font-medium text-gray-700 truncate" title={suspect}>
                  {isCorrectSuspect && <span class="text-green-500 mr-1">*</span>}
                  {suspect}
                </div>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    class={`h-full rounded-full transition-all ${isCorrectSuspect ? 'bg-green-400' : 'bg-amber-400'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div class="w-16 text-sm text-gray-500 text-right">
                  {count}票 ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reason length distribution */}
      {stats.reasons.length > 0 && (
        <div>
          <h4 class="text-sm font-bold text-gray-700 mb-2">理由の記述量</h4>
          <div class="flex gap-2 items-end h-16">
            {[
              { label: '短文(~19字)', count: stats.shortReasons, color: 'bg-red-300' },
              { label: '中文(20~49字)', count: stats.midReasons, color: 'bg-amber-300' },
              { label: '長文(50字~)', count: stats.longReasons, color: 'bg-green-300' },
            ].map((bin) => {
              const height = stats.reasons.length > 0 ? Math.max(4, Math.round((bin.count / stats.reasons.length) * 100)) : 4;
              return (
                <div key={bin.label} class="flex-1 flex flex-col items-center gap-1">
                  <div class="text-xs font-bold text-gray-600">{bin.count}人</div>
                  <div
                    class={`w-full ${bin.color} rounded-t`}
                    style={{ height: `${height}%`, minHeight: '4px' }}
                  />
                  <div class="text-[10px] text-gray-400 text-center">{bin.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reason quality hints (pure heuristic, no AI) */}
      {stats.reasons.length > 0 && (
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 class="text-sm font-bold text-gray-700 mb-2">集計所見</h4>
          <ul class="space-y-1 text-sm text-gray-600">
            {stats.accuracy >= 70 && (
              <li>- 正解率が高く、全体的に証拠を正しく読み取れています</li>
            )}
            {stats.accuracy > 0 && stats.accuracy < 30 && (
              <li>- 正解率が低めです。証拠の読み取りや議論の深さに課題がありそうです</li>
            )}
            {stats.reasonRate < 50 && (
              <li>- 理由記入率が低めです。投票前に「なぜそう思ったか」を促すと改善が期待できます</li>
            )}
            {stats.avgReasonLength > 0 && stats.avgReasonLength < 15 && (
              <li>- 理由が短めの傾向です。「証拠を1つ以上挙げて理由を書こう」と声かけすると効果的です</li>
            )}
            {stats.avgReasonLength >= 40 && (
              <li>- 理由をしっかり書けている生徒が多く、論理的思考の育成につながっています</li>
            )}
            {stats.longReasons >= stats.reasons.length * 0.5 && (
              <li>- 半数以上が50字以上の理由を書いており、記述力が高いクラスです</li>
            )}
            {sortedSuspects.length > 1 && sortedSuspects[0][1] === sortedSuspects[1][1] && (
              <li>- 票が割れています。議論フェーズで多角的な視点が出ている可能性があります</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
