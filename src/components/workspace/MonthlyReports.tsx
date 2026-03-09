import { useState, useEffect, useMemo } from 'preact/hooks';
import type { SessionLogRow, ClassWithStats, StudentLogSummary } from '../../lib/supabase';
import {
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  saveMonthlyReport,
  type StudentWithClass,
} from '../../lib/supabase';
import {
  buildMonthlyReport,
  buildMonthlyReportListItems,
  getAvailableMonths,
  monthLabel,
  reportToJSON,
  type MonthlyReportData,
  type MonthlyReportListItem,
} from '../../lib/monthly-report';
import {
  formatMinSec,
  formatPercent,
  formatDate,
  type ClassAggregateMetrics,
  type ScenarioAggregateMetrics,
  type StudentAggregateMetrics,
} from '../../lib/session-analytics';
import {
  exportMonthlyReportPDF,
  exportMonthlySummaryCSV,
  exportMonthlyClassCSV,
  exportMonthlyScenarioCSV,
  exportMonthlyStudentCSV,
  exportMonthlyComparisonSummaryCSV,
  exportMonthlyComparisonClassCSV,
  exportMonthlyComparisonScenarioCSV,
} from '../../lib/analytics-export';
import { exportMonthlyZip } from '../../lib/zip-export';
import {
  compareMonthlyReports,
  getPreviousMonth,
  formatDeltaDisplay,
  deltaColorClass,
  type MonthlyComparison,
  type DeltaValue,
} from '../../lib/monthly-comparison';

interface Props {
  logs: SessionLogRow[];
  classes: ClassWithStats[];
  teacherId: string;
}

export default function MonthlyReports({ logs, classes, teacherId }: Props) {
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [studentLogs, setStudentLogs] = useState<StudentLogSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [currentReport, setCurrentReport] = useState<MonthlyReportData | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch student data
  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) {
      setDataLoaded(true);
      return;
    }
    fetchAllStudentsForTeacher(classIds).then((allStudents) => {
      setStudents(allStudents);
      const ids = allStudents.map((s) => s.id);
      if (ids.length === 0) {
        setDataLoaded(true);
        return;
      }
      fetchStudentLogSummaries(ids).then((sl) => {
        setStudentLogs(sl);
        setDataLoaded(true);
      });
    });
  }, [classes]);

  // Build list items
  const listItems = useMemo(() => buildMonthlyReportListItems(logs), [logs]);

  // Generate report when a month is selected
  const generateReport = (year: number, month: number) => {
    const report = buildMonthlyReport(
      logs,
      classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
      students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
      studentLogs,
      year,
      month,
    );
    setCurrentReport(report);
    setSelectedMonth({ year, month });
  };

  const handleSave = async () => {
    if (!currentReport) return;
    setSaving(true);
    const json = reportToJSON(currentReport);
    await saveMonthlyReport(
      teacherId,
      currentReport.year,
      currentReport.month,
      json.summary as unknown as Record<string, unknown>,
      {
        classBreakdown: json.classBreakdown,
        scenarioBreakdown: json.scenarioBreakdown,
        studentBreakdown: json.studentBreakdown,
        classInsightsEntries: json.classInsightsEntries,
        insights: json.insights,
        improvements: json.improvements,
      },
    );
    setSaving(false);
  };

  // Compute comparison when detail is shown
  const comparison = useMemo(() => {
    if (!currentReport || !selectedMonth || !dataLoaded) return null;

    // Find previous month
    const prev = getPreviousMonth(selectedMonth.year, selectedMonth.month);
    const availableMonths = getAvailableMonths(logs);
    const hasPrevMonth = availableMonths.some((m) => m.year === prev.year && m.month === prev.month);
    if (!hasPrevMonth) return null;

    const prevReport = buildMonthlyReport(
      logs,
      classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
      students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
      studentLogs,
      prev.year,
      prev.month,
    );

    return compareMonthlyReports(currentReport, prevReport);
  }, [currentReport, selectedMonth, dataLoaded, logs, classes, students, studentLogs]);

  // Detail view
  if (selectedMonth && currentReport) {
    return (
      <MonthlyReportDetail
        report={currentReport}
        comparison={comparison}
        onBack={() => {
          setSelectedMonth(null);
          setCurrentReport(null);
        }}
        onExportPDF={() => exportMonthlyReportPDF(currentReport, comparison)}
        onRegenerate={() => generateReport(selectedMonth.year, selectedMonth.month)}
        onSave={handleSave}
        saving={saving}
      />
    );
  }

  // List view
  if (logs.length === 0) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4">📅</div>
        <p class="font-bold">まだ授業データがありません</p>
        <p class="text-sm mt-1">セッションを実施すると月次レポートが生成されます</p>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-lg">月次レポート一覧</h3>
        <span class="text-xs text-gray-400">
          {dataLoaded ? `${listItems.length}ヶ月分` : '読み込み中...'}
        </span>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">対象月</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">授業回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">平均正解率</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">主要所見</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {listItems.map((item) => (
                <tr key={`${item.year}-${item.month}`} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 font-bold">{monthLabel(item.year, item.month)}</td>
                  <td class="text-center px-3 py-3">
                    <span class="inline-block px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700">
                      {item.sessionCount}回
                    </span>
                  </td>
                  <td class="text-center px-3 py-3">
                    <AccuracyBadge rate={item.avgAccuracyRate} />
                  </td>
                  <td class="px-3 py-3 text-xs text-gray-500 truncate max-w-[200px]" title={item.topInsight || ''}>
                    {item.topInsight || '--'}
                  </td>
                  <td class="text-center px-3 py-3">
                    <div class="flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          if (dataLoaded) {
                            generateReport(item.year, item.month);
                          }
                        }}
                        disabled={!dataLoaded}
                        class={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          dataLoaded
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                            : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                        }`}
                      >
                        詳細
                      </button>
                      <button
                        onClick={() => {
                          if (dataLoaded) {
                            const report = buildMonthlyReport(
                              logs,
                              classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
                              students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
                              studentLogs,
                              item.year,
                              item.month,
                            );
                            exportMonthlyReportPDF(report);
                          }
                        }}
                        disabled={!dataLoaded}
                        class={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          dataLoaded
                            ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
                            : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                        }`}
                      >
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Monthly Report Detail View
// ============================================================

