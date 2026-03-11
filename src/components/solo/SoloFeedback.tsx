interface FeedbackEntry {
  correct: boolean;
  goodPoints: string[];
  missedClues: string[];
  hint: string;
}

interface Props {
  votedFor: string;
  feedbackData: Record<string, FeedbackEntry> | null;
}

export default function SoloFeedback({ votedFor, feedbackData }: Props) {
  if (!feedbackData || !votedFor) return null;

  const entry = feedbackData[votedFor];
  if (!entry) return null;

  return (
    <div class={`rounded-2xl border-2 p-5 ${
      entry.correct
        ? 'bg-green-50 border-green-300'
        : 'bg-blue-50 border-blue-300'
    }`}>
      <div class="text-center mb-3">
        <p class="text-2xl mb-1">{entry.correct ? '\uD83C\uDF1F' : '\uD83D\uDD0D'}</p>
        <h3 class="font-black text-gray-900">
          {entry.correct ? '大正解！おみごと！' : '惜しい！でもいい推理だったよ'}
        </h3>
      </div>

      {/* Good points */}
      {entry.goodPoints.length > 0 && (
        <div class="mb-3">
          <p class="text-xs font-black text-green-700 mb-1">
            {entry.correct ? '\u2B50 ここがすごい' : '\u2B50 よかったところ'}
          </p>
          <ul class="space-y-1">
            {entry.goodPoints.map((point, i) => (
              <li key={i} class="text-sm text-gray-700 leading-relaxed">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missed clues */}
      {entry.missedClues.length > 0 && (
        <div class="mb-3">
          <p class="text-xs font-black text-amber-700 mb-1">{'\uD83D\uDCA1'} 見落としポイント</p>
          <ul class="space-y-1">
            {entry.missedClues.map((clue, i) => (
              <li key={i} class="text-sm text-gray-700 leading-relaxed">
                {clue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hint for next */}
      {entry.hint && (
        <div class="bg-white/60 rounded-xl p-3 mt-2">
          <p class="text-xs font-black text-blue-700 mb-1">{'\uD83D\uDCDD'} 次への探偵メモ</p>
          <p class="text-sm text-gray-700 leading-relaxed">{entry.hint}</p>
        </div>
      )}
    </div>
  );
}
