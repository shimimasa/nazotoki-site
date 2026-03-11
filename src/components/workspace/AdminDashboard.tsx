import { useState, useEffect, useMemo } from 'preact/hooks';
import type { SessionLogRow, ClassWithStats, StudentWithClass, StudentLogSummary, SchoolTeacher, SchoolRow, RoleChangeLog, TeacherInvitationRow, SchoolProfileUpdate, SchoolType, RoleChangeLogQuery, PaginatedRoleChangeLogs } from '../../lib/supabase';
import {
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  fetchSchoolClasses,
  fetchSchoolSessionLogs,
  fetchSchoolTeachers,
  fetchSchoolStudents,
  fetchSchool,
  updateSchoolName,
  updateSchoolProfile,
  updateTeacherRole,
  fetchRoleChangeLogs,
  fetchRoleChangeLogsPaginated,
  fetchTeacherInvitations,
  createTeacherInvitation,
  sendInvitationEmail,
} from '../../lib/supabase';
import { buildSchoolReport } from '../../lib/school-report';
import GroupDashboard from './GroupDashboard';
import { formatMinSec, formatPercent, formatDate } from '../../lib/session-analytics';
import {
  filterSessionsByRange,
  dateRangeLabel,
  type DateRange,
  type DateRangeType,
} from '../../lib/analytics-export';
import {
  computeAdminKPI,
  computeAdminClassStatus,
  computeAdminScenarioStatus,
  computeAdminInsights,
  type AdminKPI,
  type ClassStatus,
  type ScenarioStatus,
} from '../../lib/admin-dashboard';
import type { Insight } from '../../lib/session-insights';
import {
  exportAdminSummaryCSV,
  exportAdminClassCSV,
  exportAdminScenarioCSV,
  exportAdminDashboardHtml,
  exportAdminDashboardZip,
  exportAdminComparisonSummaryCSV,
  exportAdminClassComparisonCSV,
  exportAdminComparisonHtml,
  exportAdminComparisonZip,
} from '../../lib/admin-export';
import {
  getSchoolComparisonRange,
  getSchoolComparisonLabel,
  compareAdminDashboards,
  type AdminComparison,
  type AdminClassDelta,
} from '../../lib/admin-comparison';
import { formatDeltaDisplay, deltaColorClass } from '../../lib/monthly-comparison';

// ============================================================
// Admin Range Options
// ============================================================

type AdminRangeType = 'all' | 'last30' | 'thisTerm' | 'thisYear';

const ADMIN_RANGE_OPTIONS: { type: AdminRangeType; label: string }[] = [
  { type: 'all', label: '全期間' },
  { type: 'last30', label: '直近30日' },
  { type: 'thisTerm', label: '今学期' },
  { type: 'thisYear', label: '今年度' },
];

function toDateRange(type: AdminRangeType): DateRange {
  return { type: type as DateRangeType };
}

// ============================================================
// Props
// ============================================================

interface Props {
  logs: SessionLogRow[];
  classes: ClassWithStats[];
  teacherId: string;
  schoolId?: string | null;
  groupRole?: string | null;
}

// ============================================================
// Main Component
// ============================================================

