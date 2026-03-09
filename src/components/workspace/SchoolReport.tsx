import { useState, useEffect, useMemo } from 'preact/hooks';
import type { SessionLogRow, ClassWithStats, StudentLogSummary } from '../../lib/supabase';
import {
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  fetchSchoolClasses,
  fetchSchoolSessionLogs,
  fetchSchoolStudents,
  type StudentWithClass,
} from '../../lib/supabase';
import {
  buildSchoolReport,
  type SchoolReportData,
  type SchoolSummaryMetrics,
  type SchoolScenarioMetrics,
} from '../../lib/school-report';
import {
  formatMinSec,
  formatPercent,
  formatDate,
  type ClassAggregateMetrics,
} from '../../lib/session-analytics';
import type { Insight } from '../../lib/session-insights';
import {
  filterSessionsByRange,
  dateRangeLabel,
  type DateRange,
  type DateRangeType,
  exportSchoolSummaryCSV,
  exportSchoolClassCSV,
  exportSchoolScenarioCSV,
  exportSchoolReportPDF,
  exportSchoolComparisonSummaryCSV,
  exportSchoolComparisonClassCSV,
  exportSchoolComparisonScenarioCSV,
} from '../../lib/analytics-export';
import { exportSchoolZip, exportSchoolComparisonZip } from '../../lib/zip-export';
import {
  getSchoolComparisonRange,
  getSchoolComparisonLabel,
  compareSchoolReports,
  type SchoolComparison,
  type SchoolSummaryDeltas,
  type SchoolClassDelta,
  formatDeltaDisplay,
  deltaColorClass,
  type DeltaValue,
} from '../../lib/school-comparison';

// ============================================================
// School Report Range Options
// ============================================================

type SchoolReportRangeType = 'all' | 'last30' | 'thisTerm' | 'thisYear';

const RANGE_OPTIONS: { type: SchoolReportRangeType; label: string }[] = [
  { type: 'all', label: '全期間' },
  { type: 'last30', label: '直近30日' },
  { type: 'thisTerm', label: '今学期' },
  { type: 'thisYear', label: '今年度' },
];

function toDateRange(type: SchoolReportRangeType): DateRange {
  return { type: type as DateRangeType };
}

// ============================================================
// Main Component
// ============================================================

interface Props {
  logs: SessionLogRow[];
  classes: ClassWithStats[];
  teacherId: string;
  schoolId?: string | null;
}

