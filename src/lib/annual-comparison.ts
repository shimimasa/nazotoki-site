/**
 * Annual Comparison — Compare two annual reports, compute deltas and insights.
 *
 * Pure functions: (current, previous) → comparison. No side effects.
 *
 * Reuses DeltaValue, formatDeltaDisplay, deltaColorClass from monthly-comparison.ts.
 */

import type { AnnualReportData, AnnualSummaryMetrics } from './annual-report';
import { annualLabel, getAvailableSchoolYears } from './annual-report';
import type { ClassAggregateMetrics, ScenarioAggregateMetrics } from './session-analytics';
import type { SessionLogRow } from './supabase';
import type { Insight } from './session-insights';
import { type DeltaValue, formatDeltaDisplay, deltaColorClass } from './monthly-comparison';

// Re-export shared helpers for convenience
export { formatDeltaDisplay, deltaColorClass, type DeltaValue };

// ============================================================
// Types
// ============================================================

export interface AnnualSummaryDeltas {
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

export interface AnnualClassDelta {
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

export interface AnnualScenarioDelta {
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

export interface AnnualComparison {
  currentLabel: string;
  previousLabel: string;
  deltas: AnnualSummaryDeltas;
  classDeltas: AnnualClassDelta[];
  scenarioDeltas: AnnualScenarioDelta[];
  insights: Insight[];
  improvements: Insight[];
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
// Previous year logic
// ============================================================

/** Get the previous school year, or null if not available in logs */
export function getPreviousSchoolYear(
  logs: SessionLogRow[],
  currentYear: number,
): number | null {
  const available = getAvailableSchoolYears(logs);
  const prev = currentYear - 1;
  return available.includes(prev) ? prev : null;
}

// ============================================================
// Core: Compare two annual reports
// ============================================================

export function compareAnnualReports(
  current: AnnualReportData,
  previous: AnnualReportData,
): AnnualComparison {
  const curS = current.summary;
  const prevS = previous.summary;

  const deltas: AnnualSummaryDeltas = {
    sessions: makeDeltaValue(curS.totalSessions, prevS.totalSessions),
    classes: makeDeltaValue(curS.totalClasses, prevS.totalClasses),
    students: makeDeltaValue(curS.totalStudents, prevS.totalStudents),
    accuracyRate: makeDeltaValue(curS.avgAccuracyRate, prevS.avgAccuracyRate),
    duration: makeDeltaValue(curS.avgDuration, prevS.avgDuration),
    discussTime: makeDeltaValue(curS.avgDiscussTime, prevS.avgDiscussTime),
    exploreTime: makeDeltaValue(curS.avgExploreTime, prevS.avgExploreTime),
    voteReasonRate: makeDeltaValue(curS.avgVoteReasonRate, prevS.avgVoteReasonRate),
    evidenceCount: makeDeltaValue(curS.avgEvidenceCount, prevS.avgEvidenceCount),
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

  const classDeltas: AnnualClassDelta[] = Array.from(classMap.entries())
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

  const scenarioDeltas: AnnualScenarioDelta[] = Array.from(scenarioMap.entries())
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
  const { insights, improvements } = computeAnnualComparisonInsights(deltas, classDeltas, scenarioDeltas);

  return {
    currentLabel: annualLabel(current.schoolYear),
    previousLabel: annualLabel(previous.schoolYear),
    deltas,
    classDeltas,
    scenarioDeltas,
    insights,
    improvements,
  };
}

// ============================================================
// Comparison insights (rule-based)
// ============================================================

const DELTA_THRESHOLD_RATE = 0.05;    // 5 percentage points
const DELTA_THRESHOLD_TIME = 60;      // 60 seconds (1 minute)
const DELTA_THRESHOLD_EVIDENCE = 1;   // 1 piece of evidence

function computeAnnualComparisonInsights(
  deltas: AnnualSummaryDeltas,
  classDeltas: AnnualClassDelta[],
  scenarioDeltas: AnnualScenarioDelta[],
): { insights: Insight[]; improvements: Insight[] } {
  const insights: Insight[] = [];
  const improvements: Insight[] = [];

  // --- Accuracy change ---
  const accDelta = deltas.accuracyRate.delta;
  if (accDelta != null) {
    if (accDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `今年度は前年度より正解率が${formatDeltaPct(accDelta)}上昇しており、推理整理が進んでいる可能性があります`,
      });
    } else if (accDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `今年度は前年度より正解率が${formatDeltaPct(Math.abs(accDelta))}低下しており、難易度やシナリオ構成の見直しが必要かもしれません`,
      });
      improvements.push({
        type: 'suggestion',
        text: '次年度は年度初めに手がかりが明確なシナリオから導入すると、成功体験が増える可能性があります',
      });
    } else {
      insights.push({
        type: 'observation',
        text: '正解率は前年度とほぼ同水準を維持しています',
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
      improvements.push({
        type: 'suggestion',
        text: '次年度は議論前に「気づいたことを1つメモして」と促すと、発言量が増える可能性があります',
      });
    }
  } else if (disDelta != null) {
    if (disDelta > DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が前年度より${formatDeltaTime(Math.abs(disDelta))}増加しています`,
      });
    } else if (disDelta < -DELTA_THRESHOLD_TIME) {
      insights.push({
        type: 'observation',
        text: `議論時間が前年度より${formatDeltaTime(Math.abs(disDelta))}減少しています`,
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
      improvements.push({
        type: 'suggestion',
        text: '次年度は探索時間を少し長めに設定すると証拠発見が増える可能性があります',
      });
    } else if (expDelta > DELTA_THRESHOLD_TIME && evDelta > 0) {
      insights.push({
        type: 'observation',
        text: '探索時間の増加に伴い証拠発見数も増えており、探索が充実している傾向があります',
      });
    } else if (expDelta < -DELTA_THRESHOLD_TIME && evDelta >= 0) {
      insights.push({
        type: 'observation',
        text: '探索時間が短縮しつつ証拠発見数は維持されており、効率的な探索が定着しつつある可能性があります',
      });
    }
  }

  // --- Vote reason rate ---
  const vrDelta = deltas.voteReasonRate.delta;
  if (vrDelta != null) {
    if (vrDelta > DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: `投票理由の記入率が前年度より${formatDeltaPct(vrDelta)}上がっており、根拠の言語化が定着しつつあります`,
      });
    } else if (vrDelta < -DELTA_THRESHOLD_RATE) {
      insights.push({
        type: 'observation',
        text: '投票理由の記入率が低下しています',
      });
      improvements.push({
        type: 'suggestion',
        text: '次年度は「なぜその人を選んだ？」の声かけを強化すると改善する可能性があります',
      });
    }
  }

  // --- Session count change ---
  const sesDelta = deltas.sessions.delta;
  if (sesDelta != null) {
    if (sesDelta > 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が前年度より${sesDelta}回増え、実施経験が蓄積されています`,
      });
    } else if (sesDelta < 0) {
      insights.push({
        type: 'observation',
        text: `授業回数が前年度より${Math.abs(sesDelta)}回減少しています`,
      });
    }
  }

