import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  findSessionByCode,
  joinSession,
  voteAsParticipant,
  subscribeToSessionRun,
  unsubscribeChannel,
  reconnectSession,
  fetchMyParticipant,
  clearSavedSession,
  type SessionRun,
  type SessionParticipant,
} from '../../lib/session-realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { PHASE_CONFIG } from './types';

// ============================================================
// Types
// ============================================================

type Screen = 'join' | 'lobby' | 'session' | 'ended';

// ============================================================
// Phase display config (student-facing labels)
// ============================================================

const PHASE_DISPLAY: Record<string, { icon: string; label: string; message: string }> = {
  prep: { icon: '⚙️', label: '準備中', message: '先生がセッションを準備しています...' },
  intro: { icon: '📖', label: '導入', message: '先生の説明を聞いてください' },
  explore: { icon: '🔍', label: '探索', message: '証拠カードを調べましょう！' },
  twist: { icon: '⚡', label: '反転', message: '新しい証拠が明らかに...！' },
  discuss: { icon: '💬', label: '議論', message: 'グループで話し合いましょう' },
  vote: { icon: '🗳️', label: '投票', message: '犯人だと思う人を選んでください' },
  truth: { icon: '🎬', label: '真相', message: '先生の画面を見てください' },
};

// ============================================================
// Main Component
// ============================================================

