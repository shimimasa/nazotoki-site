/**
 * Admin Dashboard — School-level KPI, class/scenario status, and admin insights.
 *
 * Pure functions: (report data) → admin view models. No side effects, no DB calls.
 * Designed for school administrators (principals, vice-principals, ICT leads).
 */

import type { SessionLogRow } from './supabase';
import type { ClassAggregateMetrics } from './session-analytics';
import type { SchoolSummaryMetrics, SchoolScenarioMetrics, SchoolReportData } from './school-report';
import type { Insight } from './session-insights';

// ============================================================
// Types
// ============================================================

export interface AdminKPI {
  totalSessions: number;
  activeClassCount: number;
  totalStudents: number;
  avgAccuracyRate: number | null;
  avgDiscussTime: number | null;
  avgExploreTime: number | null;
  uniqueScenarioCount: number;
  last30DaySessions: number;
  lowActivityClassCount: number;
  classGapPt: number | null; // percentage points (0-100 scale)
}

export type ClassStatusLabel = '活用中' | '導入段階' | '低活用';

export interface ClassStatus {
  classId: string;
  className: string;
  gradeLabel: string | null;
  sessionCount: number;
  avgAccuracyRate: number | null;
  avgDiscussTime: number | null;
  avgExploreTime: number | null;
  lastSessionDate: string | null;
  statusLabel: ClassStatusLabel;
}

export type ScenarioStatusLabel = 'よく使われている' | '継続活用候補' | '試行段階';

export interface ScenarioStatus {
  slug: string;
  title: string;
  sessionCount: number;
  classCount: number;
  avgAccuracyRate: number | null;
  avgDuration: number | null;
  statusLabel: ScenarioStatusLabel;
}

// ============================================================
// Status Label Logic
// ============================================================

function classStatusLabel(sessionCount: number): ClassStatusLabel {
  if (sessionCount >= 5) return '活用中';
  if (sessionCount >= 2) return '導入段階';
  return '低活用';
}

function scenarioStatusLabel(sessionCount: number): ScenarioStatusLabel {
  if (sessionCount >= 5) return 'よく使われている';
  if (sessionCount >= 2) return '継続活用候補';
  return '試行段階';
}

// ============================================================
// KPI Computation
// ============================================================

export function computeAdminKPI(
  summary: SchoolSummaryMetrics,
  classMetrics: ClassAggregateMetrics[],
  logs: SessionLogRow[],
): AdminKPI {
  const activeClasses = classMetrics.filter((c) => c.sessionCount > 0);
  const lowActivity = classMetrics.filter((c) => c.sessionCount <= 1);

  // Last 30 days
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const last30 = logs.filter((l) => new Date(l.created_at).getTime() >= thirtyDaysAgo).length;

  // Class gap (max - min accuracy among classes with >= 2 sessions)
  let classGapPt: number | null = null;
  const withAccuracy = activeClasses.filter((c) => c.avgAccuracyRate != null && c.sessionCount >= 2);
  if (withAccuracy.length >= 2) {
    const rates = withAccuracy.map((c) => c.avgAccuracyRate!);
    classGapPt = Math.round((Math.max(...rates) - Math.min(...rates)) * 100);
  }

  return {
    totalSessions: summary.totalSessions,
    activeClassCount: activeClasses.length,
    totalStudents: summary.totalStudents,
    avgAccuracyRate: summary.avgAccuracyRate,
    avgDiscussTime: summary.avgDiscussTime,
    avgExploreTime: summary.avgExploreTime,
    uniqueScenarioCount: summary.uniqueScenarioCount,
    last30DaySessions: last30,
    lowActivityClassCount: lowActivity.length,
    classGapPt,
  };
}

// ============================================================
// Class Status
// ============================================================

