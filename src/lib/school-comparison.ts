/**
 * School Comparison — Compare two school reports across periods.
 *
 * Pure functions: (current, previous) → comparison. No side effects.
 *
 * Reuses DeltaValue, formatDeltaDisplay, deltaColorClass from monthly-comparison.ts.
 */

import type { SchoolReportData, SchoolSummaryMetrics, SchoolScenarioMetrics } from './school-report';
import type { ClassAggregateMetrics } from './session-analytics';
import type { Insight } from './session-insights';
import { type DeltaValue, formatDeltaDisplay, deltaColorClass } from './monthly-comparison';
import {
  filterSessionsByRange,
  dateRangeLabel,
  type DateRange,
  type DateRangeType,
} from './analytics-export';
import type { SessionLogRow } from './supabase';

// Re-export shared helpers for convenience
export { formatDeltaDisplay, deltaColorClass, type DeltaValue };

// ============================================================
// Types
// ============================================================

export interface SchoolSummaryDeltas {
  sessions: DeltaValue;
  classes: DeltaValue;
  students: DeltaValue;
  accuracyRate: DeltaValue;
  duration: DeltaValue;
  discussTime: DeltaValue;
  exploreTime: DeltaValue;
  voteReasonRate: DeltaValue;
  evidenceCount: DeltaValue;
  scenarioCount: DeltaValue;
}

export interface SchoolClassDelta {
  classId: string;
  className: string;
  gradeLabel: string | null;
  currentSessions: number;
  previousSessions: number;
  currentAccuracy: number | null;
  previousAccuracy: number | null;
  accuracyDelta: number | null;
  currentDiscussTime: number | null;
  previousDiscussTime: number | null;
  discussDelta: number | null;
  currentExploreTime: number | null;
  previousExploreTime: number | null;
  exploreDelta: number | null;
}

export interface SchoolScenarioDelta {
  slug: string;
  title: string;
  currentSessions: number;
  previousSessions: number;
  currentAccuracy: number | null;
  previousAccuracy: number | null;
  accuracyDelta: number | null;
  currentDuration: number | null;
  previousDuration: number | null;
  durationDelta: number | null;
}

export interface SchoolComparison {
  currentLabel: string;
  previousLabel: string;
  deltas: SchoolSummaryDeltas;
  classDeltas: SchoolClassDelta[];
  scenarioDeltas: SchoolScenarioDelta[];
  insights: Insight[];
}

// ============================================================
// Helpers
// ============================================================

function delta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

function makeDeltaValue(current: number | null, previous: number | null): DeltaValue {
  return { current, previous, delta: delta(current, previous) };
}

// ============================================================
// Previous period logic
// ============================================================

/**
 * Get the previous period DateRange for a given school report range type.
 * Returns null for 'all' (no comparison).
 */
export function getSchoolComparisonRange(
  rangeType: DateRangeType,
): DateRange | null {
  const now = new Date();

  switch (rangeType) {
    case 'all':
      return null; // No comparison for "all time"

    case 'last30': {
      // Previous 30 days: 60 days ago to 30 days ago
      const end = new Date(now);
      end.setDate(end.getDate() - 30);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return {
        type: 'custom',
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      };
    }

    case 'thisTerm': {
      // Previous term
      const m = now.getMonth() + 1;
      const year = m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      let termStart: Date;
      let termEnd: Date;
      if (m >= 4 && m <= 8) {
        // Current = 1学期 (Apr-Aug) → Previous = 3学期 (Jan-Mar) of same school year
        termStart = new Date(year, 0, 1);    // Jan 1
        termEnd = new Date(year, 2, 31);     // Mar 31
      } else if (m >= 9 && m <= 12) {
        // Current = 2学期 (Sep-Dec) → Previous = 1学期 (Apr-Aug)
        termStart = new Date(year, 3, 1);    // Apr 1
        termEnd = new Date(year, 7, 31);     // Aug 31
      } else {
        // Current = 3学期 (Jan-Mar) → Previous = 2学期 (Sep-Dec)
        termStart = new Date(year, 8, 1);    // Sep 1
        termEnd = new Date(year, 11, 31);    // Dec 31
      }
      return {
        type: 'custom',
        start: termStart.toISOString().slice(0, 10),
        end: termEnd.toISOString().slice(0, 10),
      };
    }

    case 'thisYear': {
      // Previous school year (Apr 1 of year-1 to Mar 31 of year)
      const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const prevStart = new Date(year - 1, 3, 1);    // Apr 1 of prev year
      const prevEnd = new Date(year, 2, 31);          // Mar 31 of current year boundary
      return {
        type: 'custom',
        start: prevStart.toISOString().slice(0, 10),
        end: prevEnd.toISOString().slice(0, 10),
      };
    }

    default:
      return null;
  }
}

