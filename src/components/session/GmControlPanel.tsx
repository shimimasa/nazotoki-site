import { PHASE_CONFIG } from './types';

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
}

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
}: GmControlPanelProps) {
  const phases = skipTwist
    ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
    : [...PHASE_CONFIG];
  const navigablePhases = phases.filter((p) => p.key !== 'prep');

  const mm = Math.floor(Math.abs(timerSeconds) / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.abs(timerSeconds % 60)
    .toString()
    .padStart(2, '0');
  const isOvertime = timerSeconds < 0;
  const isUrgent = !isOvertime && timerSeconds > 0 && timerSeconds <= 60;

  return (
    <>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div class="fixed right-0 top-0 bottom-0 z-40 w-72 bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
        {/* Header */}
        <div class="sticky top-0 bg-indigo-600 text-white px-4 py-3 flex items-center justify-between z-10">
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
      </div>
    </>
  );
}
