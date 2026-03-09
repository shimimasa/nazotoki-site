/**
 * Term Comparison — Compare two term reports, compute deltas and insights.
 *
 * Pure functions: (current, previous) → comparison. No side effects.
 *
 * Reuses DeltaValue, formatDeltaDisplay, deltaColorClass from monthly-comparison.ts.
 */

import type { TermReportData, TermNumber } from './term-report';
import { termLabel, type TermId } from './term-report';
import type { ClassAggregateMetrics, ScenarioAggregateMetrics } from './session-analytics';
import type { Insight } from './session-insights';
import { type DeltaValue, formatDeltaDisplay, deltaColorClass } from './monthly-comparison';

// Re-export shared helpers for convenience
export { formatDeltaDisplay, deltaColorClass, type DeltaValue };

// ============================================================
// Types
// ============================================================

export interface TermSummaryDeltas {
  sessions: DeltaValue;
  classes: DeltaValue;
  students: DeltaValue;
  accuracyRate: DeltaValue;
  duration: DeltaValue;
  discussTime: DeltaValue;
  exploreTime: DeltaValue;
  voteReasonRate: DeltaValue;
  evidenceCount: DeltaValue;
}

export interface TermClassDelta {
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

export interface TermScenarioDelta {
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

export interface TermComparison {
  currentLabel: string;
  previousLabel: string;
  deltas: TermSummaryDeltas;
  classDeltas: TermClassDelta[];
  scenarioDeltas: TermScenarioDelta[];
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

/** Compute weighted average of a metric from class breakdowns */
function weightedAvgFromClasses(
  classes: ClassAggregateMetrics[],
  getter: (c: ClassAggregateMetrics) => number | null,
): number | null {
  let totalWeight = 0;
  let totalValue = 0;
  for (const c of classes) {
    const v = getter(c);
    if (v != null && c.sessionCount > 0) {
      totalValue += v * c.sessionCount;
      totalWeight += c.sessionCount;
    }
  }
  return totalWeight > 0 ? totalValue / totalWeight : null;
}

/** Compute avg vote reason rate from scenario breakdowns */
function avgVoteReasonRate(report: TermReportData): number | null {
  const items = report.scenarioBreakdown.filter((s) => s.avgVoteReasonRate != null);
  if (items.length === 0) return null;
  let total = 0;
  let weight = 0;
  for (const s of items) {
    total += s.avgVoteReasonRate! * s.sessionCount;
    weight += s.sessionCount;
  }
  return weight > 0 ? total / weight : null;
}

/** Compute avg evidence count from scenario breakdowns */
function avgEvidenceCount(report: TermReportData): number | null {
  const items = report.scenarioBreakdown.filter((s) => s.avgEvidenceCount != null);
  if (items.length === 0) return null;
  let total = 0;
  let weight = 0;
  for (const s of items) {
    total += s.avgEvidenceCount! * s.sessionCount;
    weight += s.sessionCount;
  }
  return weight > 0 ? total / weight : null;
}

// ============================================================
// Previous term logic
// ============================================================

/** Get the previous term (handles school year boundary) */
export function getPreviousTerm(schoolYear: number, term: TermNumber): TermId {
  if (term === 2) return { schoolYear, term: 1 };
  if (term === 3) return { schoolYear, term: 2 };
  // term === 1 → previous is term 3 of previous school year
  return { schoolYear: schoolYear - 1, term: 3 };
}

// ============================================================
// Core: Compare two term reports
// ============================================================

export function compareTermReports(
  current: TermReportData,
  previous: TermReportData,
): TermComparison {
  const curSummary = current.summary;
  const prevSummary = previous.summary;

  // Compute extended metrics from breakdowns
  const curExplore = weightedAvgFromClasses(current.classBreakdown, (c) => c.avgExploreTime);
  const prevExplore = weightedAvgFromClasses(previous.classBreakdown, (c) => c.avgExploreTime);

  const curReasonRate = avgVoteReasonRate(current);
  const prevReasonRate = avgVoteReasonRate(previous);

  const curEvidence = avgEvidenceCount(current);
  const prevEvidence = avgEvidenceCount(previous);

  const deltas: TermSummaryDeltas = {
    sessions: makeDeltaValue(curSummary.totalSessions, prevSummary.totalSessions),
    classes: makeDeltaValue(curSummary.totalClasses, prevSummary.totalClasses),
    students: makeDeltaValue(curSummary.totalStudents, prevSummary.totalStudents),
    accuracyRate: makeDeltaValue(curSummary.avgAccuracyRate, prevSummary.avgAccuracyRate),
    duration: makeDeltaValue(curSummary.avgDuration, prevSummary.avgDuration),
    discussTime: makeDeltaValue(curSummary.avgDiscussTime, prevSummary.avgDiscussTime),
    exploreTime: makeDeltaValue(curExplore, prevExplore),
    voteReasonRate: makeDeltaValue(curReasonRate, prevReasonRate),
    evidenceCount: makeDeltaValue(curEvidence, prevEvidence),
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

  const classDeltas: TermClassDelta[] = Array.from(classMap.entries())
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
    cur: ScenarioAggregateMetrics | null;
    prev: ScenarioAggregateMetrics | null;
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

  const scenarioDeltas: TermScenarioDelta[] = Array.from(scenarioMap.entries())
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
  const insights = computeTermComparisonInsights(deltas, classDeltas);

  return {
    currentLabel: termLabel(current.schoolYear, current.term),
    previousLabel: termLabel(previous.schoolYear, previous.term),
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
const DELTA_THRESHOLD_TIME = 60;      // 60 seconds (1 minute)
const DELTA_THRESHOLD_EVIDENCE = 1;   // 1 piece of evidence

function computeTermComparisonInsights(
  deltas: TermSummaryDeltas,
  classDeltas: TermClassDelta[],
): Insight[] {
  const insights: Insight[] = [];

  // --- Accuracy change ---
  const accDelta = deltas.accuracyRate.delta;
  if (accDelta != null) {
    if (accDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `正解率が前学期より${formatDeltaPct(accDelta)}上昇しており、推理整理が進んでいる可能性があります`,
      });
    } else if (accDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `正解率が前学期より${formatDeltaPct(Math.abs(accDelta))}低下しており、難易度の調整が必要かもしれません`,
      });
    } else {
      insights.push({
        type: 'observation',
        text: '正解率は前学期とほぼ同水準を維持しています',
      });
    }
  }

