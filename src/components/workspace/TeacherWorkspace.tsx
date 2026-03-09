import { useState, useEffect, useCallback } from 'preact/hooks';
import {
  fetchSessionLogs,
  fetchClasses,
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  type SessionLogRow,
  type ClassWithStats,
  type StudentWithClass,
  type StudentLogSummary,
} from '../../lib/supabase';
import SessionHistoryList from './SessionHistoryList';
import SessionLogDetail from './SessionLogDetail';
import ClassList from './ClassList';
import ClassDetail from './ClassDetail';
import OrphanedLogsBanner from './OrphanedLogsBanner';
import AnalyticsDashboard from './AnalyticsDashboard';
import MonthlyReports from './MonthlyReports';
import TermReports from './TermReports';
import AnnualReports from './AnnualReports';
import SchoolReport from './SchoolReport';
import AdminDashboard from './AdminDashboard';
import {
  exportAllReportsZip,
  exportSelectedReportsZip,
  isValidExportSelection,
  DEFAULT_EXPORT_SELECTION,
  type ExportSelection,
} from '../../lib/zip-export';

type WorkspaceTab = 'history' | 'classes' | 'analytics' | 'reports' | 'admin';
type ReportSubTab = 'monthly' | 'term' | 'annual' | 'school';

interface Props {
  teacherId: string;
  teacherName: string;
  schoolId?: string | null;
  role?: string | null;
}

