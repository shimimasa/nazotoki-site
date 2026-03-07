import { useEffect, useState } from 'preact/hooks';

interface PhaseTransitionProps {
  icon: string;
  label: string;
  color: string;
  onComplete: () => void;
}

const PHASE_COLORS: Record<string, string> = {
  intro: 'from-indigo-900 to-indigo-800',
  explore: 'from-emerald-900 to-emerald-800',
  twist: 'from-amber-900 to-orange-800',
  discuss: 'from-blue-900 to-blue-800',
  vote: 'from-red-900 to-red-800',
  truth: 'from-yellow-800 to-amber-700',
};

export function getPhaseColor(key: string): string {
  return PHASE_COLORS[key] || 'from-gray-900 to-gray-800';
}

export default function PhaseTransition({
  icon,
  label,
  color,
  onComplete,
}: PhaseTransitionProps) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 1200);
    const t3 = setTimeout(() => onComplete(), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      class={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b ${color} transition-opacity duration-300 ${
        phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        class={`transition-all duration-500 ${
          phase === 'show'
            ? 'scale-100 opacity-100'
            : 'scale-75 opacity-0'
        }`}
      >
        <div class="text-7xl sm:text-8xl mb-4 text-center">{icon}</div>
        <div class="text-3xl sm:text-4xl font-black text-white text-center tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}
