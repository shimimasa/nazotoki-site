/**
 * Annual Report — Aggregate session data by school year (年度), generate insights.
 *
 * Japanese school year (年度): April of year N – March of year N+1
 *   1学期: April–August
 *   2学期: September–December
 *   3学期: January–March
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
import { getSchoolYear, type TermNumber } from './term-report';
import { filterLogsByTerm, filterStudentLogsByTerm } from './term-report';

// ============================================================
// Types
// ============================================================

/** Per-term sub-metrics within a year */
export interface TermSubMetrics {
  term: TermNumber;
  label: string;
  sessionCount: number;
  avgAccuracyRate: number | null;
  avgDiscussTime: number | null;
  avgExploreTime: number | null;
  avgDuration: number | null;
  avgEvidenceCount: number | null;
  avgVoteReasonRate: number | null;
}

export interface AnnualReportData {
  schoolYear: number;
  generatedAt: string;
  summary: AnnualSummaryMetrics;
  termBreakdown: TermSubMetrics[];
  classBreakdown: ClassAggregateMetrics[];
  scenarioBreakdown: ScenarioAggregateMetrics[];
  studentBreakdown: StudentAggregateMetrics[];
  classInsights: Map<string, ClassInsights>;
  insights: Insight[];
  improvements: Insight[];
}

export interface AnnualSummaryMetrics extends SummaryMetrics {
  avgExploreTime: number | null;
  avgEvidenceCount: number | null;
  avgVoteReasonRate: number | null;
}

export interface AnnualReportListItem {
  schoolYear: number;
  sessionCount: number;
  avgAccuracyRate: number | null;
  termCount: number;
  topInsight: string | null;
}

// ============================================================
// Year utilities
// ============================================================

/** Get all available school years from session logs (sorted newest first) */
export function getAvailableSchoolYears(logs: SessionLogRow[]): number[] {
  const seen = new Set<number>();
  for (const log of logs) {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    seen.add(getSchoolYear(d));
  }
  return Array.from(seen).sort((a, b) => b - a);
}

/** Filter session logs to a specific school year (April N – March N+1) */
export function filterLogsBySchoolYear(
  logs: SessionLogRow[],
  schoolYear: number,
): SessionLogRow[] {
  return logs.filter((log) => {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return getSchoolYear(d) === schoolYear;
  });
}

/** Filter student logs to a specific school year */
export function filterStudentLogsBySchoolYear(
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  schoolYear: number,
): typeof studentLogs {
  return studentLogs.filter((sl) => {
    const d = new Date(sl.created_at);
    return getSchoolYear(d) === schoolYear;
  });
}

/** Human-readable label for a school year */
export function annualLabel(schoolYear: number): string {
  return `${schoolYear}年度`;
}

// ============================================================
// Term sub-metrics within a year
// ============================================================

const TERM_LABELS: Record<TermNumber, string> = {
  1: '1学期',
  2: '2学期',
  3: '3学期',
};