/**
 * Get the label for the previous period.
 */
export function getSchoolComparisonLabel(rangeType: DateRangeType): string {
  switch (rangeType) {
    case 'last30': return '前30日';
    case 'thisTerm': {
      const now = new Date();
      const m = now.getMonth() + 1;
      if (m >= 4 && m <= 8) return '前学期（3学期）';
      if (m >= 9 && m <= 12) return '前学期（1学期）';
      return '前学期（2学期）';
    }
    case 'thisYear': return '前年度';
    default: return '';
  }
}

// ============================================================
// Core: Compare two school reports
// ============================================================

export function compareSchoolReports(
  current: SchoolReportData,
  previous: SchoolReportData,
  currentLabel: string,
  previousLabel: string,
): SchoolComparison {
  const curS = current.summary;
  const prevS = previous.summary;

  const deltas: SchoolSummaryDeltas = {
    sessions: makeDeltaValue(curS.totalSessions, prevS.totalSessions),
    classes: makeDeltaValue(curS.totalClasses, prevS.totalClasses),
    students: makeDeltaValue(curS.totalStudents, prevS.totalStudents),
    accuracyRate: makeDeltaValue(curS.avgAccuracyRate, prevS.avgAccuracyRate),
    duration: makeDeltaValue(curS.avgDuration, prevS.avgDuration),
    discussTime: makeDeltaValue(curS.avgDiscussTime, prevS.avgDiscussTime),
    exploreTime: makeDeltaValue(curS.avgExploreTime, prevS.avgExploreTime),
    voteReasonRate: makeDeltaValue(curS.avgVoteReasonRate, prevS.avgVoteReasonRate),
    evidenceCount: makeDeltaValue(curS.avgEvidenceCount, prevS.avgEvidenceCount),
    scenarioCount: makeDeltaValue(curS.uniqueScenarioCount, prevS.uniqueScenarioCount),
  };

  // Class-level deltas
  const classMap = new Map<string, {
    name: string;
    grade: string | null;
    cur: ClassAggregateMetrics | null;
    prev: ClassAggregateMetrics | null;
  }>();

  current.classBreakdown.forEach((c) => {
    classMap.set(c.classId, { name: c.className, grade: c.gradeLabel, cur: c, prev: null });
  });
  previous.classBreakdown.forEach((c) => {
    const existing = classMap.get(c.classId);
    if (existing) {
      existing.prev = c;
    } else {
      classMap.set(c.classId, { name: c.className, grade: c.gradeLabel, cur: null, prev: c });
    }
  });

  const classDeltas: SchoolClassDelta[] = Array.from(classMap.entries())
    .map(([classId, { name, grade, cur, prev }]) => ({
      classId,
      className: name,
      gradeLabel: grade,
      currentSessions: cur?.sessionCount ?? 0,
      previousSessions: prev?.sessionCount ?? 0,
      currentAccuracy: cur?.avgAccuracyRate ?? null,
      previousAccuracy: prev?.avgAccuracyRate ?? null,
      accuracyDelta: delta(cur?.avgAccuracyRate ?? null, prev?.avgAccuracyRate ?? null),
      currentDiscussTime: cur?.avgDiscussTime ?? null,
      previousDiscussTime: prev?.avgDiscussTime ?? null,
      discussDelta: delta(cur?.avgDiscussTime ?? null, prev?.avgDiscussTime ?? null),
      currentExploreTime: cur?.avgExploreTime ?? null,
      previousExploreTime: prev?.avgExploreTime ?? null,
      exploreDelta: delta(cur?.avgExploreTime ?? null, prev?.avgExploreTime ?? null),
    }))
    .filter((d) => d.currentSessions > 0 || d.previousSessions > 0)
    .sort((a, b) => b.currentSessions - a.currentSessions);

  // Scenario-level deltas
  const scenarioMap = new Map<string, {
    title: string;
    cur: SchoolScenarioMetrics | null;
    prev: SchoolScenarioMetrics | null;
  }>();

  current.scenarioBreakdown.forEach((s) => {
    scenarioMap.set(s.slug, { title: s.title, cur: s, prev: null });
  });
  previous.scenarioBreakdown.forEach((s) => {
    const existing = scenarioMap.get(s.slug);
    if (existing) {
      existing.prev = s;
    } else {
      scenarioMap.set(s.slug, { title: s.title, cur: null, prev: s });
    }
  });

  const scenarioDeltas: SchoolScenarioDelta[] = Array.from(scenarioMap.entries())
    .map(([slug, { title, cur, prev }]) => ({
      slug,
      title,
      currentSessions: cur?.sessionCount ?? 0,
      previousSessions: prev?.sessionCount ?? 0,
      currentAccuracy: cur?.avgAccuracyRate ?? null,
      previousAccuracy: prev?.avgAccuracyRate ?? null,
      accuracyDelta: delta(cur?.avgAccuracyRate ?? null, prev?.avgAccuracyRate ?? null),
      currentDuration: cur?.avgDuration ?? null,
      previousDuration: prev?.avgDuration ?? null,
      durationDelta: delta(cur?.avgDuration ?? null, prev?.avgDuration ?? null),
    }))
    .filter((d) => d.currentSessions > 0 || d.previousSessions > 0)
    .sort((a, b) => b.currentSessions - a.currentSessions);

  // Insights
  const insights = computeSchoolComparisonInsights(deltas, classDeltas, previousLabel);

  return {
    currentLabel,
    previousLabel,
    deltas,
    classDeltas,
    scenarioDeltas,
    insights,
  };
}

