/**
 * Admin Dashboard Comparison — Period-over-period comparison for admin KPIs.
 *
 * Pure functions: (currentKPI, previousKPI) → deltas + insights.
 * Reuses getSchoolComparisonRange/Label from school-comparison.ts.
 */

import type { DateRangeType } from './analytics-export';
import {
  getSchoolComparisonRange,
  getSchoolComparisonLabel,
  type DeltaValue,
} from './school-comparison';
import type { AdminKPI, ClassStatus } from './admin-dashboard';
import type { Insight } from './session-insights';

// Re-export for convenience
export { getSchoolComparisonRange, getSchoolComparisonLabel };
export type { DeltaValue };

// ============================================================
// Types
// ============================================================

export interface AdminKPIDeltas {
  sessions: DeltaValue;
  activeClasses: DeltaValue;
  students: DeltaValue;
  accuracyRate: DeltaValue;
  discussTime: DeltaValue;
  exploreTime: DeltaValue;
  scenarioCount: DeltaValue;
  lowActivityClasses: DeltaValue;
  classGapPt: DeltaValue;
}

export interface AdminClassDelta {
  classId: string;
  className: string;
  gradeLabel: string | null;
  currentSessions: number;
  previousSessions: number;
  sessionsDelta: number;
  currentAccuracy: number | null;
  previousAccuracy: number | null;
  accuracyDelta: number | null;
  currentDiscussTime: number | null;
  previousDiscussTime: number | null;
  discussDelta: number | null;
  currentExploreTime: number | null;
  previousExploreTime: number | null;
  exploreDelta: number | null;
  statusLabel: string;
}

export interface AdminComparison {
  currentLabel: string;
  previousLabel: string;
  deltas: AdminKPIDeltas;
  classDeltas: AdminClassDelta[];
  insights: Insight[];
}

// ============================================================
// Helpers
// ============================================================

function dv(current: number | null, previous: number | null): DeltaValue {
  return {
    current,
    previous,
    delta: current != null && previous != null ? current - previous : null,
  };
}

// ============================================================
// Compare two admin KPIs
// ============================================================

export function compareAdminDashboards(
  current: AdminKPI,
  previous: AdminKPI,
  currentClasses: ClassStatus[],
  previousClasses: ClassStatus[],
  currentLabel: string,
  previousLabel: string,
): AdminComparison {
  const deltas: AdminKPIDeltas = {
    sessions: dv(current.totalSessions, previous.totalSessions),
    activeClasses: dv(current.activeClassCount, previous.activeClassCount),
    students: dv(current.totalStudents, previous.totalStudents),
    accuracyRate: dv(current.avgAccuracyRate, previous.avgAccuracyRate),
    discussTime: dv(current.avgDiscussTime, previous.avgDiscussTime),
    exploreTime: dv(current.avgExploreTime, previous.avgExploreTime),
    scenarioCount: dv(current.uniqueScenarioCount, previous.uniqueScenarioCount),
    lowActivityClasses: dv(current.lowActivityClassCount, previous.lowActivityClassCount),
    classGapPt: dv(current.classGapPt, previous.classGapPt),
  };

  // Build class deltas
  const prevMap = new Map(previousClasses.map((c) => [c.classId, c]));
  const allClassIds = new Set([
    ...currentClasses.map((c) => c.classId),
    ...previousClasses.map((c) => c.classId),
  ]);

  const classDeltas: AdminClassDelta[] = [];
  for (const classId of allClassIds) {
    const cur = currentClasses.find((c) => c.classId === classId);
    const prev = prevMap.get(classId);
    if (!cur && !prev) continue;

    const curSessions = cur?.sessionCount ?? 0;
    const prevSessions = prev?.sessionCount ?? 0;
    if (curSessions === 0 && prevSessions === 0) continue;

    classDeltas.push({
      classId,
      className: cur?.className ?? prev?.className ?? '',
      gradeLabel: cur?.gradeLabel ?? prev?.gradeLabel ?? null,
      currentSessions: curSessions,
      previousSessions: prevSessions,
      sessionsDelta: curSessions - prevSessions,
      currentAccuracy: cur?.avgAccuracyRate ?? null,
      previousAccuracy: prev?.avgAccuracyRate ?? null,
      accuracyDelta: cur?.avgAccuracyRate != null && prev?.avgAccuracyRate != null
        ? cur.avgAccuracyRate - prev.avgAccuracyRate
        : null,
      currentDiscussTime: cur?.avgDiscussTime ?? null,
      previousDiscussTime: prev?.avgDiscussTime ?? null,
      discussDelta: cur?.avgDiscussTime != null && prev?.avgDiscussTime != null
        ? cur.avgDiscussTime - prev.avgDiscussTime
        : null,
      currentExploreTime: cur?.avgExploreTime ?? null,
      previousExploreTime: prev?.avgExploreTime ?? null,
      exploreDelta: cur?.avgExploreTime != null && prev?.avgExploreTime != null
        ? cur.avgExploreTime - prev.avgExploreTime
        : null,
      statusLabel: cur?.statusLabel ?? '低活用',
    });
  }

  classDeltas.sort((a, b) => b.currentSessions - a.currentSessions);

  const insights = computeAdminComparisonInsights(deltas, classDeltas, currentLabel, previousLabel);

  return { currentLabel, previousLabel, deltas, classDeltas, insights };
}