  // --- Scenario variety change ---
  const curScenarioCount = scenarioDeltas.filter((s) => s.currentSessions > 0).length;
  const prevScenarioCount = scenarioDeltas.filter((s) => s.previousSessions > 0).length;
  if (curScenarioCount > prevScenarioCount + 2) {
    insights.push({
      type: 'observation',
      text: `使用シナリオが前年度より${curScenarioCount - prevScenarioCount}種類増えており、多様な題材に触れています`,
    });
  }

  // --- Class-level notable changes (top 2) ---
  let classInsightCount = 0;
  for (const cd of classDeltas) {
    if (classInsightCount >= 2) break;
    if (cd.accuracyDelta != null && Math.abs(cd.accuracyDelta) > DELTA_THRESHOLD_RATE) {
      const dir = cd.accuracyDelta > 0 ? '上昇' : '低下';
      insights.push({
        type: 'observation',
        text: `${cd.className}の正解率が前年度より${formatDeltaPct(Math.abs(cd.accuracyDelta))}${dir}しています`,
      });
      classInsightCount++;
    }
  }

  // Ensure at least one insight
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: '前年度と大きな変化は見られず、安定した授業運営が続いています',
    });
  }

  // Ensure at least one improvement
  if (improvements.length === 0) {
    improvements.push({
      type: 'suggestion',
      text: '年度間の比較データが蓄積されると、より精度の高い傾向分析が可能になります',
    });
  }

  return { insights, improvements };
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
