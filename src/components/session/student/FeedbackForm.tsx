import { useState } from 'preact/hooks';
import { submitFeedback } from '../../../lib/session-realtime';

interface Props {
  participantId: string;
  sessionToken: string;
}

export default function FeedbackForm({ participantId, sessionToken }: Props) {
  const [funRating, setFunRating] = useState(0);
  const [difficultyRating, setDifficultyRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!participantId || !sessionToken) return null;

  if (submitted) {
    return (
      <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p class="text-green-700 font-bold text-sm">ありがとう！</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (funRating === 0 || difficultyRating === 0) return;
    setSubmitting(true);
    const ok = await submitFeedback(participantId, sessionToken, funRating, difficultyRating, comment);
    setSubmitting(false);
    if (ok) setSubmitted(true);
  };

  const StarRow = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div class="space-y-1">
      <p class="text-xs font-bold text-gray-600">{label}</p>
      <div class="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            class={`w-10 h-10 rounded-lg text-lg transition-colors ${
              n <= value ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {'\u2B50'}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div class="bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
      <h3 class="text-sm font-black text-blue-700 text-center">感想を教えてね</h3>
      <StarRow label="楽しさ" value={funRating} onChange={setFunRating} />
      <StarRow label="難しさ" value={difficultyRating} onChange={setDifficultyRating} />
      <div>
        <p class="text-xs font-bold text-gray-600 mb-1">一言（任意）</p>
        <input
          type="text"
          value={comment}
          onInput={(e) => setComment((e.target as HTMLInputElement).value.slice(0, 50))}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
          placeholder="ひとこと感想..."
          maxLength={50}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={funRating === 0 || difficultyRating === 0 || submitting}
        class="w-full py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
      >
        {submitting ? '送信中...' : '送信する'}
      </button>
    </div>
  );
}