export default function TeacherWorkspace({ teacherId, teacherName, schoolId, role }: Props) {
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<WorkspaceTab>('history');
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('monthly');
  const [logs, setLogs] = useState<SessionLogRow[]>([]);
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [zipExporting, setZipExporting] = useState(false);
  const [exportSelection, setExportSelection] = useState<ExportSelection>({ ...DEFAULT_EXPORT_SELECTION });
  const [showExportSettings, setShowExportSettings] = useState(false);

  // Guard: redirect non-admin away from admin tab
  useEffect(() => {
    if (tab === 'admin' && !isAdmin) {
      setTab('history');
    }
  }, [tab, isAdmin]);

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

  // All-reports ZIP: fetch student data on demand, build ZIP
  const handleAllReportsZip = useCallback(async () => {
    if (logs.length === 0) return;
    setZipExporting(true);
    try {
      const classIds = classes.map((c) => c.id);
      const allStudents = classIds.length > 0 ? await fetchAllStudentsForTeacher(classIds) : [];
      const studentIds = allStudents.map((s) => s.id);
      const studentLogs = studentIds.length > 0 ? await fetchStudentLogSummaries(studentIds) : [];

      const params = {
        logs,
        classes: classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
        students: allStudents.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
        studentLogs,
      };
      exportSelectedReportsZip(params, exportSelection);
    } finally {
      setZipExporting(false);
    }
  }, [logs, classes, exportSelection]);

  const toggleSelection = (key: keyof ExportSelection) => {
    setExportSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectionValid = isValidExportSelection(exportSelection);

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
        <button
          onClick={() => setTab('analytics')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'analytics'
              ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
        >
          📊 分析
        </button>
        <button
          onClick={() => setTab('reports')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'reports'
              ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
        >
          📅 レポート
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('admin')}
            class={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === 'admin'
                ? 'text-sky-700 border-b-2 border-sky-500 bg-sky-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            📊 管理
          </button>
        )}
      </div>

      {/* Content */}
      {tab === 'history' ? (
        <SessionHistoryList logs={logs} onSelect={setSelectedLogId} />
      ) : tab === 'analytics' ? (
        <AnalyticsDashboard logs={logs} classes={classes} teacherId={teacherId} />
      ) : tab === 'reports' ? (
        <div>
          {/* Report sub-tabs */}
          <div class="flex items-center gap-2 mb-5">
            <button
              onClick={() => setReportSubTab('monthly')}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                reportSubTab === 'monthly'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              月次レポート
            </button>
            <button
              onClick={() => setReportSubTab('term')}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                reportSubTab === 'term'
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              学期レポート
            </button>
            <button
              onClick={() => setReportSubTab('annual')}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                reportSubTab === 'annual'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              年度レポート
            </button>
            <button
              onClick={() => setReportSubTab('school')}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                reportSubTab === 'school'
                  ? 'bg-sky-100 text-sky-800 border border-sky-300'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              学校レポート
            </button>
            <div class="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowExportSettings(!showExportSettings)}
                class={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  showExportSettings
                    ? 'bg-gray-200 text-gray-700 border border-gray-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
                title="エクスポート対象を設定"
              >
                設定
              </button>
              <button
                onClick={handleAllReportsZip}
                disabled={zipExporting || logs.length === 0 || !selectionValid}
                class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  zipExporting || logs.length === 0 || !selectionValid
                    ? 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                    : 'bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200'
                }`}
                title="選択した対象をまとめてダウンロード"
              >
                {zipExporting ? '生成中...' : '一括ZIP'}
              </button>
            </div>
          </div>
          {/* Export Selection Panel */}
          {showExportSettings && (
            <ExportSettingsPanel
              selection={exportSelection}
              onToggle={toggleSelection}
              valid={selectionValid}
            />
          )}
          {reportSubTab === 'monthly' ? (
            <MonthlyReports logs={logs} classes={classes} teacherId={teacherId} />
          ) : reportSubTab === 'term' ? (
            <TermReports logs={logs} classes={classes} teacherId={teacherId} />
          ) : reportSubTab === 'school' ? (
            <SchoolReport logs={logs} classes={classes} teacherId={teacherId} schoolId={schoolId} />
          ) : (
            <AnnualReports logs={logs} classes={classes} teacherId={teacherId} />
          )}
        </div>
      ) : tab === 'admin' && isAdmin ? (
        <AdminDashboard logs={logs} classes={classes} teacherId={teacherId} schoolId={schoolId} />
      ) : (
        <ClassList
          teacherId={teacherId}
          onSelectClass={(id) => {
            setSelectedClassId(id);
            // Refresh classes data
            fetchClasses(teacherId).then(setClasses);
          }}
          schoolId={schoolId}
        />
      )}
    </div>
  );
}

// ============================================================
// Export Settings Panel
// ============================================================

function ExportSettingsPanel({
  selection,
  onToggle,
  valid,
}: {
  selection: ExportSelection;
  onToggle: (key: keyof ExportSelection) => void;
  valid: boolean;
}) {
  return (
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      <div class="flex flex-wrap gap-6">
        {/* Report Units */}
        <div>
          <div class="text-xs font-bold text-gray-500 mb-2">レポート単位</div>
          <div class="space-y-1.5">
            <ExportCheckbox
              label="月次"
              checked={selection.includeMonthly}
              onChange={() => onToggle('includeMonthly')}
              color="amber"
            />
            <ExportCheckbox
              label="学期"
              checked={selection.includeTerm}
              onChange={() => onToggle('includeTerm')}
              color="indigo"
            />
            <ExportCheckbox
              label="年度"
              checked={selection.includeAnnual}
              onChange={() => onToggle('includeAnnual')}
              color="emerald"
            />
          </div>
        </div>

        {/* File Types */}
        <div>
          <div class="text-xs font-bold text-gray-500 mb-2">ファイル形式</div>
          <div class="space-y-1.5">
            <ExportCheckbox
              label="CSV"
              checked={selection.includeCSV}
              onChange={() => onToggle('includeCSV')}
              color="blue"
            />
            <ExportCheckbox
              label="HTML"
              checked={selection.includeHTML}
              onChange={() => onToggle('includeHTML')}
              color="purple"
            />
          </div>
        </div>

        {/* Additional */}
        <div>
          <div class="text-xs font-bold text-gray-500 mb-2">追加内容</div>
          <div class="space-y-1.5">
            <ExportCheckbox
              label="比較データ"
              checked={selection.includeComparison}
              onChange={() => onToggle('includeComparison')}
              color="teal"
            />
          </div>
        </div>
      </div>

      {!valid && (
        <div class="mt-3 text-xs text-red-500 font-bold">
          レポート単位とファイル形式をそれぞれ1つ以上選択してください
        </div>
      )}
    </div>
  );
}

function ExportCheckbox({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        class="w-4 h-4 rounded border-gray-300"
      />
      <span class={`text-sm font-bold ${checked ? `text-${color}-700` : 'text-gray-400'}`}>
        {label}
      </span>
    </label>
  );
}

// ============================================================
// Stats Bar
// ============================================================

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
