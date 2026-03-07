import { useState, useEffect } from 'preact/hooks';
import {
  fetchSessionLogs,
  fetchClasses,
  type SessionLogRow,
  type ClassWithStats,
} from '../../lib/supabase';
import SessionHistoryList from './SessionHistoryList';
import SessionLogDetail from './SessionLogDetail';
import ClassList from './ClassList';
import ClassDetail from './ClassDetail';
import OrphanedLogsBanner from './OrphanedLogsBanner';

type WorkspaceTab = 'history' | 'classes';

interface Props {
  teacherId: string;
  teacherName: string;
}

export default function TeacherWorkspace({ teacherId, teacherName }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>('history');
  const [logs, setLogs] = useState<SessionLogRow[]>([]);
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchSessionLogs(teacherId),
      fetchClasses(teacherId),
    ]).then(([l, c]) => {
      setLogs(l);
      setClasses(c);
      setLoading(false);
    });
  }, [teacherId]);

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">📋</div>
        <p class="font-bold">データを読み込み中...</p>
        <p class="text-sm mt-1">授業履歴を取得しています</p>
      </div>
    );
  }

  // Session log detail view
  if (selectedLogId) {
    const log = logs.find((l) => l.id === selectedLogId);
    return (
      <SessionLogDetail
        logId={selectedLogId}
        cachedLog={log || null}
        onBack={() => setSelectedLogId(null)}
      />
    );
  }

  // Class detail view
  if (selectedClassId) {
    const cls = classes.find((c) => c.id === selectedClassId);
    if (cls) {
      return (
        <ClassDetail
          classId={selectedClassId}
          classData={cls}
          onBack={() => {
            setSelectedClassId(null);
            // Refresh classes when returning
            fetchClasses(teacherId).then(setClasses);
          }}
        />
      );
    }
  }

  const refreshLogs = () => {
    fetchSessionLogs(teacherId).then(setLogs);
  };

  return (
    <div>
      {/* Orphaned logs adoption banner */}
      <OrphanedLogsBanner teacherId={teacherId} onClaimed={refreshLogs} />

      {/* Stats */}
      <StatsBar logs={logs} classCount={classes.length} />

      {/* Tabs */}
      <div class="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('history')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'history'
              ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
        >
          📋 授業履歴 ({logs.length})
        </button>
        <button
          onClick={() => setTab('classes')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'classes'
              ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
        >
          🏫 クラス ({classes.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'history' ? (
        <SessionHistoryList logs={logs} onSelect={setSelectedLogId} />
      ) : (
        <ClassList
          teacherId={teacherId}
          onSelectClass={(id) => {
            setSelectedClassId(id);
            // Refresh classes data
            fetchClasses(teacherId).then(setClasses);
          }}
        />
      )}
    </div>
  );
}

function StatsBar({ logs, classCount }: { logs: SessionLogRow[]; classCount: number }) {
  const completed = logs.filter((l) => l.duration != null);
  const totalTime = completed.reduce((sum, l) => sum + (l.duration || 0), 0);
  const avgTime = completed.length > 0 ? Math.round(totalTime / completed.length) : 0;
  const uniqueSlugs = new Set(logs.map((l) => l.scenario_slug)).size;

  const avgMin = Math.floor(avgTime / 60);
  const avgSec = avgTime % 60;

  const stats = [
    { label: '総授業数', value: String(logs.length) },
    { label: 'クラス数', value: String(classCount) },
    { label: 'シナリオ数', value: String(uniqueSlugs) },
    { label: '平均授業時間', value: avgTime > 0 ? `${avgMin}:${String(avgSec).padStart(2, '0')}` : '--' },
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