export default function StudentSession() {
  // Join state
  const [screen, setScreen] = useState<Screen>('join');
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session state
  const [sessionRun, setSessionRun] = useState<SessionRun | null>(null);
  const [participant, setParticipant] = useState<SessionParticipant | null>(null);
  const participantRef = useRef<SessionParticipant | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Vote state
  const [votedFor, setVotedFor] = useState('');
  const [voteReason, setVoteReason] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [voting, setVoting] = useState(false);

  // Evidence panel state (Phase 63)
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // Expanded evidence card indices (Phase 67)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  // Scenario content (Phase 67: rich student view)
  const [scenarioContent, setScenarioContent] = useState<{
    common_html: string;
    evidence_cards: { number: number; title: string; content_html: string }[];
    evidence5: { number: number; title: string; content_html: string } | null;
  } | null>(null);

  // Timer state (local countdown)
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  // Connection state (Phase 68)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const pendingVoteRef = useRef<{ votedFor: string; voteReason: string } | null>(null);

  // Reconnection state
  const [reconnecting, setReconnecting] = useState(true);

  // Handle Realtime channel status changes (Phase 68)
  const handleChannelStatus = useCallback((status: string) => {
    if (status === 'SUBSCRIBED') {
      setConnectionStatus('connected');
      // Retry pending vote if any
      const pending = pendingVoteRef.current;
      const p = participantRef.current;
      if (pending && p) {
        pendingVoteRef.current = null;
        voteAsParticipant(p.id, p.session_token, pending.votedFor, pending.voteReason || undefined)
          .then((ok) => { if (ok) setHasVoted(true); });
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setConnectionStatus('disconnected');
    } else if (status === 'CLOSED') {
      setConnectionStatus('disconnected');
    }
  }, []);

  // Manual reconnect (Phase 68)
  const handleReconnect = useCallback(() => {
    if (!sessionRun) return;
    setConnectionStatus('reconnecting');
    // Unsubscribe old channel
    if (channelRef.current) unsubscribeChannel(channelRef.current);
    // Re-subscribe to session run
    const channel = subscribeToSessionRun(
      sessionRun.id,
      (updated) => {
        setSessionRun(updated);
        refreshParticipant();
      },
      handleChannelStatus,
    );
    channelRef.current = channel;
  }, [sessionRun, handleChannelStatus]);

  // Fetch own participant data via RPC — Phase 71: replaces Realtime subscription
  const refreshParticipant = useCallback(async () => {
    const p = participantRef.current;
    if (!p) return;
    const fresh = await fetchMyParticipant(p.id, p.session_token);
    if (fresh) {
      setParticipant(fresh);
      participantRef.current = fresh;
    }
  }, []);

  // Try to reconnect from localStorage, or fall through to join screen
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedToken = localStorage.getItem('nazotoki-session-token');
        const savedRunId = localStorage.getItem('nazotoki-session-run-id');
        const savedName = localStorage.getItem('nazotoki-player-name');
        if (savedName) setPlayerName(savedName);

        // Check URL for pre-filled code (Phase 73: validate format)
        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get('code');
        if (codeParam) {
          const normalized = codeParam.toUpperCase().trim();
          if (/^[A-Z2-9]{6}$/.test(normalized)) {
            setJoinCode(normalized);
          }
        }

        // Attempt reconnection if we have saved session data
        if (savedToken && savedRunId) {
          const result = await reconnectSession(savedRunId, savedToken);

          if (cancelled) return;

          if (result) {
            const { run, participant: p } = result;
            setSessionRun(run);
            setParticipant(p);
            participantRef.current = p;

            // Restore vote state if already voted
            if (p.voted_for) {
              setVotedFor(p.voted_for);
              setVoteReason(p.vote_reason || '');
              setHasVoted(true);
            }

            if (run.is_active) {
              // Session still active — subscribe and go to session screen
              const channel = subscribeToSessionRun(
                run.id,
                (updated) => {
                  setSessionRun(updated);
                  // Phase 71: fetch participant via RPC on session updates
                  refreshParticipant();
                },
                handleChannelStatus,
              );
              channelRef.current = channel;
              setScreen('session');
            } else {
              // Session ended while we were away
              setScreen('ended');
            }

            setReconnecting(false);
            return;
          }

          // Token invalid or session gone — clear saved data
          clearSavedSession();
        }
      } catch { /* ignore */ }

      if (!cancelled) setReconnecting(false);
    })();

    return () => { cancelled = true; };
  }, []);

  // Fetch scenario content JSON (Phase 67: rich student view)
  useEffect(() => {
    if (!sessionRun?.scenario_slug || scenarioContent) return;
    let cancelled = false;
    fetch(`/data/scenarios/${sessionRun.scenario_slug}.json`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) setScenarioContent(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionRun?.scenario_slug]);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const id = setInterval(() => setTimerSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerSeconds]);

  // Sync timer from session run updates
  useEffect(() => {
    if (!sessionRun) return;
    setTimerSeconds(sessionRun.timer_seconds);
    setTimerRunning(sessionRun.timer_running);
  }, [sessionRun?.current_phase, sessionRun?.timer_seconds, sessionRun?.timer_running]);

  // Watch for session end — cleanup channel and transition
  useEffect(() => {
    if (sessionRun && !sessionRun.is_active && screen === 'session') {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
      }
      setScreen('ended');
    }
  }, [sessionRun?.is_active, screen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
      }
    };
  }, []);

  // ============================================================
  // Handlers
  // ============================================================

  const handleFindSession = useCallback(async () => {
    setError(null);
    setJoining(true);

    const code = joinCode.toUpperCase().trim();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      setError('参加コードは6文字の英数字です（例: ABC234）');
      setJoining(false);
      return;
    }

    try {
      const run = await findSessionByCode(code);
      if (!run) {
        setError('セッションが見つかりません。コードを確認してください');
        setJoining(false);
        return;
      }

      setSessionRun(run);
      setScreen('lobby');
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください');
    }
    setJoining(false);
  }, [joinCode]);

  const handleJoinSession = useCallback(async () => {
    if (!sessionRun || !playerName.trim()) return;
    setError(null);
    setJoining(true);

    try {
      // Phase 71: RPC handles active check + participant insert atomically
      const p = await joinSession({
        joinCode: sessionRun.join_code,
        participantName: playerName.trim(),
      });

      if (!p) {
        setError('参加に失敗しました。セッションが終了しているか、もう一度試してください');
        setJoining(false);
        return;
      }

      setParticipant(p);
      participantRef.current = p;

      // Save name for next time
      try {
        localStorage.setItem('nazotoki-player-name', playerName.trim());
      } catch { /* ignore */ }

      // Subscribe to session updates (Phase 71: session_run only, participant via RPC)
      const channel = subscribeToSessionRun(
        sessionRun.id,
        (updated) => {
          setSessionRun(updated);
          refreshParticipant();
        },
        handleChannelStatus,
      );
      channelRef.current = channel;

      setScreen('session');
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください');
    }
    setJoining(false);
  }, [sessionRun, playerName]);

  const handleVote = useCallback(async () => {
    if (!participant || !votedFor.trim()) return;
    setVoting(true);
    setError(null);

    // If disconnected, queue the vote for retry on reconnect
    if (connectionStatus === 'disconnected') {
      pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
      setHasVoted(true);
      setVoting(false);
      return;
    }

    try {
      // Phase 71: pass session_token for RPC auth
      const ok = await voteAsParticipant(
        participant.id, participant.session_token,
        votedFor.trim(), voteReason.trim() || undefined,
      );
      if (ok) {
        setHasVoted(true);
      } else {
        // Queue for retry
        pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
        setHasVoted(true);
      }
    } catch {
      // Network error — queue for retry
      pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
      setHasVoted(true);
    }
    setVoting(false);
  }, [participant, votedFor, voteReason, connectionStatus]);

  // ============================================================
  // Render
  // ============================================================

  // Reconnecting screen
  if (reconnecting) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4">
        <div class="text-center space-y-4">
          <div class="text-5xl animate-pulse">🔍</div>
          <p class="text-gray-500 font-bold">接続中...</p>
        </div>
      </div>
    );
  }

  if (screen === 'join') {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4">
        <div class="w-full max-w-sm space-y-6">
          <div class="text-center">
            <div class="text-5xl mb-3">🔍</div>
            <h1 class="text-2xl font-black text-gray-900">ナゾトキ探偵団</h1>
            <p class="text-gray-500 text-sm mt-1">参加コードを入力してセッションに参加</p>
          </div>

          <div class="space-y-4">
            <div>
              <input
                type="text"
                value={joinCode}
                onInput={(e) => setJoinCode((e.target as HTMLInputElement).value.toUpperCase())}
                placeholder="参加コード（6文字）"
                maxLength={6}
                class="w-full px-4 py-4 text-center text-2xl font-mono font-black tracking-[0.3em] uppercase border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFindSession();
                }}
                autoFocus
              />
            </div>

            {error && (
              <p class="text-red-600 text-sm text-center font-bold">{error}</p>
            )}

            <button
              onClick={handleFindSession}
              disabled={joining || joinCode.length < 4}
              class={`w-full py-4 rounded-xl text-lg font-black transition-colors ${
                joining || joinCode.length < 4
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700'
              }`}
            >
              {joining ? '検索中...' : 'セッションを探す'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4">
        <div class="w-full max-w-sm space-y-6">
          <div class="text-center">
            <div class="text-4xl mb-2">✅</div>
            <h2 class="text-xl font-black text-gray-900">セッション発見！</h2>
            <p class="text-amber-700 font-bold mt-2">{sessionRun?.scenario_title}</p>
          </div>

          <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">参加コード</span>
              <span class="font-mono font-bold">{sessionRun?.join_code}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">フェーズ</span>
              <span class="font-bold">
                {PHASE_DISPLAY[sessionRun?.current_phase || 'prep']?.icon}{' '}
                {PHASE_DISPLAY[sessionRun?.current_phase || 'prep']?.label}
              </span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-bold text-gray-700 mb-2">
              あなたの名前
            </label>
            <input
              type="text"
              value={playerName}
              onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)}
              placeholder="名前を入力"
              maxLength={20}
              class="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && playerName.trim()) handleJoinSession();
              }}
              autoFocus
            />
          </div>

          {error && (
            <p class="text-red-600 text-sm text-center font-bold">{error}</p>
          )}

          <div class="space-y-2">
            <button
              onClick={handleJoinSession}
              disabled={joining || !playerName.trim()}
              class={`w-full py-4 rounded-xl text-lg font-black transition-colors ${
                joining || !playerName.trim()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700'
              }`}
            >
              {joining ? '参加中...' : '参加する'}
            </button>
            <button
              onClick={() => {
                setScreen('join');
                setSessionRun(null);
                setError(null);
              }}
              class="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'ended') {
    const myVote = votedFor || participant?.voted_for || null;
    const myReason = voteReason || participant?.vote_reason || null;
    const charNames = (sessionRun?.character_names as string[]) || [];
    const allVotes = (sessionRun?.votes as Record<string, string>) || {};
    const voteEntries = Object.values(allVotes);
    const totalVotes = voteEntries.length;
    const voteCounts: Record<string, number> = {};
    for (const name of charNames) voteCounts[name] = 0;
    for (const v of voteEntries) {
      if (voteCounts[v] !== undefined) voteCounts[v]++;
      else voteCounts[v] = (voteCounts[v] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(voteCounts), 1);
    const discoveredCount = ((sessionRun?.discovered_evidence as number[]) || []).length;
    const totalEvidence = ((sessionRun?.evidence_titles as { number: number; title: string }[]) || []).length;

    const handleReset = () => {
      clearSavedSession();
      setScreen('join');
      setSessionRun(null);
      setParticipant(null);
      setJoinCode('');
      setHasVoted(false);
      setVotedFor('');
      setVoteReason('');
      setScenarioContent(null);
      setEvidenceOpen(false);
      setExpandedCards(new Set());
    };

    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4 py-8">
        <div class="w-full max-w-sm space-y-5">
          {/* Header */}
          <div class="text-center space-y-2">
            <div class="text-5xl">🎉</div>
            <h2 class="text-2xl font-black text-gray-900">セッション終了！</h2>
            {sessionRun?.scenario_title && (
              <p class="text-amber-700 font-bold text-sm">{sessionRun.scenario_title}</p>
            )}
          </div>

          {/* My participation summary */}
          <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
            <h3 class="text-sm font-black text-gray-500 text-center">あなたの記録</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">名前</span>
                <span class="font-bold">{participant?.participant_name}</span>
              </div>
              {participant?.assigned_character && (
                <div class="flex justify-between">
                  <span class="text-gray-500">役割</span>
                  <span class="font-bold text-amber-700">{'\uD83C\uDFAD'} {participant.assigned_character}</span>
                </div>
              )}
              {myVote && (
                <div class="flex justify-between">
                  <span class="text-gray-500">投票</span>
                  <span class="font-bold">{myVote}</span>
                </div>
              )}
              {myReason && (
                <div class="pt-1 border-t border-gray-100">
                  <p class="text-gray-500 text-xs mb-1">あなたの推理</p>
                  <p class="text-gray-700 text-sm">「{myReason}」</p>
                </div>
              )}
              {totalEvidence > 0 && (
                <div class="flex justify-between">
                  <span class="text-gray-500">発見した証拠</span>
                  <span class="font-bold">{discoveredCount}/{totalEvidence}</span>
                </div>
              )}
            </div>
          </div>

          {/* Vote results */}
          {totalVotes > 0 && (
            <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
              <h3 class="text-sm font-black text-gray-500 text-center">
                {'\uD83D\uDDF3\uFE0F'} みんなの投票結果
              </h3>
              <div class="space-y-2">
                {Object.entries(voteCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => {
                    const pct = Math.round((count / maxCount) * 100);
                    const isMyVote = name === myVote;
                    return (
                      <div key={name} class="space-y-0.5">
                        <div class="flex items-center justify-between text-sm">
                          <span class={`font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-700'}`}>
                            {isMyVote && '\u25B6 '}{name}
                          </span>
                          <span class={`font-mono font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-500'}`}>
                            {count}{'\u7968'}
                          </span>
                        </div>
                        <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            class={`h-full rounded-full transition-all ${
                              isMyVote ? 'bg-amber-400' : 'bg-sky-300'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Thank you + reset */}
          <div class="text-center space-y-3 pt-2">
            <p class="text-gray-500 text-sm">お疲れ様でした！</p>
            <button
              onClick={handleReset}
              class="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 active:bg-gray-400 transition-colors"
            >
              トップに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Session screen (realtime phase display)
  // ============================================================

  const phase = sessionRun?.current_phase || 'prep';
  const phaseInfo = PHASE_DISPLAY[phase] || PHASE_DISPLAY.prep;
  const isVotePhase = phase === 'vote';

  const mm = Math.floor(Math.abs(timerSeconds) / 60).toString().padStart(2, '0');
  const ss = Math.abs(timerSeconds % 60).toString().padStart(2, '0');
  const isOvertime = timerSeconds < 0;

  return (
    <div class="min-h-[80dvh] flex flex-col px-4 py-6 relative max-w-2xl mx-auto w-full">
      {/* Connection indicator (Phase 68) */}
      <div class="absolute top-2 right-2 flex items-center gap-1.5">
        <span class={`w-2.5 h-2.5 rounded-full ${
          connectionStatus === 'connected'
            ? 'bg-green-400'
            : connectionStatus === 'reconnecting'
              ? 'bg-yellow-400 animate-pulse'
              : 'bg-red-400'
        }`} />
        {connectionStatus !== 'connected' && (
          <span class="text-[10px] text-gray-400 font-bold">
            {connectionStatus === 'reconnecting' ? '再接続中' : '切断'}
          </span>
        )}
      </div>

      {/* Disconnection banner (Phase 68) */}
      {connectionStatus === 'disconnected' && (
        <div class="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p class="text-red-700 text-sm font-bold">接続が切れました</p>
          <button
            onClick={handleReconnect}
            class="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
          >
            再接続
          </button>
        </div>
      )}

      {/* Header: scenario + participant info */}
      <div class="text-center mb-6">
        <p class="text-sm text-gray-400">{participant?.participant_name}</p>
        {participant?.assigned_character && (
          <div class="inline-block mt-1 px-3 py-1 bg-amber-100 border border-amber-300 rounded-full">
            <span class="text-amber-800 font-black text-sm">
              {'\uD83C\uDFAD'} {participant.assigned_character}役
            </span>
          </div>
        )}
        <h1 class="text-lg font-black text-gray-900 mt-1">
          {sessionRun?.scenario_title}
        </h1>
      </div>

      {/* Phase indicator */}
      <div class="bg-white rounded-2xl border-2 border-gray-200 p-6 text-center mb-6">
        <div class="text-5xl mb-3">{phaseInfo.icon}</div>
        <h2 class="text-2xl font-black text-gray-900">{phaseInfo.label}</h2>
        <p class="text-gray-500 mt-2">{phaseInfo.message}</p>

        {/* Timer */}
        {timerSeconds !== 0 && (
          <div class={`mt-4 font-mono font-black text-4xl tabular-nums ${
            isOvertime ? 'text-red-500 animate-pulse' : timerSeconds <= 60 ? 'text-red-500' : 'text-gray-800'
          }`}>
            {isOvertime && '-'}{mm}:{ss}
          </div>
        )}
      </div>

      {/* Intro phase: rich common info (Phase 67) */}
      {phase === 'intro' && scenarioContent && (
        <div class="mb-4 bg-white rounded-xl border border-gray-200 p-4 max-h-[60vh] overflow-y-auto">
          <div
            class="prose prose-sm max-w-none [&_ruby_rt]:text-[0.6em] [&_ruby_rt]:text-gray-400"
            dangerouslySetInnerHTML={{ __html: scenarioContent.common_html }}
          />
        </div>
      )}

      {/* Evidence reference panel (Phase 63/67) — explore/discuss/vote phases */}
      {sessionRun && ['explore', 'discuss', 'vote'].includes(phase) && (() => {
        const titles = (sessionRun.evidence_titles as { number: number; title: string }[]) || [];
        const discovered = (sessionRun.discovered_evidence as number[]) || [];
        const discoveredTitles = titles.filter((t) => discovered.includes(t.number));
        if (titles.length === 0) return null;
        const richCards = scenarioContent?.evidence_cards || [];
        return (
          <div class="mb-4">
            <button
              onClick={() => setEvidenceOpen((v) => !v)}
              class="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <span>{'\uD83D\uDD0D'} 発見した証拠（{discoveredTitles.length}/{titles.length}）</span>
              <span class={`transition-transform ${evidenceOpen ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
            </button>
            {evidenceOpen && (
              <div class="mt-1 border border-amber-200 rounded-xl bg-white overflow-hidden">
                {titles.map((t) => {
                  const found = discovered.includes(t.number);
                  const richCard = richCards.find((c) => c.number === t.number);
                  const isExpanded = expandedCards.has(t.number);
                  return (
                    <div key={t.number} class="border-b border-amber-100 last:border-b-0">
                      <button
                        onClick={() => {
                          if (!found || !richCard) return;
                          setExpandedCards((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.number)) next.delete(t.number);
                            else next.add(t.number);
                            return next;
                          });
                        }}
                        class={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left ${
                          found ? 'text-gray-900' : 'text-gray-300'
                        } ${found && richCard ? 'hover:bg-amber-50 cursor-pointer' : 'cursor-default'}`}
                      >
                        <span class={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
                          found ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-400'
                        }`}>
                          {found ? '\u2713' : t.number}
                        </span>
                        <span class="font-bold flex-1">{found ? t.title : '???'}</span>
                        {found && richCard && (
                          <span class={`text-amber-400 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
                        )}
                      </button>
                      {found && richCard && isExpanded && (
                        <div class="px-4 pb-3">
                          <div
                            class="prose prose-sm max-w-none text-gray-700 bg-amber-50/50 rounded-lg p-3 [&_ruby_rt]:text-[0.6em] [&_ruby_rt]:text-gray-400"
                            dangerouslySetInnerHTML={{ __html: richCard.content_html }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Phase-specific content */}
      <div class="flex-1">
        {/* Explore phase: discovered count + hint */}
        {phase === 'explore' && sessionRun && (
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p class="text-amber-800 font-bold">
              {'\uD83D\uDD0D'} 発見された証拠: {(sessionRun.discovered_evidence as number[]).length}個
            </p>
            <p class="text-amber-600 text-sm mt-1">
              {scenarioContent
                ? '上の証拠パネルをタップして内容を確認できます'
                : '先生の画面で証拠カードを確認しましょう'}
            </p>
          </div>
        )}

        {/* Twist phase: reveal indicator */}
        {phase === 'twist' && sessionRun && (
          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
            {sessionRun.twist_revealed ? (
              <p class="text-purple-800 font-bold">⚡ 新しい証拠が公開されました！</p>
            ) : (
              <p class="text-purple-600">まもなく新しい証拠が明かされます...</p>
            )}
          </div>
        )}

        {/* Discuss phase */}
        {phase === 'discuss' && (
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <p class="text-blue-800 font-bold">💬 グループで話し合いましょう</p>
            <p class="text-blue-600 text-sm mt-1">
              証拠をもとに、犯人は誰か議論してください
            </p>
          </div>
        )}

        {/* Vote phase: student vote form */}
        {isVotePhase && !hasVoted && (() => {
          const charNames = (sessionRun?.character_names as string[]) || [];
          const hasCharNames = charNames.length > 0;
          return (
            <div class="bg-white rounded-xl border-2 border-amber-300 p-6 space-y-4">
              <h3 class="text-lg font-black text-gray-900 text-center">
                🗳️ あなたの投票
              </h3>

              <div>
                <label class="block text-sm font-bold text-gray-700 mb-2">
                  犯人だと思う人
                </label>
                {hasCharNames ? (
                  <div class="grid grid-cols-2 gap-2">
                    {charNames.map((name) => (
                      <button
                        key={name}
                        onClick={() => setVotedFor(name)}
                        class={`px-4 py-3 rounded-xl text-base font-bold transition-all border-2 ${
                          votedFor === name
                            ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-300'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={votedFor}
                    onInput={(e) => setVotedFor((e.target as HTMLInputElement).value)}
                    placeholder="キャラクター名を入力"
                    maxLength={50}
                    class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                  />
                )}
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">
                  理由（なぜそう思う？）
                </label>
                <textarea
                  value={voteReason}
                  onInput={(e) => setVoteReason((e.target as HTMLTextAreaElement).value)}
                  placeholder="証拠や理由を書いてください"
                  maxLength={200}
                  rows={3}
                  class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-base resize-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </div>

              {error && (
                <p class="text-red-600 text-sm text-center font-bold">{error}</p>
              )}

              <button
                onClick={handleVote}
                disabled={voting || !votedFor.trim()}
                class={`w-full py-4 rounded-xl text-lg font-black transition-colors ${
                  voting || !votedFor.trim()
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'
                }`}
              >
                {voting ? '送信中...' : '投票する'}
              </button>
            </div>
          );
        })()}

        {/* Vote submitted */}
        {isVotePhase && hasVoted && (
          <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-2">
            <div class="text-4xl">✅</div>
            <p class="text-green-800 font-black text-lg">投票完了！</p>
            <p class="text-green-600 text-sm">
              「{votedFor}」に投票しました
            </p>
            <p class="text-gray-500 text-sm mt-2">
              先生の画面で結果を確認しましょう
            </p>
          </div>
        )}

        {/* Truth phase: vote results + message */}
        {phase === 'truth' && sessionRun && (() => {
          const charNames = (sessionRun.character_names as string[]) || [];
          const allVotes = sessionRun.votes as Record<string, string>;
          const voteEntries = Object.values(allVotes);
          const totalVotes = voteEntries.length;
          // Count votes per character name
          const voteCounts: Record<string, number> = {};
          for (const name of charNames) voteCounts[name] = 0;
          for (const v of voteEntries) {
            if (voteCounts[v] !== undefined) voteCounts[v]++;
            else voteCounts[v] = (voteCounts[v] || 0) + 1;
          }
          const maxCount = Math.max(...Object.values(voteCounts), 1);
          const myVote = votedFor || participant?.voted_for || null;

          return (
            <div class="space-y-4">
              <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p class="text-amber-800 font-bold">{'\uD83C\uDFAC'} 真相が明かされます</p>
                <p class="text-amber-600 text-sm mt-1">先生の画面を見てください</p>
              </div>

              {totalVotes > 0 && (
                <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
                  <h3 class="text-sm font-black text-gray-700 text-center">
                    {'\uD83D\uDDF3\uFE0F'} みんなの投票結果
                  </h3>
                  <div class="space-y-2">
                    {Object.entries(voteCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => {
                        const pct = Math.round((count / maxCount) * 100);
                        const isMyVote = name === myVote;
                        return (
                          <div key={name} class="space-y-0.5">
                            <div class="flex items-center justify-between text-sm">
                              <span class={`font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-700'}`}>
                                {isMyVote && '\u25B6 '}{name}
                              </span>
                              <span class={`font-mono font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-500'}`}>
                                {count}{'\u7968'}
                              </span>
                            </div>
                            <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                class={`h-full rounded-full transition-all ${
                                  isMyVote ? 'bg-amber-400' : 'bg-sky-300'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {myVote && (
                    <p class="text-xs text-gray-400 text-center pt-1">
                      {'\u25B6'} あなたの投票: <span class="font-bold text-amber-700">{myVote}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer: connection status */}
      <div class="mt-6 text-center space-y-1">
        {pendingVoteRef.current && (
          <p class="text-xs text-amber-500 font-bold">
            {'\u26A0'} 投票は再接続時に送信されます
          </p>
        )}
        <p class="text-xs text-gray-300">
          コード: {sessionRun?.join_code} ・ {participant?.participant_name}
        </p>
      </div>
    </div>
  );
}
