import { useState, useEffect } from 'preact/hooks';
import {
  fetchSessionLogs,
  type SessionLogRow,
} from '../../lib/supabase';
import SessionHistoryList from './SessionHistoryList';
import SessionLogDetail from './SessionLogDetail';

export default function TeacherWorkspace() {
  const [logs, setLogs] = useState<SessionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionLogs().then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">📋</div>
        <p class="font-bold">データを読み込み中...</p>
        <p class="text-sm mt-1">授業履歴を取得しています</p>
      </div>
    );
  }

  if (selectedId) {
    const log = logs.find((l) => l.id === selectedId);
    return (
      <SessionLogDetail
        logId={selectedId}
        cachedLog={log || null}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      {/* Stats */}
      <StatsBar logs={logs} />

      <h2 class="text-xl font-black mb-4">授業履歴</h2>
      <SessionHistoryList logs={logs} onSelect={setSelectedId} />
    </div>
  );
}

function StatsBar({ logs }: { logs: SessionLogRow[] }) {
  const completed = logs.filter((l) => l.duration != null);
  const totalTime = completed.reduce((sum, l) => sum + (l.duration || 0), 0);
  const avgTime = completed.length > 0 ? Math.round(totalTime / completed.length) : 0;
  const uniqueSlugs = new Set(logs.map((l) => l.scenario_slug)).size;

  const avgMin = Math.floor(avgTime / 60);
  const avgSec = avgTime % 60;

  const stats = [
    { label: '総授業数', value: String(logs.length) },
    { label: 'シナリオ数', value: String(uniqueSlugs) },
    { label: '平均授業時間', value: avgTime > 0 ? `${avgMin}:${String(avgSec).padStart(2, '0')}` : '--' },
    { label: '総授業時間', value: totalTime > 0 ? `${Math.floor(totalTime / 60)}分` : '--' },
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
