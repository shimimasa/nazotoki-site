import { computeGoNoGo } from '../../src/lib/classroom-summary';
import type {
  SessionFeedbackRow,
  SessionLogRow,
  SoloSessionRow,
  StudentLogSummary,
} from '../../src/lib/supabase-client';

function createLogs(count: number): SessionLogRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `log-${index}`,
    scenario_slug: `scenario-${index}`,
    scenario_title: `Scenario ${index}`,
    start_time: null,
    end_time: null,
    duration: null,
    phase_durations: null,
    vote_results: null,
    vote_reasons: null,
    discovered_evidence: null,
    twist_revealed: false,
    correct_players: null,
    gm_memo: null,
    reflections: null,
    environment: null,
    player_count: null,
    teacher_name: null,
    teacher_id: null,
    class_id: null,
    created_at: '2026-03-16T00:00:00.000Z',
  }));
}

function createStudentLogs(total: number, voted: number, uniqueStudents = total): StudentLogSummary[] {
  return Array.from({ length: total }, (_, index) => ({
    student_id: `student-${index % uniqueStudents}`,
    is_correct: index < voted ? true : null,
    vote_reason: index < voted ? 'reason' : null,
    created_at: '2026-03-16T00:00:00.000Z',
  }));
}

function createSoloSessions(count: number, daysAgo = 0): SoloSessionRow[] {
  const completedAt = new Date();
  completedAt.setDate(completedAt.getDate() - daysAgo);
  return Array.from({ length: count }, (_, index) => ({
    id: `solo-${index}`,
    student_id: `student-${index}`,
    scenario_slug: `scenario-${index}`,
    completed_at: completedAt.toISOString(),
    duration_seconds: 300,
    vote: 'a',
    vote_reason: 'because',
    is_correct: true,
    rp_earned: 10,
    created_at: completedAt.toISOString(),
  }));
}

function createFeedback(total: number, funCount: number): SessionFeedbackRow[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `feedback-${index}`,
    session_run_id: 'run-1',
    participant_id: `participant-${index}`,
    fun_rating: index < funCount ? 4 : 3,
    difficulty_rating: 3,
    comment: '',
    created_at: '2026-03-16T00:00:00.000Z',
  }));
}

describe('computeGoNoGo', () => {
  it('passes all metrics when every KPI is met', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 10, 8),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.allPassed).toBe(true);
    expect(result.passedCount).toBe(5);
    expect(result.metrics.map((metric) => metric.passed)).toEqual([true, true, true, true, true]);
  });

  it('fails the session count metric when there are fewer than 10 sessions', () => {
    const result = computeGoNoGo(
      createLogs(9),
      10,
      createStudentLogs(10, 10, 8),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.metrics[0]?.passed).toBe(false);
  });

  it('fails the participation metric when fewer than 80 percent join', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(7, 7, 7),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.metrics[1]?.value).toBe(70);
    expect(result.metrics[1]?.passed).toBe(false);
  });

  it('passes the vote metric at exactly 90 percent', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 9, 8),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.metrics[2]?.value).toBe(90);
    expect(result.metrics[2]?.passed).toBe(true);
  });

  it('fails the solo activity metric when only 9 students were active recently', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 10, 8),
      createSoloSessions(9),
      createFeedback(10, 7),
    );

    expect(result.metrics[3]?.value).toBe(9);
    expect(result.metrics[3]?.passed).toBe(false);
  });

  it('ignores solo sessions completed more than a week ago', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 10, 8),
      createSoloSessions(12, 8),
      createFeedback(10, 7),
    );

    expect(result.metrics[3]?.value).toBe(0);
    expect(result.metrics[3]?.passed).toBe(false);
  });

  it('passes the fun metric at exactly 70 percent', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 10, 8),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.metrics[4]?.value).toBe(70);
    expect(result.metrics[4]?.passed).toBe(true);
  });

  it('counts duplicated student log ids only once for participation', () => {
    const result = computeGoNoGo(
      createLogs(10),
      10,
      createStudentLogs(10, 10, 2),
      createSoloSessions(10),
      createFeedback(10, 7),
    );

    expect(result.metrics[1]?.value).toBe(20);
    expect(result.allPassed).toBe(false);
  });
});
