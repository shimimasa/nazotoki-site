import { useState, useEffect } from 'preact/hooks';
import {
  fetchOrphanedLogs,
  claimOrphanedLogs,
  type SessionLogRow,
} from '../../lib/supabase';

interface Props {
  teacherId: string;
  onClaimed: () => void;
}

export default function OrphanedLogsBanner({ teacherId, onClaimed }: Props) {
  const [orphanedLogs, setOrphanedLogs] = useState<SessionLogRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchOrphanedLogs().then(setOrphanedLogs);
  }, []);

  if (dismissed || orphanedLogs.length === 0) return null;

  const handleClaim = async () => {
    if (!confirm(
      `${orphanedLogs.length} 件の過去ログをこのアカウントに紐付けます。\nよろしいですか？`
    )) return;

    setClaiming(true);
    const ids = orphanedLogs.map((l) => l.id);
    const claimed = await claimOrphanedLogs(ids, teacherId);
    setClaiming(false);

    if (claimed > 0) {
      setOrphanedLogs([]);
      onClaimed();
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div class="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3">
          <div class="text-2xl">📦</div>
          <div>
            <div class="font-bold text-amber-800">
              過去ログの引き取り
            </div>
            <p class="text-sm text-amber-700 mt-1">
              アカウント未紐付けの授業ログが <span class="font-bold">{orphanedLogs.length} 件</span> あります
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          class="text-amber-400 hover:text-amber-600 text-lg leading-none"
          title="閉じる"
        >
          ×
        </button>
      </div>

      {/* Expandable detail list */}
      <div class="mt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          class="text-sm text-amber-600 hover:text-amber-800 hover:underline"
        >
          {expanded ? '▼ 一覧を閉じる' : '▶ 詳細を表示'}
        </button>

        {expanded && (
          <div class="mt-3 max-h-48 overflow-y-auto space-y-1">
            {orphanedLogs.map((log) => (
              <div
                key={log.id}
                class="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-amber-100"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-bold text-gray-800 truncate block">
                    {log.scenario_title || log.scenario_slug}
                  </span>
                </div>
                <div class="flex items-center gap-4 text-gray-500 text-xs flex-shrink-0 ml-3">
                  <span>{formatDate(log.start_time || log.created_at)}</span>
                  <span>{formatDuration(log.duration)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claim button */}
      <div class="mt-4 flex gap-2">
        <button
          onClick={handleClaim}
          disabled={claiming}
          class={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            claiming
              ? 'bg-gray-300 text-gray-500 cursor-wait'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {claiming ? '処理中...' : `${orphanedLogs.length} 件を引き取る`}
        </button>
        <button
          onClick={() => setDismissed(true)}
          class="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          今はしない
        </button>
      </div>
    </div>
  );
}
