/**
 * Session Insights — Rule-based educational insight generation.
 *
 * Pure functions: (metrics) → insights. No side effects, no API calls.
 * All text uses hedged language (「傾向があります」「可能性があります」).
 */

import type { SessionMetrics, ClassAggregateMetrics } from './session-analytics';

// ============================================================
// Types
// ============================================================

export interface Insight {
  type: 'observation' | 'suggestion' | 'recommendation';
  text: string;
}

export interface SessionInsights {
  observations: Insight[];
  suggestions: Insight[];
}

export interface ClassInsights {
  observations: Insight[];
  suggestions: Insight[];
  recommendations: Insight[];
}

// ============================================================
// Thresholds (centralized, easy to tune)
// ============================================================

const T = {
  DISCUSS_LONG: 600,       // 10 min — active discussion
  DISCUSS_SHORT: 180,      // 3 min — discussion too brief
  DISCUSS_VERY_LONG: 900,  // 15 min — may need focus
  EXPLORE_SHORT: 180,      // 3 min — insufficient exploration
  ACCURACY_HIGH: 0.75,
  ACCURACY_LOW: 0.35,
  VOTE_REASON_HIGH: 0.7,
  VOTE_REASON_LOW: 0.3,
  EVIDENCE_HIGH: 5,
  EVIDENCE_LOW: 2,
  MIN_SESSIONS_FOR_CLASS: 2,
  DURATION_FAST: 1500,     // 25 min — fast-paced session
  DURATION_LONG: 3000,     // 50 min — long session
} as const;

// ============================================================
// 1. Per-session insights
// ============================================================

export function computeSessionInsights(m: SessionMetrics): SessionInsights {
  const obs: Insight[] = [];
  const sug: Insight[] = [];

  const discuss = m.phaseDurations.discuss ?? null;
  const explore = m.phaseDurations.explore ?? null;

  // --- Observations ---

  // Discussion time
  if (discuss != null && discuss >= T.DISCUSS_LONG) {
    obs.push({ type: 'observation', text: '議論時間が長く、意見交換が活発でした' });
  } else if (discuss != null && discuss < T.DISCUSS_SHORT) {
    obs.push({ type: 'observation', text: '議論時間が短めでした。論点を明示すると深まる可能性があります' });
  }

  // Explore time
  if (explore != null && explore < T.EXPLORE_SHORT) {
    obs.push({ type: 'observation', text: '探索時間が短めでした。証拠確認が十分でなかった可能性があります' });
  }

  // Accuracy
  if (m.accuracyRate != null && m.accuracyRate >= T.ACCURACY_HIGH) {
    obs.push({ type: 'observation', text: '正解率が高く、推理力が発揮されました' });
  } else if (m.accuracyRate != null && m.accuracyRate < T.ACCURACY_LOW) {
    if (discuss != null && discuss >= T.DISCUSS_LONG) {
      obs.push({ type: 'observation', text: '議論は活発でしたが、結論の整理に課題がある可能性があります' });
    } else {
      obs.push({ type: 'observation', text: '正解率が低めでした。ヒントの出し方を調整してもよいかもしれません' });
    }
  }

  // Vote reason rate
  if (m.voteReasonRate != null && m.voteReasonRate >= T.VOTE_REASON_HIGH) {
    obs.push({ type: 'observation', text: '投票理由の記入率が高く、根拠を言語化できています' });
  } else if (m.voteReasonRate != null && m.voteReasonRate < T.VOTE_REASON_LOW && m.totalVoters > 0) {
    obs.push({ type: 'observation', text: '投票理由の記入が少なめでした' });
  }

  // Evidence
  if (m.evidenceCount >= T.EVIDENCE_HIGH) {
    obs.push({ type: 'observation', text: '多くの証拠が発見され、探索が充実していました' });
  } else if (m.evidenceCount <= T.EVIDENCE_LOW && m.evidenceCount > 0) {
    obs.push({ type: 'observation', text: '発見された証拠が少なめでした' });
  }

  // Reflections
  if (m.reflectionCount > 0) {
    obs.push({ type: 'observation', text: `振り返りが${m.reflectionCount}件記録されました` });
  }

  // --- Suggestions ---

  if (explore != null && explore < T.EXPLORE_SHORT) {
    sug.push({ type: 'suggestion', text: '次回は探索時間を2分程度延長してみてください' });
  }

  if (m.accuracyRate != null && m.accuracyRate < T.ACCURACY_LOW) {
    sug.push({ type: 'suggestion', text: '投票前に1分間の根拠整理タイムを入れると改善する可能性があります' });
  }

  if (m.voteReasonRate != null && m.voteReasonRate < T.VOTE_REASON_LOW && m.totalVoters > 0) {
    sug.push({ type: 'suggestion', text: '「なぜその人を選んだ？」と声かけを追加すると記入率が上がる可能性があります' });
  }

  if (discuss != null && discuss >= T.DISCUSS_VERY_LONG) {
    sug.push({ type: 'suggestion', text: '論点カードを先に1つ提示すると議論を焦点化しやすくなります' });
  }

  if (discuss != null && discuss < T.DISCUSS_SHORT) {
    sug.push({ type: 'suggestion', text: '議論前に「気になった点を1つメモして」と促すと発言しやすくなります' });
  }

  if (m.evidenceCount <= T.EVIDENCE_LOW && m.evidenceCount > 0) {
    sug.push({ type: 'suggestion', text: '探索フェーズの導線を確認し、証拠へのアクセスを改善してみてください' });
  }

  return { observations: obs, suggestions: sug };
}