export default function SchoolReport({ logs, classes, teacherId, schoolId }: Props) {
  // School-scoped data (fetched independently when schoolId is available)
  const [schoolLogs, setSchoolLogs] = useState<SessionLogRow[] | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<ClassWithStats[] | null>(null);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [studentLogs, setStudentLogs] = useState<StudentLogSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [rangeType, setRangeType] = useState<SchoolReportRangeType>('all');

  // Determine effective data source: school-scoped or teacher-scoped
  const effectiveLogs = schoolLogs ?? logs;
  const effectiveClasses = schoolClasses ?? classes;

  // Fetch school-scoped data when schoolId is available
  useEffect(() => {
    if (!schoolId) {
      // No school_id: fall back to teacher-scoped data (passed via props)
      setSchoolLogs(null);
      setSchoolClasses(null);
      return;
    }
    // Fetch school-scoped classes and logs
    Promise.all([
      fetchSchoolClasses(schoolId),
      fetchSchoolSessionLogs(schoolId),
    ]).then(([cls, lg]) => {
      setSchoolClasses(cls);
      setSchoolLogs(lg);
    });
  }, [schoolId]);

  // Fetch student data (based on effective classes)
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

  // Helper: build school report from logs
  const buildReport = (filteredLogs: SessionLogRow[]) => {
    if (filteredLogs.length === 0) return null;
    return buildSchoolReport(
      filteredLogs,
      effectiveClasses.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
      students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
      studentLogs,
    );
  };

  // Filter logs by selected range, build report + comparison
  const { report, comparison, currentRangeLabel } = useMemo(() => {
    if (!dataLoaded || effectiveLogs.length === 0) return { report: null, comparison: null, currentRangeLabel: '全期間' };

    const range = toDateRange(rangeType);
    const filtered = filterSessionsByRange(effectiveLogs, range);
    const label = dateRangeLabel(range);

    const currentReport = buildReport(filtered);
    if (!currentReport) return { report: null, comparison: null, currentRangeLabel: label };

    // Build comparison if applicable
    let cmp: SchoolComparison | null = null;
    const prevRange = getSchoolComparisonRange(rangeType as DateRangeType);
    if (prevRange) {
      const prevLogs = filterSessionsByRange(effectiveLogs, prevRange);
      const prevReport = buildReport(prevLogs);
      if (prevReport) {
        const prevLabel = getSchoolComparisonLabel(rangeType as DateRangeType);
        cmp = compareSchoolReports(currentReport, prevReport, label, prevLabel);
      }
    }

    return { report: currentReport, comparison: cmp, currentRangeLabel: label };
  }, [dataLoaded, effectiveLogs, effectiveClasses, students, studentLogs, rangeType]);

  if (effectiveLogs.length === 0) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4">🏫</div>
        <p class="font-bold">まだ授業データがありません</p>
        <p class="text-sm mt-1">セッションを実施すると学校レポートが生成されます</p>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">🏫</div>
        <p class="font-bold">学校レポートを生成中...</p>
      </div>
    );
  }

  const hasData = report != null;
  const hasComparison = comparison != null;

  return (
    <div class="space-y-6">
      {/* Header with range selector */}
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h3 class="font-bold text-lg">学校全体レポート</h3>
          {/* Range Filter */}
          <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => setRangeType(opt.type)}
                class={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  rangeType === opt.type
                    ? 'bg-white text-sky-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {hasData && (
          <div class="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportSchoolZip(report, currentRangeLabel, comparison)}
              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 transition-colors"
            >
              学校レポート一式ZIP
            </button>
            <button
              onClick={() => exportSchoolSummaryCSV(report, currentRangeLabel)}
              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              サマリーCSV
            </button>
            <button
              onClick={() => exportSchoolReportPDF(report, currentRangeLabel)}
              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 transition-colors"
            >
              PDF出力
            </button>
            {hasComparison && (
              <button
                onClick={() => exportSchoolComparisonZip(report, comparison)}
                class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                比較ZIP
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty state for filtered range */}
      {!hasData && (
        <div class="text-center py-12 text-gray-400">
          <div class="text-3xl mb-3">📅</div>
          <p class="font-bold">この期間の授業データはありません</p>
          <p class="text-sm mt-1">「{currentRangeLabel}」に該当するセッションがありません</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Summary Cards (with deltas if comparison available) */}
          <SchoolSummaryCards summary={report.summary} deltas={comparison?.deltas ?? null} />

          {/* Comparison Insights */}
          {hasComparison && comparison.insights.length > 0 && (
            <SchoolComparisonInsightsSection
              insights={comparison.insights}
              currentLabel={comparison.currentLabel}
              previousLabel={comparison.previousLabel}
            />
          )}

          {/* School Insights (non-comparison) */}
          {report.insights.length > 0 && <SchoolInsightsSection insights={report.insights} />}

          {/* Class Comparison Table */}
          {hasComparison && comparison.classDeltas.length > 0 && (
            <SchoolClassComparisonTable
              classDeltas={comparison.classDeltas}
              currentLabel={comparison.currentLabel}
              previousLabel={comparison.previousLabel}
              onExportCSV={() => exportSchoolComparisonClassCSV(comparison)}
            />
          )}

          {/* Class Breakdown */}
          {report.classBreakdown.length > 0 && (
            <SchoolClassTable
              classes={report.classBreakdown}
              onExportCSV={() => exportSchoolClassCSV(report, currentRangeLabel)}
            />
          )}

          {/* Scenario Breakdown */}
          {report.scenarioBreakdown.length > 0 && (
            <SchoolScenarioTable
              scenarios={report.scenarioBreakdown}
              onExportCSV={() => exportSchoolScenarioCSV(report, currentRangeLabel)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Summary Cards (with optional deltas)
// ============================================================

function SchoolSummaryCards({ summary, deltas }: { summary: SchoolSummaryMetrics; deltas: SchoolSummaryDeltas | null }) {
  const cards: {
    label: string;
    value: string;
    color: string;
    delta: DeltaValue | null;
    unit: 'pct' | 'time' | 'count' | 'pctPt';
    metric: 'positive' | 'negative' | 'neutral';
  }[] = [
    { label: '総授業回数', value: String(summary.totalSessions), color: 'text-amber-600', delta: deltas?.sessions ?? null, unit: 'count', metric: 'positive' },
    { label: 'クラス数', value: String(summary.totalClasses), color: 'text-blue-600', delta: deltas?.classes ?? null, unit: 'count', metric: 'positive' },
    { label: '参加生徒数', value: String(summary.totalStudents), color: 'text-indigo-600', delta: deltas?.students ?? null, unit: 'count', metric: 'positive' },
    { label: '平均正解率', value: formatPercent(summary.avgAccuracyRate), color: 'text-green-600', delta: deltas?.accuracyRate ?? null, unit: 'pctPt', metric: 'positive' },
    { label: '平均授業時間', value: formatMinSec(summary.avgDuration), color: 'text-amber-600', delta: deltas?.duration ?? null, unit: 'time', metric: 'neutral' },
    { label: '平均議論時間', value: formatMinSec(summary.avgDiscussTime), color: 'text-purple-600', delta: deltas?.discussTime ?? null, unit: 'time', metric: 'neutral' },
    { label: '平均探索時間', value: formatMinSec(summary.avgExploreTime), color: 'text-teal-600', delta: deltas?.exploreTime ?? null, unit: 'time', metric: 'neutral' },
    { label: '平均証拠発見数', value: summary.avgEvidenceCount != null ? String(summary.avgEvidenceCount) : '--', color: 'text-orange-600', delta: deltas?.evidenceCount ?? null, unit: 'count', metric: 'positive' },
    { label: '投票理由記入率', value: formatPercent(summary.avgVoteReasonRate), color: 'text-emerald-600', delta: deltas?.voteReasonRate ?? null, unit: 'pctPt', metric: 'positive' },
    { label: '利用シナリオ数', value: String(summary.uniqueScenarioCount), color: 'text-sky-600', delta: deltas?.scenarioCount ?? null, unit: 'count', metric: 'positive' },
  ];

  return (
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => {
        const display = c.delta ? formatDeltaDisplay(c.delta, c.unit) : null;
        const colorCls = display ? deltaColorClass(display.color, c.metric) : '';
        return (
          <div key={c.label} class="bg-white rounded-xl p-4 text-center border border-gray-200">
            <div class={`text-2xl font-black ${c.color}`}>{c.value}</div>
            {display && display.text !== '--' && (
              <div class={`text-xs font-bold mt-0.5 ${colorCls}`}>{display.text}</div>
            )}
            <div class="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Comparison Insights
// ============================================================

function SchoolComparisonInsightsSection({ insights, currentLabel, previousLabel }: {
  insights: Insight[];
  currentLabel: string;
  previousLabel: string;
}) {
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          {currentLabel} vs {previousLabel}
        </span>
      </div>

      {observations.length > 0 && (
        <section class="bg-white rounded-xl border border-amber-200 p-5">
          <h4 class="font-bold text-sm text-gray-700 mb-3">比較所見</h4>
          <ul class="space-y-1.5">
            {observations.map((ins, i) => (
              <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                <span class="text-amber-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section class="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <h4 class="font-bold text-sm text-amber-800 mb-3">改善の提案</h4>
          <ul class="space-y-1.5">
            {suggestions.map((ins, i) => (
              <li key={i} class="text-sm text-amber-900 flex items-start gap-2">
                <span class="text-amber-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ============================================================
// School Insights (non-comparison, existing)
// ============================================================

function SchoolInsightsSection({ insights }: { insights: Insight[] }) {
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  return (
    <div class="space-y-3">
      {observations.length > 0 && (
        <section class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-bold text-sm text-gray-700 mb-3">学校全体の傾向</h4>
          <ul class="space-y-1.5">
            {observations.map((ins, i) => (
              <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                <span class="text-sky-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section class="bg-sky-50 rounded-xl border border-sky-200 p-5">
          <h4 class="font-bold text-sm text-sky-800 mb-3">改善の提案</h4>
          <ul class="space-y-1.5">
            {suggestions.map((ins, i) => (
              <li key={i} class="text-sm text-sky-900 flex items-start gap-2">
                <span class="text-sky-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Class Comparison Table
// ============================================================

function SchoolClassComparisonTable({ classDeltas, currentLabel, previousLabel, onExportCSV }: {
  classDeltas: SchoolClassDelta[];
  currentLabel: string;
  previousLabel: string;
  onExportCSV: () => void;
}) {
  return (
    <section>
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold text-sm text-gray-700">クラス別比較</h4>
        <button
          onClick={onExportCSV}
          class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
        >
          クラス比較CSV
        </button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-center px-2 py-3 font-bold text-gray-600 text-xs">{currentLabel}<br />回数</th>
                <th class="text-center px-2 py-3 font-bold text-gray-400 text-xs">{previousLabel}<br />回数</th>
                <th class="text-center px-2 py-3 font-bold text-gray-600 text-xs">{currentLabel}<br />正解率</th>
                <th class="text-center px-2 py-3 font-bold text-gray-400 text-xs">{previousLabel}<br />正解率</th>
                <th class="text-center px-2 py-3 font-bold text-gray-700 text-xs">正解率<br />差分</th>
                <th class="text-center px-2 py-3 font-bold text-gray-600 text-xs">{currentLabel}<br />議論</th>
                <th class="text-center px-2 py-3 font-bold text-gray-400 text-xs">{previousLabel}<br />議論</th>
              </tr>
            </thead>
            <tbody>
              {classDeltas.map((cd) => {
                const accColor = cd.accuracyDelta != null
                  ? cd.accuracyDelta > 0.01 ? 'text-green-600 font-bold' : cd.accuracyDelta < -0.01 ? 'text-red-500 font-bold' : 'text-gray-500'
                  : 'text-gray-300';
                const accText = cd.accuracyDelta != null
                  ? `${cd.accuracyDelta > 0 ? '+' : ''}${Math.round(cd.accuracyDelta * 100)}pt`
                  : '--';
                return (
                  <tr key={cd.classId} class="border-b border-gray-100">
                    <td class="px-4 py-3">
                      <div class="font-bold">{cd.className}</div>
                      {cd.gradeLabel && (
                        <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{cd.gradeLabel}</span>
                      )}
                    </td>
                    <td class="text-center px-2 py-3 font-bold text-amber-600">{cd.currentSessions}</td>
                    <td class="text-center px-2 py-3 text-gray-400">{cd.previousSessions}</td>
                    <td class="text-center px-2 py-3">
                      {cd.currentAccuracy != null ? <AccuracyBadge rate={cd.currentAccuracy} /> : <span class="text-gray-300">--</span>}
                    </td>
                    <td class="text-center px-2 py-3 text-gray-400">
                      {cd.previousAccuracy != null ? `${Math.round(cd.previousAccuracy * 100)}%` : '--'}
                    </td>
                    <td class={`text-center px-2 py-3 ${accColor}`}>{accText}</td>
                    <td class="text-center px-2 py-3">{formatMinSec(cd.currentDiscussTime)}</td>
                    <td class="text-center px-2 py-3 text-gray-400">{formatMinSec(cd.previousDiscussTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Class Breakdown Table (existing)
// ============================================================

function SchoolClassTable({ classes, onExportCSV }: { classes: ClassAggregateMetrics[]; onExportCSV: () => void }) {
  return (
    <section>
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold text-sm text-gray-700">クラス別分析</h4>
        <button
          onClick={onExportCSV}
          class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
        >
          クラス分析CSV
        </button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">授業回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">議論</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">探索</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">最終実施日</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.classId} class="border-b border-gray-100">
                  <td class="px-4 py-3">
                    <div class="font-bold">{c.className}</div>
                    {c.gradeLabel && (
                      <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{c.gradeLabel}</span>
                    )}
                  </td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">{c.sessionCount}</td>
                  <td class="text-center px-3 py-3"><AccuracyBadge rate={c.avgAccuracyRate} /></td>
                  <td class="text-center px-3 py-3">{formatMinSec(c.avgDiscussTime)}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(c.avgExploreTime)}</td>
                  <td class="text-center px-3 py-3 text-gray-500">{formatDate(c.lastSessionDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Scenario Breakdown Table
// ============================================================

function SchoolScenarioTable({ scenarios, onExportCSV }: { scenarios: SchoolScenarioMetrics[]; onExportCSV: () => void }) {
  return (
    <section>
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold text-sm text-gray-700">シナリオ別分析</h4>
        <button
          onClick={onExportCSV}
          class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
        >
          シナリオ分析CSV
        </button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">シナリオ</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">実施回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">実施クラス</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">平均時間</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">議論</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">証拠発見</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.slug} class="border-b border-gray-100">
                  <td class="px-4 py-3 font-bold truncate max-w-[200px]" title={s.title}>{s.title}</td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">{s.sessionCount}</td>
                  <td class="text-center px-3 py-3">
                    <span class="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-600">
                      {s.classCount}
                    </span>
                  </td>
                  <td class="text-center px-3 py-3"><AccuracyBadge rate={s.avgAccuracyRate} /></td>
                  <td class="text-center px-3 py-3">{formatMinSec(s.avgDuration)}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(s.avgDiscussTime)}</td>
                  <td class="text-center px-3 py-3">{s.avgEvidenceCount != null ? String(s.avgEvidenceCount) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Shared: Accuracy Badge
// ============================================================

function AccuracyBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span class="text-gray-300">--</span>;
  const pct = Math.round(rate * 100);
  const color =
    pct >= 70 ? 'text-green-600 bg-green-50' :
    pct >= 40 ? 'text-amber-600 bg-amber-50' :
    'text-red-500 bg-red-50';
  return (
    <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {pct}%
    </span>
  );
}
