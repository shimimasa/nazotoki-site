import { describe, it, expect } from 'vitest';
import {
  computeSessionInsights,
  computeClassInsights,
} from '../../src/lib/session-insights';
import type {
  SessionMetrics,
  ClassAggregateMetrics,
} from '../../src/lib/session-analytics';

// ============================================================
// Test helpers
// ============================================================

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    duration: 1800,
    phaseDurations: { explore: 300, discuss: 420 },
    totalVoters: 4,
    correctVoters: 2,
    accuracyRate: 0.5,
    evidenceCount: 4,
    voteReasonCount: 2,
    voteReasonRate: 0.5,
    reflectionCount: 0,
    playerCount: 4,
    ...overrides,
  };
}

function makeClassMetrics(
  overrides: Partial<ClassAggregateMetrics> = {},
): ClassAggregateMetrics {
  return {
    classId: 'c1',
    className: '5-1',
    gradeLabel: '小5',
    sessionCount: 3,
    avgDuration: 2000,
    avgAccuracyRate: 0.5,
    avgDiscussTime: 420,
    avgExploreTime: 300,
    scenarioCounts: [],
    lastSessionDate: null,
    ...overrides,
  };
}

// ============================================================
// computeSessionInsights
// ============================================================

describe('computeSessionInsights', () => {
  describe('observations — discussion time', () => {
    it('flags long discussion (>= 600s)', () => {
      const m = makeMetrics({ phaseDurations: { discuss: 700 } });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('議論時間が長く'))).toBe(true);
    });

    it('flags short discussion (< 180s)', () => {
      const m = makeMetrics({ phaseDurations: { discuss: 120 } });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('議論時間が短め'))).toBe(true);
    });

    it('does not flag discussion when missing', () => {
      const m = makeMetrics({ phaseDurations: {} });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('議論時間'))).toBe(false);
    });
  });

  describe('observations — explore time', () => {
    it('flags short explore (< 180s)', () => {
      const m = makeMetrics({ phaseDurations: { explore: 120 } });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('探索時間が短め'))).toBe(true);
    });

    it('does not flag short explore when time adequate', () => {
      const m = makeMetrics({ phaseDurations: { explore: 300 } });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('探索時間が短め'))).toBe(false);
    });
  });

  describe('observations — accuracy', () => {
    it('flags high accuracy (>= 0.75)', () => {
      const m = makeMetrics({ accuracyRate: 0.8 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('正解率が高く'))).toBe(true);
    });

    it('flags low accuracy + active discussion as "結論整理"', () => {
      const m = makeMetrics({
        accuracyRate: 0.2,
        phaseDurations: { discuss: 700 },
      });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('結論の整理'))).toBe(true);
    });

    it('flags low accuracy without long discussion as "ヒントの出し方"', () => {
      const m = makeMetrics({
        accuracyRate: 0.2,
        phaseDurations: { discuss: 400 },
      });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('ヒントの出し方'))).toBe(true);
    });

    it('does not flag accuracy when null', () => {
      const m = makeMetrics({ accuracyRate: null });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('正解率'))).toBe(false);
    });
  });

  describe('observations — vote reasons', () => {
    it('flags high vote reason rate (>= 0.7)', () => {
      const m = makeMetrics({ voteReasonRate: 0.8 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('根拠を言語化'))).toBe(true);
    });

    it('flags low vote reason rate (< 0.3) when voters exist', () => {
      const m = makeMetrics({ voteReasonRate: 0.2, totalVoters: 4 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('投票理由の記入が少な'))).toBe(true);
    });

    it('does not flag low vote reason rate with zero voters', () => {
      const m = makeMetrics({ voteReasonRate: 0.2, totalVoters: 0 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('投票理由'))).toBe(false);
    });
  });

  describe('observations — evidence count', () => {
    it('flags high evidence (>= 5)', () => {
      const m = makeMetrics({ evidenceCount: 6 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('探索が充実'))).toBe(true);
    });

    it('flags low evidence (<= 2, > 0)', () => {
      const m = makeMetrics({ evidenceCount: 2 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('証拠が少な'))).toBe(true);
    });

    it('does not flag evidence when count is zero', () => {
      const m = makeMetrics({ evidenceCount: 0 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('証拠'))).toBe(false);
    });
  });

  describe('observations — reflections', () => {
    it('notes reflection count when present', () => {
      const m = makeMetrics({ reflectionCount: 5 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('振り返りが5件'))).toBe(true);
    });

    it('does not mention reflections when zero', () => {
      const m = makeMetrics({ reflectionCount: 0 });
      const r = computeSessionInsights(m);
      expect(r.observations.some((o) => o.text.includes('振り返り'))).toBe(false);
    });
  });

  describe('suggestions', () => {
    it('suggests longer explore time when short', () => {
      const m = makeMetrics({ phaseDurations: { explore: 120 } });
      const r = computeSessionInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('探索時間を2分'))).toBe(true);
    });

    it('suggests reason organization time when accuracy low', () => {
      const m = makeMetrics({ accuracyRate: 0.2 });
      const r = computeSessionInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('根拠整理タイム'))).toBe(true);
    });

    it('suggests "論点カード" when discussion very long (>= 900s)', () => {
      const m = makeMetrics({ phaseDurations: { discuss: 1000 } });
      const r = computeSessionInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('論点カード'))).toBe(true);
    });

    it('suggests memo prompt when discussion very short', () => {
      const m = makeMetrics({ phaseDurations: { discuss: 100 } });
      const r = computeSessionInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('気になった点'))).toBe(true);
    });
  });

  it('returns empty arrays when nothing notable', () => {
    const m = makeMetrics({
      phaseDurations: { explore: 400, discuss: 400 },
      accuracyRate: 0.55,
      voteReasonRate: 0.5,
      evidenceCount: 4,
      reflectionCount: 0,
    });
    const r = computeSessionInsights(m);
    expect(r.observations).toEqual([]);
    expect(r.suggestions).toEqual([]);
  });
});

