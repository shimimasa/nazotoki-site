import { useState, useEffect } from 'preact/hooks';
import { playCountdownTick, playCountdownReveal } from '../../../lib/sound-effects';
import { shakeScreen, flashScreen } from '../../../lib/screen-effects';

interface Props {
  onComplete: () => void;
}

export default function TruthCountdown({ onComplete }: Props) {
  const [step, setStep] = useState(0); // 0=3, 1=2, 2=1, 3=真相!

  useEffect(() => {
    playCountdownTick();
    const t1 = setTimeout(() => { setStep(1); playCountdownTick(); shakeScreen(2, 200); }, 1000);
    const t2 = setTimeout(() => { setStep(2); playCountdownTick(); shakeScreen(3, 200); }, 2000);
    const t3 = setTimeout(() => { setStep(3); playCountdownReveal(); shakeScreen(5, 400); flashScreen('rgba(255,255,255,0.5)', 350); }, 3000);
    const t4 = setTimeout(() => onComplete(), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  const labels = ['3', '2', '1', '\u771F\u76F8\u306F\u2026\uFF01'];
  const label = labels[step];

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-amber-900 to-amber-800">
      <style>{`
        @keyframes countdown-pop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        key={step}
        class="text-center"
        style="animation: countdown-pop 0.5s ease-out"
      >
        <div class={`font-black text-white ${step < 3 ? 'text-[120px] sm:text-[160px]' : 'text-5xl sm:text-6xl'}`}>
          {label}
        </div>
        {step < 3 && (
          <p class="text-amber-200/60 text-lg font-bold mt-4">
            {'\uD83C\uDFAC'} まもなく真相が明かされます
          </p>
        )}
      </div>
    </div>
  );
}
