/**
 * Term Report — Aggregate session data by school term (学期), generate insights.
 *
 * Japanese school year:
 *   1学期: April–August (month 4–8, August included for stray sessions)
 *   2学期: September–December (month 9–12)
 *   3学期: January–March (month 1–3)
 *
 * School year (年度): month >= 4 → year, month <= 3 → year - 1
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
import { filterLogsByMonth } from './monthly-report';

// ============================================================
// Types
// ============================================================

export type TermNumber = 1 | 2 | 3;

export interface TermId {
  schoolYear: number;
  term: TermNumber;
}

/** Month-by-month sub-metrics within a term */
export interface MonthlySubMetrics {
  year: number;
  month: number;
  sessionCount: number;
  avgAccuracyRate: number | null;
  avgDiscussTime: number | null;
  avgDuration: number | null;
}

export interface TermReportData {
  schoolYear: number;
  term: TermNumber;
  generatedAt: string;
  summary: SummaryMetrics;
  monthlyBreakdown: MonthlySubMetrics[];
  classBreakdown: ClassAggregateMetrics[];
  scenarioBreakdown: ScenarioAggregateMetrics[];
  studentBreakdown: StudentAggregateMetrics[];
  classInsights: Map<string, ClassInsights>;
  insights: Insight[];
  improvements: Insight[];
}

export interface TermReportListItem {
  schoolYear: number;
  term: TermNumber;
  sessionCount: number;
  avgAccuracyRate: number | null;
  topInsight: string | null;
}

// ============================================================
// Term definitions
// ============================================================

interface TermDef {
  term: TermNumber;
  label: string;
  months: number[];
}

const TERM_DEFS: TermDef[] = [
  { term: 1, label: '1学期', months: [4, 5, 6, 7, 8] },
  { term: 2, label: '2学期', months: [9, 10, 11, 12] },
  { term: 3, label: '3学期', months: [1, 2, 3] },
];

// ============================================================
// Term utilities
// ============================================================

