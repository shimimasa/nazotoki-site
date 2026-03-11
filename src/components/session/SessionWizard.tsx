import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { SessionScenarioData } from './types';
import { PHASE_CONFIG } from './types';
import Timer from './Timer';
import PhaseProgress from './PhaseProgress';
import PhaseTransition, { getPhaseColor } from './PhaseTransition';
import GmControlPanel from './GmControlPanel';
import PrepPhase from './phases/PrepPhase';
import IntroPhase from './phases/IntroPhase';
import ExplorePhase from './phases/ExplorePhase';
import TwistPhase from './phases/TwistPhase';
import DiscussPhase from './phases/DiscussPhase';
import VotePhase from './phases/VotePhase';
import TruthPhase from './phases/TruthPhase';
import {
  saveGmMemo,
  loadGmMemo,
  saveSessionLog,
  getCurrentTeacher,
  fetchClasses,
  saveStudentSessionLogs,
  fetchStudents,
  type TeacherProfile,
  type ClassRow,
  type StudentRow,
  fetchSessionFeedback,
  type SessionFeedbackRow,
} from '../../lib/supabase';
import {
  createSessionRun,
  updateSessionRun,
  endSessionRun,
  assignCharacter,
  linkParticipantStudent,
  fetchSessionParticipants,
  subscribeToParticipants,
  unsubscribeChannel,
  type SessionParticipant,
} from '../../lib/session-realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface SessionWizardProps {
  data: SessionScenarioData;
  siteUrl: string;
}

