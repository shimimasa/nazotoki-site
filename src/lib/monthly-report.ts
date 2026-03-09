/**
 * Monthly Report — Aggregate session data by month, generate insights.
 *
 * Pure functions: (data) → report. No side effects, no DB calls.
 */

import type { SessionLogRow } from './supabase';
import type {
  ClassAggregateMetrics,
  ScenarioAggregateMetrics,
  StudentAggregateMetrics,
  SummaryMetrics,
} from './session-analytics';
import {
  computeSummaryMetrics,
  aggregateClassMetrics,
  aggregateScenarioMetrics,
  aggregateStudentMetrics,
} from './session-analytics';
import type { Insight, ClassInsights } from './session-insights';
import { computeClassInsights } from './session-insights';

// ============================================================
// Types
// ============================================================

export interface MonthlyReportData {
  year: number;
  month: number;
  generatedAt: string;
  summary: SummaryMetrics;
  classBreakdown: ClassAggregateMetrics[];
  scenarioBreakdown: ScenarioAggregateMetrics[];
  studentBreakdown: StudentAggregateMetrics[];
  classInsights: Map<string, ClassInsights>;
  insights: Insight[];
  improvements: Insight[];
}

/** Serializable version for Supabase JSON storage */
export interface MonthlyReportJSON {
  year: number;
  month: number;
  generatedAt: string;
  summary: SummaryMetrics;
  classBreakdown: ClassAggregateMetrics[];
  scenarioBreakdown: ScenarioAggregateMetrics[];
  studentBreakdown: StudentAggregateMetrics[];
  classInsightsEntries: [string, ClassInsights][];
  insights: Insight[];
  improvements: Insight[];
}

/** Row summary for the list view */
export interface MonthlyReportListItem {
  year: number;
  month: number;
  sessionCount: number;
  avgAccuracyRate: number | null;
  topInsight: string | null;
}

// ============================================================
// Month utilities
// ============================================================

