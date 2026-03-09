/**
 * Session Analytics — Pure utility functions for computing metrics
 * from session_logs and student_session_logs data.
 *
 * All functions are pure: (data) → metrics. No side effects, no DB calls.
 */

import type { SessionLogRow } from './supabase';

// ============================================================
// Types
// ============================================================

export interface SessionMetrics {
  duration: number | null;
  phaseDurations: Record<string, number>;
  totalVoters: number;
  correctVoters: number;
  accuracyRate: number | null;
  evidenceCount: number;
  voteReasonCount: number;
  voteReasonRate: number | null;
  reflectionCount: number;
  playerCount: number | null;
}

export interface ClassAggregateMetrics {
  classId: string;
  className: string;
  gradeLabel: string | null;
  sessionCount: number;
  avgDuration: number | null;
  avgAccuracyRate: number | null;
  avgDiscussTime: number | null;
  avgExploreTime: number | null;
  scenarioCounts: { slug: string; title: string; count: number }[];
  lastSessionDate: string | null;
}

export interface ScenarioAggregateMetrics {
  slug: string;
  title: string;
  sessionCount: number;
  avgDuration: number | null;
  avgAccuracyRate: number | null;
  avgVoteReasonRate: number | null;
  avgDiscussTime: number | null;
  avgEvidenceCount: number | null;
}

export interface StudentAggregateMetrics {
  studentId: string;
  studentName: string;
  className: string;
  participationCount: number;
  correctCount: number;
  accuracyRate: number | null;
  lastSessionDate: string | null;
}

export interface SummaryMetrics {
  totalSessions: number;
  totalClasses: number;
  totalStudents: number;
  avgAccuracyRate: number | null;
  avgDuration: number | null;
  avgDiscussTime: number | null;
}

// ============================================================
// Helpers
// ============================================================

function avgOfNonNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function computeAccuracy(log: SessionLogRow): number | null {
  const voters = log.vote_results ? Object.keys(log.vote_results).length : 0;
  if (voters === 0) return null;
  const correct = (log.correct_players || []).length;
  return correct / voters;
}

function avgAccuracy(logs: SessionLogRow[]): number | null {
  const rates = logs.map(computeAccuracy).filter((r): r is number => r != null);
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

// ============================================================
// 1. Per-session metrics
// ============================================================

export function computeSessionMetrics(log: SessionLogRow): SessionMetrics {
  const voteEntries = log.vote_results ? Object.entries(log.vote_results) : [];
  const correctPlayers = log.correct_players || [];
  const reasons = log.vote_reasons
    ? Object.values(log.vote_reasons).filter((r) => r && r.trim().length > 0)
    : [];
  const reflections = log.reflections || [];
  const evidence = log.discovered_evidence || [];

  return {
    duration: log.duration,
    phaseDurations: log.phase_durations || {},
    totalVoters: voteEntries.length,
    correctVoters: correctPlayers.length,
    accuracyRate: voteEntries.length > 0 ? correctPlayers.length / voteEntries.length : null,
    evidenceCount: evidence.length,
    voteReasonCount: reasons.length,
    voteReasonRate: voteEntries.length > 0 ? reasons.length / voteEntries.length : null,
    reflectionCount: reflections.length,
    playerCount: log.player_count,
  };
}

// ============================================================
// 2. Class-level aggregate
// ============================================================

export function aggregateClassMetrics(
  classId: string,
  className: string,
  gradeLabel: string | null,
  logs: SessionLogRow[],
): ClassAggregateMetrics {
  const classLogs = logs.filter((l) => l.class_id === classId);

  const avgDuration = avgOfNonNull(classLogs.map((l) => l.duration));

  const withPhases = classLogs.filter((l) => l.phase_durations);
  const avgDiscuss = avgOfNonNull(withPhases.map((l) => l.phase_durations?.discuss ?? null));
  const avgExplore = avgOfNonNull(withPhases.map((l) => l.phase_durations?.explore ?? null));

  // Scenario breakdown
  const scenarioMap = new Map<string, { title: string; count: number }>();
  classLogs.forEach((l) => {
    const existing = scenarioMap.get(l.scenario_slug);
    if (existing) {
      existing.count++;
    } else {
      scenarioMap.set(l.scenario_slug, {
        title: l.scenario_title || l.scenario_slug,
        count: 1,
      });
    }
  });

  const dates = classLogs
    .map((l) => l.start_time || l.created_at)
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    classId,
    className,
    gradeLabel,
    sessionCount: classLogs.length,
    avgDuration,
    avgAccuracyRate: avgAccuracy(classLogs),
    avgDiscussTime: avgDiscuss,
    avgExploreTime: avgExplore,
    scenarioCounts: Array.from(scenarioMap.entries())
      .map(([slug, { title, count }]) => ({ slug, title, count }))
      .sort((a, b) => b.count - a.count),
    lastSessionDate: dates[0] || null,
  };
}

