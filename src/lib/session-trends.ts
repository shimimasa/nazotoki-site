/**
 * Session Trends — Time-series analysis for tracking growth over time.
 *
 * Pure functions: (data) → trends + insights. No side effects.
 */

import type { SessionLogRow } from './supabase';
import type { Insight } from './session-insights';

// ============================================================
// Types
// ============================================================

export interface TrendPoint {
  sessionNumber: number;
  date: string;
  scenarioTitle: string;
  accuracyRate: number | null;
  discussTime: number | null;
  exploreTime: number | null;
  evidenceCount: number;
  voteReasonRate: number | null;
  duration: number | null;
}

export interface ClassTrend {
  classId: string;
  className: string;
  gradeLabel: string | null;
  points: TrendPoint[];
  insights: Insight[];
}

export interface ScenarioTrend {
  slug: string;
  title: string;
  points: TrendPoint[];
}

export interface StudentTrendPoint {
  sessionNumber: number;
  date: string;
  isCorrect: boolean | null;
  hasReason: boolean;
}

export interface StudentTrend {
  studentId: string;
  studentName: string;
  className: string;
  points: StudentTrendPoint[];
  insights: Insight[];
}

// ============================================================
// Constants
// ============================================================

const MIN_POINTS_FOR_TREND = 3;
const TREND_THRESHOLD = 0.15; // 15% change to detect trend

// ============================================================
// Helpers
// ============================================================

function toTrendPoint(log: SessionLogRow, index: number): TrendPoint {
  const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
  const correct = (log.correct_players || []).length;
  const reasons = log.vote_reasons
    ? Object.values(log.vote_reasons).filter((r) => r && r.trim().length > 0).length
    : 0;

  return {
    sessionNumber: index + 1,
    date: log.start_time || log.created_at,
    scenarioTitle: log.scenario_title || log.scenario_slug,
    accuracyRate: voters > 0 ? correct / voters : null,
    discussTime: log.phase_durations?.discuss ?? null,
    exploreTime: log.phase_durations?.explore ?? null,
    evidenceCount: (log.discovered_evidence || []).length,
    voteReasonRate: voters > 0 ? reasons / voters : null,
    duration: log.duration,
  };
}

function sortByDate(logs: SessionLogRow[]): SessionLogRow[] {
  return [...logs].sort((a, b) => {
    const da = a.start_time || a.created_at;
    const db = b.start_time || b.created_at;
    return da.localeCompare(db);
  });
}

/** Compare first half vs second half averages. */
function detectTrend(values: (number | null)[]): 'up' | 'down' | 'stable' | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < MIN_POINTS_FOR_TREND) return null;

  const mid = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, mid);
  const secondHalf = valid.slice(-mid);

  if (firstHalf.length === 0 || secondHalf.length === 0) return null;

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  // For near-zero baselines, use absolute difference
  const baseline = Math.max(Math.abs(firstAvg), 0.05);
  const change = (secondAvg - firstAvg) / baseline;

  if (change > TREND_THRESHOLD) return 'up';
  if (change < -TREND_THRESHOLD) return 'down';
  return 'stable';
}

// ============================================================
// 1. Class trends
// ============================================================

export function computeClassTrends(
  classes: { id: string; class_name: string; grade_label: string | null }[],
  logs: SessionLogRow[],
): ClassTrend[] {
  return classes
    .map((cls) => {
      const classLogs = sortByDate(logs.filter((l) => l.class_id === cls.id));
      const points = classLogs.map((l, i) => toTrendPoint(l, i));
      const insights = computeTrendInsights(points);

      return {
        classId: cls.id,
        className: cls.class_name,
        gradeLabel: cls.grade_label,
        points,
        insights,
      };
    })
    .filter((t) => t.points.length >= 2);
}

// ============================================================
// 2. Scenario trends
// ============================================================

export function computeScenarioTrends(logs: SessionLogRow[]): ScenarioTrend[] {
  const grouped = new Map<string, SessionLogRow[]>();
  logs.forEach((l) => {
    const arr = grouped.get(l.scenario_slug) || [];
    arr.push(l);
    grouped.set(l.scenario_slug, arr);
  });

  return Array.from(grouped.entries())
    .map(([slug, scenarioLogs]) => {
      const sorted = sortByDate(scenarioLogs);
      return {
        slug,
        title: sorted[0].scenario_title || slug,
        points: sorted.map((l, i) => toTrendPoint(l, i)),
      };
    })
    .filter((t) => t.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length);
}

// ============================================================
// 3. Student trends
// ============================================================

