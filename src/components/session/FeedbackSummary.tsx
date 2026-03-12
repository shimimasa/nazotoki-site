import type { SessionFeedbackRow } from '../../lib/supabase-client';

interface FeedbackSummaryProps {
  feedback: SessionFeedbackRow[];
  variant?: 'card' | 'section';
}

export default function FeedbackSummary({ feedback, variant = 'card' }: FeedbackSummaryProps) {
  if (feedback.length === 0) return null;

  const avgFun = (feedback.reduce((s, f) => s + f.fun_rating, 0) / feedback.length).toFixed(1);
  const avgDifficulty = (feedback.reduce((s, f) => s + f.difficulty_rating, 0) / feedback.length).toFixed(1);
  const comments = feedback.filter(f => f.comment);

  const content = (
    <div class={`bg-blue-50 ${variant === 'card' ? 'border border-blue-200 rounded-xl p-4' : 'rounded-lg p-3'} space-y-3`}>
      {variant === 'card' && (
        <h3 class="text-sm font-black text-blue-700 text-center">
          {'\u751F\u5F92\u30D5\u30A3\u30FC\u30C9\u30D0\u30C3\u30AF'} ({feedback.length}{'\u4EF6'})
        </h3>
      )}
      <div class="flex justify-around text-center">
        <div>
          <p class="text-xs text-gray-500">{'\u697D\u3057\u3055'}</p>
          <p class="text-xl font-black text-amber-600">{avgFun}</p>
        </div>
        <div>
          <p class="text-xs text-gray-500">{'\u96E3\u3057\u3055'}</p>
          <p class="text-xl font-black text-blue-600">{avgDifficulty}</p>
        </div>
      </div>
      {comments.length > 0 && (
        <div class="border-t border-blue-200 pt-2 space-y-1">
          {comments.map(f => (
            <p key={f.id} class="text-xs text-gray-600">
              {'\u300C'}{f.comment}{'\u300D'}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  if (variant === 'section') {
    return (
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\uD83D\uDCDD'} {'\u751F\u5F92\u30D5\u30A3\u30FC\u30C9\u30D0\u30C3\u30AF'} ({feedback.length}{'\u4EF6'})
        </h4>
        {content}
      </section>
    );
  }

  return <div class="max-w-md mx-auto text-left">{content}</div>;
}