// ============================================================
// computeClassInsights
// ============================================================

describe('computeClassInsights', () => {
  it('returns empty result when session count too low', () => {
    const m = makeClassMetrics({ sessionCount: 1 });
    const r = computeClassInsights(m);
    expect(r.observations).toEqual([]);
    expect(r.suggestions).toEqual([]);
    expect(r.recommendations).toEqual([]);
  });

  describe('observations', () => {
    it('notes long avg discussion time', () => {
      const m = makeClassMetrics({ avgDiscussTime: 700 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('議論に時間をかける'))).toBe(true);
    });

    it('notes compact avg discussion time', () => {
      const m = makeClassMetrics({ avgDiscussTime: 100 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('コンパクト'))).toBe(true);
    });

    it('notes high avg accuracy', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.8 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('正解率が安定して高い'))).toBe(true);
    });

    it('notes low avg accuracy with difficulty hint', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.2 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('難易度調整の余地'))).toBe(true);
    });

    it('notes short avg explore time', () => {
      const m = makeClassMetrics({ avgExploreTime: 100 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('探索時間が短め'))).toBe(true);
    });

    it('notes fast-paced class when avg duration < 1500s', () => {
      const m = makeClassMetrics({ avgDuration: 1000 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('テンポよく'))).toBe(true);
    });

    it('notes reliability when session count >= 5', () => {
      const m = makeClassMetrics({ sessionCount: 6 });
      const r = computeClassInsights(m);
      expect(r.observations.some((o) => o.text.includes('6回の授業'))).toBe(true);
    });
  });

  describe('suggestions', () => {
    it('suggests easier scenario when accuracy low', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.2 });
      const r = computeClassInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('難易度がやや低い'))).toBe(true);
    });

    it('suggests pair share when discussion short', () => {
      const m = makeClassMetrics({ avgDiscussTime: 100 });
      const r = computeClassInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('隣の人と30秒共有'))).toBe(true);
    });

    it('suggests harder scenario when high accuracy with sufficient sessions', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.85, sessionCount: 4 });
      const r = computeClassInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('難易度の高い'))).toBe(true);
    });

    it('does not suggest harder scenario when session count < 3', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.85, sessionCount: 2 });
      const r = computeClassInsights(m);
      expect(r.suggestions.some((s) => s.text.includes('難易度の高い'))).toBe(false);
    });
  });

  describe('recommendations', () => {
    it('recommends discussion-heavy scenarios when avg discuss time high', () => {
      const m = makeClassMetrics({ avgDiscussTime: 700 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('議論重視型'))).toBe(true);
    });

    it('recommends clear-clue scenarios when accuracy low', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.2 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('手がかりが明確'))).toBe(true);
    });

    it('recommends fewer-evidence scenarios when explore time short', () => {
      const m = makeClassMetrics({ avgExploreTime: 100 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('証拠数が少なめ'))).toBe(true);
    });

    it('recommends short scenarios when fast-paced', () => {
      const m = makeClassMetrics({ avgDuration: 1000 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('短時間型'))).toBe(true);
    });

    it('recommends high-difficulty scenarios when accuracy high', () => {
      const m = makeClassMetrics({ avgAccuracyRate: 0.8 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('高難度'))).toBe(true);
    });

    it('recommends deep scenarios when avg duration long', () => {
      const m = makeClassMetrics({ avgDuration: 3200 });
      const r = computeClassInsights(m);
      expect(r.recommendations.some((x) => x.text.includes('深い議論'))).toBe(true);
    });
  });

  it('returns empty arrays when nothing notable', () => {
    const m = makeClassMetrics({
      avgDuration: 2000,
      avgAccuracyRate: 0.55,
      avgDiscussTime: 400,
      avgExploreTime: 400,
      sessionCount: 3,
    });
    const r = computeClassInsights(m);
    expect(r.observations).toEqual([]);
    expect(r.suggestions).toEqual([]);
    expect(r.recommendations).toEqual([]);
  });
});