export function computeStudentTrends(
  students: { id: string; student_name: string; className: string }[],
  studentLogs: {
    student_id: string;
    is_correct: boolean | null;
    vote_reason: string | null;
    created_at: string;
  }[],
): StudentTrend[] {
  const logsByStudent = new Map<string, typeof studentLogs>();
  studentLogs.forEach((sl) => {
    const arr = logsByStudent.get(sl.student_id) || [];
    arr.push(sl);
    logsByStudent.set(sl.student_id, arr);
  });

  return students
    .map((s) => {
      const sLogs = (logsByStudent.get(s.id) || []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );

      const points: StudentTrendPoint[] = sLogs.map((l, i) => ({
        sessionNumber: i + 1,
        date: l.created_at,
        isCorrect: l.is_correct,
        hasReason: !!(l.vote_reason && l.vote_reason.trim().length > 0),
      }));

      const insights: Insight[] = [];
      if (points.length >= MIN_POINTS_FOR_TREND) {
        // Accuracy trend
        const withResult = points.filter((p) => p.isCorrect != null);
        if (withResult.length >= MIN_POINTS_FOR_TREND) {
          const mid = Math.floor(withResult.length / 2);
          const firstCorrect =
            withResult.slice(0, mid).filter((p) => p.isCorrect).length / mid;
          const lastCorrect =
            withResult.slice(-mid).filter((p) => p.isCorrect).length / mid;
          if (lastCorrect > firstCorrect + TREND_THRESHOLD) {
            insights.push({
              type: 'observation',
              text: '正解率が上昇傾向にあります',
            });
          } else if (firstCorrect > lastCorrect + TREND_THRESHOLD) {
            insights.push({
              type: 'observation',
              text: '正解率が低下傾向にあります',
            });
          }
        }

        // Reason writing trend
        const reasonCount = points.filter((p) => p.hasReason).length;
        if (reasonCount > points.length * 0.5) {
          insights.push({
            type: 'observation',
            text: '投票理由の記入が定着している傾向があります',
          });
        }
      }

      return {
        studentId: s.id,
        studentName: s.student_name,
        className: s.className,
        points,
        insights,
      };
    })
    .filter((t) => t.points.length >= 2);
}

// ============================================================
// 4. Trend insights (for class/scenario point series)
// ============================================================

function computeTrendInsights(points: TrendPoint[]): Insight[] {
  if (points.length < MIN_POINTS_FOR_TREND) return [];

  const insights: Insight[] = [];

  // Accuracy
  const accTrend = detectTrend(points.map((p) => p.accuracyRate));
  if (accTrend === 'up') {
    insights.push({
      type: 'observation',
      text: '正解率が上昇傾向にあります',
    });
  } else if (accTrend === 'down') {
    insights.push({
      type: 'observation',
      text: '正解率が低下傾向にあり、難易度の調整が必要かもしれません',
    });
  } else if (accTrend === 'stable') {
    const avg = points
      .map((p) => p.accuracyRate)
      .filter((v): v is number => v != null);
    if (
      avg.length > 0 &&
      avg.reduce((a, b) => a + b, 0) / avg.length >= 0.7
    ) {
      insights.push({
        type: 'observation',
        text: '正解率が安定して高い水準を維持しています',
      });
    }
  }

  // Discuss time
  const disTrend = detectTrend(points.map((p) => p.discussTime));
  if (disTrend === 'up') {
    insights.push({
      type: 'observation',
      text: '議論時間が増加傾向にあり、意見交換が定着している可能性があります',
    });
  } else if (disTrend === 'down') {
    insights.push({
      type: 'observation',
      text: '議論時間が減少傾向にあります',
    });
  }

  // Explore time
  const expTrend = detectTrend(points.map((p) => p.exploreTime));
  if (expTrend === 'down') {
    insights.push({
      type: 'observation',
      text: '探索時間が減少傾向にあり、証拠確認を短く済ませる傾向があります',
    });
  } else if (expTrend === 'up') {
    insights.push({
      type: 'observation',
      text: '探索時間が増加しており、証拠をじっくり確認する姿勢が育っている可能性があります',
    });
  }

  // Vote reason rate
  const vrTrend = detectTrend(points.map((p) => p.voteReasonRate));
  if (vrTrend === 'up') {
    insights.push({
      type: 'observation',
      text: '投票理由の記入率が上昇しており、根拠の言語化が育っている可能性があります',
    });
  }

  // Evidence
  const evTrend = detectTrend(points.map((p) => p.evidenceCount));
  if (evTrend === 'up') {
    insights.push({
      type: 'observation',
      text: '発見する証拠の数が増えており、探索力が育っている可能性があります',
    });
  }

  return insights;
}