function buildTermSubMetrics(
  yearLogs: SessionLogRow[],
  schoolYear: number,
): TermSubMetrics[] {
  const result: TermSubMetrics[] = [];
  const terms: TermNumber[] = [1, 2, 3];

  for (const term of terms) {
    const termLogs = filterLogsByTerm(yearLogs, schoolYear, term);
    if (termLogs.length === 0) continue;

    const summary = computeSummaryMetrics(termLogs, 0, 0);

    // Explore time
    const exploreTimes = termLogs
      .map((l) => l.phase_durations?.explore)
      .filter((t): t is number => t != null);
    const avgExplore = exploreTimes.length > 0
      ? Math.round(exploreTimes.reduce((a, b) => a + b, 0) / exploreTimes.length)
      : null;

    // Evidence count
    const evidenceCounts = termLogs
      .map((l) => (l.discovered_evidence || []).length)
      .filter((c) => c > 0);
    const avgEvidence = evidenceCounts.length > 0
      ? Math.round((evidenceCounts.reduce((a, b) => a + b, 0) / evidenceCounts.length) * 10) / 10
      : null;

    // Vote reason rate
    const voteReasonRates: number[] = [];
    termLogs.forEach((log) => {
      const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
      if (voters === 0) return;
      const reasons = log.vote_reasons
        ? Object.values(log.vote_reasons).filter((r) => r && r.trim().length > 0).length
        : 0;
      voteReasonRates.push(reasons / voters);
    });
    const avgReasonRate = voteReasonRates.length > 0
      ? voteReasonRates.reduce((a, b) => a + b, 0) / voteReasonRates.length
      : null;

    result.push({
      term,
      label: TERM_LABELS[term],
      sessionCount: termLogs.length,
      avgAccuracyRate: summary.avgAccuracyRate,
      avgDiscussTime: summary.avgDiscussTime,
      avgExploreTime: avgExplore,
      avgDuration: summary.avgDuration,
      avgEvidenceCount: avgEvidence,
      avgVoteReasonRate: avgReasonRate,
    });
  }

  return result;
}

// ============================================================
// Extended summary metrics
// ============================================================

function computeAnnualSummary(
  logs: SessionLogRow[],
  classCount: number,
  studentCount: number,
): AnnualSummaryMetrics {
  const base = computeSummaryMetrics(logs, classCount, studentCount);

  // Explore time
  const exploreTimes = logs
    .map((l) => l.phase_durations?.explore)
    .filter((t): t is number => t != null);
  const avgExplore = exploreTimes.length > 0
    ? Math.round(exploreTimes.reduce((a, b) => a + b, 0) / exploreTimes.length)
    : null;

  // Evidence count
  const evidenceCounts = logs
    .map((l) => (l.discovered_evidence || []).length)
    .filter((c) => c > 0);
  const avgEvidence = evidenceCounts.length > 0
    ? Math.round((evidenceCounts.reduce((a, b) => a + b, 0) / evidenceCounts.length) * 10) / 10
    : null;

  // Vote reason rate
  const voteReasonRates: number[] = [];
  logs.forEach((log) => {
    const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
    if (voters === 0) return;
    const reasons = log.vote_reasons
      ? Object.values(log.vote_reasons).filter((r) => r && r.trim().length > 0).length
      : 0;
    voteReasonRates.push(reasons / voters);
  });
  const avgReasonRate = voteReasonRates.length > 0
    ? voteReasonRates.reduce((a, b) => a + b, 0) / voteReasonRates.length
    : null;

  return {
    ...base,
    avgExploreTime: avgExplore,
    avgEvidenceCount: avgEvidence,
    avgVoteReasonRate: avgReasonRate,
  };
}

// ============================================================
// Core: Build annual report from raw data
// ============================================================

