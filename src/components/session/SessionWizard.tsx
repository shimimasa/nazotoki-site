import { useState, useCallback } from 'preact/hooks';
import type { SessionScenarioData } from './types';
import { PHASE_CONFIG } from './types';
import Timer from './Timer';
import PhaseProgress from './PhaseProgress';
import PhaseTransition, { getPhaseColor } from './PhaseTransition';
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
  const [reflections, setReflections] = useState<string[]>(['']);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [stepStartTimes, setStepStartTimes] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<number | null>(null);
  const [timerExpiredOverlay, setTimerExpiredOverlay] = useState(false);

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

    setSaving(false);
    setCompleted(true);
  }, [sessionId, votes, reflections, stepStartTimes, data.playableCharacters]);

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
          />
        );
      case 'twist':
        return data.evidence5 ? (
          <TwistPhase evidence5={data.evidence5} />
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
              setReflections(['']);
              setSessionId(null);
              setStartedAt(null);
              setStepStartTimes([]);
              setCompleted(false);
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
    <div class="space-y-4">
      {/* ヘッダー: フェーズ進捗 + タイマー */}
      {currentStep > 0 && (
        <div class="sticky top-0 z-10 bg-gray-50 -mx-4 px-4 py-3 border-b border-gray-200">
          <div class="flex items-center justify-between gap-4">
            <PhaseProgress currentStep={currentStep} skipTwist={skipTwist} />
            <Timer
              seconds={timerSeconds}
              running={timerRunning}
              onTick={handleTimerTick}
              onToggle={handleTimerToggle}
              onReset={handleTimerReset}
              onExpired={handleTimerExpired}
              defaultSeconds={currentPhase?.defaultSeconds || 0}
            />
          </div>
        </div>
      )}

      {/* フェーズタイトル */}
      {currentStep > 0 && (
        <h2 class="text-2xl font-black">
          {currentPhase?.icon} {currentPhase?.label}
        </h2>
      )}

      {/* フェーズ内容 */}
      {renderPhaseContent()}

      {/* ナビゲーション */}
      {!isFirstStep && (
        <div class="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={handlePrev}
            class="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
          >
            ← 前へ
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
              {saving ? '保存中...' : '✓ セッション完了'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              class="px-6 py-2.5 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors"
            >
              次へ →
            </button>
          )}
        </div>
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
