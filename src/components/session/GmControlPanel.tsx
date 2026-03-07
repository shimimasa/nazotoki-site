import { useState, useMemo } from 'preact/hooks';
import { PHASE_CONFIG } from './types';
import type { EvidenceCardData, CharacterData } from './types';

interface GmControlPanelProps {
  currentStep: number;
  skipTwist: boolean;
  onGoToStep: (step: number) => void;
  onNext: () => void;
  onPrev: () => void;
  timerSeconds: number;
  timerRunning: boolean;
  onTimerToggle: () => void;
  onTimerReset: (seconds: number) => void;
  timerDefaultSeconds: number;
  isProjectorMode: boolean;
  onToggleProjector: () => void;
  onClose: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
  onComplete: () => void;
  saving: boolean;
  // Dashboard props
  scenarioTitle: string;
  startedAt: Date | null;
  completed: boolean;
  discoveredCards: Set<number>;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  twistRevealed: boolean;
  votes: Record<string, string>;
  voteReasons: Record<string, string>;
  characters: CharacterData[];
  gmMemo: string;
  onGmMemoChange: (value: string) => void;
  truthHtml: string;
  stepStartTimes: number[];
}

function extractCulprit(truthHtml: string): string | null {
  const text = truthHtml.replace(/<[^>]+>/g, '');
  const match = text.match(/\u72AF\u4EBA[:：]\s*(.+?)(?:\*|（|$|\n)/);
  if (!match) return null;
  return match[1].replace(/\*+/g, '').trim() || null;
}

