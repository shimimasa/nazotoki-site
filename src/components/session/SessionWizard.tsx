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
  createSession,
  completeSession,
  saveVotes,
  saveReflections,
  saveGmMemo,
  loadGmMemo,
  saveSessionLog,
} from '../../lib/supabase';

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
  const [sessionId, setSessionId] = useState<string | null>(null);
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

  // Load GM memo: Supabase first, localStorage fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloudMemo = await loadGmMemo(data.slug);
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
  }, [data.slug]);

  // Save GM memo: localStorage immediate + Supabase debounced
  const handleGmMemoChange = useCallback((value: string) => {
    setGmMemo(value);
    try {
      localStorage.setItem(`nazotoki-gm-memo-${data.slug}`, value);
    } catch { /* ignore */ }
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    memoSaveTimer.current = window.setTimeout(() => {
      saveGmMemo(data.slug, value);
    }, 2000);
  }, [data.slug]);

  const handleDiscoverCard = useCallback((num: number) => {
    setDiscoveredCards((prev) => new Set(prev).add(num));
  }, []);

  const handleTwistRevealed = useCallback(() => {
    setTwistRevealed(true);
  }, []);

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
    },
    [],
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
    const now = new Date();
    setStartedAt(now);

    // Create Supabase session
    const id = await createSession({
      teacher_name: teacherName,
      slug: data.slug,
      scenario_title: data.title,
      environment,
      player_count: playerCount,
      started_at: now.toISOString(),
    });
    setSessionId(id);

    goToStep(1); // Skip to intro
  }, [teacherName, data.slug, data.title, environment, playerCount, goToStep]);

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
    setTimerRunning((r) => !r);
  }, []);

  const handleTimerReset = useCallback((seconds: number) => {
    setTimerSeconds(seconds);
  }, []);

  const handleTimerExpired = useCallback(() => {
    setTimerExpiredOverlay(true);
    setTimeout(() => setTimerExpiredOverlay(false), 3000);
  }, []);

  const handleVote = useCallback((voterId: string, suspectId: string) => {
    setVotes((prev) => ({ ...prev, [voterId]: suspectId }));
  }, []);

  const handleVoteReason = useCallback((voterId: string, reason: string) => {
    setVoteReasons((prev) => ({ ...prev, [voterId]: reason }));
  }, []);

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

    if (sessionId) {
      await completeSession(sessionId, phaseDurations);

      // Save votes
      const voteRecords = Object.entries(votes).map(
        ([voterId, suspectId]) => {
          const voterChar = data.playableCharacters.find(
            (c) => c.id === voterId,
          );
          const suspectChar = data.playableCharacters.find(
            (c) => c.id === suspectId,
          );
          return {
            session_id: sessionId,
            voter_name: voterChar?.name || voterId,
            suspect_name: suspectChar?.name || suspectId,
            is_correct: false, // Could be determined from truth data
          };
        },
      );
      await saveVotes(voteRecords);

      // Save reflections
      const reflectionRecords = reflections
        .filter((r) => r.trim().length > 0)
        .map((content) => ({
          session_id: sessionId,
          content,
        }));
      await saveReflections(reflectionRecords);
    }

    // Save comprehensive session log
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

    await saveSessionLog({
      scenario_slug: data.slug,
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
    });

    // Final GM memo cloud save
    await saveGmMemo(data.slug, gmMemo);

    setSaving(false);
    setCompleted(true);
  }, [sessionId, votes, voteReasons, reflections, stepStartTimes, startedAt,
    data.playableCharacters, data.slug, data.truthHtml,
    discoveredCards, twistRevealed, gmMemo]);

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

  if (completed) {
    return (
      <div class="text-center py-12 space-y-6">
        <div class="text-6xl">🎉</div>
        <h2 class="text-3xl font-black">セッション完了！</h2>
        <p class="text-gray-600">
          お疲れ様でした。データは{sessionId ? '記録されました' : 'ローカルに保存されました'}。
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
              setSessionId(null);
              setStartedAt(null);
              setStepStartTimes([]);
              setCompleted(false);
              setGmPanelOpen(false);
              setIsProjectorMode(false);
              setDiscoveredCards(new Set());
              setTwistRevealed(false);
            }}
            class="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            もう一度プレイ
          </button>
        </div>
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