// ============================================================
// Comparison Insights
// ============================================================

const CTH = {
  ACCURACY_DELTA: 0.05, // 5 percentage points
  CLASS_GAP_DELTA: 5,   // 5pt
  CLASS_ACCURACY_NOTABLE: 0.1, // 10 percentage points
} as const;

function computeAdminComparisonInsights(
  deltas: AdminKPIDeltas,
  classDeltas: AdminClassDelta[],
  currentLabel: string,
  previousLabel: string,
): Insight[] {
  const insights: Insight[] = [];

  // 1. Session volume change
  if (deltas.sessions.delta != null) {
    if (deltas.sessions.delta > 0) {
      insights.push({
        type: 'observation',
        text: `${currentLabel}は${previousLabel}より授業実施数が${deltas.sessions.delta}回増えており、学校全体で活用が進んでいる可能性があります`,
      });
    } else if (deltas.sessions.delta < 0) {
      insights.push({
        type: 'observation',
        text: `${currentLabel}は${previousLabel}より授業実施数が${Math.abs(deltas.sessions.delta)}回減少しており、活用がやや停滞している可能性があります`,
      });
    }
  }

  // 2. Accuracy change
  if (deltas.accuracyRate.delta != null) {
    const ptDelta = Math.round(deltas.accuracyRate.delta * 100);
    if (deltas.accuracyRate.delta > CTH.ACCURACY_DELTA) {
      insights.push({
        type: 'observation',
        text: `正解率が${ptDelta}pt向上しており、学校全体で理解度が上がっている傾向があります`,
      });
    } else if (deltas.accuracyRate.delta < -CTH.ACCURACY_DELTA) {
      insights.push({
        type: 'suggestion',
        text: `正解率が${Math.abs(ptDelta)}pt低下しており、シナリオ難易度や導入説明の見直しが有効かもしれません`,
      });
    }
  }

  // 3. Low activity class change
  if (deltas.lowActivityClasses.delta != null) {
    if (deltas.lowActivityClasses.delta < 0) {
      insights.push({
        type: 'observation',
        text: `低活用クラスが${Math.abs(deltas.lowActivityClasses.delta!)}クラス減少しており、学校全体で定着が進んでいるかもしれません`,
      });
    } else if (deltas.lowActivityClasses.delta > 0) {
      insights.push({
        type: 'suggestion',
        text: `低活用クラスが${deltas.lowActivityClasses.delta}クラス増加しており、導入支援の見直しが必要かもしれません`,
      });
    }
  }

  // 4. Class gap change
  if (deltas.classGapPt.delta != null) {
    if (deltas.classGapPt.delta > CTH.CLASS_GAP_DELTA) {
      insights.push({
        type: 'suggestion',
        text: `クラス間格差が${deltas.classGapPt.delta}pt拡大しており、支援配分の見直しが必要かもしれません`,
      });
    } else if (deltas.classGapPt.delta < -CTH.CLASS_GAP_DELTA) {
      insights.push({
        type: 'observation',
        text: `クラス間格差が${Math.abs(deltas.classGapPt.delta)}pt縮小しており、学校全体の均質化が進んでいます`,
      });
    }
  }

  // 5. Scenario diversity
  if (deltas.scenarioCount.delta != null && deltas.scenarioCount.delta > 0) {
    insights.push({
      type: 'observation',
      text: `利用シナリオが${deltas.scenarioCount.delta}種類増えており、教材運用の幅が広がっています`,
    });
  }

  // 6. Class-level notable changes (top 3)
  const notableClasses = classDeltas
    .filter((c) => c.accuracyDelta != null && Math.abs(c.accuracyDelta) >= CTH.CLASS_ACCURACY_NOTABLE)
    .sort((a, b) => Math.abs(b.accuracyDelta!) - Math.abs(a.accuracyDelta!))
    .slice(0, 3);

  for (const c of notableClasses) {
    const ptDelta = Math.round(c.accuracyDelta! * 100);
    if (c.accuracyDelta! > 0) {
      insights.push({
        type: 'observation',
        text: `${c.className}で正解率が${ptDelta}pt向上しています`,
      });
    } else {
      insights.push({
        type: 'suggestion',
        text: `${c.className}で正解率が${Math.abs(ptDelta)}pt低下しており、個別の支援が有効かもしれません`,
      });
    }
  }

  // Fallback
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: `${currentLabel}と${previousLabel}で大きな変化は見られず、安定した授業運営が続いています`,
    });
  }

  return insights;
}
