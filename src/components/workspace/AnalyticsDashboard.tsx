import { useState, useEffect, useMemo } from 'preact/hooks';
import type { SessionLogRow, ClassWithStats, SoloSessionRow, SessionFeedbackRow } from '../../lib/supabase';
import {
  fetchAllStudentsForTeacher,
  fetchStudentLogSummaries,
  fetchSoloSessionsForStudents,
  fetchAllTeacherFeedback,
  type StudentWithClass,
  type StudentLogSummary,
} from '../../lib/supabase';
import { computeGoNoGo, type GoNoGoResult } from '../../lib/classroom-summary';
import CompetencyDashboard from './CompetencyDashboard';
import ClassTendencyChart from './ClassTendencyChart';
import {
  computeSummaryMetrics,
  computeSessionMetrics,
  aggregateClassMetrics,
  aggregateScenarioMetrics,
  aggregateStudentMetrics,
  formatMinSec,
  formatPercent,
  formatDate,
  type ClassAggregateMetrics,
  type ScenarioAggregateMetrics,
  type StudentAggregateMetrics,
} from '../../lib/session-analytics';
import {
  computeSessionInsights,
  computeClassInsights,
  type SessionInsights,
  type ClassInsights,
  type Insight,
} from '../../lib/session-insights';
import {
  computeClassTrends,
  computeScenarioTrends,
  computeStudentTrends,
  type ClassTrend,
  type ScenarioTrend,
  type StudentTrend,
  type TrendPoint,
} from '../../lib/session-trends';
import {
  filterSessionsByRange,
  filterStudentLogsByRange,
  dateRangeLabel,
  exportClassTrendCSV,
  exportScenarioTrendCSV,
  exportStudentCSV,
  exportAnalyticsPDF,
  type DateRange,
  type DateRangeType,
} from '../../lib/analytics-export';

interface Props {
  logs: SessionLogRow[];
  classes: ClassWithStats[];
  teacherId: string;
}

