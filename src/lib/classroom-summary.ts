/**
 * Classroom Summary — Go/No-Go KPI computation
 * Phase 119: Pure functions for classroom performance metrics
 */

import type { SessionLogRow, SoloSessionRow, SessionFeedbackRow } from './supabase-client';
import type { StudentLogSummary } from './supabase-client';

export interface GoNoGoMetric {
  label: string;
  value: number;
  target: number;
  unit: string;
  passed: boolean;
}

export interface GoNoGoResult {
  metrics: GoNoGoMetric[];
  allPassed: boolean;
  passedCount: number;
}

export function computeGoNoGo(
  logs: SessionLogRow[],
  totalStudents: number,
  studentLogs: StudentLogSummary[],
  soloSessions: SoloSessionRow[],
  feedbackRows: SessionFeedbackRow[],
): GoNoGoResult {
  // 1. セッション実施回数
  const sessionCount = logs.length;

  // 2. 生徒参加率 — 1回以上参加した生徒 / 全生徒
  const participatedStudents = new Set(studentLogs.map(l => l.student_id));
  const participationRate = totalStudents > 0
    ? Math.round((participatedStudents.size / totalStudents) * 100)
    : 0;

  // 3. 平均投票率 — 投票した生徒ログ / 全生徒ログ
  const logsWithVote = studentLogs.filter(l => l.is_correct != null);
  const voteRate = studentLogs.length > 0
    ? Math.round((logsWithVote.length / studentLogs.length) * 100)
    : 0;

  // 4. ソロ週間アクティブ生徒 — 直近7日に完了したユニーク生徒数
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentSolo = soloSessions.filter(s =>
    s.completed_at && new Date(s.completed_at) >= weekAgo
  );
  const soloActiveStudents = new Set(recentSolo.map(s => s.student_id)).size;

  // 5. フィードバック「楽しかった」率 — fun_rating >= 4 / 全フィードバック
  const funCount = feedbackRows.filter(f => f.fun_rating >= 4).length;
  const funRate = feedbackRows.length > 0
    ? Math.round((funCount / feedbackRows.length) * 100)
    : 0;

  const metrics: GoNoGoMetric[] = [
    { label: 'セッション実施回数', value: sessionCount, target: 10, unit: '回', passed: sessionCount >= 10 },
    { label: '生徒参加率', value: participationRate, target: 80, unit: '%', passed: participationRate >= 80 },
    { label: '平均投票率', value: voteRate, target: 90, unit: '%', passed: voteRate >= 90 },
    { label: 'ソロ週間アクティブ', value: soloActiveStudents, target: 10, unit: '人', passed: soloActiveStudents >= 10 },
    { label: '「楽しかった」率', value: funRate, target: 70, unit: '%', passed: funRate >= 70 },
  ];

  const passedCount = metrics.filter(m => m.passed).length;
  return { metrics, allPassed: passedCount === metrics.length, passedCount };
}
