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

  const revealAll = () => {
    setRevealedCards(new Set(evidenceCards.map((c) => c.number)));
  };

  return (
    <div class="space-y-6">
      {/* キャラクターシート配布 */}
      <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-bold text-purple-900">
              👥 キャラクターシートを配布
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

      {/* 証拠カード */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xl font-black">🔍 証拠カード</h3>
          <button
            onClick={revealAll}
            class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors"
          >
            全て表示
          </button>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          {evidenceCards.map((card) => {
            const revealed = revealedCards.has(card.number);
            return (
              <div
                key={card.number}
                class="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => toggleCard(card.number)}
                  class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span class="font-bold">
                    証拠{card.number}: {card.title}
                  </span>
                  <span class="text-gray-400 text-lg">
                    {revealed ? '▲' : '▼'}
                  </span>
                </button>
                {revealed && (
                  <div
                    class="px-4 pb-4 prose prose-sm max-w-none border-t border-gray-100 pt-3"
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