export default function AnalyticsDashboard({ logs, classes, teacherId }: Props) {
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [studentLogs, setStudentLogs] = useState<StudentLogSummary[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [soloSessions, setSoloSessions] = useState<SoloSessionRow[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<SessionFeedbackRow[]>([]);
  const [goNoGoReady, setGoNoGoReady] = useState(false);

  // Date range filter state
  const [dateRange, setDateRange] = useState<DateRange>({ type: 'all' });

  // Fetch student data for analytics
  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) {
      setStudentLoading(false);
      return;
    }
    const feedbackPromise = fetchAllTeacherFeedback().then((rows) => {
      setFeedbackRows(rows);
    });

    fetchAllStudentsForTeacher(classIds).then((allStudents) => {
      setStudents(allStudents);
      const ids = allStudents.map((s) => s.id);
      if (ids.length === 0) {
        setStudentLoading(false);
        setGoNoGoReady(true);
        return;
      }
      const logsPromise = fetchStudentLogSummaries(ids).then((sl) => {
        setStudentLogs(sl);
        setStudentLoading(false);
      });
      const soloPromise = fetchSoloSessionsForStudents(ids).then(setSoloSessions);

      Promise.all([logsPromise, soloPromise, feedbackPromise]).then(() => {
        setGoNoGoReady(true);
      });
    });
  }, [classes]);

  // Apply date range filter
  const filteredLogs = useMemo(
    () => filterSessionsByRange(logs, dateRange),
    [logs, dateRange],
  );

  const filteredStudentLogs = useMemo(
    () => filterStudentLogsByRange(studentLogs, dateRange),
    [studentLogs, dateRange],
  );

  // Phase 119: Go/No-Go KPI (uses full data, not filtered)
  const goNoGo = useMemo(
    () => computeGoNoGo(logs, students.length, studentLogs, soloSessions, feedbackRows),
    [logs, students.length, studentLogs, soloSessions, feedbackRows],
  );

  // Compute all metrics (using filtered data)
  const summary = useMemo(
    () => computeSummaryMetrics(filteredLogs, classes.length, students.length),
    [filteredLogs, classes.length, students.length],
  );

  const classMetrics = useMemo(
    () =>
      classes.map((c) =>
        aggregateClassMetrics(c.id, c.class_name, c.grade_label, filteredLogs),
      ),
    [classes, filteredLogs],
  );

  const scenarioMetrics = useMemo(() => aggregateScenarioMetrics(filteredLogs), [filteredLogs]);

  // Insights: latest session + per-class
  const latestSessionInsights = useMemo(() => {
    if (filteredLogs.length === 0) return null;
    const latest = filteredLogs[0]; // logs are sorted desc by created_at
    const metrics = computeSessionMetrics(latest);
    const insights = computeSessionInsights(metrics);
    return { title: latest.scenario_title || latest.scenario_slug, insights };
  }, [filteredLogs]);

  const classInsightsMap = useMemo(() => {
    const map = new Map<string, ClassInsights>();
    classMetrics.forEach((cm) => {
      map.set(cm.classId, computeClassInsights(cm));
    });
    return map;
  }, [classMetrics]);

  const studentMetrics = useMemo(
    () =>
      aggregateStudentMetrics(
        students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
        filteredStudentLogs,
      ),
    [students, filteredStudentLogs],
  );

  // Trends
  const classTrends = useMemo(
    () => computeClassTrends(classes, filteredLogs),
    [classes, filteredLogs],
  );

  const scenarioTrends = useMemo(
    () => computeScenarioTrends(filteredLogs),
    [filteredLogs],
  );

  const studentTrends = useMemo(
    () =>
      computeStudentTrends(
        students.map((s) => ({ id: s.id, student_name: s.student_name, className: s.class_name })),
        filteredStudentLogs,
      ),
    [students, filteredStudentLogs],
  );

  // Export handlers
  const handleExportPDF = () => {
    exportAnalyticsPDF({
      range: dateRange,
      summary,
      classMetrics,
      scenarioMetrics,
      studentMetrics,
      classTrends,
      classInsightsMap,
      latestSessionInsights,
    });
  };

  const handleExportClassCSV = () => exportClassTrendCSV(classTrends);
  const handleExportScenarioCSV = () => exportScenarioTrendCSV(scenarioTrends, filteredLogs);
  const handleExportStudentCSV = () => exportStudentCSV(studentMetrics);

  if (logs.length === 0) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4">📊</div>
        <p class="font-bold">まだ授業データがありません</p>
        <p class="text-sm mt-1">セッションを実施すると分析が表示されます</p>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      {/* Date Range Filter + Export Buttons */}
      <DateRangeFilter
        range={dateRange}
        onChange={setDateRange}
        filteredCount={filteredLogs.length}
        totalCount={logs.length}
        onExportPDF={handleExportPDF}
        onExportClassCSV={handleExportClassCSV}
        onExportScenarioCSV={handleExportScenarioCSV}
        onExportStudentCSV={handleExportStudentCSV}
        hasData={filteredLogs.length > 0}
      />

      {/* Filtered-out notice */}
      {filteredLogs.length === 0 && logs.length > 0 && (
        <div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-4">📅</div>
          <p class="font-bold">選択期間にデータがありません</p>
          <p class="text-sm mt-1">期間を変更してください</p>
        </div>
      )}

      {/* Phase 119: Go/No-Go Summary (always visible, uses full data) */}
      {goNoGoReady && <GoNoGoSection result={goNoGo} />}

      {filteredLogs.length > 0 && (
        <>
          {/* A. Summary Cards */}
          <SummaryCards summary={summary} />

          {/* NEW: Insights Section */}
          <InsightsSection
            latestSession={latestSessionInsights}
            classMetrics={classMetrics}
            classInsightsMap={classInsightsMap}
          />

          {/* B. Class Analysis */}
          {classMetrics.length > 0 && <ClassAnalysis metrics={classMetrics} />}

          {/* C. Scenario Analysis */}
          {scenarioMetrics.length > 0 && <ScenarioAnalysis metrics={scenarioMetrics} />}

          {/* F. Trends */}
          {classTrends.length > 0 && <ClassTrendSection trends={classTrends} />}
          {scenarioTrends.length > 0 && <ScenarioTrendSection trends={scenarioTrends} />}
          {!studentLoading && studentTrends.length > 0 && (
            <StudentTrendSection trends={studentTrends} />
          )}

          {/* D. Student Analysis */}
          {!studentLoading && studentMetrics.length > 0 && (
            <StudentAnalysis metrics={studentMetrics} />
          )}
          {studentLoading && students.length === 0 && classes.length > 0 && (
            <div class="text-center py-8 text-gray-400 text-sm">生徒データを読み込み中...</div>
          )}

          {/* Phase 106: Class Tendency Radar Chart */}
          <ClassTendencyChart classes={classes} logs={filteredLogs} />

          {/* Phase 98: Competency Dashboard */}
          <CompetencyDashboard classes={classes} teacherId={teacherId} />
        </>
      )}
    </div>
  );
}

