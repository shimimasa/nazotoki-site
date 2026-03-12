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
  cacheSessionState,
  getCachedSessionState,
  clearSessionCache,
  sendHeartbeat,
} from '../../lib/session-realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useFontSize } from '../../lib/use-font-size';
import Confetti from './Confetti';

// Phase 141: Extracted sub-components
import type { Screen, ScenarioContent, SessionRun, SessionParticipant } from './student/types';
import { PHASE_DISPLAY, MAX_RETRIES, getBackoffDelay } from './student/types';
import ConnectionBanner from './student/ConnectionBanner';
import JoinScreen from './student/JoinScreen';
import EndScreen from './student/EndScreen';
import { VoteResultsCard } from './student/EndScreen';

// ============================================================
// Main Component
// ============================================================

export default function StudentSession() {
  const fontSize = useFontSize();

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

  // Evidence panel state
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  // Scenario content
  const [scenarioContent, setScenarioContent] = useState<ScenarioContent | null>(null);

  // Phase 134-136: Character sheet, hypothesis, confetti
  const [charPanelOpen, setCharPanelOpen] = useState(false);
  const [studentHypothesis, setStudentHypothesis] = useState('');
  const [studentHypothesisSuspect, setStudentHypothesisSuspect] = useState('');
  const [studentConfetti, setStudentConfetti] = useState(false);

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const pendingVoteRef = useRef<{ votedFor: string; voteReason: string } | null>(null);
  const [votePending, setVotePending] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  // Auto-reconnect state
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shouldReconnect, setShouldReconnect] = useState(0);
  const [reconnecting, setReconnecting] = useState(true);

  // ============================================================
  // Reconnection & Channel
  // ============================================================

  const refreshParticipant = useCallback(async () => {
    const p = participantRef.current;
    if (!p) return;
    const fresh = await fetchMyParticipant(p.id, p.session_token);
    if (fresh) {
      setParticipant(fresh);
      participantRef.current = fresh;
    }
  }, []);

  const handleChannelStatus = useCallback((status: string) => {
    if (status === 'SUBSCRIBED') {
      setConnectionStatus('connected');
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const pending = pendingVoteRef.current;
      const p = participantRef.current;
      if (pending && p) {
        pendingVoteRef.current = null;
        voteAsParticipant(p.id, p.session_token, pending.votedFor, pending.voteReason || undefined)
          .then((ok) => { if (ok) { setHasVoted(true); setVotePending(false); } });
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setShouldReconnect((n) => n + 1);
    }
  }, []);

  const handleManualReconnect = useCallback(() => {
    retryCountRef.current = 0;
    setShouldReconnect((n) => n + 1);
  }, []);

  // Auto-reconnect with exponential backoff
  useEffect(() => {
    if (shouldReconnect === 0 || !sessionRun || screen !== 'session') return;
    if (retryCountRef.current >= MAX_RETRIES) {
      setConnectionStatus('disconnected');
      return;
    }
    setConnectionStatus('reconnecting');
    const delay = getBackoffDelay(retryCountRef.current);
    const runId = sessionRun.id;

    const timer = setTimeout(async () => {
      retryCountRef.current++;
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
      }
      try {
        const p = participantRef.current;
        if (p) {
          const result = await reconnectSession(p.session_run_id, p.session_token);
          if (result) {
            setSessionRun(result.run);
            setParticipant(result.participant);
            participantRef.current = result.participant;
            if (!result.run.is_active) {
              clearSessionCache(runId);
              setScreen('ended');
              return;
            }
          }
        }
      } catch { /* continue to re-subscribe */ }
      const channel = subscribeToSessionRun(
        runId,
        (updated) => { setSessionRun(updated); refreshParticipant(); },
        handleChannelStatus,
      );
      channelRef.current = channel;
    }, delay);

    retryTimerRef.current = timer;
    return () => { clearTimeout(timer); retryTimerRef.current = null; };
  }, [shouldReconnect, screen]);

  // Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      if (connectionStatus === 'disconnected') handleManualReconnect();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [connectionStatus, handleManualReconnect]);

  // ============================================================
  // Initial load & reconnection from localStorage
  // ============================================================

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedToken = localStorage.getItem('nazotoki-session-token');
        const savedRunId = localStorage.getItem('nazotoki-session-run-id');
        const savedName = localStorage.getItem('nazotoki-player-name');
        if (savedName) setPlayerName(savedName);

        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get('code');
        if (codeParam) {
          const normalized = codeParam.toUpperCase().trim();
          if (/^[A-Z2-9]{6}$/.test(normalized)) setJoinCode(normalized);
        }

        if (savedToken && savedRunId) {
          const cached = getCachedSessionState(savedRunId);
          if (cached && cached.is_active) {
            setSessionRun(cached);
            setScreen('session');
            setReconnecting(false);
          }

          const result = await reconnectSession(savedRunId, savedToken);
          if (cancelled) return;

          if (result) {
            const { run, participant: p } = result;
            setSessionRun(run);
            setParticipant(p);
            participantRef.current = p;
            if (p.voted_for) {
              setVotedFor(p.voted_for);
              setVoteReason(p.vote_reason || '');
              setHasVoted(true);
            }
            if (run.is_active) {
              const channel = subscribeToSessionRun(
                run.id,
                (updated) => { setSessionRun(updated); refreshParticipant(); },
                handleChannelStatus,
              );
              channelRef.current = channel;
              setScreen('session');
            } else {
              clearSessionCache(run.id);
              setScreen('ended');
            }
            setReconnecting(false);
            return;
          }

          if (cached && cached.is_active && !cancelled) {
            setShouldReconnect((n) => n + 1);
            return;
          }
          clearSavedSession();
          if (cached) clearSessionCache(savedRunId);
        }
      } catch { /* ignore */ }
      if (!cancelled) setReconnecting(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // Side effects
  // ============================================================

  // Fetch scenario content JSON
  useEffect(() => {
    if (!sessionRun?.scenario_slug || scenarioContent) return;
    let cancelled = false;
    fetch(`/data/scenarios/${sessionRun.scenario_slug}.json`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setScenarioContent(data); })
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

  // Cache session state for instant restore
  useEffect(() => {
    if (!sessionRun?.id || !sessionRun.is_active) return;
    cacheSessionState(sessionRun.id, sessionRun);
  }, [sessionRun]);

  // Heartbeat (30s interval)
  useEffect(() => {
    if (screen !== 'session' || !participant) return;
    sendHeartbeat(participant.id, participant.session_token);
    const interval = setInterval(() => {
      const p = participantRef.current;
      if (p) sendHeartbeat(p.id, p.session_token);
    }, 30000);
    return () => clearInterval(interval);
  }, [screen, participant?.id]);

  // Hypothesis localStorage sync
  useEffect(() => {
    if (!sessionRun?.id) return;
    try {
      const saved = localStorage.getItem(`nazotoki-hypothesis-${sessionRun.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.suspect) setStudentHypothesisSuspect(parsed.suspect);
        if (parsed.reason) setStudentHypothesis(parsed.reason);
      }
    } catch { /* ignore */ }
  }, [sessionRun?.id]);

  useEffect(() => {
    if (!sessionRun?.id || (!studentHypothesisSuspect && !studentHypothesis)) return;
    try {
      localStorage.setItem(`nazotoki-hypothesis-${sessionRun.id}`, JSON.stringify({
        suspect: studentHypothesisSuspect, reason: studentHypothesis,
      }));
    } catch { /* ignore */ }
  }, [sessionRun?.id, studentHypothesisSuspect, studentHypothesis]);

  // Confetti on truth phase
  const prevPhaseRef = useRef<string>('');
  useEffect(() => {
    const phase = sessionRun?.current_phase || '';
    if (phase === 'truth' && prevPhaseRef.current !== 'truth') {
      setStudentConfetti(true);
      setTimeout(() => setStudentConfetti(false), 4000);
    }
    prevPhaseRef.current = phase;
  }, [sessionRun?.current_phase]);

  // Watch for session end
  useEffect(() => {
    if (sessionRun && !sessionRun.is_active && screen === 'session') {
      if (channelRef.current) { unsubscribeChannel(channelRef.current); channelRef.current = null; }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      retryCountRef.current = 0;
      clearSessionCache(sessionRun.id);
      clearSavedSession();
      setScreen('ended');
    }
  }, [sessionRun?.is_active, screen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) unsubscribeChannel(channelRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
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
      const savedStudentId = localStorage.getItem('nazotoki-student-id') || undefined;
      const savedStudentToken = localStorage.getItem('nazotoki-student-token') || undefined;
      const p = await joinSession({
        joinCode: sessionRun.join_code,
        participantName: playerName.trim(),
        studentId: savedStudentId,
        studentToken: savedStudentToken,
      });
      if (!p) {
        setError('参加に失敗しました。セッションが終了しているか、もう一度試してください');
        setJoining(false);
        return;
      }
      setParticipant(p);
      participantRef.current = p;
      try { localStorage.setItem('nazotoki-player-name', playerName.trim()); } catch { /* ignore */ }
      const channel = subscribeToSessionRun(
        sessionRun.id,
        (updated) => { setSessionRun(updated); refreshParticipant(); },
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
    if (connectionStatus === 'disconnected') {
      pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
      setHasVoted(true);
      setVotePending(true);
      setVoting(false);
      return;
    }
    try {
      const ok = await voteAsParticipant(
        participant.id, participant.session_token,
        votedFor.trim(), voteReason.trim() || undefined,
      );
      if (ok) {
        setHasVoted(true);
        setVotePending(false);
      } else {
        pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
        setHasVoted(true);
        setVotePending(true);
      }
    } catch {
      pendingVoteRef.current = { votedFor: votedFor.trim(), voteReason: voteReason.trim() };
      setHasVoted(true);
      setVotePending(true);
    }
    setVoting(false);
  }, [participant, votedFor, voteReason, connectionStatus]);

  const handleReset = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (channelRef.current) { unsubscribeChannel(channelRef.current); channelRef.current = null; }
    retryCountRef.current = 0;
    participantRef.current = null;
    clearSavedSession();
    if (sessionRun) clearSessionCache(sessionRun.id);
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
    setConnectionStatus('connected');
    setCharPanelOpen(false);
    setStudentHypothesis('');
    setStudentHypothesisSuspect('');
    setVotePending(false);
  }, [sessionRun]);

  // ============================================================
  // Render: Screen router
  // ============================================================

  if (reconnecting) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4">
        <div class="text-center space-y-4">
          <div class="text-5xl animate-pulse">{'\uD83D\uDD0D'}</div>
          <p class="text-gray-500 font-bold">接続中...</p>
        </div>
      </div>
    );
  }

  if (screen === 'join' || screen === 'lobby') {
    return (
      <JoinScreen
        joinCode={joinCode}
        onCodeChange={setJoinCode}
        playerName={playerName}
        onNameChange={setPlayerName}
        error={error}
        joining={joining}
        sessionRun={sessionRun}
        isLobby={screen === 'lobby'}
        onFindSession={handleFindSession}
        onJoinSession={handleJoinSession}
        onBack={() => { setScreen('join'); setSessionRun(null); setError(null); }}
      />
    );
  }

  if (screen === 'ended') {
    return (
      <EndScreen
        sessionRun={sessionRun}
        participant={participant}
        votedFor={votedFor}
        voteReason={voteReason}
        onReset={handleReset}
      />
    );
  }

  // ============================================================
  // Session screen (realtime phase display)
  // ============================================================

  const phase = sessionRun?.current_phase || 'prep';
  const phaseInfo = PHASE_DISPLAY[phase] || PHASE_DISPLAY.prep;
  const isVotePhase = phase === 'vote';
  const charNames = (sessionRun?.character_names as string[]) || [];

  const mm = Math.floor(Math.abs(timerSeconds) / 60).toString().padStart(2, '0');
  const ss = Math.abs(timerSeconds % 60).toString().padStart(2, '0');
  const isOvertime = timerSeconds < 0;

  return (
    <div class="min-h-[80dvh] flex flex-col px-4 py-6 relative max-w-2xl mx-auto w-full">
      <ConnectionBanner
        connectionStatus={connectionStatus}
        retryCount={retryCountRef.current}
        votePending={votePending}
        isOffline={isOffline}
        onManualReconnect={handleManualReconnect}
      />

      {studentConfetti && <Confetti count={60} />}

      {/* Header: scenario + participant info */}
      <div class="text-center mb-6 relative">
        <button
          onClick={fontSize.cycle}
          class="absolute right-0 top-0 text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1.5 py-0.5 border border-gray-200 rounded"
          title={`文字サイズ: ${fontSize.label}`}
        >
          Aa
        </button>
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
        {timerSeconds !== 0 && (
          <div class={`mt-4 font-mono font-black text-4xl tabular-nums ${
            isOvertime ? 'text-red-500 animate-pulse' : timerSeconds <= 60 ? 'text-red-500' : 'text-gray-800'
          }`}>
            {isOvertime && '-'}{mm}:{ss}
          </div>
        )}
      </div>

      {/* Intro phase */}
      {phase === 'intro' && (scenarioContent ? (
        <div class="mb-4 bg-white rounded-xl border border-gray-200 p-4 max-h-[60vh] overflow-y-auto">
          <div
            class="prose prose-sm max-w-none [&_ruby_rt]:text-[0.6em] [&_ruby_rt]:text-gray-400"
            dangerouslySetInnerHTML={{ __html: scenarioContent.common_html }}
          />
        </div>
      ) : (
        <div class="mb-4 bg-white rounded-xl border border-gray-200 p-4 space-y-3 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-3/4" />
          <div class="h-4 bg-gray-200 rounded w-full" />
          <div class="h-4 bg-gray-200 rounded w-5/6" />
          <div class="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      ))}

      {/* Character sheet panel */}
      {participant?.assigned_character && scenarioContent?.characters && (() => {
        const myChar = scenarioContent.characters.find(c => c.name === participant.assigned_character);
        if (!myChar) return null;
        return (
          <div class="mb-4">
            <button
              onClick={() => setCharPanelOpen(v => !v)}
              class="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm font-bold text-green-800 hover:bg-green-100 transition-colors"
            >
              <span>{'\uD83C\uDFAD'} マイキャラクター: {myChar.name}</span>
              <span class={`transition-transform ${charPanelOpen ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
            </button>
            {charPanelOpen && (
              <div class="mt-1 border border-green-200 rounded-xl bg-white p-4 space-y-3">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-black text-green-700">
                    {myChar.name.charAt(0)}
                  </div>
                  <div>
                    <p class="font-black text-gray-900 text-sm">{myChar.name}</p>
                    <p class="text-xs text-gray-500">{myChar.role}</p>
                  </div>
                </div>
                {myChar.intro_html && (
                  <div class="prose prose-sm max-w-none text-gray-700 [&_ruby_rt]:text-[0.6em] [&_ruby_rt]:text-gray-400" dangerouslySetInnerHTML={{ __html: myChar.intro_html }} />
                )}
                <div class="bg-blue-50 rounded-lg p-3">
                  <p class="text-xs font-bold text-blue-600 mb-1">{'\uD83D\uDDE3\uFE0F'} 公開情報</p>
                  <div class="prose prose-sm max-w-none [&_ruby_rt]:text-[0.6em] [&_ruby_rt]:text-gray-400" dangerouslySetInnerHTML={{ __html: myChar.public_html }} />
                </div>
                <div class="bg-gray-100 rounded-lg p-3 text-center">
                  <p class="text-xs text-gray-400 font-bold">{'\uD83D\uDD12'} 秘密の情報は先生から配られたシートで確認してね</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Evidence reference panel */}
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

        {phase === 'twist' && sessionRun && (
          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
            {sessionRun.twist_revealed ? (
              <p class="text-purple-800 font-bold">{'\u26A1'} 新しい証拠が公開されました！</p>
            ) : (
              <p class="text-purple-600">まもなく新しい証拠が明かされます...</p>
            )}
          </div>
        )}

        {/* Discuss phase — hypothesis form */}
        {phase === 'discuss' && (
          <div class="space-y-4">
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p class="text-blue-800 font-bold">{'\uD83D\uDCAC'} グループで話し合いましょう</p>
              <p class="text-blue-600 text-sm mt-1">証拠をもとに、犯人は誰か議論してください</p>
            </div>
            <div class="bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
              <h3 class="text-sm font-black text-blue-700 text-center">{'\u270D\uFE0F'} あなたの仮説</h3>
              {charNames.length > 0 && (
                <div>
                  <p class="text-xs font-bold text-gray-600 mb-2">怪しいと思う人</p>
                  <div class="grid grid-cols-2 gap-2">
                    {charNames.map(name => (
                      <button
                        key={name}
                        onClick={() => setStudentHypothesisSuspect(name)}
                        class={`py-2 px-3 rounded-lg text-sm font-bold transition-colors ${
                          studentHypothesisSuspect === name
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p class="text-xs font-bold text-gray-600 mb-1">理由メモ（任意）</p>
                <textarea
                  value={studentHypothesis}
                  onInput={(e) => setStudentHypothesis((e.target as HTMLTextAreaElement).value)}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none"
                  rows={2}
                  maxLength={200}
                  placeholder="なぜそう思う？メモしておこう"
                />
              </div>
              <p class="text-[10px] text-gray-400 text-center">
                このメモは自分だけが見れます（先生には送信されません）
              </p>
            </div>
          </div>
        )}

        {/* Vote phase: form */}
        {isVotePhase && !hasVoted && (
          <div class="bg-white rounded-xl border-2 border-amber-300 p-6 space-y-4">
            <h3 class="text-lg font-black text-gray-900 text-center">{'\uD83D\uDDF3\uFE0F'} あなたの投票</h3>
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">犯人だと思う人</label>
              {charNames.length > 0 ? (
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
              <label class="block text-sm font-bold text-gray-700 mb-1">理由（なぜそう思う？）</label>
              <textarea
                value={voteReason}
                onInput={(e) => setVoteReason((e.target as HTMLTextAreaElement).value)}
                placeholder="証拠や理由を書いてください"
                maxLength={200}
                rows={3}
                class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-base resize-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </div>
            {error && <p class="text-red-600 text-sm text-center font-bold">{error}</p>}
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
        )}

        {/* Vote submitted */}
        {isVotePhase && hasVoted && (
          <div class={`rounded-xl p-6 text-center space-y-2 ${
            votePending ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
          }`}>
            <div class="text-4xl">{votePending ? '\u23F3' : '\u2705'}</div>
            <p class={`font-black text-lg ${votePending ? 'text-yellow-800' : 'text-green-800'}`}>
              {votePending ? '送信待ち...' : '投票完了！'}
            </p>
            <p class={`text-sm ${votePending ? 'text-yellow-600' : 'text-green-600'}`}>
              「{votedFor}」に投票{votePending ? '（再接続時に送信されます）' : 'しました'}
            </p>
            <p class="text-gray-500 text-sm mt-2">先生の画面で結果を確認しましょう</p>
          </div>
        )}

        {/* Truth phase: hypothesis recall */}
        {phase === 'truth' && studentHypothesisSuspect && (
          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
            <h3 class="text-sm font-black text-purple-700 mb-2">{'\u270D\uFE0F'} あなたの仮説</h3>
            <p class="text-sm"><span class="font-bold">怪しいと思った人:</span> {studentHypothesisSuspect}</p>
            {studentHypothesis && <p class="text-sm mt-1 text-gray-600">「{studentHypothesis}」</p>}
            {(votedFor || participant?.voted_for) && studentHypothesisSuspect !== (votedFor || participant?.voted_for) && (
              <p class="text-xs text-purple-500 mt-2">
                {'\u2192'} 投票では「{votedFor || participant?.voted_for}」に変更しました
              </p>
            )}
          </div>
        )}

        {/* Truth phase: vote results */}
        {phase === 'truth' && sessionRun && (() => {
          const allVotes = (sessionRun.votes as Record<string, string>) || {};
          const myVote = votedFor || participant?.voted_for || null;
          return (
            <div class="space-y-4">
              <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p class="text-amber-800 font-bold">{'\uD83C\uDFAC'} 真相が明かされます</p>
                <p class="text-amber-600 text-sm mt-1">先生の画面を見てください</p>
              </div>
              <VoteResultsCard charNames={charNames} votes={allVotes} myVote={myVote} />
              {myVote && (
                <p class="text-xs text-gray-400 text-center">
                  {'\u25B6'} あなたの投票: <span class="font-bold text-amber-700">{myVote}</span>
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div class="mt-6 text-center space-y-1">
        {votePending && (
          <p class="text-xs text-amber-500 font-bold animate-pulse">
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