// ============================================================
// Comparison insights (rule-based)
// ============================================================

const DELTA_THRESHOLD_RATE = 0.05;    // 5 percentage points
const DELTA_THRESHOLD_TIME = 60;      // 60 seconds
const DELTA_THRESHOLD_EVIDENCE = 1;   // 1 piece of evidence

function computeSchoolComparisonInsights(
  deltas: SchoolSummaryDeltas,
  classDeltas: SchoolClassDelta[],
  previousLabel: string,
): Insight[] {
  const insights: Insight[] = [];

  // --- Accuracy change ---
  const accDelta = deltas.accuracyRate.delta;
  if (accDelta != null) {
    if (accDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `学校全体の正解率が${previousLabel}より${formatDeltaPct(accDelta)}上昇しており、推理整理が進んでいる可能性があります`,
      });
    } else if (accDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'suggestion',
        text: `学校全体の正解率が${previousLabel}より${formatDeltaPct(Math.abs(accDelta))}低下しており、難易度の調整が必要かもしれません`,
      });
    } else {
      insights.push({
        type: 'observation',
        text: `学校全体の正解率は${previousLabel}とほぼ同水準を維持しています`,
      });
    }
  }

  // --- Discussion time + accuracy combination ---
  const disDelta = deltas.discussTime.delta;
  if (disDelta != null && accDelta != null) {
    if (disDelta > DELTA_THRESHOLD_TIME && accDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '議論時間が増えつつ正解率も維持されており、学校全体で議論の質が安定している傾向があります',
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME && accDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '議論がコンパクトになりつつ正解率は維持されており、効率的な授業運営が進んでいる可能性があります',
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME && accDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'suggestion',
        text: '議論時間と正解率がともに低下しており、議論の深まりに向けた支援が必要かもしれません',
      });
    }
  } else if (disDelta != null) {
    if (disDelta > DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が${previousLabel}より${formatDeltaTime(Math.abs(disDelta))}増加しています`,
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が${previousLabel}より${formatDeltaTime(Math.abs(disDelta))}減少しています`,
      });
    }
  }

  // --- Explore time + evidence combination ---
  const expDelta = deltas.exploreTime.delta;
  const evDelta = deltas.evidenceCount.delta;
  if (expDelta != null && evDelta != null) {
    if (expDelta < -DELTA_THRESHOLD_TIME && evDelta < -DELTA_THRESHOLD_EVIDENCE) {
      insights.push({
        type: 'suggestion',
        text: '探索時間と証拠発見数がともに減少しており、探索導線の見直しが必要かもしれません',
      });
    } else if (expDelta > DELTA_THRESHOLD_TIME && evDelta > 0) {
      insights.push({
        type: 'observation',
        text: '探索が充実しており、証拠発見数も増加しています',
      });
    } else if (expDelta < -DELTA_THRESHOLD_TIME && evDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '探索時間が短縮されつつ証拠発見数は維持されており、効率的な探索が定着しつつあります',
      });
    }
  }

  // --- Vote reason rate ---
  const vrDelta = deltas.voteReasonRate.delta;
  if (vrDelta != null) {
    if (vrDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `投票理由の記入率が${previousLabel}より${formatDeltaPct(vrDelta)}上がっており、学校全体で根拠の言語化が進んでいます`,
      });
    } else if (vrDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'suggestion',
        text: '投票理由の記入率が低下しており、「なぜその人を選んだ？」の声かけを学校全体で強化するとよいかもしれません',
      });
    }
  }

  // --- Scenario diversity ---
  const scDelta = deltas.scenarioCount.delta;
  if (scDelta != null && scDelta > 2) {
    insights.push({
      type: 'observation',
      text: `使用シナリオが${previousLabel}より${scDelta}種類増えており、教材運用の幅が広がっています`,
    });
  }

  // --- Session count change ---
  const sesDelta = deltas.sessions.delta;
  if (sesDelta != null) {
    if (sesDelta > 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が${previousLabel}より${sesDelta}回増え、学校全体での活用が広がっています`,
      });
    } else if (sesDelta < 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が${previousLabel}より${Math.abs(sesDelta)}回減少しています`,
      });
    }
  }

  // --- Class-level notable changes (top 3) ---
  const classGap: SchoolClassDelta[] = [];
  for (const cd of classDeltas.slice(0, 5)) {
    if (cd.accuracyDelta != null && Math.abs(cd.accuracyDelta) > DELTA_THRESHOLD_RATE) {
      classGap.push(cd);
    }
  }
  // Report up to 3 class-level changes
  for (const cd of classGap.slice(0, 3)) {
    const dir = cd.accuracyDelta! > 0 ? '上昇' : '低下';
    insights.push({
      type: cd.accuracyDelta! > 0 ? 'observation' : 'suggestion',
      text: `${cd.className}の正解率が${previousLabel}より${formatDeltaPct(Math.abs(cd.accuracyDelta!))}${dir}しています`,
    });
  }

  // --- Class gap widening ---
  const activeClasses = classDeltas.filter((c) =>
    c.currentAccuracy != null && c.previousAccuracy != null && c.currentSessions >= 2,
  );
  if (activeClasses.length >= 2) {
    const curRates = activeClasses.map((c) => c.currentAccuracy!);
    const prevRates = activeClasses.map((c) => c.previousAccuracy!);
    const curGap = Math.max(...curRates) - Math.min(...curRates);
    const prevGap = Math.max(...prevRates) - Math.min(...prevRates);
    if (curGap - prevGap > 0.1) {
      insights.push({
        type: 'suggestion',
        text: 'クラス間の正解率格差が広がっており、個別の支援配分見直しが必要かもしれません',
      });
    } else if (prevGap - curGap > 0.1) {
      insights.push({
        type: 'observation',
        text: 'クラス間の正解率格差が縮小しており、学校全体で均質な授業運営が進んでいます',
      });
    }
  }

  // Ensure at least one insight
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: `${previousLabel}と大きな変化は見られず、安定した授業運営が続いています`,
    });
  }

  return insights;
}

// ============================================================
// Format helpers
// ============================================================

function formatDeltaPct(rate: number): string {
  return `${Math.round(rate * 100)}pt`;
}

function formatDeltaTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m > 0 && s > 0) return `${m}分${s}秒`;
  if (m > 0) return `${m}分`;
  return `${s}秒`;
}