export default function AdminDashboard({ logs, classes, teacherId, schoolId, groupRole }: Props) {
  const [schoolLogs, setSchoolLogs] = useState<SessionLogRow[] | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<ClassWithStats[] | null>(null);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [studentLogs, setStudentLogs] = useState<StudentLogSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [rangeType, setRangeType] = useState<AdminRangeType>('all');

  const effectiveLogs = schoolLogs ?? logs;
  const effectiveClasses = schoolClasses ?? classes;

  // Fetch school-scoped data
  useEffect(() => {
    if (!schoolId) {
      setSchoolLogs(null);
      setSchoolClasses(null);
      return;
    }
    Promise.all([
      fetchSchoolClasses(schoolId),
      fetchSchoolSessionLogs(schoolId),
    ]).then(([cls, lg]) => {
      setSchoolClasses(cls);
      setSchoolLogs(lg);
    });
  }, [schoolId]);

  // Fetch student data
  useEffect(() => {
    setDataLoaded(false);
    const classIds = effectiveClasses.map((c) => c.id);
    if (classIds.length === 0) {
      setStudents([]);
      setStudentLogs([]);
      setDataLoaded(true);
      return;
    }
    fetchAllStudentsForTeacher(classIds).then((allStudents) => {
      setStudents(allStudents);
      const ids = allStudents.map((s) => s.id);
      if (ids.length === 0) {
        setStudentLogs([]);
        setDataLoaded(true);
        return;
      }
      fetchStudentLogSummaries(ids).then((sl) => {
        setStudentLogs(sl);
        setDataLoaded(true);
      });
    });
  }, [effectiveClasses]);

  // Build report + admin view models (with range filter)
  const range = toDateRange(rangeType);
  const currentRangeLabel = dateRangeLabel(range);

  const { kpi, classStatuses, scenarioStatuses, adminInsights, filteredLogCount, comparison } = useMemo(() => {
    const empty = { kpi: null, classStatuses: [] as ClassStatus[], scenarioStatuses: [] as ScenarioStatus[], adminInsights: [] as Insight[], filteredLogCount: 0, comparison: null as AdminComparison | null };
    if (!dataLoaded) return empty;

    // Apply range filter
    const filteredLogs = filterSessionsByRange(effectiveLogs, range);

    if (filteredLogs.length === 0) {
      return { ...empty, filteredLogCount: 0 };
    }

    const classesInput = effectiveClasses.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label }));
    const studentsInput = students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name }));

    const report = buildSchoolReport(filteredLogs, classesInput, studentsInput, studentLogs);

    // Include all classes (even those with 0 sessions in this range) for admin view
    const allClassMetrics = report.classBreakdown;
    const reportClassIds = new Set(allClassMetrics.map((c) => c.classId));
    const zeroSessionClasses = effectiveClasses
      .filter((c) => !reportClassIds.has(c.id))
      .map((c) => ({
        classId: c.id,
        className: c.class_name,
        gradeLabel: c.grade_label,
        sessionCount: 0,
        avgDuration: null,
        avgAccuracyRate: null,
        avgDiscussTime: null,
        avgExploreTime: null,
        scenarioCounts: [],
        lastSessionDate: null,
      }));
    const fullClassMetrics = [...allClassMetrics, ...zeroSessionClasses];

    const k = computeAdminKPI(report.summary, fullClassMetrics, filteredLogs);
    const cs = computeAdminClassStatus(fullClassMetrics);
    const ss = computeAdminScenarioStatus(report.scenarioBreakdown);
    const ai = computeAdminInsights(k, cs, ss, currentRangeLabel);

    // Compute comparison (if applicable)
    let comp: AdminComparison | null = null;
    if (rangeType !== 'all') {
      const prevRange = getSchoolComparisonRange(rangeType as DateRangeType);
      if (prevRange) {
        const prevFilteredLogs = filterSessionsByRange(effectiveLogs, prevRange);
        if (prevFilteredLogs.length > 0) {
          const prevReport = buildSchoolReport(prevFilteredLogs, classesInput, studentsInput, studentLogs);
          const prevAllClassMetrics = prevReport.classBreakdown;
          const prevReportClassIds = new Set(prevAllClassMetrics.map((c) => c.classId));
          const prevZeroClasses = effectiveClasses
            .filter((c) => !prevReportClassIds.has(c.id))
            .map((c) => ({
              classId: c.id,
              className: c.class_name,
              gradeLabel: c.grade_label,
              sessionCount: 0,
              avgDuration: null,
              avgAccuracyRate: null,
              avgDiscussTime: null,
              avgExploreTime: null,
              scenarioCounts: [],
              lastSessionDate: null,
            }));
          const prevFullClassMetrics = [...prevAllClassMetrics, ...prevZeroClasses];
          const prevK = computeAdminKPI(prevReport.summary, prevFullClassMetrics, prevFilteredLogs);
          const prevCs = computeAdminClassStatus(prevFullClassMetrics);
          const prevLabel = getSchoolComparisonLabel(rangeType as DateRangeType);
          comp = compareAdminDashboards(k, prevK, cs, prevCs, currentRangeLabel, prevLabel);
        }
      }
    }

    return { kpi: k, classStatuses: cs, scenarioStatuses: ss, adminInsights: ai, filteredLogCount: filteredLogs.length, comparison: comp };
  }, [dataLoaded, effectiveLogs, effectiveClasses, students, studentLogs, rangeType]);

  if (!dataLoaded) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">📊</div>
        <p class="font-bold">管理データを読み込み中...</p>
      </div>
    );
  }

  if (!kpi) {
    return (
      <div class="space-y-6">
        <AdminHeader rangeType={rangeType} onRangeChange={setRangeType} />
        <div class="text-center py-16 text-gray-400">
          <div class="text-4xl mb-4">📊</div>
          <p class="font-bold">
            {rangeType === 'all'
              ? '授業データがありません'
              : `${currentRangeLabel}の授業データはありません`}
          </p>
          <p class="text-sm mt-1">
            {rangeType === 'all'
              ? '授業を実施すると、管理職ダッシュボードが表示されます'
              : '期間を変更するか、授業を実施してください'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      {/* Header + Range Filter */}
      <AdminHeader
        rangeType={rangeType}
        onRangeChange={setRangeType}
        onExportZip={comparison
          ? () => exportAdminComparisonZip(comparison, kpi, classStatuses, scenarioStatuses, adminInsights, rangeType, currentRangeLabel)
          : () => exportAdminDashboardZip(kpi, classStatuses, scenarioStatuses, adminInsights, rangeType, currentRangeLabel)
        }
        onExportHtml={comparison
          ? () => exportAdminComparisonHtml(comparison)
          : () => exportAdminDashboardHtml(kpi, classStatuses, scenarioStatuses, adminInsights, currentRangeLabel)
        }
      />

      {/* Group Dashboard (Phase 110) */}
      {groupRole === 'group_admin' && (
        <section>
          <h3 class="text-sm font-black text-indigo-800 mb-3">グループ管理</h3>
          <GroupDashboard />
        </section>
      )}

      {/* KPI Cards */}
      <div class="flex items-center justify-between mb-1">
        <div />
        <ExportButton
          label="サマリーCSV"
          onClick={() => exportAdminSummaryCSV(kpi, rangeType, currentRangeLabel)}
        />
      </div>
      <KPICards kpi={kpi} rangeType={rangeType} comparison={comparison} />

      {/* Admin Insights */}
      {adminInsights.length > 0 && (
        <AdminInsightsSection insights={adminInsights} />
      )}

      {/* Comparison Section */}
      {comparison && (
        <ComparisonSection comparison={comparison} />
      )}

      {/* Class Status Table */}
      {classStatuses.length > 0 && (
        <ClassStatusTable
          statuses={classStatuses}
          onExportCSV={() => exportAdminClassCSV(classStatuses, rangeType, currentRangeLabel)}
        />
      )}

      {/* Scenario Status Table */}
      {scenarioStatuses.length > 0 && (
        <ScenarioStatusTable
          statuses={scenarioStatuses}
          onExportCSV={() => exportAdminScenarioCSV(scenarioStatuses, rangeType, currentRangeLabel)}
        />
      )}

      {/* School Management (admin only) */}
      {schoolId && (
        <SchoolManagement schoolId={schoolId} />
      )}

      {/* Invitation Management (admin only) */}
      {schoolId && (
        <InvitationManagement schoolId={schoolId} />
      )}

      {/* Student Management (admin only) */}
      {schoolId && (
        <StudentManagement schoolId={schoolId} />
      )}

      {/* Teacher Management (admin only) */}
      {schoolId && (
        <TeacherManagement schoolId={schoolId} currentTeacherId={teacherId} />
      )}

      {/* Role Change Audit Log (admin only) */}
      {schoolId && (
        <RoleChangeAuditLog schoolId={schoolId} />
      )}
    </div>
  );
}

// ============================================================
// Admin Header (title + range selector)
// ============================================================

function AdminHeader({
  rangeType,
  onRangeChange,
  onExportZip,
  onExportHtml,
}: {
  rangeType: AdminRangeType;
  onRangeChange: (t: AdminRangeType) => void;
  onExportZip?: () => void;
  onExportHtml?: () => void;
}) {
  return (
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex items-center gap-3">
        <div class="text-2xl">📊</div>
        <div>
          <h2 class="text-lg font-black text-gray-900">管理職ダッシュボード</h2>
          <p class="text-xs text-gray-400">学校全体の活用状況を俯瞰</p>
        </div>
      </div>
      <div class="sm:ml-auto flex items-center gap-2">
        <div class="flex rounded-lg border border-gray-200 overflow-hidden">
          {ADMIN_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onRangeChange(opt.type)}
              class={`px-3 py-1.5 text-xs font-bold transition-colors ${
                rangeType === opt.type
                  ? 'bg-sky-100 text-sky-800 border-sky-300'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              } ${opt.type !== 'all' ? 'border-l border-gray-200' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {onExportHtml && (
          <button
            onClick={onExportHtml}
            class="px-3 py-1.5 text-xs font-bold bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
            title="HTML出力"
          >
            HTML
          </button>
        )}
        {onExportZip && (
          <button
            onClick={onExportZip}
            class="px-3 py-1.5 text-xs font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
            title="一式ZIP出力"
          >
            ZIP
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Export Button (small, inline)
// ============================================================

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      class="px-2 py-1 text-xs font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
      title={`${label}をダウンロード`}
    >
      {label}
    </button>
  );
}

// ============================================================
// KPI Cards
// ============================================================

type DeltaKey = 'sessions' | 'activeClasses' | 'students' | 'accuracyRate' | 'discussTime' | 'exploreTime' | 'scenarioCount' | 'lowActivityClasses' | 'classGapPt';
type DeltaUnit = 'pct' | 'time' | 'count' | 'pctPt';
type DeltaMetric = 'positive' | 'negative' | 'neutral';

function KPICards({ kpi, rangeType, comparison }: { kpi: AdminKPI; rangeType: AdminRangeType; comparison: AdminComparison | null }) {
  const isAll = rangeType === 'all';

  const cards: { label: string; value: string; sub?: string; alert?: boolean; deltaKey?: DeltaKey; deltaUnit?: DeltaUnit; deltaMetric?: DeltaMetric }[] = [
    {
      label: isAll ? '総授業回数' : '期間内授業数',
      value: String(kpi.totalSessions),
      sub: '回',
      deltaKey: 'sessions',
      deltaUnit: 'count',
      deltaMetric: 'positive',
    },
    {
      label: '実施クラス数',
      value: String(kpi.activeClassCount),
      sub: 'クラス',
      deltaKey: 'activeClasses',
      deltaUnit: 'count',
      deltaMetric: 'positive',
    },
    {
      label: '参加生徒数',
      value: String(kpi.totalStudents),
      sub: '人',
      deltaKey: 'students',
      deltaUnit: 'count',
      deltaMetric: 'positive',
    },
    {
      label: '平均正解率',
      value: kpi.avgAccuracyRate != null ? formatPercent(kpi.avgAccuracyRate) : '-',
      deltaKey: 'accuracyRate',
      deltaUnit: 'pctPt',
      deltaMetric: 'positive',
    },
    {
      label: '平均議論時間',
      value: kpi.avgDiscussTime != null ? formatMinSec(kpi.avgDiscussTime) : '-',
      deltaKey: 'discussTime',
      deltaUnit: 'time',
      deltaMetric: 'neutral',
    },
    {
      label: '平均探索時間',
      value: kpi.avgExploreTime != null ? formatMinSec(kpi.avgExploreTime) : '-',
      deltaKey: 'exploreTime',
      deltaUnit: 'time',
      deltaMetric: 'neutral',
    },
    {
      label: '利用シナリオ数',
      value: String(kpi.uniqueScenarioCount),
      sub: '種類',
      deltaKey: 'scenarioCount',
      deltaUnit: 'count',
      deltaMetric: 'positive',
    },
    ...(isAll
      ? [{
          label: '直近30日',
          value: String(kpi.last30DaySessions),
          sub: '回',
          alert: false,
        }]
      : []),
    {
      label: '低活用クラス',
      value: String(kpi.lowActivityClassCount),
      sub: 'クラス',
      alert: kpi.lowActivityClassCount > 0,
      deltaKey: 'lowActivityClasses' as DeltaKey,
      deltaUnit: 'count' as DeltaUnit,
      deltaMetric: 'negative' as DeltaMetric,
    },
    {
      label: 'クラス間格差',
      value: kpi.classGapPt != null ? `${kpi.classGapPt}pt` : '-',
      alert: kpi.classGapPt != null && kpi.classGapPt >= 30,
      deltaKey: 'classGapPt' as DeltaKey,
      deltaUnit: 'pctPt' as DeltaUnit,
      deltaMetric: 'negative' as DeltaMetric,
    },
  ];

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {cards.map((c) => {
        // Get delta badge if comparison exists
        let deltaBadge: { text: string; colorClass: string } | null = null;
        if (comparison && c.deltaKey && comparison.deltas[c.deltaKey]) {
          const dv = comparison.deltas[c.deltaKey];
          const display = formatDeltaDisplay(dv, c.deltaUnit!);
          if (display.color !== 'neutral' || dv.delta !== 0) {
            deltaBadge = {
              text: display.text,
              colorClass: deltaColorClass(display.color, c.deltaMetric!),
            };
          }
        }

        return (
          <div
            key={c.label}
            class={`rounded-xl p-4 text-center border ${
              c.alert
                ? 'bg-red-50 border-red-200'
                : 'bg-white border-gray-200'
            }`}
          >
            <div class={`text-2xl font-black ${c.alert ? 'text-red-600' : 'text-sky-600'}`}>
              {c.value}
            </div>
            {c.sub && (
              <span class="text-xs text-gray-400 ml-0.5">{c.sub}</span>
            )}
            {deltaBadge && (
              <div class={`text-xs font-bold mt-0.5 ${deltaBadge.colorClass}`}>
                {deltaBadge.text}
              </div>
            )}
            <div class="text-xs text-gray-500 mt-1 font-bold">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Admin Insights
// ============================================================

function AdminInsightsSection({ insights }: { insights: Insight[] }) {
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  return (
    <div class="bg-sky-50 rounded-xl border border-sky-200 p-5">
      <h3 class="text-sm font-black text-sky-800 mb-3">学校全体の傾向</h3>

      {observations.length > 0 && (
        <div class="space-y-2 mb-3">
          {observations.map((o, i) => (
            <div key={i} class="flex items-start gap-2 text-sm text-sky-900">
              <span class="text-sky-500 mt-0.5 shrink-0">●</span>
              <span>{o.text}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div class="space-y-2">
          <div class="text-xs font-bold text-sky-600 mt-2 mb-1">提案</div>
          {suggestions.map((s, i) => (
            <div key={i} class="flex items-start gap-2 text-sm text-sky-900">
              <span class="text-amber-500 mt-0.5 shrink-0">▶</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Class Status Table
// ============================================================

const STATUS_LABEL_STYLE: Record<string, string> = {
  '活用中': 'bg-green-100 text-green-700',
  '導入段階': 'bg-amber-100 text-amber-700',
  '低活用': 'bg-red-100 text-red-700',
};

function ClassStatusTable({ statuses, onExportCSV }: { statuses: ClassStatus[]; onExportCSV?: () => void }) {
  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-black text-gray-700">クラス活用状況</h3>
        {onExportCSV && <ExportButton label="CSV" onClick={onExportCSV} />}
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="text-left py-2 px-2 font-bold">クラス名</th>
              <th class="text-left py-2 px-2 font-bold">学年</th>
              <th class="text-right py-2 px-2 font-bold">授業回数</th>
              <th class="text-right py-2 px-2 font-bold">正解率</th>
              <th class="text-right py-2 px-2 font-bold">議論時間</th>
              <th class="text-right py-2 px-2 font-bold">探索時間</th>
              <th class="text-right py-2 px-2 font-bold">最終実施日</th>
              <th class="text-center py-2 px-2 font-bold">状況</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <tr key={s.classId} class="border-b border-gray-100 hover:bg-gray-50">
                <td class="py-2 px-2 font-bold text-gray-900">{s.className}</td>
                <td class="py-2 px-2 text-gray-500">{s.gradeLabel || '-'}</td>
                <td class="py-2 px-2 text-right text-gray-700">{s.sessionCount}</td>
                <td class="py-2 px-2 text-right text-gray-700">
                  {s.avgAccuracyRate != null ? formatPercent(s.avgAccuracyRate) : '-'}
                </td>
                <td class="py-2 px-2 text-right text-gray-700">
                  {s.avgDiscussTime != null ? formatMinSec(s.avgDiscussTime) : '-'}
                </td>
                <td class="py-2 px-2 text-right text-gray-700">
                  {s.avgExploreTime != null ? formatMinSec(s.avgExploreTime) : '-'}
                </td>
                <td class="py-2 px-2 text-right text-gray-500">
                  {s.lastSessionDate ? formatDate(s.lastSessionDate) : '-'}
                </td>
                <td class="py-2 px-2 text-center">
                  <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_LABEL_STYLE[s.statusLabel] || ''}`}>
                    {s.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Scenario Status Table
// ============================================================

const SCENARIO_STATUS_STYLE: Record<string, string> = {
  'よく使われている': 'bg-green-100 text-green-700',
  '継続活用候補': 'bg-amber-100 text-amber-700',
  '試行段階': 'bg-gray-100 text-gray-500',
};

function ScenarioStatusTable({ statuses, onExportCSV }: { statuses: ScenarioStatus[]; onExportCSV?: () => void }) {
  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-black text-gray-700">シナリオ活用状況</h3>
        {onExportCSV && <ExportButton label="CSV" onClick={onExportCSV} />}
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="text-left py-2 px-2 font-bold">シナリオ名</th>
              <th class="text-right py-2 px-2 font-bold">使用回数</th>
              <th class="text-right py-2 px-2 font-bold">実施クラス</th>
              <th class="text-right py-2 px-2 font-bold">正解率</th>
              <th class="text-right py-2 px-2 font-bold">平均時間</th>
              <th class="text-center py-2 px-2 font-bold">状況</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <tr key={s.slug} class="border-b border-gray-100 hover:bg-gray-50">
                <td class="py-2 px-2 font-bold text-gray-900">{s.title || s.slug}</td>
                <td class="py-2 px-2 text-right text-gray-700">{s.sessionCount}</td>
                <td class="py-2 px-2 text-right text-gray-700">{s.classCount}</td>
                <td class="py-2 px-2 text-right text-gray-700">
                  {s.avgAccuracyRate != null ? formatPercent(s.avgAccuracyRate) : '-'}
                </td>
                <td class="py-2 px-2 text-right text-gray-700">
                  {s.avgDuration != null ? formatMinSec(s.avgDuration) : '-'}
                </td>
                <td class="py-2 px-2 text-center">
                  <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${SCENARIO_STATUS_STYLE[s.statusLabel] || ''}`}>
                    {s.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Comparison Section
// ============================================================

function ComparisonSection({ comparison }: { comparison: AdminComparison }) {
  const { currentLabel, previousLabel, classDeltas, insights } = comparison;
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  return (
    <div class="space-y-6">
      {/* Comparison Insights */}
      {insights.length > 0 && (
        <div class="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-black text-indigo-800">
              期間比較: {currentLabel} vs {previousLabel}
            </h3>
            <div class="flex gap-1">
              <ExportButton
                label="比較CSV"
                onClick={() => exportAdminComparisonSummaryCSV(comparison)}
              />
            </div>
          </div>

          {observations.length > 0 && (
            <div class="space-y-2 mb-3">
              {observations.map((o, i) => (
                <div key={i} class="flex items-start gap-2 text-sm text-indigo-900">
                  <span class="text-indigo-500 mt-0.5 shrink-0">●</span>
                  <span>{o.text}</span>
                </div>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <div class="space-y-2">
              <div class="text-xs font-bold text-indigo-600 mt-2 mb-1">提案</div>
              {suggestions.map((s, i) => (
                <div key={i} class="flex items-start gap-2 text-sm text-indigo-900">
                  <span class="text-amber-500 mt-0.5 shrink-0">▶</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Class Comparison Table */}
      {classDeltas.length > 0 && (
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-black text-gray-700">クラス別 期間比較</h3>
            <ExportButton
              label="クラス比較CSV"
              onClick={() => exportAdminClassComparisonCSV(comparison)}
            />
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-gray-200 text-gray-500">
                  <th class="text-left py-2 px-2 font-bold">クラス名</th>
                  <th class="text-right py-2 px-2 font-bold">当期</th>
                  <th class="text-right py-2 px-2 font-bold">前期</th>
                  <th class="text-right py-2 px-2 font-bold">授業差分</th>
                  <th class="text-right py-2 px-2 font-bold">正解率差分</th>
                  <th class="text-center py-2 px-2 font-bold">状況</th>
                </tr>
              </thead>
              <tbody>
                {classDeltas.map((c) => {
                  const sesDelta = c.sessionsDelta;
                  const sesColor = sesDelta > 0 ? 'text-green-600' : sesDelta < 0 ? 'text-red-500' : 'text-gray-400';
                  const sesText = sesDelta > 0 ? `+${sesDelta}` : String(sesDelta);

                  const accDelta = c.accuracyDelta;
                  const accText = accDelta != null
                    ? `${accDelta > 0 ? '+' : ''}${Math.round(accDelta * 100)}pt`
                    : '-';
                  const accColor = accDelta != null
                    ? (accDelta > 0 ? 'text-green-600' : accDelta < 0 ? 'text-red-500' : 'text-gray-400')
                    : 'text-gray-400';

                  return (
                    <tr key={c.classId} class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="py-2 px-2 font-bold text-gray-900">{c.className}</td>
                      <td class="py-2 px-2 text-right text-gray-700">{c.currentSessions}</td>
                      <td class="py-2 px-2 text-right text-gray-500">{c.previousSessions}</td>
                      <td class={`py-2 px-2 text-right font-bold ${sesColor}`}>{sesText}</td>
                      <td class={`py-2 px-2 text-right font-bold ${accColor}`}>{accText}</td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_LABEL_STYLE[c.statusLabel] || ''}`}>
                          {c.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// School Management (admin only)
// ============================================================

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  elementary: '小学校',
  junior_high: '中学校',
  high: '高等学校',
  combined: '一貫校',
  special_needs: '特別支援学校',
  other: 'その他',
};

const SCHOOL_TYPE_OPTIONS: { value: SchoolType; label: string }[] = [
  { value: 'elementary', label: '小学校' },
  { value: 'junior_high', label: '中学校' },
  { value: 'high', label: '高等学校' },
  { value: 'combined', label: '一貫校' },
  { value: 'special_needs', label: '特別支援学校' },
  { value: 'other', label: 'その他' },
];

function SchoolManagement({ schoolId }: { schoolId: string }) {
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<SchoolType | ''>('');
  const [editAddress, setEditAddress] = useState('');
  const [editPrincipal, setEditPrincipal] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editEmail, setEditEmail] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSchool(schoolId),
      fetchSchoolTeachers(schoolId),
      fetchSchoolClasses(schoolId),
      fetchSchoolStudents(schoolId),
    ]).then(([s, t, c, st]) => {
      setSchool(s);
      setTeachers(t);
      setClassCount(c.length);
      setStudentCount(st.length);
      setLoading(false);
    });
  }, [schoolId]);

  const adminCount = teachers.filter((t) => t.role === 'admin').length;

  const startEditing = () => {
    if (!school) return;
    setEditName(school.name);
    setEditType(school.school_type || '');
    setEditAddress(school.address || '');
    setEditPrincipal(school.principal_name || '');
    setEditPhone(school.phone_number || '');
    setEditWebsite(school.website_url || '');
    setEditEmail(school.contact_email || '');
    setEditing(true);
    setSaveMsg(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setSaveMsg(null);
  };

  const handleSaveProfile = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setSaveMsg({ type: 'err', text: '学校名を入力してください' });
      return;
    }
    if (trimmedName.length > 100) {
      setSaveMsg({ type: 'err', text: '学校名は100文字以内にしてください' });
      return;
    }
    const trimmedPhone = editPhone.trim();
    if (trimmedPhone.length > 20) {
      setSaveMsg({ type: 'err', text: '電話番号は20文字以内にしてください' });
      return;
    }
    const trimmedWebsite = editWebsite.trim();
    if (trimmedWebsite && !/^https?:\/\/.+/.test(trimmedWebsite)) {
      setSaveMsg({ type: 'err', text: 'URLは http:// または https:// で始めてください' });
      return;
    }
    const trimmedEmail = editEmail.trim();
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setSaveMsg({ type: 'err', text: 'メールアドレスの形式が正しくありません' });
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    const updates: SchoolProfileUpdate = {
      name: trimmedName,
      school_type: (editType as SchoolType) || null,
      address: editAddress.trim() || null,
      principal_name: editPrincipal.trim() || null,
      phone_number: trimmedPhone || null,
      website_url: trimmedWebsite || null,
      contact_email: trimmedEmail || null,
    };

    const ok = await updateSchoolProfile(schoolId, updates);
    if (ok) {
      setSchool((prev) => prev ? { ...prev, ...updates } : prev);
      setEditing(false);
      setSaveMsg({ type: 'ok', text: '学校情報を更新しました' });
      setTimeout(() => setSaveMsg(null), 3000);
    } else {
      setSaveMsg({ type: 'err', text: '更新に失敗しました' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm font-bold">学校情報を読み込み中...</p>
      </div>
    );
  }

  if (!school) {
    return null;
  }

  const inputClass = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400';

  return (
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-black text-gray-700">学校管理</h3>
        {!editing && (
          <button
            onClick={startEditing}
            class="px-3 py-1 text-xs font-bold text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
          >
            編集
          </button>
        )}
      </div>

      {saveMsg && (
        <div class={`mb-3 px-3 py-2 rounded-lg text-sm ${
          saveMsg.type === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {saveMsg.text}
        </div>
      )}

      {editing ? (
        /* ===== Edit Mode ===== */
        <div class="space-y-3">
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">学校名 *</label>
            <input type="text" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
              class={inputClass} maxLength={100} disabled={saving} placeholder="例: 港区立AI小学校" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">学校種別</label>
            <select value={editType} onChange={(e) => setEditType((e.target as HTMLSelectElement).value as SchoolType | '')}
              class={inputClass} disabled={saving}>
              <option value="">未設定</option>
              {SCHOOL_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">住所</label>
            <input type="text" value={editAddress} onInput={(e) => setEditAddress((e.target as HTMLInputElement).value)}
              class={inputClass} disabled={saving} placeholder="例: 東京都港区..." />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">校長名</label>
            <input type="text" value={editPrincipal} onInput={(e) => setEditPrincipal((e.target as HTMLInputElement).value)}
              class={inputClass} disabled={saving} placeholder="例: 山田太郎" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-gray-500 mb-1 block">電話番号</label>
              <input type="tel" value={editPhone} onInput={(e) => setEditPhone((e.target as HTMLInputElement).value)}
                class={inputClass} maxLength={20} disabled={saving} placeholder="例: 03-1234-5678" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-500 mb-1 block">連絡先メール</label>
              <input type="email" value={editEmail} onInput={(e) => setEditEmail((e.target as HTMLInputElement).value)}
                class={inputClass} disabled={saving} placeholder="例: info@school.ed.jp" />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">ウェブサイト</label>
            <input type="url" value={editWebsite} onInput={(e) => setEditWebsite((e.target as HTMLInputElement).value)}
              class={inputClass} disabled={saving} placeholder="例: https://school.ed.jp" />
          </div>

          <div class="flex items-center gap-2 pt-2">
            <button onClick={handleSaveProfile} disabled={saving}
              class="px-4 py-2 text-xs font-bold bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={cancelEditing} disabled={saving}
              class="px-4 py-2 text-xs font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        /* ===== Display Mode ===== */
        <div>
          {/* School Name & Type */}
          <div class="mb-4">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-lg font-bold text-gray-900">{school.name}</span>
              {school.school_type && (
                <span class="px-2 py-0.5 text-xs font-bold bg-sky-100 text-sky-700 rounded-full">
                  {SCHOOL_TYPE_LABELS[school.school_type] || school.school_type}
                </span>
              )}
            </div>
          </div>

          {/* Profile Details */}
          {(school.address || school.principal_name || school.phone_number || school.website_url || school.contact_email) && (
            <div class="mb-4 space-y-1.5">
              {school.address && (
                <div class="text-sm text-gray-600">
                  <span class="text-xs font-bold text-gray-400 mr-2">住所</span>{school.address}
                </div>
              )}
              {school.principal_name && (
                <div class="text-sm text-gray-600">
                  <span class="text-xs font-bold text-gray-400 mr-2">校長</span>{school.principal_name}
                </div>
              )}
              {school.phone_number && (
                <div class="text-sm text-gray-600">
                  <span class="text-xs font-bold text-gray-400 mr-2">電話</span>{school.phone_number}
                </div>
              )}
              {school.contact_email && (
                <div class="text-sm text-gray-600">
                  <span class="text-xs font-bold text-gray-400 mr-2">メール</span>
                  <a href={`mailto:${school.contact_email}`} class="text-sky-600 hover:underline">{school.contact_email}</a>
                </div>
              )}
              {school.website_url && (
                <div class="text-sm text-gray-600">
                  <span class="text-xs font-bold text-gray-400 mr-2">Web</span>
                  <a href={school.website_url} target="_blank" rel="noopener noreferrer" class="text-sky-600 hover:underline">{school.website_url}</a>
                </div>
              )}
            </div>
          )}

          {/* Stats Grid */}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div class="bg-gray-50 rounded-lg p-3 text-center">
              <div class="text-xl font-black text-sky-600">{teachers.length}</div>
              <div class="text-xs text-gray-500 font-bold">教師数</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 text-center">
              <div class="text-xl font-black text-purple-600">{adminCount}</div>
              <div class="text-xs text-gray-500 font-bold">管理者数</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 text-center">
              <div class="text-xl font-black text-amber-600">{classCount}</div>
              <div class="text-xs text-gray-500 font-bold">クラス数</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 text-center">
              <div class="text-xl font-black text-green-600">{studentCount}</div>
              <div class="text-xs text-gray-500 font-bold">生徒数</div>
            </div>
          </div>

          {/* School ID (supplementary) */}
          <div class="text-xs text-gray-400">
            School ID: {schoolId.slice(0, 8)}...
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// Invitation Management (admin only)
// ============================================================

function InvitationManagement({ schoolId }: { schoolId: string }) {
  const [invitations, setInvitations] = useState<TeacherInvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [schoolName, setSchoolName] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchTeacherInvitations(schoolId),
      fetchSchool(schoolId),
    ]).then(([inv, school]) => {
      setInvitations(inv);
      if (school) setSchoolName(school.name);
      setLoading(false);
    });
  }, [schoolId]);

  const handleCreate = async () => {
    setError(null);
    setGeneratedLink(null);
    setCopied(false);
    setEmailStatus(null);
    setCreating(true);
    const emailTrimmed = inviteEmail.trim();
    const result = await createTeacherInvitation(emailTrimmed || null);
    if (result.ok && result.token) {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/invite/?token=${result.token}`;
      setGeneratedLink(link);

      // Send email if address provided
      if (emailTrimmed) {
        const emailResult = await sendInvitationEmail({
          email: emailTrimmed,
          inviteLink: link,
          schoolName: schoolName || '学校',
          expiresAt: result.expiresAt || '',
        });
        if (emailResult.ok) {
          setEmailStatus({ type: 'ok', text: `${emailTrimmed} にメールを送信しました` });
        } else {
          setEmailStatus({ type: 'err', text: `メール送信に失敗しました（招待リンクは作成済み）: ${emailResult.error || ''}` });
        }
      }

      setInviteEmail('');
      // Refresh list
      fetchTeacherInvitations(schoolId).then(setInvitations);
    } else {
      const errorMessages: Record<string, string> = {
        not_authenticated: 'ログインが必要です',
        not_admin: '管理者権限がありません',
        no_school: '学校が設定されていません',
      };
      setError(errorMessages[result.error || ''] || result.error || '招待の作成に失敗しました');
    }
    setCreating(false);
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = generatedLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const getInviteStatus = (inv: TeacherInvitationRow): { label: string; style: string } => {
    if (inv.used_at) return { label: '使用済み', style: 'bg-green-100 text-green-700' };
    if (new Date(inv.expires_at) < new Date()) return { label: '期限切れ', style: 'bg-gray-100 text-gray-500' };
    return { label: '有効', style: 'bg-sky-100 text-sky-700' };
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm font-bold">招待情報を読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 class="text-sm font-black text-gray-700 mb-3">教師招待</h3>

      {/* Create Invitation */}
      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onInput={(e) => setInviteEmail((e.target as HTMLInputElement).value)}
            class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
            placeholder="招待先メール（任意）"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            class={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              creating
                ? 'bg-gray-300 text-gray-500 cursor-wait'
                : 'bg-sky-500 text-white hover:bg-sky-600'
            }`}
          >
            {creating ? '作成中...' : inviteEmail.trim() ? '招待を作成してメール送信' : '招待リンクを作成'}
          </button>
        </div>
        <p class="mt-1 text-xs text-gray-400">メールアドレスを入力すると招待メールも送信されます</p>

        {error && (
          <div class="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {emailStatus && (
          <div class={`mt-2 px-3 py-2 rounded-lg text-sm ${
            emailStatus.type === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
            {emailStatus.text}
          </div>
        )}

        {generatedLink && (
          <div class="mt-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
            <div class="text-xs font-bold text-sky-700 mb-1">招待リンク（7日間有効）</div>
            <div class="flex items-center gap-2">
              <input
                type="text"
                value={generatedLink}
                readOnly
                class="flex-1 px-2 py-1.5 text-xs bg-white border border-sky-300 rounded text-gray-700 font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                class={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-sky-500 text-white hover:bg-sky-600'
                }`}
              >
                {copied ? 'コピー済み' : 'コピー'}
              </button>
            </div>
            <p class="mt-1 text-xs text-sky-600">このリンクを招待する教師に共有してください</p>
          </div>
        )}
      </div>

      {/* Invitation List */}
      {invitations.length > 0 && (
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-gray-200 text-gray-500">
                <th class="text-left py-2 px-2 font-bold">作成日</th>
                <th class="text-left py-2 px-2 font-bold">メール</th>
                <th class="text-left py-2 px-2 font-bold">有効期限</th>
                <th class="text-center py-2 px-2 font-bold">状態</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const status = getInviteStatus(inv);
                return (
                  <tr key={inv.id} class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="py-2 px-2 text-gray-500">{formatDate(inv.created_at)}</td>
                    <td class="py-2 px-2 text-gray-700">{inv.invite_email || '-'}</td>
                    <td class="py-2 px-2 text-gray-500">{formatDate(inv.expires_at)}</td>
                    <td class="py-2 px-2 text-center">
                      <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${status.style}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p class="mt-2 text-xs text-gray-400">
        招待リンクは7日間有効で、1回のみ使用可能です
      </p>
    </div>
  );
}


// ============================================================
// Student Management (admin only)
// ============================================================

function StudentManagement({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSchoolStudents(schoolId),
      fetchSchoolClasses(schoolId),
    ]).then(([stu, cls]) => {
      setStudents(stu);
      setClasses(cls);
      setLoading(false);
    });
  }, [schoolId]);

  // Client-side filter
  const filtered = students.filter((s) => {
    if (selectedClassId !== 'all' && s.class_id !== selectedClassId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!s.student_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Class student counts
  const classCounts: Record<string, number> = {};
  students.forEach((s) => {
    classCounts[s.class_id] = (classCounts[s.class_id] || 0) + 1;
  });

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm font-bold">生徒情報を読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-black text-gray-700">生徒管理</h3>
        <span class="text-xs text-gray-400 font-bold">全 {students.length} 名</span>
      </div>

      {students.length === 0 ? (
        <div class="text-center py-6 text-gray-400">
          <p class="text-sm">まだ生徒が登録されていません</p>
        </div>
      ) : (
        <>
          {/* Class summary cards */}
          {classes.length > 1 && (
            <div class="flex flex-wrap gap-2 mb-3">
              {classes.map((cls) => (
                <div key={cls.id} class="bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                  <span class="font-bold text-gray-700">{cls.class_name}</span>
                  <span class="text-gray-400 ml-1">{classCounts[cls.id] || 0}名</span>
                </div>
              ))}
            </div>
          )}

          {/* Search + Filter */}
          <div class="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
              placeholder="生徒名で検索..."
            />
            {classes.length > 1 && (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId((e.target as HTMLSelectElement).value)}
                class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
              >
                <option value="all">すべてのクラス</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.class_name} ({classCounts[cls.id] || 0}名)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Filtered count */}
          {(searchQuery.trim() || selectedClassId !== 'all') && (
            <div class="text-xs text-gray-400 mb-2">
              {filtered.length} / {students.length} 名を表示
            </div>
          )}

          {/* Student table */}
          {filtered.length === 0 ? (
            <div class="text-center py-6 text-gray-400">
              <p class="text-sm">条件に一致する生徒はいません</p>
            </div>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="border-b border-gray-200 text-gray-500">
                    <th class="text-left py-2 px-2 font-bold">生徒名</th>
                    <th class="text-left py-2 px-2 font-bold">クラス</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="py-2 px-2 font-bold text-gray-900">{s.student_name}</td>
                      <td class="py-2 px-2 text-gray-500">{s.class_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ============================================================
// Teacher Management (admin only)
// ============================================================

const ROLE_LABELS: Record<string, { text: string; style: string }> = {
  admin: { text: '管理者', style: 'bg-purple-100 text-purple-700' },
  teacher: { text: '教師', style: 'bg-gray-100 text-gray-600' },
};

const ERROR_MESSAGES: Record<string, string> = {
  'error:not_admin': '管理者権限がありません',
  'error:no_school': '学校が設定されていません',
  'error:self_change': '自分自身の権限は変更できません',
  'error:teacher_not_found': '対象の教師が見つかりません',
  'error:different_school': '異なる学校の教師は変更できません',
  'error:invalid_role': '無効な権限です',
  'error:last_admin': '学校に管理者が1人しかいないため降格できません',
  'error:not_authenticated': 'ログインが必要です',
};

function TeacherManagement({ schoolId, currentTeacherId }: { schoolId: string; currentTeacherId: string }) {
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSchoolTeachers(schoolId).then((t) => {
      setTeachers(t);
      setLoading(false);
    });
  }, [schoolId]);

  const handleRoleChange = async (teacherId: string, teacherName: string, newRole: 'teacher' | 'admin') => {
    setError(null);
    setSuccess(null);
    setUpdating(teacherId);
    try {
      const result = await updateTeacherRole(teacherId, newRole);
      if (result.ok) {
        setTeachers((prev) =>
          prev.map((t) => (t.id === teacherId ? { ...t, role: newRole } : t)),
        );
        const roleLabel = newRole === 'admin' ? '管理者' : '教師';
        setSuccess(`${teacherName} を ${roleLabel} に変更しました`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const msg = ERROR_MESSAGES[result.error || ''] || result.error || '更新に失敗しました';
        setError(msg);
      }
    } catch {
      setError('更新中にエラーが発生しました');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm font-bold">教師一覧を読み込み中...</p>
      </div>
    );
  }

  if (teachers.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 class="text-sm font-black text-gray-700 mb-3">教師管理</h3>

      {error && (
        <div class="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div class="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="text-left py-2 px-2 font-bold">教師名</th>
              <th class="text-center py-2 px-2 font-bold">権限</th>
              <th class="text-center py-2 px-2 font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => {
              const isSelf = t.id === currentTeacherId;
              const roleInfo = ROLE_LABELS[t.role] || ROLE_LABELS.teacher;
              const isUpdating = updating === t.id;
              const targetRole = t.role === 'admin' ? 'teacher' : 'admin';
              const actionLabel = t.role === 'admin' ? '教師に降格' : '管理者に昇格';

              return (
                <tr key={t.id} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="py-2 px-2">
                    <div class="font-bold text-gray-900">
                      {t.display_name}
                      {isSelf && <span class="ml-1 text-xs text-gray-400">(自分)</span>}
                    </div>
                    <div class="text-xs text-gray-400">ID: {t.id.slice(0, 8)}...</div>
                  </td>
                  <td class="py-2 px-2 text-center">
                    <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${roleInfo.style}`}>
                      {roleInfo.text}
                    </span>
                  </td>
                  <td class="py-2 px-2 text-center">
                    {isSelf ? (
                      <span class="text-xs text-gray-400">変更不可</span>
                    ) : (
                      <button
                        onClick={() => handleRoleChange(t.id, t.display_name, targetRole)}
                        disabled={isUpdating}
                        class={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                          targetRole === 'admin'
                            ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                        } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isUpdating ? '更新中...' : actionLabel}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p class="mt-2 text-xs text-gray-400">
        管理者は学校全体のダッシュボード・レポート・エクスポートにアクセスできます
      </p>
    </div>
  );
}


// ============================================================
// Role Change Audit Log (admin only)
// ============================================================

function RoleChangeAuditLog({ schoolId }: { schoolId: string }) {
  const [result, setResult] = useState<PaginatedRoleChangeLogs>({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [teacherList, setTeacherList] = useState<SchoolTeacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filterActor, setFilterActor] = useState('');
  const [filterTarget, setFilterTarget] = useState('');
  const [filterRoleChange, setFilterRoleChange] = useState<'' | 'promoted' | 'demoted'>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Load teacher names once
  useEffect(() => {
    fetchSchoolTeachers(schoolId).then((teachers) => {
      setTeacherList(teachers);
      const nameMap: Record<string, string> = {};
      teachers.forEach((t) => { nameMap[t.id] = t.display_name; });
      setTeacherNames(nameMap);
    });
  }, [schoolId]);

  // Load logs when filters or page change
  useEffect(() => {
    setLoading(true);
    const query: RoleChangeLogQuery = {
      schoolId,
      page,
      pageSize,
    };
    if (filterActor) query.actorTeacherId = filterActor;
    if (filterTarget) query.targetTeacherId = filterTarget;
    if (filterRoleChange) query.roleChange = filterRoleChange;

    fetchRoleChangeLogsPaginated(query).then((res) => {
      setResult(res);
      setLoading(false);
    });
  }, [schoolId, page, filterActor, filterTarget, filterRoleChange]);

  // Reset page when filters change
  const applyFilter = (setter: (v: any) => void, value: any) => {
    setter(value);
    setPage(1);
  };

  const resolveTeacherName = (id: string) => teacherNames[id] || `${id.slice(0, 8)}...`;

  const formatLogDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  };

  const totalPages = Math.max(1, Math.ceil(result.totalCount / pageSize));
  const showFrom = result.totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, result.totalCount);

  const selectClass = 'px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-sky-400 focus:border-sky-400';

  return (
    <div>
      <h3 class="text-sm font-black text-gray-700 mb-3">権限変更ログ</h3>

      {/* Filters */}
      <div class="flex flex-wrap gap-2 mb-3">
        <select value={filterActor} onChange={(e) => applyFilter(setFilterActor, (e.target as HTMLSelectElement).value)} class={selectClass}>
          <option value="">変更者: 全員</option>
          {teacherList.map((t) => (
            <option key={t.id} value={t.id}>{t.display_name}</option>
          ))}
        </select>
        <select value={filterTarget} onChange={(e) => applyFilter(setFilterTarget, (e.target as HTMLSelectElement).value)} class={selectClass}>
          <option value="">対象者: 全員</option>
          {teacherList.map((t) => (
            <option key={t.id} value={t.id}>{t.display_name}</option>
          ))}
        </select>
        <select value={filterRoleChange} onChange={(e) => applyFilter(setFilterRoleChange, (e.target as HTMLSelectElement).value as '' | 'promoted' | 'demoted')} class={selectClass}>
          <option value="">種別: すべて</option>
          <option value="promoted">昇格（教師→管理者）</option>
          <option value="demoted">降格（管理者→教師）</option>
        </select>
        {(filterActor || filterTarget || filterRoleChange) && (
          <button
            onClick={() => { setFilterActor(''); setFilterTarget(''); setFilterRoleChange(''); setPage(1); }}
            class="px-2 py-1 text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            リセット
          </button>
        )}
      </div>

      {loading ? (
        <div class="text-center py-8 text-gray-400">
          <p class="text-sm font-bold">監査ログを読み込み中...</p>
        </div>
      ) : result.items.length === 0 ? (
        <div class="text-center py-6 text-gray-400">
          <p class="text-sm">{(filterActor || filterTarget || filterRoleChange) ? '条件に一致するログがありません' : 'まだ権限変更ログはありません'}</p>
        </div>
      ) : (
        <>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-gray-200 text-gray-500">
                  <th class="text-left py-2 px-2 font-bold">日時</th>
                  <th class="text-left py-2 px-2 font-bold">変更者</th>
                  <th class="text-left py-2 px-2 font-bold">対象</th>
                  <th class="text-center py-2 px-2 font-bold">変更前</th>
                  <th class="text-center py-2 px-2 font-bold">変更後</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((log) => {
                  const beforeInfo = ROLE_LABELS[log.before_role] || ROLE_LABELS.teacher;
                  const afterInfo = ROLE_LABELS[log.after_role] || ROLE_LABELS.teacher;
                  return (
                    <tr key={log.id} class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="py-2 px-2 text-gray-500 whitespace-nowrap">{formatLogDate(log.created_at)}</td>
                      <td class="py-2 px-2 font-bold text-gray-900">{resolveTeacherName(log.actor_teacher_id)}</td>
                      <td class="py-2 px-2 font-bold text-gray-900">{resolveTeacherName(log.target_teacher_id)}</td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${beforeInfo.style}`}>
                          {beforeInfo.text}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${afterInfo.style}`}>
                          {afterInfo.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div class="flex items-center justify-between mt-3">
            <p class="text-xs text-gray-400">
              {result.totalCount}件中 {showFrom}-{showTo}件を表示
            </p>
            {totalPages > 1 && (
              <div class="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  class="px-2 py-1 text-xs font-bold text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                <span class="px-2 py-1 text-xs font-bold text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  class="px-2 py-1 text-xs font-bold text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