/** Get the school year for a date. April–December = same year, January–March = previous year */
export function getSchoolYear(date: Date): number {
  const m = date.getMonth() + 1;
  return m >= 4 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Get the term number for a date */
export function getTermNumber(date: Date): TermNumber {
  const m = date.getMonth() + 1;
  if (m >= 4 && m <= 8) return 1;
  if (m >= 9 && m <= 12) return 2;
  return 3;
}

/** Get TermId from a date */
export function getTermFromDate(date: Date): TermId {
  return { schoolYear: getSchoolYear(date), term: getTermNumber(date) };
}

/** Get the months that belong to a term */
export function getTermMonths(term: TermNumber): number[] {
  const def = TERM_DEFS.find((d) => d.term === term);
  return def ? def.months : [];
}

/** Human-readable label for a term */
export function termLabel(schoolYear: number, term: TermNumber): string {
  const def = TERM_DEFS.find((d) => d.term === term);
  return `${schoolYear}年度 ${def?.label ?? `${term}学期`}`;
}

/** Get all available terms from session logs (sorted newest first) */
export function getAvailableTerms(logs: SessionLogRow[]): TermId[] {
  const seen = new Set<string>();
  const terms: TermId[] = [];

  for (const log of logs) {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    const tid = getTermFromDate(d);
    const key = `${tid.schoolYear}-${tid.term}`;
    if (!seen.has(key)) {
      seen.add(key);
      terms.push(tid);
    }
  }

  // Sort descending (newest first)
  return terms.sort((a, b) => {
    if (a.schoolYear !== b.schoolYear) return b.schoolYear - a.schoolYear;
    return b.term - a.term;
  });
}

/** Filter session logs to a specific term */
export function filterLogsByTerm(
  logs: SessionLogRow[],
  schoolYear: number,
  term: TermNumber,
): SessionLogRow[] {
  const months = getTermMonths(term);
  return logs.filter((log) => {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const sy = getSchoolYear(d);
    const m = d.getMonth() + 1;
    return sy === schoolYear && months.includes(m);
  });
}

/** Filter student logs to a specific term */
export function filterStudentLogsByTerm(
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  schoolYear: number,
  term: TermNumber,
): typeof studentLogs {
  const months = getTermMonths(term);
  return studentLogs.filter((sl) => {
    const d = new Date(sl.created_at);
    const sy = getSchoolYear(d);
    const m = d.getMonth() + 1;
    return sy === schoolYear && months.includes(m);
  });
}

// ============================================================
// Monthly sub-metrics within a term
// ============================================================

function buildMonthlySubMetrics(
  termLogs: SessionLogRow[],
  schoolYear: number,
  term: TermNumber,
): MonthlySubMetrics[] {
  const months = getTermMonths(term);
  const result: MonthlySubMetrics[] = [];

  for (const month of months) {
    // Determine actual year for this month
    const year = month >= 4 ? schoolYear : schoolYear + 1;
    const monthLogs = filterLogsByMonth(termLogs, year, month);

    if (monthLogs.length === 0) continue;

    const summary = computeSummaryMetrics(monthLogs, 0, 0);
    result.push({
      year,
      month,
      sessionCount: monthLogs.length,
      avgAccuracyRate: summary.avgAccuracyRate,
      avgDiscussTime: summary.avgDiscussTime,
      avgDuration: summary.avgDuration,
    });
  }

  return result;
}

// ============================================================
// Core: Build term report from raw data
// ============================================================

export function buildTermReport(
  allLogs: SessionLogRow[],
  classes: { id: string; class_name: string; grade_label: string | null }[],
  students: { id: string; student_name: string; className: string }[],
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  schoolYear: number,
  term: TermNumber,
): TermReportData {
  const termLogs = filterLogsByTerm(allLogs, schoolYear, term);
  const termStudentLogs = filterStudentLogsByTerm(studentLogs, schoolYear, term);

  // Determine active classes and students
  const activeClassIds = new Set(termLogs.map((l) => l.class_id).filter(Boolean));
  const activeClasses = classes.filter((c) => activeClassIds.has(c.id));

  const activeStudentIds = new Set(termStudentLogs.map((sl) => sl.student_id));
  const activeStudents = students.filter((s) => activeStudentIds.has(s.id));

  // Summary
  const summary = computeSummaryMetrics(termLogs, activeClasses.length, activeStudents.length);

  // Monthly breakdown within term
  const monthlyBreakdown = buildMonthlySubMetrics(termLogs, schoolYear, term);

  // Class breakdown
  const classBreakdown = activeClasses.map((c) =>
    aggregateClassMetrics(c.id, c.class_name, c.grade_label, termLogs),
  );

  // Scenario breakdown
  const scenarioBreakdown = aggregateScenarioMetrics(termLogs);

  // Student breakdown
  const studentBreakdown = aggregateStudentMetrics(activeStudents, termStudentLogs);

  // Class insights
  const classInsights = new Map<string, ClassInsights>();
  classBreakdown.forEach((cm) => {
    classInsights.set(cm.classId, computeClassInsights(cm));
  });

  // Term insights + improvements
  const { insights, improvements } = computeTermInsights(
    summary, classBreakdown, scenarioBreakdown, termLogs, monthlyBreakdown, term,
  );

  return {
    schoolYear,
    term,
    generatedAt: new Date().toISOString(),
    summary,
    monthlyBreakdown,
    classBreakdown,
    scenarioBreakdown,
    studentBreakdown,
    classInsights,
    insights,
    improvements,
  };
}

// ============================================================
// Build list items (for list view)
// ============================================================

export function buildTermReportListItems(logs: SessionLogRow[]): TermReportListItem[] {
  const terms = getAvailableTerms(logs);

  return terms.map(({ schoolYear, term }) => {
    const termLogs = filterLogsByTerm(logs, schoolYear, term);
    const summary = computeSummaryMetrics(termLogs, 0, 0);

    const { insights } = computeTermInsights(summary, [], [], termLogs, [], term);
    const topInsight = insights.length > 0 ? insights[0].text : null;

    return {
      schoolYear,
      term,
      sessionCount: termLogs.length,
      avgAccuracyRate: summary.avgAccuracyRate,
      topInsight,
    };
  });
}

// ============================================================
// Term insights (rule-based)
// ============================================================

const T = {
  SESSIONS_ACTIVE: 15,
  SESSIONS_MODERATE: 5,
  SESSIONS_LOW: 3,
  ACCURACY_HIGH: 0.75,
  ACCURACY_LOW: 0.35,
  DISCUSS_LONG: 600,
  DISCUSS_SHORT: 180,
  EXPLORE_SHORT: 180,
  VOTE_REASON_HIGH: 0.7,
  VOTE_REASON_LOW: 0.3,
  EVIDENCE_HIGH: 5,
  EVIDENCE_LOW: 2,
  PROGRESSION_THRESHOLD: 0.1, // 10pt improvement across term
} as const;

function computeTermInsights(
  summary: SummaryMetrics,
  classBreakdown: ClassAggregateMetrics[],
  scenarioBreakdown: ScenarioAggregateMetrics[],
  termLogs: SessionLogRow[],
  monthlyBreakdown: MonthlySubMetrics[],
  term: TermNumber,
): { insights: Insight[]; improvements: Insight[] } {
  const insights: Insight[] = [];
  const improvements: Insight[] = [];
  const termDef = TERM_DEFS.find((d) => d.term === term);
  const termName = termDef?.label ?? `${term}学期`;

  // --- Session frequency ---
  if (summary.totalSessions >= T.SESSIONS_ACTIVE) {
    insights.push({
      type: 'observation',
      text: `${termName}を通して${summary.totalSessions}回の授業を実施し、活発に取り組んだ学期でした`,
    });
  } else if (summary.totalSessions >= T.SESSIONS_MODERATE) {
    insights.push({
      type: 'observation',
      text: `${termName}は${summary.totalSessions}回の授業を実施しました`,
    });
  } else if (summary.totalSessions > 0 && summary.totalSessions < T.SESSIONS_LOW) {
    insights.push({
      type: 'observation',
      text: `${termName}の実施は${summary.totalSessions}回でした`,
    });
    improvements.push({
      type: 'suggestion',
      text: '次学期は月1〜2回の実施を目標にすると、生徒の推理スキル定着が加速する可能性があります',
    });
  }

  // --- Accuracy ---
  if (summary.avgAccuracyRate != null) {
    if (summary.avgAccuracyRate >= T.ACCURACY_HIGH) {
      insights.push({
        type: 'observation',
        text: `${termName}全体の正解率が高く、推理力が発揮されている傾向があります`,
      });
    } else if (summary.avgAccuracyRate < T.ACCURACY_LOW) {
      insights.push({
        type: 'observation',
        text: `${termName}全体の正解率が低めの傾向があり、難易度調整の余地がある可能性があります`,
      });
      improvements.push({
        type: 'suggestion',
        text: '次学期は手がかりが明確なシナリオから始めると成功体験が増える可能性があります',
      });
    }
  }

  // --- Discussion time ---
  if (summary.avgDiscussTime != null) {
    if (summary.avgDiscussTime >= T.DISCUSS_LONG) {
      insights.push({
        type: 'observation',
        text: `${termName}を通して議論時間が長く、意見交換が定着していた可能性があります`,
      });
    } else if (summary.avgDiscussTime < T.DISCUSS_SHORT) {
      insights.push({
        type: 'observation',
        text: `${termName}は議論時間が短めの傾向がありました`,
      });
      improvements.push({
        type: 'suggestion',
        text: '次学期は議論前に「気づいたことを1つメモして」と促すと発言量が増える可能性があります',
      });
    }
  }

  // --- Vote reason rate ---
  const voteReasonRates: number[] = [];
  termLogs.forEach((log) => {
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
        text: `${termName}を通して投票理由の記入率が高く、根拠の言語化が定着しつつあります`,
      });
    } else if (avgReasonRate < T.VOTE_REASON_LOW) {
      improvements.push({
        type: 'suggestion',
        text: '次学期は「なぜその人を選んだ？」と声かけを追加すると理由記入率が上がる可能性があります',
      });
    }
  }

  // --- Evidence discovery ---
  const evidenceCounts = termLogs
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
        text: '次学期は探索時間を少し長めに設定すると証拠発見が増える可能性があります',
      });
    }
  }

  // --- Explore time ---
  const exploreTimes = termLogs
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

  // --- Month-within-term progression ---
  if (monthlyBreakdown.length >= 2) {
    const firstHalf = monthlyBreakdown.slice(0, Math.ceil(monthlyBreakdown.length / 2));
    const secondHalf = monthlyBreakdown.slice(Math.ceil(monthlyBreakdown.length / 2));

    const firstAccuracies = firstHalf
      .filter((m) => m.avgAccuracyRate != null)
      .map((m) => m.avgAccuracyRate!);
    const secondAccuracies = secondHalf
      .filter((m) => m.avgAccuracyRate != null)
      .map((m) => m.avgAccuracyRate!);

    if (firstAccuracies.length > 0 && secondAccuracies.length > 0) {
      const firstAvg = firstAccuracies.reduce((a, b) => a + b, 0) / firstAccuracies.length;
      const secondAvg = secondAccuracies.reduce((a, b) => a + b, 0) / secondAccuracies.length;
      const delta = secondAvg - firstAvg;

      if (delta > T.PROGRESSION_THRESHOLD) {
        insights.push({
          type: 'observation',
          text: `${termName}後半に正解率が向上しており、学習効果が現れている可能性があります`,
        });
      } else if (delta < -T.PROGRESSION_THRESHOLD) {
        insights.push({
          type: 'observation',
          text: `${termName}後半に正解率が低下しており、難易度やモチベーションの変化に注意が必要かもしれません`,
        });
        improvements.push({
          type: 'suggestion',
          text: '学期後半にシナリオのバリエーションを変えると新鮮さを保てる可能性があります',
        });
      }
    }

    // Discussion time progression
    const firstDiscuss = firstHalf
      .filter((m) => m.avgDiscussTime != null)
      .map((m) => m.avgDiscussTime!);
    const secondDiscuss = secondHalf
      .filter((m) => m.avgDiscussTime != null)
      .map((m) => m.avgDiscussTime!);

    if (firstDiscuss.length > 0 && secondDiscuss.length > 0) {
      const firstAvg = firstDiscuss.reduce((a, b) => a + b, 0) / firstDiscuss.length;
      const secondAvg = secondDiscuss.reduce((a, b) => a + b, 0) / secondDiscuss.length;

      if (secondAvg - firstAvg > 120) { // 2 minutes increase
        insights.push({
          type: 'observation',
          text: `${termName}後半にかけて議論時間が伸びており、議論への慣れが見られる傾向があります`,
        });
      }
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
  } else if (scenarioBreakdown.length === 1 && summary.totalSessions >= 3) {
    improvements.push({
      type: 'suggestion',
      text: '次学期は異なるシナリオも試すと、生徒の多角的な思考力が育つ可能性があります',
    });
  }

  // --- Class-level notable patterns ---
  for (const cm of classBreakdown.slice(0, 3)) {
    if (cm.avgAccuracyRate != null && cm.avgAccuracyRate >= T.ACCURACY_HIGH && cm.sessionCount >= 3) {
      insights.push({
        type: 'observation',
        text: `${cm.className}は${termName}を通して正解率が高く、安定した推理力を発揮している傾向があります`,
      });
    }
    if (cm.avgDiscussTime != null && cm.avgDiscussTime >= T.DISCUSS_LONG && cm.sessionCount >= 3) {
      insights.push({
        type: 'observation',
        text: `${cm.className}は${termName}全体を通して議論重視型の授業スタイルが定着している可能性があります`,
      });
    }
  }

  // Ensure at least one improvement
  if (improvements.length === 0 && summary.totalSessions > 0) {
    improvements.push({
      type: 'suggestion',
      text: '次学期も継続的に実施することで、生徒の思考パターンがより明確に見えてくる可能性があります',
    });
  }

  return { insights, improvements };
}
