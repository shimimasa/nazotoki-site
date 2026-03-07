import { useState } from 'preact/hooks';
import type { EvidenceCardData, CharacterData } from '../types';

interface ExplorePhaseProps {
  evidenceCards: EvidenceCardData[];
  characters: CharacterData[];
}

export default function ExplorePhase({
  evidenceCards,
  characters,
}: ExplorePhaseProps) {
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const [showQR, setShowQR] = useState(false);

  const toggleCard = (num: number) => {
    setRevealedCards((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const discoveredCount = revealedCards.size;
  const totalCards = evidenceCards.length;
  const allDiscovered = discoveredCount === totalCards;

  return (
    <div class="space-y-6">
      {/* Character sheet distribution */}
      <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-bold text-purple-900">
              {'\uD83D\uDC65'} キャラクターシートを配布
            </p>
            <p class="text-sm text-purple-700 mt-1">
              各プレイヤーに担当キャラのシートを渡してください
            </p>
          </div>
          <button
            onClick={() => setShowQR(!showQR)}
            class="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors"
          >
            {showQR ? 'QRを隠す' : 'QRコードを表示'}
          </button>
        </div>

        {showQR && (
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {characters.map((char) => (
              <div
                key={char.id}
                class="bg-white rounded-lg p-3 text-center border border-purple-100"
              >
                <img
                  src={char.qrDataUrl}
                  alt={`${char.name} QRコード`}
                  class="w-32 h-32 mx-auto"
                />
                <p class="font-bold text-sm mt-2">{char.name}</p>
                <p class="text-xs text-gray-500">{char.role}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Evidence cards */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xl font-black">{'\uD83D\uDD0D'} 証拠カード</h3>
          <div class={`px-3 py-1.5 rounded-lg text-sm font-bold ${
            allDiscovered
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}>
            {allDiscovered
              ? '\u2705 全ての証拠を発見！'
              : `\uD83D\uDD0D ${discoveredCount} / ${totalCards} 発見`}
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          {evidenceCards.map((card) => {
            const revealed = revealedCards.has(card.number);
            return (
              <div
                key={card.number}
                class={`rounded-xl border-2 overflow-hidden transition-all ${
                  revealed
                    ? 'bg-white border-emerald-300'
                    : 'bg-gray-50 border-gray-300 hover:border-amber-400'
                }`}
              >
                <button
                  onClick={() => toggleCard(card.number)}
                  class={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                    revealed ? 'bg-emerald-50' : 'hover:bg-amber-50'
                  }`}
                >
                  <span class="font-bold flex items-center gap-2">
                    {revealed ? (
                      <span class="text-emerald-600">{'\u2705'}</span>
                    ) : (
                      <span class="text-amber-500">{'\uD83D\uDD0D'}</span>
                    )}
                    証拠{card.number}: {card.title}
                  </span>
                  <span class="text-gray-400 text-lg">
                    {revealed ? '\u25B2' : '\u25BC'}
                  </span>
                </button>
                {revealed && (
                  <div
                    class="px-4 pb-4 prose prose-sm max-w-none border-t border-emerald-100 pt-3"
                    dangerouslySetInnerHTML={{ __html: card.contentHtml }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
