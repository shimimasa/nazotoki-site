import { useEffect, useState } from 'preact/hooks';
import { playPhaseTransition, playTensionRise, playDramaticReveal, playEvidenceSlam } from '../../lib/sound-effects';
import { flashScreen, shakeScreen } from '../../lib/screen-effects';

interface PhaseTransitionProps {
  icon: string;
  label: string;
  color: string;
  onComplete: () => void;
  phaseKey?: string;
}

const PHASE_COLORS: Record<string, string> = {
  intro: 'from-indigo-900 to-indigo-800',
  explore: 'from-emerald-900 to-emerald-800',
  twist: 'from-amber-900 to-orange-800',
  discuss: 'from-blue-900 to-blue-800',
  vote: 'from-red-900 to-red-800',
  truth: 'from-yellow-800 to-amber-700',
};

const PHASE_SUBTITLES: Record<string, string> = {
  intro: '\u7269\u8A9E\u306E\u4E16\u754C\u306B\u5165\u308D\u3046',
  explore: '\u624B\u304C\u304B\u308A\u3092\u96C6\u3081\u3088\u3046',
  twist: '\u4E8B\u4EF6\u304C\u52D5\u304F\u2026\uFF01',
  discuss: '\u307F\u3093\u306A\u3067\u8A71\u3057\u5408\u304A\u3046',
  vote: '\u72AF\u4EBA\u3092\u6C7A\u3081\u3088\u3046',
  truth: '\u4E8B\u4EF6\u306E\u771F\u76F8\u306F\u2026',
};

// Phase-specific timing: dramatic phases get longer display time
const PHASE_TIMING: Record<string, { showAt: number; exitAt: number; doneAt: number }> = {
  truth: { showAt: 50, exitAt: 2200, doneAt: 2600 },
  twist: { showAt: 50, exitAt: 1800, doneAt: 2200 },
  vote: { showAt: 50, exitAt: 1600, doneAt: 2000 },
};
const DEFAULT_TIMING = { showAt: 50, exitAt: 1500, doneAt: 1900 };

export function getPhaseColor(key: string): string {
  return PHASE_COLORS[key] || 'from-gray-900 to-gray-800';
}

export default function PhaseTransition({
  icon,
  label,
  color,
  onComplete,
  phaseKey,
}: PhaseTransitionProps) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    // Phase-specific SE + screen effects
    if (phaseKey === 'truth') {
      playDramaticReveal();
      flashScreen('rgba(255,255,255,0.5)', 350);
      setTimeout(() => shakeScreen(4, 300), 200);
    } else if (phaseKey === 'twist') {
      playTensionRise();
      flashScreen('rgba(255,165,0,0.3)', 300);
    } else if (phaseKey === 'vote') {
      playEvidenceSlam();
      flashScreen('rgba(239,68,68,0.25)', 250);
    } else {
      playPhaseTransition();
      flashScreen('rgba(255,255,255,0.3)', 200);
    }

    const timing = (phaseKey && PHASE_TIMING[phaseKey]) || DEFAULT_TIMING;
    const t1 = setTimeout(() => setPhase('show'), timing.showAt);
    const t2 = setTimeout(() => setPhase('exit'), timing.exitAt);
    const t3 = setTimeout(() => onComplete(), timing.doneAt);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete, phaseKey]);

  const subtitle = phaseKey ? PHASE_SUBTITLES[phaseKey] : undefined;
  const isDramatic = phaseKey === 'truth' || phaseKey === 'twist';

  return (
    <div
      class={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b ${color} transition-opacity duration-300 ${
        phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <style>{`
        @keyframes phase-icon-pop {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes phase-icon-dramatic {
          0% { transform: scale(0.1) rotate(-20deg); opacity: 0; }
          40% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          60% { transform: scale(0.95) rotate(-2deg); }
          80% { transform: scale(1.05) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes phase-label-slide {
          0% { opacity: 0; transform: translateY(20px); letter-spacing: 0.3em; }
          100% { opacity: 1; transform: translateY(0); letter-spacing: 0.15em; }
        }
      `}</style>
      <div
        class={`transition-all duration-500 ${
          phase === 'show'
            ? 'scale-100 opacity-100'
            : 'scale-75 opacity-0'
        }`}
      >
        <div
          class="text-7xl sm:text-9xl mb-4 text-center"
          style={phase === 'show'
            ? { animation: isDramatic ? 'phase-icon-dramatic 0.8s ease-out' : 'phase-icon-pop 0.6s ease-out' }
            : undefined}
        >
          {icon}
        </div>
        <div
          class="text-3xl sm:text-4xl font-black text-white text-center"
          style={phase === 'show' && isDramatic
            ? { animation: 'phase-label-slide 0.6s ease-out 0.2s both' }
            : { letterSpacing: '0.15em' }}
        >
          {label}
        </div>
        {subtitle && (
          <div
            class={`text-base sm:text-lg text-white/70 text-center mt-2 font-bold transition-all duration-500 delay-300 ${
              phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