  // --- Discussion time + accuracy combination ---
  const disDelta = deltas.discussTime.delta;
  if (disDelta != null && accDelta != null) {
    if (disDelta > DELTA_THRESHOLD_TIME && accDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '議論時間が増えつつ正解率も維持されており、議論の質が安定している傾向があります',
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME && accDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '議論がコンパクトになりつつ正解率は維持されており、効率的な推理が行われている可能性があります',
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME && accDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: '議論時間と正解率がともに低下しており、議論の深まりが課題かもしれません',
      });
    }
  } else if (disDelta != null) {
    if (disDelta > DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が前学期より${formatDeltaTime(Math.abs(disDelta))}増加しています`,
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が前学期より${formatDeltaTime(Math.abs(disDelta))}減少しています`,
      });
    }
  }

  // --- Explore time + evidence combination ---
  const expDelta = deltas.exploreTime.delta;
  const evDelta = deltas.evidenceCount.delta;
  if (expDelta != null && evDelta != null) {
    if (expDelta < -DELTA_THRESHOLD_TIME && evDelta < -DELTA_THRESHOLD_EVIDENCE) {
      insights.push({
        type: 'observation',
        text: '探索時間と証拠発見数がともに減少しており、探索導線の見直しが必要かもしれません',
      });
    } else if (expDelta > DELTA_THRESHOLD_TIME && evDelta > 0) {
      insights.push({
        type: 'observation',
        text: '探索時間の増加に伴い証拠発見数も増えており、探索が充実している傾向があります',
      });
    }
  }

  // --- Vote reason rate ---
  const vrDelta = deltas.voteReasonRate.delta;
  if (vrDelta != null) {
    if (vrDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `投票理由の記入率が前学期より${formatDeltaPct(vrDelta)}上がっており、根拠の言語化が定着しつつあります`,
      });
    } else if (vrDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: '投票理由の記入率が低下しており、「なぜその人を選んだ？」の声かけを強化するとよいかもしれません',
      });
    }
  }

  // --- Session count change ---
  const sesDelta = deltas.sessions.delta;
  if (sesDelta != null) {
    if (sesDelta > 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が前学期より${sesDelta}回増え、実施経験が蓄積されています`,
      });
    } else if (sesDelta < 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が前学期より${Math.abs(sesDelta)}回減少しています`,
      });
    }
  }

  // --- Class-level notable changes ---
  for (const cd of classDeltas.slice(0, 3)) {
    if (cd.accuracyDelta != null && Math.abs(cd.accuracyDelta) > DELTA_THRESHOLD_RATE) {
      const dir = cd.accuracyDelta > 0 ? '上昇' : '低下';
      insights.push({
        type: 'observation',
        text: `${cd.className}の正解率が前学期より${formatDeltaPct(Math.abs(cd.accuracyDelta))}${dir}しています`,
      });
    }
  }

  // Ensure at least one insight
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: '前学期と大きな変化は見られず、安定した授業運営が続いています',
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