// ============================================================
// 2. Class-level insights
// ============================================================

export function computeClassInsights(m: ClassAggregateMetrics): ClassInsights {
  const obs: Insight[] = [];
  const sug: Insight[] = [];
  const rec: Insight[] = [];

  if (m.sessionCount < T.MIN_SESSIONS_FOR_CLASS) {
    return { observations: [], suggestions: [], recommendations: [] };
  }

  // --- Observations ---

  if (m.avgDiscussTime != null && m.avgDiscussTime >= T.DISCUSS_LONG) {
    obs.push({ type: 'observation', text: 'このクラスは議論に時間をかける傾向があります' });
  } else if (m.avgDiscussTime != null && m.avgDiscussTime < T.DISCUSS_SHORT) {
    obs.push({ type: 'observation', text: 'このクラスは議論がコンパクトに進む傾向があります' });
  }

  if (m.avgAccuracyRate != null && m.avgAccuracyRate >= T.ACCURACY_HIGH) {
    obs.push({ type: 'observation', text: '正解率が安定して高い傾向があります' });
  } else if (m.avgAccuracyRate != null && m.avgAccuracyRate < T.ACCURACY_LOW) {
    obs.push({ type: 'observation', text: '正解率が低めの傾向があり、難易度調整の余地があります' });
  }

  if (m.avgExploreTime != null && m.avgExploreTime < T.EXPLORE_SHORT) {
    obs.push({ type: 'observation', text: '探索時間が短めの傾向があります' });
  }

  if (m.avgDuration != null && m.avgDuration < T.DURATION_FAST) {
    obs.push({ type: 'observation', text: 'テンポよく授業が進む傾向があります' });
  }

  if (m.sessionCount >= 5) {
    obs.push({ type: 'observation', text: `${m.sessionCount}回の授業実績があり、傾向分析の信頼度が高まっています` });
  }

  // --- Suggestions ---

  if (m.avgAccuracyRate != null && m.avgAccuracyRate < T.ACCURACY_LOW) {
    sug.push({ type: 'suggestion', text: '次回は難易度がやや低いシナリオを選ぶと成功体験につながる可能性があります' });
  }

  if (m.avgDiscussTime != null && m.avgDiscussTime < T.DISCUSS_SHORT) {
    sug.push({ type: 'suggestion', text: '議論前に「気づいたことを隣の人と30秒共有」を入れると発言量が増える可能性があります' });
  }

  if (m.avgExploreTime != null && m.avgExploreTime < T.EXPLORE_SHORT) {
    sug.push({ type: 'suggestion', text: '探索時間を長めに確保すると、議論の質が上がる可能性があります' });
  }

  if (m.avgAccuracyRate != null && m.avgAccuracyRate >= T.ACCURACY_HIGH && m.sessionCount >= 3) {
    sug.push({ type: 'suggestion', text: 'より難易度の高いシナリオに挑戦してもよいかもしれません' });
  }

  // --- Scenario Recommendations ---

  if (m.avgDiscussTime != null && m.avgDiscussTime >= T.DISCUSS_LONG) {
    rec.push({ type: 'recommendation', text: '議論重視型シナリオと相性が良さそうです' });
  }

  if (m.avgAccuracyRate != null && m.avgAccuracyRate < T.ACCURACY_LOW) {
    rec.push({ type: 'recommendation', text: '手がかりが明確で推理しやすいシナリオが適している可能性があります' });
  }

  if (m.avgExploreTime != null && m.avgExploreTime < T.EXPLORE_SHORT) {
    rec.push({ type: 'recommendation', text: '証拠数が少なめのシナリオが扱いやすい可能性があります' });
  }

  if (m.avgDuration != null && m.avgDuration < T.DURATION_FAST) {
    rec.push({ type: 'recommendation', text: '短時間型シナリオとも相性が良い傾向です' });
  }

  if (m.avgAccuracyRate != null && m.avgAccuracyRate >= T.ACCURACY_HIGH) {
    rec.push({ type: 'recommendation', text: '高難度シナリオに挑戦できるクラスです' });
  }

  if (m.avgDuration != null && m.avgDuration >= T.DURATION_LONG) {
    rec.push({ type: 'recommendation', text: 'じっくり取り組むタイプのため、深い議論が必要なシナリオが向いている可能性があります' });
  }

  return { observations: obs, suggestions: sug, recommendations: rec };
}
