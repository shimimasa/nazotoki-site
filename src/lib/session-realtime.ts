/**
 * Session Realtime — Phase 56-62, 71 (RLS hardening), 81 (Critical Security Fix), 85 (Resilient Reconnection)
 *
 * session_runs: セッション進行中のライブ状態
 * session_participants: 参加コードで参加した生徒
 *
 * 先生側: createSessionRun → updateSessionRun（フェーズ変更時）→ endSessionRun
 * 生徒側: findSessionByCode(RPC) → joinSession(RPC) → subscribeToSessionRun → voteAsParticipant(RPC)
 * 再接続: reconnectSession(RPC)
 *
 * Phase 71: 生徒の session_participants 操作を全て SECURITY DEFINER RPC に移行。
 *           anon の直接 INSERT/UPDATE/SELECT を廃止し、トークン認証をDB側で実施。
 * Phase 81: createSessionRunからteacherId引数を削除（auth.uid()で内部解決）。
 *           findSessionByCodeをRPC化（直接SELECT廃止）。
 */
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================
// Types
// ============================================================

export interface SessionRun {
  id: string;
  scenario_slug: string;
  scenario_title: string | null;
  teacher_id: string | null;
  class_id: string | null;
  join_code: string;
  current_phase: string;
  timer_seconds: number;
  timer_running: boolean;
  discovered_evidence: number[];
  twist_revealed: boolean;
  votes: Record<string, string>;
  vote_reasons: Record<string, string>;
  character_names: string[];
  evidence_titles: { number: number; title: string }[];
  player_count: number;
  is_active: boolean;
  started_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface SessionParticipant {
  id: string;
  session_run_id: string;
  participant_name: string;
  student_id: string | null;
  assigned_character: string | null;
  session_token: string;
  voted_for: string | null;
  vote_reason: string | null;
  voted_at: string | null;
  joined_at: string;
  token_expires_at: string | null;
  last_seen_at: string | null;
}

// ============================================================
// Teacher Functions
// ============================================================

/** Create a new session run (teacher starts session) — Phase 72/81: atomic RPC, auth.uid() internal */
export async function createSessionRun(params: {
  scenarioSlug: string;
  scenarioTitle: string;
  classId: string | null;
  playerCount: number;
  characterNames?: string[];
  evidenceTitles?: { number: number; title: string }[];
}): Promise<{ id: string; joinCode: string } | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rpc_create_session_run', {
    p_scenario_slug: params.scenarioSlug,
    p_scenario_title: params.scenarioTitle,
    p_class_id: params.classId || null,
    p_player_count: params.playerCount,
    p_character_names: params.characterNames || [],
    p_evidence_titles: params.evidenceTitles || [],
  });

  if (error || !data?.ok) {
    console.error('createSessionRun error:', error || data?.error);
    return null;
  }

  return { id: data.id, joinCode: data.join_code };
}

/** Update session run state (teacher changes phase, timer, etc.) */
export async function updateSessionRun(
  runId: string,
  updates: Partial<{
    current_phase: string;
    timer_seconds: number;
    timer_running: boolean;
    discovered_evidence: number[];
    twist_revealed: boolean;
    votes: Record<string, string>;
    vote_reasons: Record<string, string>;
    player_count: number;
    started_at: string;
    is_active: boolean;
  }>,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('session_runs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', runId);

  if (error) {
    console.error('updateSessionRun error:', error);
    return false;
  }
  return true;
}

/** End session run (mark as inactive) */
export async function endSessionRun(runId: string): Promise<boolean> {
  return updateSessionRun(runId, { is_active: false });
}

/** Fetch participants for a session run (teacher view) */
export async function fetchSessionParticipants(
  runId: string,
): Promise<SessionParticipant[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_participants')
    .select('*')
    .eq('session_run_id', runId)
    .order('joined_at', { ascending: true });
  if (error) {
    console.error('fetchSessionParticipants error:', error);
    return [];
  }
  return (data || []) as SessionParticipant[];
}

// ============================================================
// Student Functions
// ============================================================

/** Find active session by join code — Phase 81: RPC (no direct SELECT enumeration) */
export async function findSessionByCode(
  joinCode: string,
): Promise<SessionRun | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rpc_find_session_by_code', {
    p_join_code: joinCode.toUpperCase().trim(),
  });

  if (error || !data?.ok) return null;

  // RPC excludes teacher_id/class_id for security; default them to null
  const run = data.run;
  return {
    ...run,
    teacher_id: null,
    class_id: null,
  } as SessionRun;
}

/** Join a session as participant (student) — Phase 71/83: RPC with token auth + student_id validation */
export async function joinSession(params: {
  joinCode: string;
  participantName: string;
  studentId?: string;
  studentToken?: string;
}): Promise<SessionParticipant | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rpc_join_session', {
    p_join_code: params.joinCode,
    p_participant_name: params.participantName,
    p_student_id: params.studentId || null,
    p_student_token: params.studentToken || null,
  });

  if (error || !data?.ok) {
    console.error('joinSession error:', error || data?.error);
    return null;
  }

  const participant = data.participant as SessionParticipant;

  // Store token in localStorage for reconnection
  try {
    localStorage.setItem('nazotoki-session-token', participant.session_token);
    localStorage.setItem('nazotoki-session-run-id', participant.session_run_id);
  } catch { /* ignore */ }

  return participant;
}