export function computeAdminClassStatus(
  classMetrics: ClassAggregateMetrics[],
): ClassStatus[] {
  return classMetrics
    .map((c) => ({
      classId: c.classId,
      className: c.className,
      gradeLabel: c.gradeLabel,
      sessionCount: c.sessionCount,
      avgAccuracyRate: c.avgAccuracyRate,
      avgDiscussTime: c.avgDiscussTime,
      avgExploreTime: c.avgExploreTime,
      lastSessionDate: c.lastSessionDate,
      statusLabel: classStatusLabel(c.sessionCount),
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

// ============================================================
// Scenario Status
// ============================================================

export function computeAdminScenarioStatus(
  scenarioMetrics: SchoolScenarioMetrics[],
): ScenarioStatus[] {
  return scenarioMetrics
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      sessionCount: s.sessionCount,
      classCount: s.classCount,
      avgAccuracyRate: s.avgAccuracyRate,
      avgDuration: s.avgDuration,
      statusLabel: scenarioStatusLabel(s.sessionCount),
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

// ============================================================
// Admin Insights
// ============================================================

const TH = {
  SESSIONS_SOLID: 10,
  SESSIONS_FEW: 3,
  ACCURACY_HIGH: 0.7,
  ACCURACY_LOW: 0.35,
  SCENARIOS_DIVERSE: 5,
  CLASS_GAP_HIGH: 30, // percentage points
  RECENT_ACTIVE_RATIO: 0.3,
} as const;

export function computeAdminInsights(
  kpi: AdminKPI,
  classStatuses: ClassStatus[],
  scenarioStatuses: ScenarioStatus[],
  rangeLabel: string = '全期間',
): Insight[] {
  const insights: Insight[] = [];
  const isAll = rangeLabel === '全期間';
  const prefix = isAll ? '学校全体で' : `${rangeLabel}では、`;

  // 1. Session volume
  if (kpi.totalSessions >= TH.SESSIONS_SOLID) {
    insights.push({
      type: 'observation',
      text: `${prefix}${kpi.totalSessions}回の授業実施が進んでおり、十分な運用実績が蓄積しています`,
    });
  } else if (kpi.totalSessions >= TH.SESSIONS_FEW) {
    insights.push({
      type: 'observation',
      text: `${prefix}${kpi.totalSessions}回の授業が実施されています`,
    });
  } else if (kpi.totalSessions > 0) {
    insights.push({
      type: 'suggestion',
      text: `${prefix}授業実施がまだ少ないため、各クラスでの活用促進が効果的です`,
    });
  }

  // 2. Low activity classes
  if (kpi.lowActivityClassCount > 0 && kpi.activeClassCount > 0) {
    insights.push({
      type: 'suggestion',
      text: `${kpi.lowActivityClassCount}クラスで活用頻度が低く、導入支援の優先候補かもしれません`,
    });
  }

  // 3. Scenario diversity
  if (kpi.uniqueScenarioCount >= TH.SCENARIOS_DIVERSE) {
    insights.push({
      type: 'observation',
      text: `${kpi.uniqueScenarioCount}種類のシナリオが使用されており、教材運用の幅が広がっています`,
    });
  }

  // 4. Class gap
  if (kpi.classGapPt != null && kpi.classGapPt >= TH.CLASS_GAP_HIGH) {
    insights.push({
      type: 'suggestion',
      text: `クラス間で正解率に${kpi.classGapPt}ptの差が見られ、支援配分の見直しが有効かもしれません`,
    });
  }

  // 5. Accuracy level
  if (kpi.avgAccuracyRate != null && kpi.avgAccuracyRate >= TH.ACCURACY_HIGH) {
    insights.push({
      type: 'observation',
      text: `${isAll ? '学校全体の' : `${rangeLabel}の`}正解率が高く、生徒の理解度は良好な水準です`,
    });
  } else if (kpi.avgAccuracyRate != null && kpi.avgAccuracyRate < TH.ACCURACY_LOW) {
    insights.push({
      type: 'suggestion',
      text: '正解率が低めの傾向があり、シナリオ難易度の見直しや授業前の導入説明の強化が考えられます',
    });
  }

  // 6. Recent activity (only meaningful for 'all' or long periods)
  if (isAll && kpi.totalSessions > 0) {
    if (kpi.last30DaySessions === 0) {
      insights.push({
        type: 'suggestion',
        text: '直近30日間で授業実施がありません。学期の進行状況に合わせた活用促進が有効です',
      });
    } else if (kpi.last30DaySessions > kpi.totalSessions * TH.RECENT_ACTIVE_RATIO) {
      insights.push({
        type: 'observation',
        text: `直近30日で${kpi.last30DaySessions}回の授業があり、活発に活用されています`,
      });
    }
  }

  // Fallback: ensure at least one insight
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: isAll
        ? '現在のデータからは特筆すべき傾向は見られません。授業実施データの蓄積に伴い、より詳細な分析が可能になります'
        : `${rangeLabel}のデータからは特筆すべき傾向は見られません`,
    });
  }

  return insights;
}
