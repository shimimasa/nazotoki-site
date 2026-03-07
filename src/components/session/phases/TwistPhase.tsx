import { useState, useEffect } from 'preact/hooks';
import type { EvidenceCardData } from '../types';

interface TwistPhaseProps {
  evidence5: EvidenceCardData;
}

type TwistState = 'locked' | 'countdown' | 'revealed';

export default function TwistPhase({ evidence5 }: TwistPhaseProps) {
  const [state, setState] = useState<TwistState>('locked');
  const [count, setCount] = useState(3);
  const [cardVisible, setCardVisible] = useState(false);

  useEffect(() => {
    if (state !== 'countdown') return;
    if (count <= 0) {
      setState('revealed');
      setTimeout(() => setCardVisible(true), 100);
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [state, count]);

  const handleReveal = () => {
    setCount(3);
    setState('countdown');
  };

  // Countdown overlay
  if (state === 'countdown') {
    return (
      <div class="space-y-4">
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
          <div class="text-center">
            <div
              key={count}
              class="text-9xl font-black text-amber-400 animate-bounce"
            >
              {count}
            </div>
            <div class="text-xl text-amber-200 mt-4 font-bold">
              新たな証拠を公開します...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p class="font-bold">{'\u26A1'} 新たな証拠が見つかりました！</p>
        <p class="mt-1">
          このカードを全員に共有してください。物語の転換点です。
        </p>
      </div>

      <div class="bg-white rounded-xl border-2 border-amber-300 overflow-hidden">
        {state === 'locked' ? (
          <button
            onClick={handleReveal}
            class="w-full py-12 flex flex-col items-center gap-3 hover:bg-amber-50 transition-colors"
          >
            <span class="text-5xl">{'\uD83D\uDD12'}</span>
            <span class="text-lg font-black text-amber-800">
              証拠{evidence5.number}: {evidence5.title}
            </span>
            <span class="text-sm text-amber-600">
              タップして公開
            </span>
          </button>
        ) : (
          <div
            class={`p-6 transition-all duration-700 ${
              cardVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4'
            }`}
          >
            <h3 class="text-xl font-black text-amber-800 mb-4">
              {'\uD83D\uDD13'} 証拠{evidence5.number}: {evidence5.title}
            </h3>
            <div
              class="prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: evidence5.contentHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