/** Vote as participant (student) — Phase 71: uses RPC with token auth */
export async function voteAsParticipant(
  participantId: string,
  sessionToken: string,
  votedFor: string,
  voteReason?: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc('rpc_submit_vote', {
    p_participant_id: participantId,
    p_session_token: sessionToken,
    p_voted_for: votedFor,
    p_vote_reason: voteReason || null,
  });

  if (error || !data?.ok) {
    console.error('voteAsParticipant error:', error || data?.error);
    return false;
  }
  return true;
}

/** Link a participant to a student record (teacher action) */
export async function linkParticipantStudent(
  participantId: string,
  studentId: string | null,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('session_participants')
    .update({ student_id: studentId })
    .eq('id', participantId);

  if (error) {
    console.error('linkParticipantStudent error:', error);
    return false;
  }
  return true;
}

/** Assign a character to a participant (teacher action) */
export async function assignCharacter(
  participantId: string,
  characterName: string | null,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('session_participants')
    .update({ assigned_character: characterName })
    .eq('id', participantId);

  if (error) {
    console.error('assignCharacter error:', error);
    return false;
  }
  return true;
}

// ============================================================
// Reconnection (Phase 58)
// ============================================================

/** Reconnect to a session using saved token — Phase 71: uses RPC with token auth */
export async function reconnectSession(
  sessionRunId: string,
  sessionToken: string,
): Promise<{ run: SessionRun; participant: SessionParticipant } | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rpc_reconnect_session', {
    p_session_run_id: sessionRunId,
    p_session_token: sessionToken,
  });

  if (error || !data?.ok) {
    console.error('reconnectSession error:', error || data?.error);
    return null;
  }

  return {
    run: data.run as SessionRun,
    participant: data.participant as SessionParticipant,
  };
}

/** Fetch own participant record by token — Phase 71: replaces anon SELECT */
export async function fetchMyParticipant(
  participantId: string,
  sessionToken: string,
): Promise<SessionParticipant | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rpc_get_my_participant', {
    p_participant_id: participantId,
    p_session_token: sessionToken,
  });

  if (error || !data?.ok) return null;
  return data.participant as SessionParticipant;
}

/** Clear saved session from localStorage */
export function clearSavedSession(): void {
  try {
    localStorage.removeItem('nazotoki-session-token');
    localStorage.removeItem('nazotoki-session-run-id');
  } catch { /* ignore */ }
}

// ============================================================
// Session Feedback (Phase 91)
// ============================================================

/** Submit session feedback (student calls after session ends) */
export async function submitFeedback(
  participantId: string,
  sessionToken: string,
  funRating: number,
  difficultyRating: number,
  comment: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('rpc_submit_feedback', {
    p_participant_id: participantId,
    p_session_token: sessionToken,
    p_fun: funRating,
    p_difficulty: difficultyRating,
    p_comment: comment,
  });
  if (error || !data?.ok) return false;
  return true;
}

// ============================================================
// Heartbeat (Phase 86: GM connection monitor)
// ============================================================

/** Send heartbeat to update last_seen_at (student calls every 30s) */
export async function sendHeartbeat(
  participantId: string,
  sessionToken: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('rpc_heartbeat', {
    p_participant_id: participantId,
    p_session_token: sessionToken,
  });
  if (error || !data?.ok) return false;
  return true;
}

// ============================================================
// Session State Cache (Phase 85: resilient reconnection)
// ============================================================

/** Cache session state to localStorage for instant restore on page reload */
export function cacheSessionState(runId: string, run: SessionRun): void {
  try {
    localStorage.setItem(
      `session-cache-${runId}`,
      JSON.stringify({ ...run, _cachedAt: Date.now() }),
    );
  } catch { /* ignore */ }
}

/** Restore cached session state from localStorage */
export function getCachedSessionState(runId: string): SessionRun | null {
  try {
    const raw = localStorage.getItem(`session-cache-${runId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    // Ignore stale cache (older than 24 hours)
    if (cached._cachedAt && Date.now() - cached._cachedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`session-cache-${runId}`);
      return null;
    }
    delete cached._cachedAt;
    return cached as SessionRun;
  } catch {
    return null;
  }
}

/** Clear cached session state */
export function clearSessionCache(runId: string): void {
  try {
    localStorage.removeItem(`session-cache-${runId}`);
  } catch { /* ignore */ }
}

// ============================================================
// Realtime Subscriptions
// ============================================================

/** Subscribe to session run updates (student listens to teacher's phase changes) */
export function subscribeToSessionRun(
  runId: string,
  onUpdate: (run: SessionRun) => void,
  onStatus?: (status: string) => void,
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`session-run-${runId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_runs',
        filter: `id=eq.${runId}`,
      },
      (payload) => {
        onUpdate(payload.new as SessionRun);
      },
    )
    .subscribe((status) => {
      if (onStatus) onStatus(status);
    });

  return channel;
}

/** Subscribe to participant changes (teacher sees who joined, who voted) */
export function subscribeToParticipants(
  runId: string,
  onInsert: (participant: SessionParticipant) => void,
  onUpdate: (participant: SessionParticipant) => void,
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`session-participants-${runId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'session_participants',
        filter: `session_run_id=eq.${runId}`,
      },
      (payload) => {
        onInsert(payload.new as SessionParticipant);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_participants',
        filter: `session_run_id=eq.${runId}`,
      },
      (payload) => {
        onUpdate(payload.new as SessionParticipant);
      },
    )
    .subscribe();

  return channel;
}

/** Unsubscribe from a channel */
export function unsubscribeChannel(channel: RealtimeChannel | null): void {
  if (channel && supabase) {
    supabase.removeChannel(channel);
  }
}