export function buildAnnualReport(
  allLogs: SessionLogRow[],
  classes: { id: string; class_name: string; grade_label: string | null }[],
  students: { id: string; student_name: string; className: string }[],
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  schoolYear: number,
): AnnualReportData {
  const yearLogs = filterLogsBySchoolYear(allLogs, schoolYear);
  const yearStudentLogs = filterStudentLogsBySchoolYear(studentLogs, schoolYear);

  // Active classes and students
  const activeClassIds = new Set(yearLogs.map((l) => l.class_id).filter(Boolean));
  const activeClasses = classes.filter((c) => activeClassIds.has(c.id));
  const activeStudentIds = new Set(yearStudentLogs.map((sl) => sl.student_id));
  const activeStudents = students.filter((s) => activeStudentIds.has(s.id));

  // Summary
  const summary = computeAnnualSummary(yearLogs, activeClasses.length, activeStudents.length);

  // Term breakdown
  const termBreakdown = buildTermSubMetrics(yearLogs, schoolYear);

  // Class breakdown
  const classBreakdown = activeClasses.map((c) =>
    aggregateClassMetrics(c.id, c.class_name, c.grade_label, yearLogs),
  );

  // Scenario breakdown
  const scenarioBreakdown = aggregateScenarioMetrics(yearLogs);

  // Student breakdown
  const studentBreakdown = aggregateStudentMetrics(activeStudents, yearStudentLogs);

  // Class insights
  const classInsights = new Map<string, ClassInsights>();
  classBreakdown.forEach((cm) => {
    classInsights.set(cm.classId, computeClassInsights(cm));
  });

  // Annual insights
  const { insights, improvements } = computeAnnualInsights(
    summary, classBreakdown, scenarioBreakdown, yearLogs, termBreakdown,
  );

  return {
    schoolYear,
    generatedAt: new Date().toISOString(),
    summary,
    termBreakdown,
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

export function buildAnnualReportListItems(logs: SessionLogRow[]): AnnualReportListItem[] {
  const years = getAvailableSchoolYears(logs);

  return years.map((schoolYear) => {
    const yearLogs = filterLogsBySchoolYear(logs, schoolYear);
    const summary = computeSummaryMetrics(yearLogs, 0, 0);

    // Count terms with data
    const termBreakdown = buildTermSubMetrics(yearLogs, schoolYear);

    const { insights } = computeAnnualInsights(summary, [], [], yearLogs, termBreakdown);
    const topInsight = insights.length > 0 ? insights[0].text : null;

    return {
      schoolYear,
      sessionCount: yearLogs.length,
      avgAccuracyRate: summary.avgAccuracyRate,
      termCount: termBreakdown.length,
      topInsight,
    };
  });
}

// ============================================================
// Annual insights (rule-based)
// ============================================================

const T = {
  SESSIONS_ACTIVE: 30,
  SESSIONS_MODERATE: 10,
  SESSIONS_LOW: 5,
  ACCURACY_HIGH: 0.75,
  ACCURACY_LOW: 0.35,
  DISCUSS_LONG: 600,
  DISCUSS_SHORT: 180,
  EXPLORE_SHORT: 180,
  VOTE_REASON_HIGH: 0.7,
  VOTE_REASON_LOW: 0.3,
  EVIDENCE_HIGH: 5,
  EVIDENCE_LOW: 2,
  TERM_PROGRESSION_THRESHOLD: 0.08, // 8pt improvement across terms
  TERM_DISCUSS_INCREASE: 90, // 1.5 min increase
} as const;

function computeAnnualInsights(
  summary: SummaryMetrics | AnnualSummaryMetrics,
  classBreakdown: ClassAggregateMetrics[],
  scenarioBreakdown: ScenarioAggregateMetrics[],
  yearLogs: SessionLogRow[],
  termBreakdown: TermSubMetrics[],
): { insights: Insight[]; improvements: Insight[] } {
  const insights: Insight[] = [];
  const improvements: Insight[] = [];

  // --- Session frequency ---
  if (summary.totalSessions >= T.SESSIONS_ACTIVE) {
    insights.push({
      type: 'observation',
      text: `年度を通して${summary.totalSessions}回の授業を実施し、非常に活発な1年でした`,
    });
  } else if (summary.totalSessions >= T.SESSIONS_MODERATE) {
    insights.push({
      type: 'observation',
      text: `年間${summary.totalSessions}回の授業を実施しました`,
    });
  } else if (summary.totalSessions > 0 && summary.totalSessions < T.SESSIONS_LOW) {
    insights.push({
      type: 'observation',
      text: `年間の実施は${summary.totalSessions}回でした`,
    });
    improvements.push({
      type: 'suggestion',
      text: '次年度は各学期に数回ずつ実施すると、生徒の推理スキル定着が加速する可能性があります',
    });
  }

  // --- Accuracy ---
  if (summary.avgAccuracyRate != null) {
    if (summary.avgAccuracyRate >= T.ACCURACY_HIGH) {
      insights.push({
        type: 'observation',
        text: '年間平均正解率が高く、推理力が安定して発揮されている傾向があります',
      });
    } else if (summary.avgAccuracyRate < T.ACCURACY_LOW) {
      insights.push({
        type: 'observation',
        text: '年間平均正解率が低めの傾向があり、次年度の難易度調整を検討する余地があります',
      });
      improvements.push({
        type: 'suggestion',
        text: '次年度は年度初めに手がかりが明確なシナリオから始めると成功体験が積める可能性があります',
      });
    }
  }

  // --- Discussion time ---
  if (summary.avgDiscussTime != null) {
    if (summary.avgDiscussTime >= T.DISCUSS_LONG) {
      insights.push({
        type: 'observation',
        text: '年間を通して議論時間が長く、意見交換が定着していた可能性があります',
      });
    } else if (summary.avgDiscussTime < T.DISCUSS_SHORT) {
      insights.push({
        type: 'observation',
        text: '年間を通して議論時間が短めの傾向がありました',
      });
      improvements.push({
        type: 'suggestion',
        text: '次年度は議論前に「気づいたことを1つメモして」と促すと発言量が増える可能性があります',
      });
    }
  }

  // --- Vote reason rate ---
  const voteReasonRates: number[] = [];
  yearLogs.forEach((log) => {
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
        text: '年間を通して投票理由の記入率が高く、根拠の言語化が定着しつつあります',
      });
    } else if (avgReasonRate < T.VOTE_REASON_LOW) {
      improvements.push({
        type: 'suggestion',
        text: '次年度は「なぜその人を選んだ？」と声かけを追加すると理由記入率が上がる可能性があります',
      });
    }
  }

  // --- Evidence discovery ---
  const evidenceCounts = yearLogs
    .map((l) => (l.discovered_evidence || []).length)
    .filter((c) => c > 0);
  if (evidenceCounts.length > 0) {
    const avgEvidence = evidenceCounts.reduce((a, b) => a + b, 0) / evidenceCounts.length;
    if (avgEvidence >= T.EVIDENCE_HIGH) {
      insights.push({
        type: 'observation',
        text: '年間を通して証拠発見数が多く、探索活動が充実していた傾向があります',
      });
    } else if (avgEvidence <= T.EVIDENCE_LOW) {
      improvements.push({
        type: 'suggestion',
        text: '次年度は探索時間を少し長めに設定すると証拠発見が増える可能性があります',
      });
    }
  }

  // --- Term progression (the most important annual insight) ---
  if (termBreakdown.length >= 2) {
    // Accuracy progression across terms
    const termsWithAccuracy = termBreakdown.filter((t) => t.avgAccuracyRate != null);
    if (termsWithAccuracy.length >= 2) {
      const first = termsWithAccuracy[0].avgAccuracyRate!;
      const last = termsWithAccuracy[termsWithAccuracy.length - 1].avgAccuracyRate!;
      const delta = last - first;

      if (delta > T.TERM_PROGRESSION_THRESHOLD) {
        insights.push({
          type: 'observation',
          text: `年度を通して正解率が上昇しています（${TERM_LABELS[termsWithAccuracy[0].term]} ${Math.round(first * 100)}% → ${TERM_LABELS[termsWithAccuracy[termsWithAccuracy.length - 1].term]} ${Math.round(last * 100)}%）`,
        });
      } else if (delta < -T.TERM_PROGRESSION_THRESHOLD) {
        insights.push({
          type: 'observation',
          text: `年度後半に正解率が低下しており、難易度やモチベーションの変化に注意が必要かもしれません`,
        });
        improvements.push({
          type: 'suggestion',
          text: '次年度は学期後半にシナリオのバリエーションを変えると新鮮さを保てる可能性があります',
        });
      }
    }

    // Discussion time progression
    const termsWithDiscuss = termBreakdown.filter((t) => t.avgDiscussTime != null);
    if (termsWithDiscuss.length >= 2) {
      const first = termsWithDiscuss[0].avgDiscussTime!;
      const last = termsWithDiscuss[termsWithDiscuss.length - 1].avgDiscussTime!;

      if (last - first > T.TERM_DISCUSS_INCREASE) {
        insights.push({
          type: 'observation',
          text: '議論時間が学期を追うごとに伸びており、議論への慣れが見られる傾向があります',
        });
      }
    }

    // Explore time progression
    const termsWithExplore = termBreakdown.filter((t) => t.avgExploreTime != null);
    if (termsWithExplore.length >= 2) {
      const first = termsWithExplore[0].avgExploreTime!;
      const last = termsWithExplore[termsWithExplore.length - 1].avgExploreTime!;

      if (first - last > 60) {
        insights.push({
          type: 'observation',
          text: '探索時間が短縮されており、効率的な証拠収集が身についてきた可能性があります',
        });
      }
    }

    // Vote reason rate progression
    const termsWithReason = termBreakdown.filter((t) => t.avgVoteReasonRate != null);
    if (termsWithReason.length >= 2) {
      const first = termsWithReason[0].avgVoteReasonRate!;
      const last = termsWithReason[termsWithReason.length - 1].avgVoteReasonRate!;

      if (last - first > 0.15) {
        insights.push({
          type: 'observation',
          text: '理由記入率が年度を通して向上しており、言語化スキルの成長が見られる可能性があります',
        });
      }
    }

    // Session count progression
    const firstTermSessions = termBreakdown[0].sessionCount;
    const lastTermSessions = termBreakdown[termBreakdown.length - 1].sessionCount;
    if (lastTermSessions > firstTermSessions && lastTermSessions >= firstTermSessions * 1.5) {
      insights.push({
        type: 'observation',
        text: '授業回数が年度後半に増加しており、積極的な実施が進んでいます',
      });
    }
  }

  // --- Multi-class usage ---
  if (classBreakdown.length >= 3) {
    insights.push({
      type: 'observation',
      text: `${classBreakdown.length}クラスで実施しており、学校全体での活用が進んでいます`,
    });
  } else if (classBreakdown.length >= 2) {
    insights.push({
      type: 'observation',
      text: `${classBreakdown.length}クラスで実施しています`,
    });
  }

  // --- Scenario variety ---
  if (scenarioBreakdown.length >= 5) {
    insights.push({
      type: 'observation',
      text: `年間${scenarioBreakdown.length}種類のシナリオを使用し、多様な題材に触れています`,
    });
  } else if (scenarioBreakdown.length >= 1 && scenarioBreakdown.length <= 2 && summary.totalSessions >= 5) {
    improvements.push({
      type: 'suggestion',
      text: '次年度はより多くのシナリオを試すと、生徒の多角的な思考力が育つ可能性があります',
    });
  }

  // --- Term coverage ---
  if (termBreakdown.length === 3) {
    insights.push({
      type: 'observation',
      text: '全3学期で授業を実施しており、年間を通して継続的に取り組んでいます',
    });
  } else if (termBreakdown.length === 1) {
    improvements.push({
      type: 'suggestion',
      text: '次年度は複数の学期にわたって実施すると、成長の推移が見えやすくなる可能性があります',
    });
  }

  // --- Class-level notable patterns ---
  for (const cm of classBreakdown.slice(0, 3)) {
    if (cm.avgAccuracyRate != null && cm.avgAccuracyRate >= T.ACCURACY_HIGH && cm.sessionCount >= 5) {
      insights.push({
        type: 'observation',
        text: `${cm.className}は年間を通して正解率が高く、安定した推理力を発揮している傾向があります`,
      });
    }
  }

  // Ensure at least one improvement
  if (improvements.length === 0 && summary.totalSessions > 0) {
    improvements.push({
      type: 'suggestion',
      text: '次年度も継続的に実施することで、年間の成長曲線がより明確に見えてくる可能性があります',
    });
  }

  return { insights, improvements };
}
