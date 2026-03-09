import { useState, useEffect, useMemo } from 'preact/hooks';
import type { SessionLogRow, ClassWithStats, StudentLogSummary } from '../../lib/supabase';
import {
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  type StudentWithClass,
} from '../../lib/supabase';
import {
  buildTermReport,
  buildTermReportListItems,
  termLabel,
  type TermNumber,
  type TermReportData,
  type TermReportListItem,
  type MonthlySubMetrics,
} from '../../lib/term-report';
import {
  formatMinSec,
  formatPercent,
  type ClassAggregateMetrics,
  type StudentAggregateMetrics,
} from '../../lib/session-analytics';
import {
  exportTermReportPDF,
  exportTermSummaryCSV,
  exportTermClassCSV,
  exportTermScenarioCSV,
  exportTermStudentCSV,
  exportTermComparisonSummaryCSV,
  exportTermComparisonClassCSV,
  exportTermComparisonScenarioCSV,
} from '../../lib/analytics-export';
import { exportTermZip } from '../../lib/zip-export';
import { monthLabel } from '../../lib/monthly-report';
import {
  compareTermReports,
  getPreviousTerm,
  formatDeltaDisplay,
  deltaColorClass,
  type TermComparison,
  type TermSummaryDeltas,
  type DeltaValue,
} from '../../lib/term-comparison';
import { getAvailableTerms } from '../../lib/term-report';

interface Props {
  logs: SessionLogRow[];
  classes: ClassWithStats[];
  teacherId: string;
}