// ============================================================
// Date Range Filter + Export Bar
// ============================================================

const DATE_RANGE_OPTIONS: { type: DateRangeType; label: string }[] = [
  { type: 'all', label: '全期間' },
  { type: 'last30', label: '直近30日' },
  { type: 'last90', label: '直近90日' },
  { type: 'thisYear', label: '今年度' },
  { type: 'custom', label: 'カスタム' },
];

function DateRangeFilter({
  range,
  onChange,
  filteredCount,
  totalCount,
  onExportPDF,
  onExportClassCSV,
  onExportScenarioCSV,
  onExportStudentCSV,
  hasData,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  filteredCount: number;
  totalCount: number;
  onExportPDF: () => void;
  onExportClassCSV: () => void;
  onExportScenarioCSV: () => void;
  onExportStudentCSV: () => void;
  hasData: boolean;
}) {
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);

  return (
    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Period filter */}
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-bold text-gray-600 shrink-0">期間:</span>
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => {
              if (opt.type === 'custom') {
                onChange({ type: 'custom', start: '', end: '' });
              } else {
                onChange({ type: opt.type });
              }
            }}
            class={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              range.type === opt.type
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {range.type !== 'all' && (
          <span class="text-xs text-gray-400 ml-1">
            {filteredCount} / {totalCount} 件
          </span>
        )}
      </div>

      {/* Custom date inputs */}
      {range.type === 'custom' && (
        <div class="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={range.start || ''}
            onChange={(e) =>
              onChange({ ...range, start: (e.target as HTMLInputElement).value })
            }
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
          <span class="text-gray-400">〜</span>
          <input
            type="date"
            value={range.end || ''}
            onChange={(e) =>
              onChange({ ...range, end: (e.target as HTMLInputElement).value })
            }
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
        </div>
      )}

      {/* Export buttons */}
      <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
        <span class="text-sm font-bold text-gray-600 shrink-0">出力:</span>

        {/* PDF export */}
        <button
          onClick={onExportPDF}
          disabled={!hasData}
          class={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            hasData
              ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
              : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
          }`}
        >
          PDF レポート
        </button>

        {/* CSV dropdown */}
        <div class="relative">
          <button
            onClick={() => setCsvMenuOpen(!csvMenuOpen)}
            disabled={!hasData}
            class={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              hasData
                ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
            }`}
          >
            CSV {csvMenuOpen ? '▲' : '▼'}
          </button>
          {csvMenuOpen && hasData && (
            <div class="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px]">
              <button
                onClick={() => { onExportClassCSV(); setCsvMenuOpen(false); }}
                class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-t-lg"
              >
                クラス成長トレンド
              </button>
              <button
                onClick={() => { onExportScenarioCSV(); setCsvMenuOpen(false); }}
                class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
              >
                シナリオ傾向
              </button>
              <button
                onClick={() => { onExportStudentCSV(); setCsvMenuOpen(false); }}
                class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-b-lg"
              >
                生徒参加状況
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// A. Summary Cards
// ============================================================

function SummaryCards({ summary }: { summary: ReturnType<typeof computeSummaryMetrics> }) {
  const cards = [
    { label: '総授業数', value: String(summary.totalSessions), color: 'text-amber-600' },
    { label: '総クラス数', value: String(summary.totalClasses), color: 'text-blue-600' },
    { label: '総生徒数', value: String(summary.totalStudents), color: 'text-indigo-600' },
    { label: '平均正解率', value: formatPercent(summary.avgAccuracyRate), color: 'text-green-600' },
    { label: '平均授業時間', value: formatMinSec(summary.avgDuration), color: 'text-amber-600' },
    { label: '平均議論時間', value: formatMinSec(summary.avgDiscussTime), color: 'text-purple-600' },
  ];

  return (
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} class="bg-white rounded-xl p-4 text-center border border-gray-200">
          <div class={`text-2xl font-black ${c.color}`}>{c.value}</div>
          <div class="text-xs text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// B. Class Analysis
// ============================================================

function ClassAnalysis({ metrics }: { metrics: ClassAggregateMetrics[] }) {
  return (
    <section>
      <h3 class="font-bold text-lg mb-3">クラス別分析</h3>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">実施数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">平均時間</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">議論</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">探索</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">直近</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.classId} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <div class="font-bold">{m.className}</div>
                    {m.gradeLabel && (
                      <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {m.gradeLabel}
                      </span>
                    )}
                  </td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">{m.sessionCount}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(m.avgDuration)}</td>
                  <td class="text-center px-3 py-3">
                    <AccuracyBadge rate={m.avgAccuracyRate} />
                  </td>
                  <td class="text-center px-3 py-3">{formatMinSec(m.avgDiscussTime)}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(m.avgExploreTime)}</td>
                  <td class="text-center px-3 py-3 text-gray-500">{formatDate(m.lastSessionDate)}</td>
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
// C. Scenario Analysis
// ============================================================

function ScenarioAnalysis({ metrics }: { metrics: ScenarioAggregateMetrics[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? metrics : metrics.slice(0, 10);

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">シナリオ別分析</h3>
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
                <th class="text-center px-3 py-3 font-bold text-gray-700">議論</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">証拠数</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((m) => (
                <tr key={m.slug} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <div class="font-bold truncate max-w-[200px]" title={m.title}>
                      {m.title}
                    </div>
                  </td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">{m.sessionCount}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(m.avgDuration)}</td>
                  <td class="text-center px-3 py-3">
                    <AccuracyBadge rate={m.avgAccuracyRate} />
                  </td>
                  <td class="text-center px-3 py-3">{formatPercent(m.avgVoteReasonRate)}</td>
                  <td class="text-center px-3 py-3">{formatMinSec(m.avgDiscussTime)}</td>
                  <td class="text-center px-3 py-3">{m.avgEvidenceCount ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metrics.length > 10 && (
          <div class="text-center py-3 border-t border-gray-100">
            <button
              onClick={() => setShowAll(!showAll)}
              class="text-sm text-amber-600 font-bold hover:text-amber-700"
            >
              {showAll ? '折りたたむ' : `他 ${metrics.length - 10} シナリオを表示`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// D. Student Analysis
// ============================================================

function StudentAnalysis({ metrics }: { metrics: StudentAggregateMetrics[] }) {
  const [showAll, setShowAll] = useState(false);
  // Sort: most participations first
  const sorted = useMemo(
    () => [...metrics].sort((a, b) => b.participationCount - a.participationCount),
    [metrics],
  );
  const displayed = showAll ? sorted : sorted.slice(0, 20);

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">生徒参加状況</h3>
      <p class="text-xs text-gray-400 mb-3">
        参加ログの記録です。成績評価ではありません。
      </p>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">生徒名</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">参加回数</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">正解率</th>
                <th class="text-center px-3 py-3 font-bold text-gray-700">直近参加</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((m) => (
                <tr key={m.studentId} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 font-bold">{m.studentName}</td>
                  <td class="px-3 py-3 text-gray-500">{m.className}</td>
                  <td class="text-center px-3 py-3 font-bold text-amber-600">
                    {m.participationCount}
                  </td>
                  <td class="text-center px-3 py-3">
                    {m.participationCount > 0 ? m.correctCount : '--'}
                  </td>
                  <td class="text-center px-3 py-3">
                    <AccuracyBadge rate={m.accuracyRate} />
                  </td>
                  <td class="text-center px-3 py-3 text-gray-500">
                    {formatDate(m.lastSessionDate)}
                  </td>
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
// Shared: Accuracy badge
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

// ============================================================
// F. Class Trend Section
// ============================================================

function ClassTrendSection({ trends }: { trends: ClassTrend[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">クラス成長トレンド</h3>
      <div class="space-y-3">
        {trends.map((t) => (
          <div key={t.classId} class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === t.classId ? null : t.classId)}
              class="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center gap-2">
                <span class="font-bold">{t.className}</span>
                {t.gradeLabel && (
                  <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {t.gradeLabel}
                  </span>
                )}
                <span class="text-xs text-gray-400">{t.points.length}回</span>
              </div>
              <span class="text-gray-400 text-sm">
                {expanded === t.classId ? '▲' : '▼'}
              </span>
            </button>
            {expanded === t.classId && (
              <div class="px-5 pb-4">
                <TrendTable points={t.points} />
                {t.insights.length > 0 && (
                  <InsightList label="トレンド所見" insights={t.insights} color="purple" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// G. Scenario Trend Section
// ============================================================

function ScenarioTrendSection({ trends }: { trends: ScenarioTrend[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? trends : trends.slice(0, 5);

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">シナリオ傾向トレンド</h3>
      <div class="space-y-3">
        {displayed.map((t) => (
          <div key={t.slug} class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === t.slug ? null : t.slug)}
              class="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center gap-2">
                <span class="font-bold truncate max-w-[250px]" title={t.title}>{t.title}</span>
                <span class="text-xs text-gray-400">{t.points.length}回</span>
              </div>
              <span class="text-gray-400 text-sm">
                {expanded === t.slug ? '▲' : '▼'}
              </span>
            </button>
            {expanded === t.slug && (
              <div class="px-5 pb-4">
                <TrendTable points={t.points} />
              </div>
            )}
          </div>
        ))}
      </div>
      {trends.length > 5 && (
        <div class="text-center mt-3">
          <button
            onClick={() => setShowAll(!showAll)}
            class="text-sm text-amber-600 font-bold hover:text-amber-700"
          >
            {showAll ? '折りたたむ' : `他 ${trends.length - 5} シナリオを表示`}
          </button>
        </div>
      )}
    </section>
  );
}

// ============================================================
// H. Student Trend Section
// ============================================================

function StudentTrendSection({ trends }: { trends: StudentTrend[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(
    () => [...trends].sort((a, b) => b.points.length - a.points.length),
    [trends],
  );
  const displayed = showAll ? sorted : sorted.slice(0, 15);

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">生徒参加トレンド</h3>
      <p class="text-xs text-gray-400 mb-3">
        参加の継続傾向です。成績評価ではありません。
      </p>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-bold text-gray-700">生徒名</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">クラス</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">参加推移</th>
                <th class="text-left px-3 py-3 font-bold text-gray-700">所見</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t) => (
                <tr key={t.studentId} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 font-bold">{t.studentName}</td>
                  <td class="px-3 py-3 text-gray-500 text-xs">{t.className}</td>
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-1">
                      {t.points.map((p, i) => (
                        <div
                          key={i}
                          title={`#${p.sessionNumber} ${formatDate(p.date)}${p.isCorrect != null ? (p.isCorrect ? ' 正解' : ' 不正解') : ''}${p.hasReason ? ' (理由あり)' : ''}`}
                          class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                            p.isCorrect === true
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : p.isCorrect === false
                                ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'bg-gray-100 text-gray-400 border-gray-200'
                          }`}
                        >
                          {p.hasReason ? 'R' : p.sessionNumber}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td class="px-3 py-3 text-xs text-gray-500">
                    {t.insights.length > 0
                      ? t.insights.map((ins) => ins.text).join('; ')
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 15 && (
          <div class="text-center py-3 border-t border-gray-100">
            <button
              onClick={() => setShowAll(!showAll)}
              class="text-sm text-amber-600 font-bold hover:text-amber-700"
            >
              {showAll ? '折りたたむ' : `他 ${sorted.length - 15} 人を表示`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Shared: Trend Table
// ============================================================

function TrendTable({ points }: { points: TrendPoint[] }) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-gray-200">
            <th class="text-center px-2 py-2 font-bold text-gray-500">#</th>
            <th class="text-left px-2 py-2 font-bold text-gray-500">日付</th>
            <th class="text-left px-2 py-2 font-bold text-gray-500">シナリオ</th>
            <th class="text-center px-2 py-2 font-bold text-gray-500">正解率</th>
            <th class="text-center px-2 py-2 font-bold text-gray-500">議論</th>
            <th class="text-center px-2 py-2 font-bold text-gray-500">探索</th>
            <th class="text-center px-2 py-2 font-bold text-gray-500">証拠</th>
            <th class="text-center px-2 py-2 font-bold text-gray-500">理由率</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.sessionNumber} class="border-b border-gray-50">
              <td class="text-center px-2 py-1.5 text-gray-400">{p.sessionNumber}</td>
              <td class="px-2 py-1.5 text-gray-500">{formatDate(p.date)}</td>
              <td class="px-2 py-1.5 truncate max-w-[120px]" title={p.scenarioTitle}>
                {p.scenarioTitle}
              </td>
              <td class="text-center px-2 py-1.5">
                <TrendCell value={p.accuracyRate} format="pct" />
              </td>
              <td class="text-center px-2 py-1.5">
                <TrendCell value={p.discussTime} format="time" />
              </td>
              <td class="text-center px-2 py-1.5">
                <TrendCell value={p.exploreTime} format="time" />
              </td>
              <td class="text-center px-2 py-1.5">{p.evidenceCount}</td>
              <td class="text-center px-2 py-1.5">
                <TrendCell value={p.voteReasonRate} format="pct" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCell({ value, format }: { value: number | null; format: 'pct' | 'time' }) {
  if (value == null) return <span class="text-gray-300">--</span>;
  if (format === 'pct') {
    const pct = Math.round(value * 100);
    const barWidth = Math.min(pct, 100);
    const color = pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-300';
    return (
      <div class="flex items-center gap-1">
        <div class="w-12 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div class={`h-full rounded-full ${color}`} style={{ width: `${barWidth}%` }} />
        </div>
        <span class="text-gray-600 w-8 text-right">{pct}%</span>
      </div>
    );
  }
  return <span class="text-gray-600">{formatMinSec(value)}</span>;
}

// ============================================================
// Shared: Insight list (reusable)
// ============================================================

function InsightList({
  label,
  insights,
  color,
}: {
  label: string;
  insights: Insight[];
  color: 'blue' | 'amber' | 'green' | 'purple';
}) {
  const colors = {
    blue: { label: 'text-blue-600', bullet: 'text-blue-400' },
    amber: { label: 'text-amber-600', bullet: 'text-amber-400' },
    green: { label: 'text-green-600', bullet: 'text-green-400' },
    purple: { label: 'text-purple-600', bullet: 'text-purple-400' },
  };
  const c = colors[color];

  return (
    <div class="mt-3 pt-3 border-t border-gray-100">
      <div class={`text-xs font-bold ${c.label} mb-1.5`}>{label}</div>
      <ul class="space-y-1">
        {insights.map((ins, i) => (
          <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
            <span class={`${c.bullet} mt-0.5 shrink-0`}>-</span>
            {ins.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// E. Insights Section
// ============================================================

function InsightsSection({
  latestSession,
  classMetrics,
  classInsightsMap,
}: {
  latestSession: { title: string; insights: SessionInsights } | null;
  classMetrics: ClassAggregateMetrics[];
  classInsightsMap: Map<string, ClassInsights>;
}) {
  const hasLatest = latestSession &&
    (latestSession.insights.observations.length > 0 || latestSession.insights.suggestions.length > 0);

  const classesWithInsights = classMetrics.filter((cm) => {
    const ci = classInsightsMap.get(cm.classId);
    return ci && (ci.observations.length > 0 || ci.suggestions.length > 0 || ci.recommendations.length > 0);
  });

  if (!hasLatest && classesWithInsights.length === 0) return null;

  return (
    <section class="space-y-4">
      <h3 class="font-bold text-lg">授業改善インサイト</h3>

      {/* Latest session insights */}
      {hasLatest && latestSession && (
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-bold text-sm text-gray-700 mb-3">
            直近の授業: {latestSession.title}
          </h4>
          {latestSession.insights.observations.length > 0 && (
            <div class="mb-3">
              <div class="text-xs font-bold text-blue-600 mb-1.5">所見</div>
              <ul class="space-y-1">
                {latestSession.insights.observations.map((ins, i) => (
                  <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                    <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                    {ins.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {latestSession.insights.suggestions.length > 0 && (
            <div>
              <div class="text-xs font-bold text-amber-600 mb-1.5">次回への提案</div>
              <ul class="space-y-1">
                {latestSession.insights.suggestions.map((ins, i) => (
                  <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                    <span class="text-amber-400 mt-0.5 shrink-0">-</span>
                    {ins.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Per-class insights */}
      {classesWithInsights.map((cm) => {
        const ci = classInsightsMap.get(cm.classId)!;
        return (
          <div key={cm.classId} class="bg-white rounded-xl border border-gray-200 p-5">
            <h4 class="font-bold text-sm text-gray-700 mb-3">
              {cm.className}
              {cm.gradeLabel && (
                <span class="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  {cm.gradeLabel}
                </span>
              )}
            </h4>
            {ci.observations.length > 0 && (
              <div class="mb-3">
                <div class="text-xs font-bold text-blue-600 mb-1.5">クラスの傾向</div>
                <ul class="space-y-1">
                  {ci.observations.map((ins, i) => (
                    <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                      <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                      {ins.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ci.suggestions.length > 0 && (
              <div class="mb-3">
                <div class="text-xs font-bold text-amber-600 mb-1.5">改善提案</div>
                <ul class="space-y-1">
                  {ci.suggestions.map((ins, i) => (
                    <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                      <span class="text-amber-400 mt-0.5 shrink-0">-</span>
                      {ins.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ci.recommendations.length > 0 && (
              <div>
                <div class="text-xs font-bold text-green-600 mb-1.5">シナリオ相性</div>
                <ul class="space-y-1">
                  {ci.recommendations.map((ins, i) => (
                    <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                      <span class="text-green-400 mt-0.5 shrink-0">-</span>
                      {ins.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ============================================================
// Phase 119: Go/No-Go Summary
// ============================================================

function GoNoGoSection({ result }: { result: GoNoGoResult }) {
  return (
    <section>
      <div class="flex items-center gap-3 mb-4">
        <h3 class="font-bold text-lg">Go/No-Go 教室実績</h3>
        <span class={`text-xs font-bold px-2 py-1 rounded-full ${
          result.allPassed
            ? 'bg-green-100 text-green-700'
            : result.passedCount >= 3
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
        }`}>
          {result.passedCount}/{result.metrics.length} 達成
        </span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {result.metrics.map((m) => (
          <div key={m.label} class={`rounded-xl p-4 border-2 ${
            m.passed ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
          }`}>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-500">{m.label}</span>
              <span class={`text-xs font-bold ${m.passed ? 'text-green-600' : 'text-gray-400'}`}>
                {m.passed ? 'PASS' : `目標 ${m.target}${m.unit}`}
              </span>
            </div>
            <div class={`text-2xl font-black ${m.passed ? 'text-green-600' : 'text-gray-700'}`}>
              {m.value}<span class="text-sm font-normal text-gray-400 ml-0.5">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
      {result.allPassed && (
        <div class="mt-3 text-center text-sm font-bold text-green-600 bg-green-50 rounded-lg py-2">
          全指標達成 — Go判定可能
        </div>
      )}
    </section>
  );
}