function MonthlyReportDetail({
  report,
  comparison,
  onBack,
  onExportPDF,
  onRegenerate,
  onSave,
  saving,
}: {
  report: MonthlyReportData;
  comparison: MonthlyComparison | null;
  onBack: () => void;
  onExportPDF: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { summary, classBreakdown, scenarioBreakdown, studentBreakdown, classInsights, insights, improvements } = report;
  const title = monthLabel(report.year, report.month);

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            onClick={onBack}
            class="px-3 py-1.5 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors"
          >
            戻る
          </button>
          <h3 class="font-bold text-lg">{title} 月次レポート</h3>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 transition-colors"
          >
            再生成
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={() => exportMonthlyZip(report, comparison)}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 transition-colors"
          >
            レポート一式ZIP
          </button>
          <button
            onClick={() => exportMonthlySummaryCSV(report)}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            サマリーCSV
          </button>
          <button
            onClick={onExportPDF}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors"
          >
            PDF出力
          </button>
        </div>
      </div>

      {/* Summary Cards with delta indicators */}
      <SummaryCardsWithDelta summary={summary} comparison={comparison} />

      {/* Comparison Section */}
      {comparison && <ComparisonSection comparison={comparison} />}

      {/* No comparison notice */}
      {!comparison && (
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-400">
          前月比較データがありません（前月の授業記録が必要です）
        </div>
      )}

      {/* Monthly Insights */}
      {insights.length > 0 && (
        <section class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-bold text-sm text-gray-700 mb-3">月次所見</h4>
          <ul class="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <section class="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <h4 class="font-bold text-sm text-amber-800 mb-3">次月への改善提案</h4>
          <ul class="space-y-1.5">
            {improvements.map((ins, i) => (
              <li key={i} class="text-sm text-amber-900 flex items-start gap-2">
                <span class="text-amber-500 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Class Breakdown */}
      {classBreakdown.length > 0 && (
        <section>
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-sm text-gray-700">クラス別要約</h4>
            <button
              onClick={() => exportMonthlyClassCSV(report)}
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
                    <th class="text-center px-3 py-3 font-bold text-gray-700">実施数</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">議論</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">探索</th>
                  </tr>
                </thead>
                <tbody>
                  {classBreakdown.map((m) => (
                    <tr key={m.classId} class="border-b border-gray-100">
                      <td class="px-4 py-3">
                        <div class="font-bold">{m.className}</div>
                        {m.gradeLabel && (
                          <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{m.gradeLabel}</span>
                        )}
                      </td>
                      <td class="text-center px-3 py-3 font-bold text-amber-600">{m.sessionCount}</td>
                      <td class="text-center px-3 py-3"><AccuracyBadge rate={m.avgAccuracyRate} /></td>
                      <td class="text-center px-3 py-3">{formatMinSec(m.avgDiscussTime)}</td>
                      <td class="text-center px-3 py-3">{formatMinSec(m.avgExploreTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Class Insights */}
          {classBreakdown.map((cm) => {
            const ci = classInsights.get(cm.classId);
            if (!ci) return null;
            const allIns = [...ci.observations, ...ci.suggestions, ...ci.recommendations];
            if (allIns.length === 0) return null;
            return (
              <div key={cm.classId} class="mt-2 bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs font-bold text-gray-600 mb-2">{cm.className} のインサイト</div>
                <ul class="space-y-1">
                  {allIns.map((ins, i) => (
                    <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                      <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                      {ins.text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {/* Scenario Breakdown */}
      {scenarioBreakdown.length > 0 && (
        <section>
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-sm text-gray-700">シナリオ別要約</h4>
            <button
              onClick={() => exportMonthlyScenarioCSV(report)}
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
                    <th class="text-center px-3 py-3 font-bold text-gray-700">実施数</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">平均時間</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">理由記入率</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioBreakdown.map((m) => (
                    <tr key={m.slug} class="border-b border-gray-100">
                      <td class="px-4 py-3 font-bold truncate max-w-[200px]" title={m.title}>{m.title}</td>
                      <td class="text-center px-3 py-3 font-bold text-amber-600">{m.sessionCount}</td>
                      <td class="text-center px-3 py-3">{formatMinSec(m.avgDuration)}</td>
                      <td class="text-center px-3 py-3"><AccuracyBadge rate={m.avgAccuracyRate} /></td>
                      <td class="text-center px-3 py-3">{formatPercent(m.avgVoteReasonRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Student Breakdown */}
      {studentBreakdown.length > 0 && (
        <StudentBreakdownSection metrics={studentBreakdown} onExportCSV={() => exportMonthlyStudentCSV(report)} />
      )}

      {/* Generated timestamp */}
      <div class="text-center text-xs text-gray-400 pt-2">
        生成日時: {new Date(report.generatedAt).toLocaleString('ja-JP')}
      </div>
    </div>
  );
}

// ============================================================
// Summary Cards with Delta Indicators
// ============================================================

function SummaryCardsWithDelta({
  summary,
  comparison,
}: {
  summary: import('../../lib/session-analytics').SummaryMetrics;
  comparison: MonthlyComparison | null;
}) {
  const d = comparison?.deltas;

  const cards: {
    label: string;
    value: string;
    color: string;
    delta?: DeltaValue;
    unit?: 'pct' | 'time' | 'count' | 'pctPt';
    metric?: 'positive' | 'negative' | 'neutral';
  }[] = [
    {
      label: '授業回数', value: String(summary.totalSessions), color: 'text-amber-600',
      delta: d?.sessions, unit: 'count', metric: 'positive',
    },
    {
      label: 'クラス数', value: String(summary.totalClasses), color: 'text-blue-600',
      delta: d?.classes, unit: 'count', metric: 'positive',
    },
    {
      label: '参加生徒数', value: String(summary.totalStudents), color: 'text-indigo-600',
      delta: d?.students, unit: 'count', metric: 'positive',
    },
    {
      label: '平均正解率', value: formatPercent(summary.avgAccuracyRate), color: 'text-green-600',
      delta: d?.accuracyRate, unit: 'pctPt', metric: 'positive',
    },
    {
      label: '平均授業時間', value: formatMinSec(summary.avgDuration), color: 'text-amber-600',
      delta: d?.duration, unit: 'time', metric: 'neutral',
    },
    {
      label: '平均議論時間', value: formatMinSec(summary.avgDiscussTime), color: 'text-purple-600',
      delta: d?.discussTime, unit: 'time', metric: 'neutral',
    },
  ];

  return (
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} class="bg-white rounded-xl p-4 text-center border border-gray-200">
          <div class={`text-2xl font-black ${c.color}`}>{c.value}</div>
          <div class="text-xs text-gray-500 mt-1">{c.label}</div>
          {c.delta && c.unit && c.metric && (
            <DeltaBadge delta={c.delta} unit={c.unit} metric={c.metric} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Delta Badge (small indicator under a card)
// ============================================================

function DeltaBadge({
  delta,
  unit,
  metric,
}: {
  delta: DeltaValue;
  unit: 'pct' | 'time' | 'count' | 'pctPt';
  metric: 'positive' | 'negative' | 'neutral';
}) {
  const { text, color } = formatDeltaDisplay(delta, unit);
  if (text === '--') return null;

  const colorClass = deltaColorClass(color, metric);

  return (
    <div class={`text-xs font-bold mt-1 ${colorClass}`}>
      {text}
    </div>
  );
}

// ============================================================
// Comparison Section
// ============================================================

function ComparisonSection({ comparison }: { comparison: MonthlyComparison }) {
  const { deltas, classDeltas, scenarioDeltas, insights, previousLabel } = comparison;

  return (
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-sm text-gray-700">
          前月比較
          <span class="text-xs text-gray-400 font-normal ml-2">vs {previousLabel}</span>
        </h4>
        <div class="flex items-center gap-2">
          <button
            onClick={() => exportMonthlyComparisonSummaryCSV(comparison)}
            class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            全体比較CSV
          </button>
          {classDeltas.length > 0 && (
            <button
              onClick={() => exportMonthlyComparisonClassCSV(comparison)}
              class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              クラス比較CSV
            </button>
          )}
          {scenarioDeltas.length > 0 && (
            <button
              onClick={() => exportMonthlyComparisonScenarioCSV(comparison)}
              class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              シナリオ比較CSV
            </button>
          )}
        </div>
      </div>

      {/* Delta Detail Cards */}
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="grid grid-cols-3 md:grid-cols-3 gap-4">
          <DeltaDetailCard
            label="探索時間" delta={deltas.exploreTime} unit="time" metric="neutral"
          />
          <DeltaDetailCard
            label="理由記入率" delta={deltas.voteReasonRate} unit="pctPt" metric="positive"
          />
          <DeltaDetailCard
            label="証拠発見数" delta={deltas.evidenceCount} unit="count" metric="positive"
          />
        </div>
      </div>

      {/* Comparison Insights */}
      {insights.length > 0 && (
        <div class="bg-blue-50 rounded-xl border border-blue-200 p-5">
          <h4 class="font-bold text-sm text-blue-800 mb-3">月間比較インサイト</h4>
          <ul class="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} class="text-sm text-blue-900 flex items-start gap-2">
                <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Class-level Comparison Table */}
      {classDeltas.length > 0 && (
        <div>
          <h4 class="font-bold text-xs text-gray-600 mb-2">クラス別前月比較</h4>
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-4 py-2.5 font-bold text-gray-700">クラス</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">今月</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">前月</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">正解率差分</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">議論差分</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">探索差分</th>
                  </tr>
                </thead>
                <tbody>
                  {classDeltas.map((cd) => (
                    <tr key={cd.classId} class="border-b border-gray-100">
                      <td class="px-4 py-2.5">
                        <div class="font-bold text-sm">{cd.className}</div>
                        {cd.gradeLabel && (
                          <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{cd.gradeLabel}</span>
                        )}
                      </td>
                      <td class="text-center px-3 py-2.5 text-xs text-gray-500">{cd.currentSessions}回</td>
                      <td class="text-center px-3 py-2.5 text-xs text-gray-500">{cd.previousSessions}回</td>
                      <td class="text-center px-3 py-2.5">
                        <InlineDelta value={cd.accuracyDelta} unit="pctPt" metric="positive" />
                      </td>
                      <td class="text-center px-3 py-2.5">
                        <InlineDelta value={cd.discussDelta} unit="time" metric="neutral" />
                      </td>
                      <td class="text-center px-3 py-2.5">
                        <InlineDelta value={cd.exploreDelta} unit="time" metric="neutral" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
// Delta Detail Card
// ============================================================

function DeltaDetailCard({
  label,
  delta,
  unit,
  metric,
}: {
  label: string;
  delta: DeltaValue;
  unit: 'pct' | 'time' | 'count' | 'pctPt';
  metric: 'positive' | 'negative' | 'neutral';
}) {
  const { text, color } = formatDeltaDisplay(delta, unit);
  const colorClass = deltaColorClass(color, metric);

  // Format current value for display
  let currentDisplay: string;
  if (delta.current == null) {
    currentDisplay = '--';
  } else if (unit === 'pct' || unit === 'pctPt') {
    currentDisplay = `${Math.round(delta.current * 100)}%`;
  } else if (unit === 'time') {
    const m = Math.floor(delta.current / 60);
    const s = Math.round(delta.current % 60);
    currentDisplay = `${m}:${String(s).padStart(2, '0')}`;
  } else {
    currentDisplay = String(Math.round(delta.current * 10) / 10);
  }

  return (
    <div class="text-center">
      <div class="text-lg font-black text-gray-700">{currentDisplay}</div>
      <div class="text-xs text-gray-500">{label}</div>
      <div class={`text-xs font-bold mt-0.5 ${colorClass}`}>{text}</div>
    </div>
  );
}

// ============================================================
// Inline Delta (for table cells)
// ============================================================

function InlineDelta({
  value,
  unit,
  metric,
}: {
  value: number | null;
  unit: 'pct' | 'time' | 'count' | 'pctPt';
  metric: 'positive' | 'negative' | 'neutral';
}) {
  if (value == null) return <span class="text-gray-300 text-xs">--</span>;

  const dv: DeltaValue = { current: 0, previous: 0, delta: value };
  const { text, color } = formatDeltaDisplay(dv, unit);
  const colorClass = deltaColorClass(color, metric);

  return <span class={`text-xs font-bold ${colorClass}`}>{text}</span>;
}

// ============================================================
// Student Breakdown (with show more)
// ============================================================

function StudentBreakdownSection({ metrics, onExportCSV }: { metrics: StudentAggregateMetrics[]; onExportCSV?: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(
    () => [...metrics].sort((a, b) => b.participationCount - a.participationCount),
    [metrics],
  );
  const displayed = showAll ? sorted : sorted.slice(0, 20);

  return (
    <section>
      <div class="flex items-center justify-between mb-3">
        <div>
          <h4 class="font-bold text-sm text-gray-700">生徒参加要約</h4>
          <p class="text-xs text-gray-400 mt-0.5">参加ログの記録です。成績評価ではありません。</p>
        </div>
        {onExportCSV && (
          <button
            onClick={onExportCSV}
            class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            生徒参加CSV
          </button>
        )}
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">生徒名</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">参加回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((m) => (
                <tr key={m.studentId} class="border-b border-gray-100">
                  <td class="px-4 py-3 font-bold">{m.studentName}</td>
                  <td class="px-3 py-3 text-gray-500">{m.className}</td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">{m.participationCount}</td>
                  <td class="text-center px-3 py-3">{m.participationCount > 0 ? m.correctCount : '--'}</td>
                  <td class="text-center px-3 py-3"><AccuracyBadge rate={m.accuracyRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 20 && (
          <div class="text-center py-3 border-t border-gray-100">
            <button
              onClick={() => setShowAll(!showAll)}
              class="text-sm text-amber-600 font-bold hover:text-amber-700"
            >
              {showAll ? '折りたたむ' : `他 ${sorted.length - 20} 人を表示`}
            </button>
          </div>
        )}
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