export default function SessionWizard({ data, siteUrl }: SessionWizardProps) {
  const skipTwist = data.evidence5 === null;

  // Session setup
  const [teacherName, setTeacherName] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  const [environment, setEnvironment] = useState<
    'classroom' | 'dayservice' | 'home'
  >('classroom');

  // Session state
  const [currentStep, setCurrentStep] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [voteReasons, setVoteReasons] = useState<Record<string, string>>({});
  const [reflections, setReflections] = useState<string[]>(['']);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [stepStartTimes, setStepStartTimes] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<number | null>(null);
  const [timerExpiredOverlay, setTimerExpiredOverlay] = useState(false);
  const [gmPanelOpen, setGmPanelOpen] = useState(false);
  const [isProjectorMode, setIsProjectorMode] = useState(false);
  const [discoveredCards, setDiscoveredCards] = useState<Set<number>>(new Set());
  const [twistRevealed, setTwistRevealed] = useState(false);
  const [gmMemo, setGmMemo] = useState('');
  const memoSaveTimer = useRef<number | null>(null);
  const timerExpiredTimer = useRef<number | null>(null);

  // Realtime session state (Phase 56)
  const [sessionRunId, setSessionRunId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const participantChannelRef = useRef<RealtimeChannel | null>(null);
  // Phase 86 fix: separate last_seen_at tracking to avoid heartbeat-triggered re-renders
  const lastSeenMapRef = useRef<Record<string, string>>({});

  // Phase 91: Feedback summary on completed screen
  const [feedbackSummary, setFeedbackSummary] = useState<SessionFeedbackRow[]>([]);

  // Teacher / Class / Student state
  const [currentTeacher, setCurrentTeacher] = useState<TeacherProfile | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classStudents, setClassStudents] = useState<StudentRow[]>([]);
  const classStudentsRef = useRef<StudentRow[]>([]);

  // Cleanup on unmount (Phase 56 + Phase 73: timers)
  useEffect(() => {
    return () => {
      if (participantChannelRef.current) {
        unsubscribeChannel(participantChannelRef.current);
      }
      if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
      if (timerExpiredTimer.current) clearTimeout(timerExpiredTimer.current);
    };
  }, []);

  // Load teacher profile and classes
  useEffect(() => {
    getCurrentTeacher().then((t) => {
      setCurrentTeacher(t);
      if (t) {
        setTeacherName(t.display_name);
        fetchClasses(t.id).then(setTeacherClasses);
      }
    });
  }, []);

  // Load students when class is selected
  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId).then((students) => {
        setClassStudents(students);
        classStudentsRef.current = students;
      });
    } else {
      setClassStudents([]);
      classStudentsRef.current = [];
    }
  }, [selectedClassId]);

  // Load GM memo: Supabase first, localStorage fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloudMemo = await loadGmMemo(data.slug, currentTeacher?.id);
      if (!cancelled && cloudMemo !== null) {
        setGmMemo(cloudMemo);
        return;
      }
      if (!cancelled) {
        try {
          const local = localStorage.getItem(`nazotoki-gm-memo-${data.slug}`);
          if (local) setGmMemo(local);
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [data.slug, currentTeacher]);

  // Save GM memo: localStorage immediate + Supabase debounced
  const handleGmMemoChange = useCallback((value: string) => {
    setGmMemo(value);
    try {
      localStorage.setItem(`nazotoki-gm-memo-${data.slug}`, value);
    } catch { /* ignore */ }
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    memoSaveTimer.current = window.setTimeout(() => {
      saveGmMemo(data.slug, value, currentTeacher?.id);
    }, 2000);
  }, [data.slug, currentTeacher]);

  const handleDiscoverCard = useCallback((num: number) => {
    setDiscoveredCards((prev) => {
      const next = new Set(prev).add(num);
      // Sync to Realtime (Phase 56)
      if (sessionRunId) {
        updateSessionRun(sessionRunId, {
          discovered_evidence: Array.from(next),
        });
      }
      return next;
    });
  }, [sessionRunId]);

  const handleTwistRevealed = useCallback(() => {
    setTwistRevealed(true);
    // Sync to Realtime (Phase 56)
    if (sessionRunId) {
      updateSessionRun(sessionRunId, { twist_revealed: true });
    }
  }, [sessionRunId]);

  const currentPhase = PHASE_CONFIG[currentStep];

  // Determine effective step considering twist skip
  const getEffectiveSteps = useCallback(() => {
    const steps = PHASE_CONFIG.map((_, i) => i);
    if (skipTwist) return steps.filter((i) => PHASE_CONFIG[i].key !== 'twist');
    return steps;
  }, [skipTwist]);

  const applyStep = useCallback(
    (step: number) => {
      setCurrentStep(step);
      const config = PHASE_CONFIG[step];
      setTimerSeconds(config.defaultSeconds);
      setTimerRunning(config.defaultSeconds > 0);
      setStepStartTimes((prev) => {
        const next = [...prev];
        next[step] = Date.now();
        return next;
      });

      // Sync phase to Realtime (Phase 56)
      if (sessionRunId) {
        updateSessionRun(sessionRunId, {
          current_phase: config.key,
          timer_seconds: config.defaultSeconds,
          timer_running: config.defaultSeconds > 0,
        });
      }
    },
    [sessionRunId],
  );

  const goToStep = useCallback(
    (step: number) => {
      // Skip transition for prep phase
      if (step === 0) {
        applyStep(step);
        return;
      }
      setTransitionTarget(step);
      setTransitioning(true);
    },
    [applyStep],
  );

  const handleTransitionComplete = useCallback(() => {
    if (transitionTarget !== null) {
      applyStep(transitionTarget);
    }
    setTransitioning(false);
    setTransitionTarget(null);
  }, [transitionTarget, applyStep]);

  const handleStart = useCallback(async () => {
    setStartError(null);

    // Phase 72: Create session run via atomic RPC
    // Phase 81: teacherId resolved server-side via auth.uid()
    const result = await createSessionRun({
      scenarioSlug: data.slug,
      scenarioTitle: data.title,
      classId: selectedClassId,
      playerCount,
      characterNames: data.playableCharacters.map((c) => c.name),
      evidenceTitles: data.evidenceCards.map((c) => ({ number: c.number, title: c.title })),
    });

    if (!result) {
      // Phase 72 H4 fix: block UI progression on failure
      setStartError('セッションの作成に失敗しました。通信状態を確認してもう一度お試しください。');
      return;
    }

    setStartedAt(new Date());
    setSessionRunId(result.id);
    setJoinCode(result.joinCode);

    // Subscribe to participant joins (Phase 62: auto-match student names)
    const channel = subscribeToParticipants(
      result.id,
      (p) => {
        // Auto-match participant name to student roster
        const students = classStudentsRef.current;
        if (students.length > 0 && !p.student_id) {
          const name = p.participant_name.trim();
          const match = students.find((s) =>
            s.student_name === name ||
            s.student_name.replace(/\s/g, '') === name.replace(/\s/g, ''),
          );
          if (match) {
            linkParticipantStudent(p.id, match.id);
            p = { ...p, student_id: match.id };
          }
        }
        setParticipants((prev) => [...prev, p]);
      },
      (updated) => {
        // Phase 86 fix: always track last_seen_at in ref (no re-render)
        if (updated.last_seen_at) {
          lastSeenMapRef.current[updated.id] = updated.last_seen_at;
        }
        // Only trigger state update if meaningful fields changed (not just heartbeat)
        setParticipants((prev) => {
          const old = prev.find((p) => p.id === updated.id);
          if (old) {
            const isHeartbeatOnly =
              old.assigned_character === updated.assigned_character &&
              old.voted_for === updated.voted_for &&
              old.vote_reason === updated.vote_reason &&
              old.student_id === updated.student_id &&
              old.participant_name === updated.participant_name;
            if (isHeartbeatOnly) return prev; // same ref → no re-render
          }
          return prev.map((p) => (p.id === updated.id ? updated : p));
        });
      },
    );
    participantChannelRef.current = channel;

    goToStep(1); // Skip to intro
  }, [goToStep, data.slug, data.title, currentTeacher, selectedClassId, playerCount]);

  const handleNext = useCallback(() => {
    const effectiveSteps = getEffectiveSteps();
    const currentIndex = effectiveSteps.indexOf(currentStep);
    if (currentIndex < effectiveSteps.length - 1) {
      goToStep(effectiveSteps[currentIndex + 1]);
    }
  }, [currentStep, getEffectiveSteps, goToStep]);

  const handlePrev = useCallback(() => {
    const effectiveSteps = getEffectiveSteps();
    const currentIndex = effectiveSteps.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(effectiveSteps[currentIndex - 1]);
    }
  }, [currentStep, getEffectiveSteps, goToStep]);

  const handleTimerTick = useCallback(() => {
    setTimerSeconds((s) => s - 1);
  }, []);

  const handleTimerToggle = useCallback(() => {
    setTimerRunning((prev) => {
      const next = !prev;
      // Sync to Realtime (Phase 59) — include current seconds for accurate student sync
      if (sessionRunId) {
        updateSessionRun(sessionRunId, {
          timer_running: next,
          timer_seconds: timerSeconds,
        });
      }
      return next;
    });
  }, [sessionRunId, timerSeconds]);

  const handleTimerReset = useCallback((seconds: number) => {
    setTimerSeconds(seconds);
    // Sync to Realtime (Phase 59)
    if (sessionRunId) {
      updateSessionRun(sessionRunId, { timer_seconds: seconds });
    }
  }, [sessionRunId]);

  const handleTimerExpired = useCallback(() => {
    setTimerExpiredOverlay(true);
    // Phase 73: store ref for cleanup
    timerExpiredTimer.current = window.setTimeout(() => setTimerExpiredOverlay(false), 3000);
  }, []);

  const handleVote = useCallback((voterId: string, suspectId: string) => {
    setVotes((prev) => {
      const next = { ...prev, [voterId]: suspectId };
      if (sessionRunId) {
        updateSessionRun(sessionRunId, { votes: next });
      }
      return next;
    });
  }, [sessionRunId]);

  const handleVoteReason = useCallback((voterId: string, reason: string) => {
    setVoteReasons((prev) => {
      const next = { ...prev, [voterId]: reason };
      if (sessionRunId) {
        updateSessionRun(sessionRunId, { vote_reasons: next });
      }
      return next;
    });
  }, [sessionRunId]);

  const handleReflectionChange = useCallback(
    (index: number, value: string) => {
      setReflections((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    [],
  );

  const handleAddReflection = useCallback(() => {
    setReflections((prev) => [...prev, '']);
  }, []);

  const handleRemoveReflection = useCallback((index: number) => {
    setReflections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleComplete = useCallback(async () => {
    if (!confirm('セッションを完了しますか？\n（完了後はデータが保存されます）')) return;
    setSaving(true);

    // Calculate phase durations
    const phaseDurations: Record<string, number> = {};
    for (let i = 1; i < PHASE_CONFIG.length; i++) {
      if (stepStartTimes[i]) {
        const endTime = stepStartTimes[i + 1] || Date.now();
        phaseDurations[PHASE_CONFIG[i].key] = Math.round(
          (endTime - stepStartTimes[i]) / 1000,
        );
      }
    }

    // Determine correct players
    const culpritText = data.truthHtml.replace(/<[^>]+>/g, '');
    const culpritMatch = culpritText.match(/\u72AF\u4EBA[:：]\s*(.+?)(?:\*|（|$|\n)/);
    const culpritName = culpritMatch
      ? culpritMatch[1].replace(/\*+/g, '').trim() || null
      : null;

    const correctPlayers = culpritName
      ? Object.entries(votes)
          .filter(([, suspectId]) => {
            const suspect = data.playableCharacters.find((c) => c.id === suspectId);
            return suspect && (
              suspect.name.includes(culpritName) ||
              culpritName.includes(suspect.name)
            );
          })
          .map(([voterId]) => {
            const voter = data.playableCharacters.find((c) => c.id === voterId);
            return voter?.name || voterId;
          })
      : null;

    // Collect reflections (non-empty only)
    const validReflections = reflections.filter((r) => r.trim().length > 0);

    // Save all data to session_logs (single source of truth)
    const sessionLogId = await saveSessionLog({
      scenario_slug: data.slug,
      scenario_title: data.title,
      start_time: startedAt?.toISOString() || null,
      end_time: new Date().toISOString(),
      duration: startedAt
        ? Math.round((Date.now() - startedAt.getTime()) / 1000)
        : null,
      phase_durations: phaseDurations,
      vote_results: votes,
      vote_reasons: voteReasons,
      discovered_evidence: Array.from(discoveredCards),
      twist_revealed: twistRevealed,
      correct_players: correctPlayers,
      gm_memo: gmMemo,
      reflections: validReflections.length > 0 ? validReflections : null,
      environment,
      player_count: playerCount,
      teacher_name: teacherName || null,
      teacher_id: currentTeacher?.id || null,
      class_id: selectedClassId || null,
    });
    setSavedLogId(sessionLogId);

    // Save student session logs from participants (Phase 65)
    // Uses participant.student_id (set by Phase 62 auto-match or manual link)
    if (sessionLogId && participants.length > 0) {
      const linkedParticipants = participants.filter((p) => p.student_id);
      if (linkedParticipants.length > 0) {
        const studentLogs = linkedParticipants.map((p) => {
          const isCorrect = culpritName && p.voted_for
            ? p.voted_for === culpritName ||
              p.voted_for.includes(culpritName) ||
              culpritName.includes(p.voted_for)
            : null;
          return {
            session_log_id: sessionLogId,
            student_id: p.student_id!,
            voted_for: p.voted_for || undefined,
            vote_reason: p.vote_reason || undefined,
            is_correct: isCorrect ?? undefined,
          };
        });
        await saveStudentSessionLogs(studentLogs);
      }
    }
    // Fallback: class-based save for students not in participants (e.g. offline mode)
    else if (sessionLogId && selectedClassId && classStudents.length > 0) {
      const participantStudentIds = new Set(participants.map((p) => p.student_id).filter(Boolean));
      const unlinkedStudents = classStudents.filter((s) => !participantStudentIds.has(s.id));
      if (unlinkedStudents.length > 0) {
        const studentLogs = unlinkedStudents.map((student) => {
          const matchedVoter = Object.entries(votes).find(([voterId]) => {
            const char = data.playableCharacters.find((c) => c.id === voterId);
            return char?.name === student.student_name;
          });
          const vFor = matchedVoter
            ? data.playableCharacters.find((c) => c.id === matchedVoter[1])?.name || matchedVoter[1]
            : null;
          const reason = matchedVoter ? voteReasons[matchedVoter[0]] || null : null;
          const isCorrect = matchedVoter && correctPlayers
            ? correctPlayers.some((cp) => {
                const voter = data.playableCharacters.find((c) => c.id === matchedVoter[0]);
                return voter?.name === cp;
              })
            : null;
          return {
            session_log_id: sessionLogId,
            student_id: student.id,
            voted_for: vFor || undefined,
            vote_reason: reason || undefined,
            is_correct: isCorrect ?? undefined,
          };
        });
        await saveStudentSessionLogs(studentLogs);
      }
    }

    // Final GM memo cloud save
    await saveGmMemo(data.slug, gmMemo, currentTeacher?.id);

    // End session run (Phase 56)
    if (sessionRunId) {
      await endSessionRun(sessionRunId);
      if (participantChannelRef.current) {
        unsubscribeChannel(participantChannelRef.current);
        participantChannelRef.current = null;
      }
    }

    setSaving(false);
    setCompleted(true);
  }, [votes, voteReasons, reflections, stepStartTimes, startedAt,
    data.playableCharacters, data.slug, data.truthHtml,
    discoveredCards, twistRevealed, gmMemo, environment, playerCount, teacherName,
    currentTeacher, selectedClassId, classStudents, sessionRunId, participants]);

  // Student link handler (Phase 62)
  const handleLinkStudent = useCallback(async (participantId: string, studentId: string | null) => {
    const ok = await linkParticipantStudent(participantId, studentId);
    if (ok) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId ? { ...p, student_id: studentId } : p,
        ),
      );
    }
  }, []);

  // Character assignment handlers (Phase 61)
  const handleAssignCharacter = useCallback(async (participantId: string, characterName: string | null) => {
    const ok = await assignCharacter(participantId, characterName);
    if (ok) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId ? { ...p, assigned_character: characterName } : p,
        ),
      );
    }
  }, []);

  const handleAutoAssign = useCallback(async () => {
    const names = [...data.playableCharacters.map((c) => c.name)];
    // Shuffle using Fisher-Yates
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    // Assign to participants in order
    const updates = participants.map((p, idx) => ({
      id: p.id,
      character: idx < names.length ? names[idx] : null,
    }));
    const results = await Promise.all(
      updates.map((u) => assignCharacter(u.id, u.character)),
    );
    // Update local state for successful assignments
    setParticipants((prev) =>
      prev.map((p, idx) =>
        results[idx] ? { ...p, assigned_character: updates[idx].character } : p,
      ),
    );
  }, [participants, data.playableCharacters]);

  // Render phase content
  const renderPhaseContent = () => {
    switch (currentPhase?.key) {
      case 'prep':
        return (
          <PrepPhase
            data={data}
            teacherName={teacherName}
            playerCount={playerCount}
            environment={environment}
            onTeacherName={setTeacherName}
            onPlayerCount={setPlayerCount}
            onEnvironment={setEnvironment}
            onStart={handleStart}
            startError={startError}
            classes={teacherClasses}
            selectedClassId={selectedClassId}
            onClassSelect={setSelectedClassId}
          />
        );
      case 'intro':
        return <IntroPhase commonHtml={data.commonHtml} />;
      case 'explore':
        return (
          <ExplorePhase
            evidenceCards={data.evidenceCards}
            characters={data.playableCharacters}
            discoveredCards={discoveredCards}
            onDiscoverCard={handleDiscoverCard}
          />
        );
      case 'twist':
        return data.evidence5 ? (
          <TwistPhase
            evidence5={data.evidence5}
            onRevealed={handleTwistRevealed}
          />
        ) : null;
      case 'discuss':
        return (
          <DiscussPhase
            gmGuideHtml={data.gmGuideHtml}
            discussionHtml={data.discussionHtml}
            evidenceCards={data.evidenceCards}
            evidence5={data.evidence5}
          />
        );
      case 'vote':
        return (
          <VotePhase
            characters={data.playableCharacters}
            votes={votes}
            onVote={handleVote}
            voteReasons={voteReasons}
            onVoteReason={handleVoteReason}
            evidenceCards={data.evidenceCards}
            evidence5={data.evidence5}
            gmGuideHtml={data.gmGuideHtml}
          />
        );
      case 'truth':
        return (
          <TruthPhase
            solutionHtml={data.solutionHtml}
            learningGoalsHtml={data.learningGoalsHtml}
            truthHtml={data.truthHtml}
            reflections={reflections}
            onReflectionChange={handleReflectionChange}
            onAddReflection={handleAddReflection}
            onRemoveReflection={handleRemoveReflection}
            votes={votes}
            voteReasons={voteReasons}
            characters={data.playableCharacters}
          />
        );
      default:
        return null;
    }
  };

  // Phase 91: Fetch feedback when session completes
  useEffect(() => {
    if (!completed || !sessionRunId) return;
    fetchSessionFeedback(sessionRunId).then(setFeedbackSummary);
    const id = setInterval(() => {
      fetchSessionFeedback(sessionRunId).then(setFeedbackSummary);
    }, 15000);
    return () => clearInterval(id);
  }, [completed, sessionRunId]);

  if (completed) {
    return (
      <div class="text-center py-12 space-y-6">
        <div class="text-6xl">🎉</div>
        <h2 class="text-3xl font-black">セッション完了！</h2>
        <p class="text-gray-600">
          お疲れ様でした。データは{savedLogId ? '記録されました' : 'ローカルに保存されました'}。
        </p>
        <div class="flex flex-wrap gap-3 justify-center">
          <a
            href={`${siteUrl}gm/${data.slug}/reflect/`}
            class="inline-block bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition-colors no-underline"
          >
            📝 教員振り返りを記録
          </a>
          <button
            onClick={() => {
              setCurrentStep(0);
              setVotes({});
              setVoteReasons({});
              setReflections(['']);
              setSavedLogId(null);
              setStartedAt(null);
              setStepStartTimes([]);
              setCompleted(false);
              setGmPanelOpen(false);
              setIsProjectorMode(false);
              setDiscoveredCards(new Set());
              setTwistRevealed(false);
              setSessionRunId(null);
              setJoinCode(null);
              setParticipants([]);
            }}
            class="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            もう一度プレイ
          </button>
        </div>

        {/* Phase 91: Feedback summary */}
        {feedbackSummary.length > 0 && (
          <div class="max-w-md mx-auto text-left">
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <h3 class="text-sm font-black text-blue-700 text-center">
                生徒フィードバック ({feedbackSummary.length}件)
              </h3>
              <div class="flex justify-around text-center">
                <div>
                  <p class="text-xs text-gray-500">楽しさ</p>
                  <p class="text-xl font-black text-amber-600">
                    {(feedbackSummary.reduce((s, f) => s + f.fun_rating, 0) / feedbackSummary.length).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">難しさ</p>
                  <p class="text-xl font-black text-blue-600">
                    {(feedbackSummary.reduce((s, f) => s + f.difficulty_rating, 0) / feedbackSummary.length).toFixed(1)}
                  </p>
                </div>
              </div>
              {feedbackSummary.filter(f => f.comment).length > 0 && (
                <div class="border-t border-blue-200 pt-2 space-y-1">
                  {feedbackSummary.filter(f => f.comment).map(f => (
                    <p key={f.id} class="text-xs text-gray-600">
                      「{f.comment}」
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const effectiveSteps = getEffectiveSteps();
  const currentIndex = effectiveSteps.indexOf(currentStep);
  const isFirstStep = currentStep === 0;
  const isLastStep = currentIndex === effectiveSteps.length - 1;

  return (
    <div class={`space-y-4 ${isProjectorMode ? 'text-lg leading-relaxed' : ''}`}>
      {/* ヘッダー: フェーズ進捗 + タイマー + GM/投影ボタン */}
      {currentStep > 0 && (
        <div class="sticky top-0 z-10 bg-gray-50 -mx-4 px-4 py-3 border-b border-gray-200">
          <div class="flex items-center justify-between gap-2">
            <PhaseProgress currentStep={currentStep} skipTwist={skipTwist} />
            <div class="flex items-center gap-2">
              <Timer
                seconds={timerSeconds}
                running={timerRunning}
                onTick={handleTimerTick}
                onToggle={handleTimerToggle}
                onReset={handleTimerReset}
                onExpired={handleTimerExpired}
                defaultSeconds={currentPhase?.defaultSeconds || 0}
              />
              <button
                onClick={() => setIsProjectorMode((v) => !v)}
                class={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors ${
                  isProjectorMode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={isProjectorMode ? '\u6295\u5F71\u30E2\u30FC\u30C9 ON' : '\u6295\u5F71\u30E2\u30FC\u30C9 OFF'}
              >
                {'\uD83D\uDCFD\uFE0F'}
              </button>
              <button
                onClick={() => setGmPanelOpen(true)}
                class="shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black hover:bg-indigo-700 transition-colors flex items-center gap-1"
              >
                {'\uD83C\uDFAE'} GM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フェーズタイトル */}
      {currentStep > 0 && (
        <h2 class={`font-black ${isProjectorMode ? 'text-4xl' : 'text-2xl'}`}>
          {currentPhase?.icon} {currentPhase?.label}
        </h2>
      )}

      {/* フェーズ内容 */}
      {renderPhaseContent()}

      {/* ナビゲーション（投影モードでは非表示 → GMパネルから操作） */}
      {!isFirstStep && !isProjectorMode && (
        <div class="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={handlePrev}
            class="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
          >
            {'\u2190'} {'\u524D\u3078'}
          </button>

          {isLastStep ? (
            <button
              onClick={handleComplete}
              disabled={saving}
              class={`px-6 py-2.5 rounded-lg font-bold transition-colors ${
                saving
                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {saving ? '\u4FDD\u5B58\u4E2D...' : '\u2713 \u30BB\u30C3\u30B7\u30E7\u30F3\u5B8C\u4E86'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              class="px-6 py-2.5 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors"
            >
              {'\u6B21\u3078'} {'\u2192'}
            </button>
          )}
        </div>
      )}

      {/* GM Control Panel */}
      {gmPanelOpen && currentStep > 0 && (
        <GmControlPanel
          currentStep={currentStep}
          skipTwist={skipTwist}
          onGoToStep={goToStep}
          onNext={handleNext}
          onPrev={handlePrev}
          timerSeconds={timerSeconds}
          timerRunning={timerRunning}
          onTimerToggle={handleTimerToggle}
          onTimerReset={handleTimerReset}
          timerDefaultSeconds={currentPhase?.defaultSeconds || 0}
          isProjectorMode={isProjectorMode}
          onToggleProjector={() => setIsProjectorMode((v) => !v)}
          onClose={() => setGmPanelOpen(false)}
          isFirstPhase={currentIndex === 0}
          isLastPhase={isLastStep}
          onComplete={handleComplete}
          saving={saving}
          scenarioTitle={data.title}
          startedAt={startedAt}
          completed={completed}
          discoveredCards={discoveredCards}
          evidenceCards={data.evidenceCards}
          evidence5={data.evidence5}
          twistRevealed={twistRevealed}
          votes={votes}
          voteReasons={voteReasons}
          characters={data.playableCharacters}
          gmMemo={gmMemo}
          onGmMemoChange={handleGmMemoChange}
          truthHtml={data.truthHtml}
          stepStartTimes={stepStartTimes}
          joinCode={joinCode}
          participants={participants}
          characterNames={data.playableCharacters.map((c) => c.name)}
          onAssignCharacter={handleAssignCharacter}
          onAutoAssign={handleAutoAssign}
          classStudents={classStudents}
          onLinkStudent={handleLinkStudent}
          lastSeenMap={lastSeenMapRef.current}
        />
      )}

      {/* Phase transition interstitial */}
      {transitioning && transitionTarget !== null && (
        <PhaseTransition
          icon={PHASE_CONFIG[transitionTarget].icon}
          label={PHASE_CONFIG[transitionTarget].label}
          color={getPhaseColor(PHASE_CONFIG[transitionTarget].key)}
          onComplete={handleTransitionComplete}
        />
      )}

      {/* Timer expired overlay */}
      {timerExpiredOverlay && (
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 animate-pulse">
          <div class="text-center">
            <div class="text-7xl mb-4">{'\u23F0'}</div>
            <div class="text-4xl font-black text-white">時間です！</div>
          </div>
        </div>
      )}
    </div>
  );
}