export default function TermReports({ logs, classes, teacherId }: Props) {
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [studentLogs, setStudentLogs] = useState<StudentLogSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<{ schoolYear: number; term: TermNumber } | null>(null);
  const [currentReport, setCurrentReport] = useState<TermReportData | null>(null);

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
  const listItems = useMemo(() => buildTermReportListItems(logs), [logs]);

  // Generate report when a term is selected
  const generateReport = (schoolYear: number, term: TermNumber) => {
    const report = buildTermReport(
      logs,
      classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
      students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
      studentLogs,
      schoolYear,
      term,
    );
    setCurrentReport(report);
    setSelectedTerm({ schoolYear, term });
  };

  // Compute comparison when detail is shown
  const comparison = useMemo(() => {
    if (!currentReport || !selectedTerm || !dataLoaded) return null;

    const prev = getPreviousTerm(selectedTerm.schoolYear, selectedTerm.term);
    const availableTerms = getAvailableTerms(logs);
    const hasPrevTerm = availableTerms.some(
      (t) => t.schoolYear === prev.schoolYear && t.term === prev.term,
    );
    if (!hasPrevTerm) return null;

    const prevReport = buildTermReport(
      logs,
      classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
      students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
      studentLogs,
      prev.schoolYear,
      prev.term,
    );

    return compareTermReports(currentReport, prevReport);
  }, [currentReport, selectedTerm, dataLoaded, logs, classes, students, studentLogs]);

  // Detail view
  if (selectedTerm && currentReport) {
    return (
      <TermReportDetail
        report={currentReport}
        comparison={comparison}
        onBack={() => {
          setSelectedTerm(null);
          setCurrentReport(null);
        }}
        onExportPDF={() => exportTermReportPDF(currentReport, comparison)}
        onRegenerate={() => generateReport(selectedTerm.schoolYear, selectedTerm.term)}
      />
    );
  }

  // Empty state
  if (logs.length === 0) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4">📚</div>
        <p class="font-bold">まだ授業データがありません</p>
        <p class="text-sm mt-1">セッションを実施すると学期レポートが生成されます</p>
      </div>
    );
  }

  // List view
  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-lg">学期レポート一覧</h3>
        <span class="text-xs text-gray-400">
          {dataLoaded ? `${listItems.length}学期分` : '読み込み中...'}
        </span>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">学期</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">授業回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">平均正解率</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">主要所見</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {listItems.map((item) => (
                <tr key={`${item.schoolYear}-${item.term}`} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 font-bold">{termLabel(item.schoolYear, item.term)}</td>
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
                          if (dataLoaded) generateReport(item.schoolYear, item.term);
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
                            const report = buildTermReport(
                              logs,
                              classes.map((c) => ({ id: c.id, class_name: c.class_name, grade_label: c.grade_label })),
                              students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
                              studentLogs,
                              item.schoolYear,
                              item.term,
                            );
                            exportTermReportPDF(report);
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
// Term Report Detail View
// ============================================================

function TermReportDetail({
  report,
  comparison,
  onBack,
  onExportPDF,
  onRegenerate,
}: {
  report: TermReportData;
  comparison: TermComparison | null;
  onBack: () => void;
  onExportPDF: () => void;
  onRegenerate: () => void;
}) {
  const { summary, monthlyBreakdown, classBreakdown, scenarioBreakdown, studentBreakdown, classInsights, insights, improvements } = report;
  const title = termLabel(report.schoolYear, report.term);

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
          <h3 class="font-bold text-lg">{title} 学期レポート</h3>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 transition-colors"
          >
            再生成
          </button>
          <button
            onClick={() => exportTermZip(report, comparison)}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 transition-colors"
          >
            レポート一式ZIP
          </button>
          <button
            onClick={() => exportTermSummaryCSV(report)}
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
      <TermSummaryCardsWithDelta summary={summary} comparison={comparison} />

      {/* Comparison Section */}
      {comparison && <TermComparisonSection comparison={comparison} />}

      {/* No comparison notice */}
      {!comparison && (
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-400">
          前学期比較データがありません（前学期の授業記録が必要です）
        </div>
      )}

      {/* Monthly Breakdown within Term */}
      {monthlyBreakdown.length > 0 && (
        <section>
          <h4 class="font-bold text-sm text-gray-700 mb-3">月別推移</h4>
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-4 py-3 font-bold text-gray-700">月</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">授業回数</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">議論時間</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-700">授業時間</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyBreakdown.map((m) => (
                    <tr key={`${m.year}-${m.month}`} class="border-b border-gray-100">
                      <td class="px-4 py-3 font-bold">{monthLabel(m.year, m.month)}</td>
                      <td class="text-center px-3 py-3 font-bold text-amber-600">{m.sessionCount}</td>
                      <td class="text-center px-3 py-3"><AccuracyBadge rate={m.avgAccuracyRate} /></td>
                      <td class="text-center px-3 py-3">{formatMinSec(m.avgDiscussTime)}</td>
                      <td class="text-center px-3 py-3">{formatMinSec(m.avgDuration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Term Insights */}
      {insights.length > 0 && (
        <section class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-bold text-sm text-gray-700 mb-3">学期所見</h4>
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
          <h4 class="font-bold text-sm text-amber-800 mb-3">次学期への改善提案</h4>
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
              onClick={() => exportTermClassCSV(report)}
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
              onClick={() => exportTermScenarioCSV(report)}
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
        <StudentBreakdownSection metrics={studentBreakdown} onExportCSV={() => exportTermStudentCSV(report)} />
      )}

      {/* Generated timestamp */}
      <div class="text-center text-xs text-gray-400 pt-2">
        生成日時: {new Date(report.generatedAt).toLocaleString('ja-JP')}
      </div>
    </div>
  );
}

// ============================================================
// Term Summary Cards with Delta Indicators
// ============================================================

function TermSummaryCardsWithDelta({
  summary,
  comparison,
}: {
  summary: import('../../lib/session-analytics').SummaryMetrics;
  comparison: TermComparison | null;
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
            <TermDeltaBadge delta={c.delta} unit={c.unit} metric={c.metric} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Term Delta Badge (small indicator under a card)
// ============================================================

function TermDeltaBadge({
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
// Term Comparison Section
// ============================================================

function TermComparisonSection({ comparison }: { comparison: TermComparison }) {
  const { deltas, classDeltas, scenarioDeltas, insights, previousLabel } = comparison;

  return (
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-sm text-gray-700">
          前学期比較
          <span class="text-xs text-gray-400 font-normal ml-2">vs {previousLabel}</span>
        </h4>
        <div class="flex items-center gap-2">
          <button
            onClick={() => exportTermComparisonSummaryCSV(comparison)}
            class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            比較サマリーCSV
          </button>
          {classDeltas.length > 0 && (
            <button
              onClick={() => exportTermComparisonClassCSV(comparison)}
              class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              クラス比較CSV
            </button>
          )}
          {scenarioDeltas.length > 0 && (
            <button
              onClick={() => exportTermComparisonScenarioCSV(comparison)}
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
          <TermDeltaDetailCard
            label="探索時間" delta={deltas.exploreTime} unit="time" metric="neutral"
          />
          <TermDeltaDetailCard
            label="理由記入率" delta={deltas.voteReasonRate} unit="pctPt" metric="positive"
          />
          <TermDeltaDetailCard
            label="証拠発見数" delta={deltas.evidenceCount} unit="count" metric="positive"
          />
        </div>
      </div>

      {/* Comparison Insights */}
      {insights.length > 0 && (
        <div class="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
          <h4 class="font-bold text-sm text-indigo-800 mb-3">学期間比較インサイト</h4>
          <ul class="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} class="text-sm text-indigo-900 flex items-start gap-2">
                <span class="text-indigo-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Class-level Comparison Table */}
      {classDeltas.length > 0 && (
        <div>
          <h4 class="font-bold text-xs text-gray-600 mb-2">クラス別前学期比較</h4>
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-4 py-2.5 font-bold text-gray-700">クラス</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">今学期</th>
                    <th class="text-center px-3 py-2.5 font-bold text-gray-700">前学期</th>
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
                        <TermInlineDelta value={cd.accuracyDelta} unit="pctPt" metric="positive" />
                      </td>
                      <td class="text-center px-3 py-2.5">
                        <TermInlineDelta value={cd.discussDelta} unit="time" metric="neutral" />
                      </td>
                      <td class="text-center px-3 py-2.5">
                        <TermInlineDelta value={cd.exploreDelta} unit="time" metric="neutral" />
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
// Term Delta Detail Card
// ============================================================

function TermDeltaDetailCard({
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
// Term Inline Delta (for table cells)
// ============================================================

function TermInlineDelta({
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
