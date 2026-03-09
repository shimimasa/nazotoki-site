/**
 * School Report — School-level aggregation and insights.
 *
 * Pure functions: (logs, classes, students, studentLogs) → SchoolReportData.
 * No side effects, no DB calls.
 *
 * MVP scope: "all classes owned by this teacher" = school equivalent.
 * When school_id is introduced, only the fetch layer changes.
 */

import type { SessionLogRow } from './supabase';
import type { StudentLogSummary } from './supabase';
import {
  aggregateClassMetrics,
  aggregateScenarioMetrics,
  aggregateStudentMetrics,
  type ClassAggregateMetrics,
  type ScenarioAggregateMetrics,
  type StudentAggregateMetrics,
} from './session-analytics';
import type { Insight } from './session-insights';

// ============================================================
// Types
// ============================================================

export interface SchoolSummaryMetrics {
  totalSessions: number;
  totalClasses: number;
  totalStudents: number;
  avgAccuracyRate: number | null;
  avgDuration: number | null;
  avgDiscussTime: number | null;
  avgExploreTime: number | null;
  avgEvidenceCount: number | null;
  avgVoteReasonRate: number | null;
  uniqueScenarioCount: number;
}

export interface SchoolScenarioMetrics extends ScenarioAggregateMetrics {
  classCount: number;
}

export interface SchoolReportData {
  summary: SchoolSummaryMetrics;
  classBreakdown: ClassAggregateMetrics[];
  scenarioBreakdown: SchoolScenarioMetrics[];
  studentBreakdown: StudentAggregateMetrics[];
  insights: Insight[];
  generatedAt: string;
}

// ============================================================
// Helpers
// ============================================================

function avgOfNonNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function avgAccuracy(logs: SessionLogRow[]): number | null {
  const rates = logs.map((log) => {
    const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
    if (voters === 0) return null;
    const correct = (log.correct_players || []).length;
    return correct / voters;
  }).filter((r): r is number => r != null);
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

// ============================================================
// School Summary
// ============================================================

export function computeSchoolSummary(
  logs: SessionLogRow[],
  classCount: number,
  studentCount: number,
): SchoolSummaryMetrics {
  const avgDuration = avgOfNonNull(logs.map((l) => l.duration));

  const withPhases = logs.filter((l) => l.phase_durations);
  const avgDiscuss = avgOfNonNull(withPhases.map((l) => l.phase_durations?.discuss ?? null));
  const avgExplore = avgOfNonNull(withPhases.map((l) => l.phase_durations?.explore ?? null));

  // Evidence
  const withEvidence = logs.filter((l) => l.discovered_evidence);
  const avgEvidence = withEvidence.length > 0
    ? Math.round(
        (withEvidence.reduce((s, l) => s + (l.discovered_evidence?.length || 0), 0) / withEvidence.length) * 10,
      ) / 10
    : null;

  // Vote reason rate
  const withVotes = logs.filter((l) => l.vote_results && Object.keys(l.vote_results).length > 0);
  const avgVoteReason = withVotes.length > 0
    ? withVotes.reduce((sum, l) => {
        const total = Object.keys(l.vote_results!).length;
        const reasons = l.vote_reasons
          ? Object.values(l.vote_reasons).filter((r) => r && r.trim().length > 0).length
          : 0;
        return sum + (total > 0 ? reasons / total : 0);
      }, 0) / withVotes.length
    : null;

  const uniqueSlugs = new Set(logs.map((l) => l.scenario_slug));

  return {
    totalSessions: logs.length,
    totalClasses: classCount,
    totalStudents: studentCount,
    avgAccuracyRate: avgAccuracy(logs),
    avgDuration,
    avgDiscussTime: avgDiscuss,
    avgExploreTime: avgExplore,
    avgEvidenceCount: avgEvidence,
    avgVoteReasonRate: avgVoteReason,
    uniqueScenarioCount: uniqueSlugs.size,
  };
}

// ============================================================
// School Scenario Metrics (with classCount)
// ============================================================

function computeSchoolScenarioMetrics(logs: SessionLogRow[]): SchoolScenarioMetrics[] {
  const base = aggregateScenarioMetrics(logs);

  // Count distinct classes per scenario
  const classesPerScenario = new Map<string, Set<string>>();
  logs.forEach((l) => {
    if (!l.class_id) return;
    const set = classesPerScenario.get(l.scenario_slug) || new Set();
    set.add(l.class_id);
    classesPerScenario.set(l.scenario_slug, set);
  });

  return base.map((s) => ({
    ...s,
    classCount: classesPerScenario.get(s.slug)?.size || 0,
  }));
}

// ============================================================
// School Insights
// ============================================================

const ST = {
  SESSIONS_SUFFICIENT: 10,
  SESSIONS_FEW: 3,
  ACCURACY_HIGH: 0.7,
  ACCURACY_LOW: 0.35,
  DISCUSS_STABLE: 600,
  SCENARIOS_DIVERSE: 5,
  VOTE_REASON_HIGH: 0.7,
  CLASS_ACCURACY_GAP: 0.3,
} as const;

export function computeSchoolInsights(
  summary: SchoolSummaryMetrics,
  classMetrics: ClassAggregateMetrics[],
): Insight[] {
  const insights: Insight[] = [];

  // Activity level
  if (summary.totalSessions >= ST.SESSIONS_SUFFICIENT) {
    insights.push({
      type: 'observation',
      text: `学校全体で${summary.totalSessions}回の授業実績があり、十分なデータに基づく傾向分析が可能です`,
    });
  } else if (summary.totalSessions < ST.SESSIONS_FEW) {
    insights.push({
      type: 'observation',
      text: 'まだ授業数が少ないため、傾向の把握には追加データが必要です',
    });
  }

  // Accuracy
  if (summary.avgAccuracyRate != null && summary.avgAccuracyRate >= ST.ACCURACY_HIGH) {
    insights.push({
      type: 'observation',
      text: '学校全体の正解率が高く、生徒の理解度は良好な傾向です',
    });
  } else if (summary.avgAccuracyRate != null && summary.avgAccuracyRate < ST.ACCURACY_LOW) {
    insights.push({
      type: 'suggestion',
      text: '正解率が低めの傾向があり、導入支援やシナリオ難易度の見直しが有効かもしれません',
    });
  }

  // Discussion time
  if (summary.avgDiscussTime != null && summary.avgDiscussTime >= ST.DISCUSS_STABLE) {
    insights.push({
      type: 'observation',
      text: '議論時間が安定しており、意見交換型の授業が定着しつつあります',
    });
  }

  // Scenario diversity
  if (summary.uniqueScenarioCount >= ST.SCENARIOS_DIVERSE) {
    insights.push({
      type: 'observation',
      text: `${summary.uniqueScenarioCount}種類のシナリオが使用されており、教材運用の幅が広がっています`,
    });
  }

  // Vote reason rate
  if (summary.avgVoteReasonRate != null && summary.avgVoteReasonRate >= ST.VOTE_REASON_HIGH) {
    insights.push({
      type: 'observation',
      text: '投票理由の記入率が高く、思考の言語化が進んでいます',
    });
  }

  // Class gap analysis
  if (classMetrics.length >= 2) {
    const withAccuracy = classMetrics.filter((c) => c.avgAccuracyRate != null && c.sessionCount >= 2);
    if (withAccuracy.length >= 2) {
      const rates = withAccuracy.map((c) => c.avgAccuracyRate!);
      const maxRate = Math.max(...rates);
      const minRate = Math.min(...rates);
      if (maxRate - minRate >= ST.CLASS_ACCURACY_GAP) {
        insights.push({
          type: 'suggestion',
          text: 'クラス間で正解率に差があり、個別の支援配分の見直しが有効かもしれません',
        });
      }
    }
  }

  // Low-activity classes
  const lowActivity = classMetrics.filter((c) => c.sessionCount <= 1);
  if (lowActivity.length > 0 && classMetrics.length > lowActivity.length) {
    insights.push({
      type: 'suggestion',
      text: `${lowActivity.length}クラスで授業実施が1回以下です。活用促進の声かけが効果的かもしれません`,
    });
  }

  return insights;
}

// ============================================================
// Build School Report
// ============================================================

export function buildSchoolReport(
  logs: SessionLogRow[],
  classes: { id: string; class_name: string; grade_label: string | null }[],
  students: { id: string; student_name: string; className: string }[],
  studentLogs: StudentLogSummary[],
): SchoolReportData {
  const summary = computeSchoolSummary(logs, classes.length, students.length);

  const classBreakdown = classes
    .map((c) => aggregateClassMetrics(c.id, c.class_name, c.grade_label, logs))
    .filter((c) => c.sessionCount > 0)
    .sort((a, b) => b.sessionCount - a.sessionCount);

  const scenarioBreakdown = computeSchoolScenarioMetrics(logs);

  const studentBreakdown = aggregateStudentMetrics(students, studentLogs);

  const insights = computeSchoolInsights(summary, classBreakdown);

  return {
    summary,
    classBreakdown,
    scenarioBreakdown,
    studentBreakdown,
    insights,
    generatedAt: new Date().toISOString(),
  };
}
