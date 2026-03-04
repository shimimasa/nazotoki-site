import { PHASE_CONFIG } from './types';

interface PhaseProgressProps {
  currentStep: number;
  skipTwist: boolean;
}

export default function PhaseProgress({
  currentStep,
  skipTwist,
}: PhaseProgressProps) {
  const phases = skipTwist
    ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
    : [...PHASE_CONFIG];

  return (
    <div class="flex items-center gap-1 overflow-x-auto pb-2">
      {phases.map((phase, i) => {
        const originalIndex = PHASE_CONFIG.findIndex(
          (p) => p.key === phase.key,
        );
        const isActive = originalIndex === currentStep;
        const isDone = originalIndex < currentStep;

        return (
          <div
            key={phase.key}
            class={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              isActive
                ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400'
                : isDone
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            <span>{isDone ? '✓' : phase.icon}</span>
            <span class="hidden sm:inline">{phase.label}</span>
          </div>
        );
      })}
    </div>
  );
}
