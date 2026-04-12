import { useState } from 'preact/hooks';
import { submitFeedback } from '../../../lib/session-realtime';

interface Props {
  participantId: string;
  sessionToken: string;
}

const FUN_LABELS: Record<number, string> = {
  1: 'いまいち',
  2: 'まあまあ',
  3: 'ふつう',
  4: 'たのしい',
  5: 'さいこう！',
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'かんたん',
  2: 'ちょっとかんたん',
  3: 'ちょうどよい',
  4: 'むずかしい',
  5: 'すごくむずかしい',
};

export default function FeedbackForm({ participantId, sessionToken }: Props) {
  const [funRating, setFunRating] = useState(0);
  const [difficultyRating, setDifficultyRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!participantId || !sessionToken) return null;

  if (submitted) {
    return (
      <div class="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-center">
        <p class="text-3xl mb-1">{'\uD83D\uDE4C'}</p>
        <p class="text-green-700 font-black text-base">ありがとう！</p>
        <p class="text-green-600 text-xs mt-1">感想をおくってくれてありがとう</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (funRating === 0 || difficultyRating === 0) return;
    setError(null);
    setSubmitting(true);
    const ok = await submitFeedback(participantId, sessionToken, funRating, difficultyRating, comment);
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    } else {
      setError('送信できませんでした。もう一度試してください。');
    }
  };

  const StarRow = ({
    label,
    value,
    onChange,
    labelMap,
    ariaLabel,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    labelMap: Record<number, string>;
    ariaLabel: string;
  }) => (
    <div class="space-y-1">
      <div class="flex items-baseline justify-between">
        <p class="text-xs font-bold text-gray-600">{label}</p>
        {value > 0 && (
          <p class="text-xs font-black text-amber-600">{labelMap[value]}</p>
        )}
      </div>
      <div class="flex gap-1" role="radiogroup" aria-label={ariaLabel}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${labelMap[n]} (${n}/5)`}
              onClick={() => onChange(n)}
              class={`w-11 h-11 rounded-lg text-xl transition-all flex items-center justify-center ${
                active
                  ? 'bg-amber-400 text-white shadow-sm scale-100'
                  : 'bg-gray-100 text-gray-300 hover:bg-amber-100'
              }`}
            >
              {'\u2605'}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div class="bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
      <h3 class="text-sm font-black text-blue-700 text-center">感想を教えてね</h3>

      <StarRow
        label="楽しかった？"
        value={funRating}
        onChange={setFunRating}
        labelMap={FUN_LABELS}
        ariaLabel="楽しさの評価"
      />
      <StarRow
        label="むずかしかった？"
        value={difficultyRating}
        onChange={setDifficultyRating}
        labelMap={DIFFICULTY_LABELS}
        ariaLabel="難しさの評価"
      />

      <div>
        <div class="flex items-baseline justify-between mb-1">
          <p class="text-xs font-bold text-gray-600">一言（任意）</p>
          <p class="text-xs text-gray-400">{comment.length}/50</p>
        </div>
        <input
          type="text"
          value={comment}
          onInput={(e) => setComment((e.target as HTMLInputElement).value.slice(0, 50))}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
          placeholder="ひとこと感想..."
          maxLength={50}
          aria-label="一言感想（50文字以内）"
        />
      </div>

      {error && (
        <p class="text-red-600 text-xs text-center" role="alert">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={funRating === 0 || difficultyRating === 0 || submitting}
        class="w-full py-3 bg-blue-500 text-white rounded-xl font-black text-sm hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? '送信中...' : '送信する'}
      </button>
    </div>
  );
}
