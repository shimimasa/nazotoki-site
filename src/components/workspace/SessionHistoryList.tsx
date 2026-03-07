import type { SessionLogRow } from '../../lib/supabase';

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatMinSec(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  logs: SessionLogRow[];
  onSelect: (id: string) => void;
}

export default function SessionHistoryList({ logs, onSelect }: Props) {
  if (logs.length === 0) {
    return (
      <div class="py-8">
        <div class="text-center mb-8">
          <div class="text-5xl mb-4">📋</div>
          <p class="text-xl font-black text-gray-700">まだ授業記録がありません</p>
          <p class="text-gray-500 mt-2">
            セッションを完了すると、ここに授業記録が蓄積されます
          </p>
        </div>

        <div class="bg-amber-50 rounded-xl border-2 border-amber-200 p-6">
          <h3 class="font-bold text-amber-900 mb-3">始め方</h3>
          <ol class="space-y-2 text-sm text-gray-700">
            <li class="flex gap-2">
              <span class="font-black text-amber-600">1.</span>
              <span>
                <a href="/" class="text-amber-600 font-bold underline">
                  トップページ
                </a>
                からシナリオを選ぶ
              </span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">2.</span>
              <span>「セッションモードで始める」ボタンを押す</span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">3.</span>
              <span>画面の指示に従って授業を進行</span>
            </li>
            <li class="flex gap-2">
              <span class="font-black text-amber-600">4.</span>
              <span>完了すると、ここに授業記録が表示されます</span>
            </li>
          </ol>
          <a
            href="/"
            class="inline-block mt-4 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-amber-600 transition-colors no-underline text-sm"
          >
            まず1本プレイしてみる
          </a>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      {logs.map((log) => {
        const title = log.scenario_title || log.scenario_slug;
        const totalEvidence = log.discovered_evidence?.length || 0;
        const correctCount = log.correct_players?.length || 0;
        const voteCount = log.vote_results
          ? Object.keys(log.vote_results).length
          : 0;

        return (
          <button
            key={log.id}
            onClick={() => onSelect(log.id)}
            class="w-full text-left bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-400 hover:shadow-md transition-all"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-bold text-lg truncate">{title}</div>
                <div class="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    {log.start_time
                      ? formatDate(log.start_time)
                      : formatDate(log.created_at)}
                  </span>
                  {log.duration != null && (
                    <span>授業時間: {formatMinSec(log.duration)}</span>
                  )}
                </div>
              </div>
              <div class="flex-shrink-0 text-right space-y-1">
                {voteCount > 0 && (
                  <div class="text-xs text-gray-500">
                    正解: {correctCount} / {voteCount}
                  </div>
                )}
                {totalEvidence > 0 && (
                  <div class="text-xs text-gray-500">
                    証拠: {totalEvidence}件発見
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