export function getAvailableMonths(logs: SessionLogRow[]): { year: number; month: number }[] {
  const seen = new Set<string>();
  const months: { year: number; month: number }[] = [];

  for (const log of logs) {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
  }

  // Sort descending (newest first)
  return months.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

export function filterLogsByMonth(
  logs: SessionLogRow[],
  year: number,
  month: number,
): SessionLogRow[] {
  return logs.filter((log) => {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export function filterStudentLogsByMonth(
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  year: number,
  month: number,
): typeof studentLogs {
  return studentLogs.filter((sl) => {
    const d = new Date(sl.created_at);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export function monthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

// ============================================================
// Core: Build monthly report from raw data
// ============================================================

export function buildMonthlyReport(
  allLogs: SessionLogRow[],
  classes: { id: string; class_name: string; grade_label: string | null }[],
  students: { id: string; student_name: string; className: string }[],
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  year: number,
  month: number,
): MonthlyReportData {
  const monthLogs = filterLogsByMonth(allLogs, year, month);
  const monthStudentLogs = filterStudentLogsByMonth(studentLogs, year, month);

  // Determine which classes had sessions this month
  const activeClassIds = new Set(monthLogs.map((l) => l.class_id).filter(Boolean));
  const activeClasses = classes.filter((c) => activeClassIds.has(c.id));

  // Determine which students participated this month
  const activeStudentIds = new Set(monthStudentLogs.map((sl) => sl.student_id));
  const activeStudents = students.filter((s) => activeStudentIds.has(s.id));

  // Summary
  const summary = computeSummaryMetrics(monthLogs, activeClasses.length, activeStudents.length);

  // Class breakdown
  const classBreakdown = activeClasses.map((c) =>
    aggregateClassMetrics(c.id, c.class_name, c.grade_label, monthLogs),
  );

  // Scenario breakdown
  const scenarioBreakdown = aggregateScenarioMetrics(monthLogs);

  // Student breakdown
  const studentBreakdown = aggregateStudentMetrics(activeStudents, monthStudentLogs);

  // Class insights (reuse existing rule-based system)
  const classInsights = new Map<string, ClassInsights>();
  classBreakdown.forEach((cm) => {
    classInsights.set(cm.classId, computeClassInsights(cm));
  });

  // Monthly insights + improvements
  const { insights, improvements } = computeMonthlyInsights(
    summary, classBreakdown, scenarioBreakdown, monthLogs,
  );

  return {
    year,
    month,
    generatedAt: new Date().toISOString(),
    summary,
    classBreakdown,
    scenarioBreakdown,
    studentBreakdown,
    classInsights,
    insights,
    improvements,
  };
}

// ============================================================
// Monthly insights (rule-based)
// ============================================================

const T = {
  SESSIONS_ACTIVE: 5,
  SESSIONS_LOW: 2,
  ACCURACY_HIGH: 0.75,
  ACCURACY_LOW: 0.35,
  DISCUSS_LONG: 600,
  DISCUSS_SHORT: 180,
  EXPLORE_SHORT: 180,
  VOTE_REASON_HIGH: 0.7,
  VOTE_REASON_LOW: 0.3,
  EVIDENCE_HIGH: 5,
  EVIDENCE_LOW: 2,
} as const;

function computeMonthlyInsights(
  summary: SummaryMetrics,
  classBreakdown: ClassAggregateMetrics[],
  scenarioBreakdown: ScenarioAggregateMetrics[],
  monthLogs: SessionLogRow[],
): { insights: Insight[]; improvements: Insight[] } {
  const insights: Insight[] = [];
  const improvements: Insight[] = [];

  // --- Session frequency ---
  if (summary.totalSessions >= T.SESSIONS_ACTIVE) {
    insights.push({
      type: 'observation',
      text: `今月は${summary.totalSessions}回の授業を実施し、活発な月でした`,
    });
  } else if (summary.totalSessions > 0 && summary.totalSessions < T.SESSIONS_LOW) {
    insights.push({
      type: 'observation',
      text: `今月の実施は${summary.totalSessions}回でした`,
    });
    improvements.push({
      type: 'suggestion',
      text: '実施頻度を上げると、生徒の推理スキル定着が加速する可能性があります',
    });
  }

  // --- Accuracy ---
  if (summary.avgAccuracyRate != null) {
    if (summary.avgAccuracyRate >= T.ACCURACY_HIGH) {
      insights.push({
        type: 'observation',
        text: '月間平均正解率が高く、推理力が発揮されている傾向があります',
      });
    } else if (summary.avgAccuracyRate < T.ACCURACY_LOW) {
      insights.push({
        type: 'observation',
        text: '月間平均正解率が低めの傾向があり、難易度調整の余地があります',
      });
      improvements.push({
        type: 'suggestion',
        text: '次月は手がかりが明確なシナリオから始めると成功体験が増える可能性があります',
      });
    }
  }

  // --- Discussion time ---
  if (summary.avgDiscussTime != null) {
    if (summary.avgDiscussTime >= T.DISCUSS_LONG) {
      insights.push({
        type: 'observation',
        text: '議論時間が長く、意見交換が活発な月でした',
      });
    } else if (summary.avgDiscussTime < T.DISCUSS_SHORT) {
      insights.push({
        type: 'observation',
        text: '議論時間が短めの傾向がありました',
      });
      improvements.push({
        type: 'suggestion',
        text: '議論前に「気づいたことを1つメモして」と促すと発言量が増える可能性があります',
      });
    }
  }

  // --- Vote reason rate (compute from logs) ---
  const voteReasonRates: number[] = [];
  monthLogs.forEach((log) => {
    const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
    if (voters === 0) return;
    const reasons = log.vote_reasons
      ? Object.values(log.vote_reasons).filter((r) => r && r.trim().length > 0).length
      : 0;
    voteReasonRates.push(reasons / voters);
  });
  if (voteReasonRates.length > 0) {
    const avgReasonRate = voteReasonRates.reduce((a, b) => a + b, 0) / voteReasonRates.length;
    if (avgReasonRate >= T.VOTE_REASON_HIGH) {
      insights.push({
        type: 'observation',
        text: '投票理由の記入率が高く、根拠の言語化が育っている傾向があります',
      });
    } else if (avgReasonRate < T.VOTE_REASON_LOW) {
      improvements.push({
        type: 'suggestion',
        text: '「なぜその人を選んだ？」と声かけを追加すると理由記入率が上がる可能性があります',
      });
    }
  }

  // --- Evidence discovery ---
  const evidenceCounts = monthLogs
    .map((l) => (l.discovered_evidence || []).length)
    .filter((c) => c > 0);
  if (evidenceCounts.length > 0) {
    const avgEvidence = evidenceCounts.reduce((a, b) => a + b, 0) / evidenceCounts.length;
    if (avgEvidence >= T.EVIDENCE_HIGH) {
      insights.push({
        type: 'observation',
        text: '証拠発見数が多く、探索活動が充実していた傾向があります',
      });
    } else if (avgEvidence <= T.EVIDENCE_LOW) {
      improvements.push({
        type: 'suggestion',
        text: '探索時間を少し長めに設定すると証拠発見が増える可能性があります',
      });
    }
  }

  // --- Explore time ---
  const exploreTimes = monthLogs
    .map((l) => l.phase_durations?.explore)
    .filter((t): t is number => t != null);
  if (exploreTimes.length > 0) {
    const avgExplore = exploreTimes.reduce((a, b) => a + b, 0) / exploreTimes.length;
    if (avgExplore < T.EXPLORE_SHORT) {
      insights.push({
        type: 'observation',
        text: '探索時間が短めの授業が多い傾向がありました',
      });
    }
  }

  // --- Multi-class usage ---
  if (classBreakdown.length >= 2) {
    insights.push({
      type: 'observation',
      text: `${classBreakdown.length}クラスで実施しており、複数クラスでの活用が進んでいます`,
    });
  }

  // --- Scenario variety ---
  if (scenarioBreakdown.length >= 3) {
    insights.push({
      type: 'observation',
      text: `${scenarioBreakdown.length}種類のシナリオを使用し、多様な題材に触れています`,
    });
  }

  // Ensure at least one improvement suggestion
  if (improvements.length === 0 && summary.totalSessions > 0) {
    improvements.push({
      type: 'suggestion',
      text: '継続的な実施により、生徒の思考パターンがより明確に見えてくる可能性があります',
    });
  }

  return { insights, improvements };
}

// ============================================================
// Build list items from logs (for the list view)
// ============================================================

export function buildMonthlyReportListItems(logs: SessionLogRow[]): MonthlyReportListItem[] {
  const months = getAvailableMonths(logs);

  return months.map(({ year, month }) => {
    const monthLogs = filterLogsByMonth(logs, year, month);
    const summary = computeSummaryMetrics(monthLogs, 0, 0);

    // Quick insight: compute a single top-level observation
    const { insights } = computeMonthlyInsights(summary, [], [], monthLogs);
    const topInsight = insights.length > 0 ? insights[0].text : null;

    return {
      year,
      month,
      sessionCount: monthLogs.length,
      avgAccuracyRate: summary.avgAccuracyRate,
      topInsight,
    };
  });
}

// ============================================================
// Serialization (for Supabase JSON storage)
// ============================================================

export function reportToJSON(report: MonthlyReportData): MonthlyReportJSON {
  return {
    year: report.year,
    month: report.month,
    generatedAt: report.generatedAt,
    summary: report.summary,
    classBreakdown: report.classBreakdown,
    scenarioBreakdown: report.scenarioBreakdown,
    studentBreakdown: report.studentBreakdown,
    classInsightsEntries: Array.from(report.classInsights.entries()),
    insights: report.insights,
    improvements: report.improvements,
  };
}

export function reportFromJSON(json: MonthlyReportJSON): MonthlyReportData {
  return {
    ...json,
    classInsights: new Map(json.classInsightsEntries),
  };
}
