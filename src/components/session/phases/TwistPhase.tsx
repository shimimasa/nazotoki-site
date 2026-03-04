import { useState } from 'preact/hooks';
import type { EvidenceCardData } from '../types';

interface TwistPhaseProps {
  evidence5: EvidenceCardData;
}

export default function TwistPhase({ evidence5 }: TwistPhaseProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div class="space-y-4">
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p class="font-bold">⚡ 新たな証拠が見つかりました！</p>
        <p class="mt-1">
          このカードを全員に共有してください。物語の転換点です。
        </p>
      </div>

      <div class="bg-white rounded-xl border-2 border-amber-300 overflow-hidden">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            class="w-full py-12 flex flex-col items-center gap-3 hover:bg-amber-50 transition-colors"
          >
            <span class="text-5xl">🔒</span>
            <span class="text-lg font-black text-amber-800">
              証拠{evidence5.number}: {evidence5.title}
            </span>
            <span class="text-sm text-amber-600">
              タップして公開
            </span>
          </button>
        ) : (
          <div class="p-6">
            <h3 class="text-xl font-black text-amber-800 mb-4">
              証拠{evidence5.number}: {evidence5.title}
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