// ============================================================
// 3. Scenario-level aggregate
// ============================================================

export function aggregateScenarioMetrics(logs: SessionLogRow[]): ScenarioAggregateMetrics[] {
  const grouped = new Map<string, SessionLogRow[]>();
  logs.forEach((l) => {
    const arr = grouped.get(l.scenario_slug) || [];
    arr.push(l);
    grouped.set(l.scenario_slug, arr);
  });

  return Array.from(grouped.entries())
    .map(([slug, scenarioLogs]) => {
      const title = scenarioLogs[0].scenario_title || slug;

      const avgDuration = avgOfNonNull(scenarioLogs.map((l) => l.duration));

      const withVotes = scenarioLogs.filter(
        (l) => l.vote_results && Object.keys(l.vote_results).length > 0,
      );
      const avgVoteReasonRate =
        withVotes.length > 0
          ? withVotes.reduce((sum, l) => {
              const total = Object.keys(l.vote_results!).length;
              const reasons = l.vote_reasons
                ? Object.values(l.vote_reasons).filter((r) => r && r.trim().length > 0).length
                : 0;
              return sum + (total > 0 ? reasons / total : 0);
            }, 0) / withVotes.length
          : null;

      const withPhases = scenarioLogs.filter((l) => l.phase_durations);
      const avgDiscuss = avgOfNonNull(withPhases.map((l) => l.phase_durations?.discuss ?? null));

      const withEvidence = scenarioLogs.filter((l) => l.discovered_evidence);
      const avgEvidence =
        withEvidence.length > 0
          ? Math.round(
              (withEvidence.reduce((s, l) => s + (l.discovered_evidence?.length || 0), 0) /
                withEvidence.length) *
                10,
            ) / 10
          : null;

      return {
        slug,
        title,
        sessionCount: scenarioLogs.length,
        avgDuration,
        avgAccuracyRate: avgAccuracy(scenarioLogs),
        avgVoteReasonRate,
        avgDiscussTime: avgDiscuss,
        avgEvidenceCount: avgEvidence,
      };
    })
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

// ============================================================
// 4. Student-level aggregate
// ============================================================

export function aggregateStudentMetrics(
  students: { id: string; student_name: string; className: string }[],
  studentLogs: { student_id: string; is_correct: boolean | null; created_at: string }[],
): StudentAggregateMetrics[] {
  // Group logs by student_id
  const logsByStudent = new Map<string, typeof studentLogs>();
  studentLogs.forEach((sl) => {
    const arr = logsByStudent.get(sl.student_id) || [];
    arr.push(sl);
    logsByStudent.set(sl.student_id, arr);
  });

  return students.map((s) => {
    const logs = logsByStudent.get(s.id) || [];
    const withResult = logs.filter((l) => l.is_correct != null);
    const correctCount = withResult.filter((l) => l.is_correct === true).length;
    const dates = logs.map((l) => l.created_at).sort().reverse();

    return {
      studentId: s.id,
      studentName: s.student_name,
      className: s.className,
      participationCount: logs.length,
      correctCount,
      accuracyRate: withResult.length > 0 ? correctCount / withResult.length : null,
      lastSessionDate: dates[0] || null,
    };
  });
}

// ============================================================
// 5. Summary (dashboard top-level)
// ============================================================

export function computeSummaryMetrics(
  logs: SessionLogRow[],
  classCount: number,
  studentCount: number,
): SummaryMetrics {
  const avgDuration = avgOfNonNull(logs.map((l) => l.duration));

  const withPhases = logs.filter((l) => l.phase_durations);
  const avgDiscuss = avgOfNonNull(withPhases.map((l) => l.phase_durations?.discuss ?? null));

  return {
    totalSessions: logs.length,
    totalClasses: classCount,
    totalStudents: studentCount,
    avgAccuracyRate: avgAccuracy(logs),
    avgDuration,
    avgDiscussTime: avgDiscuss,
  };
}

// ============================================================
// Format helpers
// ============================================================

export function formatMinSec(totalSeconds: number | null): string {
  if (totalSeconds == null) return '--';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPercent(rate: number | null): string {
  if (rate == null) return '--';
  return `${Math.round(rate * 100)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