function formatDuration(startedAt: Date | null): string {
  if (!startedAt) return '--:--';
  const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type PanelTab = 'control' | 'dashboard';

export default function GmControlPanel({
  currentStep,
  skipTwist,
  onGoToStep,
  onNext,
  onPrev,
  timerSeconds,
  timerRunning,
  onTimerToggle,
  onTimerReset,
  timerDefaultSeconds,
  isProjectorMode,
  onToggleProjector,
  onClose,
  isFirstPhase,
  isLastPhase,
  onComplete,
  saving,
  scenarioTitle,
  startedAt,
  completed,
  discoveredCards,
  evidenceCards,
  evidence5,
  twistRevealed,
  votes,
  voteReasons,
  characters,
  gmMemo,
  onGmMemoChange,
  truthHtml,
  stepStartTimes,
}: GmControlPanelProps) {
  const [tab, setTab] = useState<PanelTab>('control');

  const phases = skipTwist
    ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
    : [...PHASE_CONFIG];
  const navigablePhases = phases.filter((p) => p.key !== 'prep');

  const currentPhase = PHASE_CONFIG[currentStep];

  const mm = Math.floor(Math.abs(timerSeconds) / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.abs(timerSeconds % 60)
    .toString()
    .padStart(2, '0');
  const isOvertime = timerSeconds < 0;
  const isUrgent = !isOvertime && timerSeconds > 0 && timerSeconds <= 60;

  const culpritName = useMemo(() => extractCulprit(truthHtml), [truthHtml]);

  const hasVotes = Object.keys(votes).length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div class="fixed right-0 top-0 bottom-0 z-40 w-80 bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-lg">{'\uD83C\uDFAE'}</span>
            <span class="font-black text-sm">GM {'\u30B3\u30F3\u30C8\u30ED\u30FC\u30EB'}</span>
          </div>
          <button
            onClick={onClose}
            class="w-8 h-8 rounded-full hover:bg-indigo-500 flex items-center justify-center transition-colors"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Tabs */}
        <div class="flex border-b border-gray-200 shrink-0">
          <button
            onClick={() => setTab('control')}
            class={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === 'control'
                ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {'\u2699\uFE0F \u64CD\u4F5C'}
          </button>
          <button
            onClick={() => setTab('dashboard')}
            class={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === 'dashboard'
                ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {'\uD83D\uDCCB \u6388\u696D'}
          </button>
        </div>

        {/* Tab content */}
        <div class="flex-1 overflow-y-auto">
          {tab === 'control' ? (
            <ControlTab
              navigablePhases={navigablePhases}
              currentStep={currentStep}
              onGoToStep={onGoToStep}
              onNext={onNext}
              onPrev={onPrev}
              isFirstPhase={isFirstPhase}
              isLastPhase={isLastPhase}
              onComplete={onComplete}
              saving={saving}
              timerSeconds={timerSeconds}
              timerRunning={timerRunning}
              onTimerToggle={onTimerToggle}
              onTimerReset={onTimerReset}
              timerDefaultSeconds={timerDefaultSeconds}
              mm={mm}
              ss={ss}
              isOvertime={isOvertime}
              isUrgent={isUrgent}
              isProjectorMode={isProjectorMode}
              onToggleProjector={onToggleProjector}
            />
          ) : (
            <DashboardTab
              scenarioTitle={scenarioTitle}
              currentPhase={currentPhase}
              timerSeconds={timerSeconds}
              timerRunning={timerRunning}
              mm={mm}
              ss={ss}
              isOvertime={isOvertime}
              isProjectorMode={isProjectorMode}
              startedAt={startedAt}
              completed={completed}
              discoveredCards={discoveredCards}
              evidenceCards={evidenceCards}
              evidence5={evidence5}
              twistRevealed={twistRevealed}
              votes={votes}
              voteReasons={voteReasons}
              characters={characters}
              culpritName={culpritName}
              hasVotes={hasVotes}
              gmMemo={gmMemo}
              onGmMemoChange={onGmMemoChange}
              stepStartTimes={stepStartTimes}
              skipTwist={skipTwist}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Control Tab (existing functionality) ─── */

interface ControlTabProps {
  navigablePhases: typeof PHASE_CONFIG;
  currentStep: number;
  onGoToStep: (step: number) => void;
  onNext: () => void;
  onPrev: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
  onComplete: () => void;
  saving: boolean;
  timerSeconds: number;
  timerRunning: boolean;
  onTimerToggle: () => void;
  onTimerReset: (seconds: number) => void;
  timerDefaultSeconds: number;
  mm: string;
  ss: string;
  isOvertime: boolean;
  isUrgent: boolean;
  isProjectorMode: boolean;
  onToggleProjector: () => void;
}

function ControlTab({
  navigablePhases,
  currentStep,
  onGoToStep,
  onNext,
  onPrev,
  isFirstPhase,
  isLastPhase,
  onComplete,
  saving,
  timerSeconds,
  timerRunning,
  onTimerToggle,
  onTimerReset,
  timerDefaultSeconds,
  mm,
  ss,
  isOvertime,
  isUrgent,
  isProjectorMode,
  onToggleProjector,
}: ControlTabProps) {
  return (
    <div class="p-4 space-y-5">
      {/* Phase navigation */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u30D5\u30A7\u30FC\u30BA\u64CD\u4F5C'}
        </h4>
        <div class="flex gap-2 mb-3">
          <button
            onClick={onPrev}
            disabled={isFirstPhase}
            class={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              isFirstPhase
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {'\u25C0 \u524D\u3078'}
          </button>
          {isLastPhase ? (
            <button
              onClick={onComplete}
              disabled={saving}
              class={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                saving
                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {saving ? '\u4FDD\u5B58\u4E2D...' : '\u2713 \u5B8C\u4E86'}
            </button>
          ) : (
            <button
              onClick={onNext}
              class="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors"
            >
              {'\u6B21\u3078 \u25B6'}
            </button>
          )}
        </div>

        {/* Phase list */}
        <div class="space-y-1">
          {navigablePhases.map((phase) => {
            const originalIndex = PHASE_CONFIG.findIndex(
              (p) => p.key === phase.key,
            );
            const isActive = originalIndex === currentStep;
            const isDone = originalIndex < currentStep;
            return (
              <button
                key={phase.key}
                onClick={() => onGoToStep(originalIndex)}
                class={`w-full px-3 py-2 rounded-lg text-left text-sm font-bold flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                    : isDone
                      ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <span>{isDone ? '\u2713' : phase.icon}</span>
                <span>{phase.label}</span>
                {isActive && (
                  <span class="ml-auto text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                    {'\u73FE\u5728'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Timer controls */}
      {timerDefaultSeconds > 0 && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\u30BF\u30A4\u30DE\u30FC'}
          </h4>
          <div
            class={`text-center py-3 rounded-lg mb-2 ${
              isOvertime
                ? 'bg-red-50 text-red-600'
                : isUrgent
                  ? 'bg-red-50 text-red-600 animate-pulse'
                  : 'bg-gray-50 text-gray-900'
            }`}
          >
            <div class="font-mono font-black text-3xl tabular-nums">
              {isOvertime && '-'}
              {mm}:{ss}
            </div>
          </div>
          <div class="grid grid-cols-4 gap-1">
            <button
              onClick={onTimerToggle}
              class={`col-span-2 py-2 rounded-lg text-sm font-bold transition-colors ${
                timerRunning
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {timerRunning
                ? '\u23F8 \u505C\u6B62'
                : '\u25B6 \u958B\u59CB'}
            </button>
            <button
              onClick={() => onTimerReset(timerSeconds + 60)}
              class="py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              +1{'\u5206'}
            </button>
            <button
              onClick={() => onTimerReset(timerSeconds + 180)}
              class="py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              +3{'\u5206'}
            </button>
          </div>
          <button
            onClick={() => onTimerReset(timerDefaultSeconds)}
            class="w-full mt-1 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
          >
            {'\u21BA \u30EA\u30BB\u30C3\u30C8'}
          </button>
        </section>
      )}

      {/* Display settings */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u8868\u793A\u8A2D\u5B9A'}
        </h4>
        <button
          onClick={onToggleProjector}
          class={`w-full px-3 py-3 rounded-lg text-sm font-bold flex items-center justify-between transition-all ${
            isProjectorMode
              ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span class="flex items-center gap-2">
            <span>{isProjectorMode ? '\uD83D\uDCFD\uFE0F' : '\uD83D\uDDA5\uFE0F'}</span>
            <span>{'\u6295\u5F71\u30E2\u30FC\u30C9'}</span>
          </span>
          <span
            class={`px-2 py-0.5 rounded text-xs font-black ${
              isProjectorMode
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {isProjectorMode ? 'ON' : 'OFF'}
          </span>
        </button>
        {isProjectorMode && (
          <p class="text-xs text-indigo-600 mt-1.5 px-1">
            {'\u6559\u5BA4\u30B9\u30AF\u30EA\u30FC\u30F3\u5411\u3051\u306B\u6587\u5B57\u3092\u5927\u304D\u304F\u8868\u793A\u3057\u307E\u3059'}
          </p>
        )}
      </section>
    </div>
  );
}

/* ─── Dashboard Tab (new) ─── */

interface DashboardTabProps {
  scenarioTitle: string;
  currentPhase: (typeof PHASE_CONFIG)[number] | undefined;
  timerSeconds: number;
  timerRunning: boolean;
  mm: string;
  ss: string;
  isOvertime: boolean;
  isProjectorMode: boolean;
  startedAt: Date | null;
  completed: boolean;
  discoveredCards: Set<number>;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  twistRevealed: boolean;
  votes: Record<string, string>;
  voteReasons: Record<string, string>;
  characters: CharacterData[];
  culpritName: string | null;
  hasVotes: boolean;
  gmMemo: string;
  onGmMemoChange: (value: string) => void;
  stepStartTimes: number[];
  skipTwist: boolean;
}

function DashboardTab({
  scenarioTitle,
  currentPhase,
  mm,
  ss,
  isOvertime,
  isProjectorMode,
  startedAt,
  completed,
  discoveredCards,
  evidenceCards,
  evidence5,
  twistRevealed,
  votes,
  voteReasons,
  characters,
  culpritName,
  hasVotes,
  gmMemo,
  onGmMemoChange,
  stepStartTimes,
  skipTwist,
}: DashboardTabProps) {
  // Calculate phase durations from stepStartTimes
  const phaseDurations = useMemo(() => {
    const durations: { key: string; label: string; icon: string; seconds: number }[] = [];
    const phases = skipTwist
      ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
      : [...PHASE_CONFIG];

    for (const phase of phases) {
      if (phase.key === 'prep') continue;
      const idx = PHASE_CONFIG.findIndex((p) => p.key === phase.key);
      if (!stepStartTimes[idx]) continue;

      // Find next started phase
      let endTime = Date.now();
      for (let j = idx + 1; j < PHASE_CONFIG.length; j++) {
        if (stepStartTimes[j]) {
          endTime = stepStartTimes[j];
          break;
        }
      }
      const seconds = Math.round((endTime - stepStartTimes[idx]) / 1000);
      durations.push({ key: phase.key, label: phase.label, icon: phase.icon, seconds });
    }
    return durations;
  }, [stepStartTimes, skipTwist]);
  return (
    <div class="p-4 space-y-4">
      {/* Session info */}
      <section class="bg-gray-50 rounded-lg p-3">
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u30BB\u30C3\u30B7\u30E7\u30F3\u60C5\u5831'}
        </h4>
        <div class="space-y-1.5 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30B7\u30CA\u30EA\u30AA'}</span>
            <span class="font-bold text-gray-900 text-right max-w-[160px] truncate">{scenarioTitle}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30D5\u30A7\u30FC\u30BA'}</span>
            <span class="font-bold text-amber-700">
              {currentPhase?.icon} {currentPhase?.label}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30BF\u30A4\u30DE\u30FC'}</span>
            <span class={`font-mono font-bold ${isOvertime ? 'text-red-600' : 'text-gray-900'}`}>
              {isOvertime && '-'}{mm}:{ss}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u6295\u5F71'}</span>
            <span class={`text-xs font-bold px-2 py-0.5 rounded ${
              isProjectorMode
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {isProjectorMode ? 'ON' : 'OFF'}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u72B6\u614B'}</span>
            <span class={`text-xs font-bold px-2 py-0.5 rounded ${
              completed
                ? 'bg-green-100 text-green-700'
                : startedAt
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-200 text-gray-500'
            }`}>
              {completed
                ? '\u5B8C\u4E86'
                : startedAt
                  ? '\u9032\u884C\u4E2D'
                  : '\u6E96\u5099\u4E2D'}
            </span>
          </div>
          {startedAt && (
            <div class="flex items-center justify-between">
              <span class="text-gray-500">{'\u7D4C\u904E'}</span>
              <span class="font-mono text-gray-700">{formatDuration(startedAt)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Evidence status */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u8A3C\u62E0\u516C\u958B\u72B6\u6CC1'}
        </h4>
        <div class="space-y-1">
          {evidenceCards.map((card) => {
            const isDiscovered = discoveredCards.has(card.number);
            return (
              <div
                key={card.number}
                class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  isDiscovered
                    ? 'bg-green-50 text-green-800'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                <span class={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                  isDiscovered
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {isDiscovered ? '\u2713' : card.number}
                </span>
                <span class="font-bold flex-1">{card.title}</span>
                <span class="text-xs">
                  {isDiscovered
                    ? '\u2705 \u767A\u898B\u6E08'
                    : '\u26AA \u672A\u767A\u898B'}
                </span>
              </div>
            );
          })}
          {evidence5 && (
            <div
              class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                twistRevealed
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              <span class={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                twistRevealed
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {twistRevealed ? '\u2713' : '\u26A1'}
              </span>
              <span class="font-bold flex-1">{evidence5.title}</span>
              <span class="text-xs">
                {twistRevealed
                  ? '\u26A1 \u516C\u958B\u6E08'
                  : '\uD83D\uDD12 \u672A\u516C\u958B'}
              </span>
            </div>
          )}
        </div>
        <p class="text-xs text-gray-400 mt-1 px-1">
          {discoveredCards.size}/{evidenceCards.length}
          {evidence5 ? ` + Twist${twistRevealed ? '(\u516C\u958B)' : '(\u672A)'}` : ''}
        </p>
      </section>

      {/* GM Memo */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\uD83D\uDCDD'} GM{'\u30E1\u30E2'}
        </h4>
        <textarea
          value={gmMemo}
          onInput={(e) => onGmMemoChange((e.target as HTMLTextAreaElement).value)}
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
          rows={4}
          placeholder={'\u5B50\u3069\u3082\u306E\u767A\u8A00\u3001\u6C17\u3065\u304D\u3001\u6539\u5584\u70B9\u306A\u3069\u2026'}
        />
        <p class="text-xs text-gray-400 mt-1 px-1">
          {'\u81EA\u52D5\u4FDD\u5B58\uFF08\u30D6\u30E9\u30A6\u30B6 + \u30AF\u30E9\u30A6\u30C9\uFF09'}
        </p>
      </section>

      {/* Class analysis */}
      {phaseDurations.length > 0 && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\uD83D\uDCCA'} {'\u6388\u696D\u5206\u6790'}
          </h4>
          <div class="bg-gray-50 rounded-lg p-3 space-y-2">
            {/* Phase durations */}
            {phaseDurations.map((pd) => {
              const m = Math.floor(pd.seconds / 60);
              const s = pd.seconds % 60;
              return (
                <div key={pd.key} class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">
                    {pd.icon} {pd.label}
                  </span>
                  <span class="font-mono font-bold text-gray-900">
                    {m}{'\u5206'}{s > 0 ? `${s.toString().padStart(2, '0')}\u79D2` : ''}
                  </span>
                </div>
              );
            })}

            <div class="border-t border-gray-200 pt-2 mt-2 space-y-1.5">
              {/* Evidence discovery rate */}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">{'\u8A3C\u62E0\u767A\u898B\u7387'}</span>
                <span class="font-bold text-gray-900">
                  {discoveredCards.size} / {evidenceCards.length}
                </span>
              </div>

              {/* Correct count */}
              {culpritName && hasVotes && (
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">{'\u6B63\u89E3\u8005'}</span>
                  <span class="font-bold text-gray-900">
                    {Object.entries(votes).filter(([, suspectId]) => {
                      const suspect = characters.find((c) => c.id === suspectId);
                      return suspect && (
                        suspect.name.includes(culpritName) ||
                        culpritName.includes(suspect.name)
                      );
                    }).length} / {Object.keys(votes).length}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Session summary (shown when votes exist or completed) */}
      {(hasVotes || completed) && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\uD83D\uDCCA'} {completed ? '\u6388\u696D\u7D50\u679C\u30B5\u30DE\u30EA\u30FC' : '\u6295\u7968\u72B6\u6CC1'}
          </h4>
          <div class="bg-gray-50 rounded-lg p-3 space-y-2">
            {/* Vote results */}
            {characters.map((voter) => {
              const suspectId = votes[voter.id];
              if (!suspectId) return null;
              const suspect = characters.find((c) => c.id === suspectId);
              if (!suspect) return null;
              const reason = voteReasons[voter.id];

              let correctMark: string | null = null;
              if (culpritName) {
                const isCorrect =
                  suspect.name.includes(culpritName) ||
                  culpritName.includes(suspect.name);
                correctMark = isCorrect ? '\u25CB' : '\u25B3';
              }

              return (
                <div key={voter.id} class="text-sm">
                  <div class="flex items-center gap-1.5">
                    {correctMark && (
                      <span class={`text-xs font-black ${
                        correctMark === '\u25CB'
                          ? 'text-green-600'
                          : 'text-amber-600'
                      }`}>
                        {correctMark}
                      </span>
                    )}
                    <span class="font-bold text-gray-700">{voter.name}</span>
                    <span class="text-gray-300">{'\u2192'}</span>
                    <span class="font-bold text-red-700">{suspect.name}</span>
                  </div>
                  {reason && (
                    <p class="text-xs text-gray-400 ml-5 mt-0.5">
                      {'\u300C'}{reason}{'\u300D'}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Correct count */}
            {culpritName && hasVotes && (
              <div class="pt-2 border-t border-gray-200 text-xs text-gray-500">
                {'\u6B63\u89E3\u8005'}: {
                  Object.entries(votes).filter(([, suspectId]) => {
                    const suspect = characters.find((c) => c.id === suspectId);
                    return suspect && (
                      suspect.name.includes(culpritName) ||
                      culpritName.includes(suspect.name)
                    );
                  }).length
                }/{Object.keys(votes).length}{'\u4EBA'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Completed summary extras */}
      {completed && (
        <section class="bg-green-50 rounded-lg p-3 text-center">
          <div class="text-2xl mb-1">{'\u2705'}</div>
          <p class="font-bold text-green-800 text-sm">{'\u30BB\u30C3\u30B7\u30E7\u30F3\u5B8C\u4E86'}</p>
          {startedAt && (
            <p class="text-xs text-green-600 mt-1">
              {'\u6240\u8981\u6642\u9593'}: {formatDuration(startedAt)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
