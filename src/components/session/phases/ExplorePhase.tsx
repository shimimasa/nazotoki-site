import { useState, useCallback } from 'preact/hooks';
import type { EvidenceCardData, CharacterData } from '../types';
import EvidenceViewer from '../EvidenceViewer';

interface ExplorePhaseProps {
  evidenceCards: EvidenceCardData[];
  characters: CharacterData[];
}

export default function ExplorePhase({
  evidenceCards,
  characters,
}: ExplorePhaseProps) {
  const [discoveredCards, setDiscoveredCards] = useState<Set<number>>(new Set());
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [justDiscovered, setJustDiscovered] = useState<number | null>(null);
  const [showQR, setShowQR] = useState(false);

  const totalCards = evidenceCards.length;
  const discoveredCount = discoveredCards.size;
  const allDiscovered = discoveredCount === totalCards;
  const progressPercent = totalCards > 0 ? (discoveredCount / totalCards) * 100 : 0;

  const handleSelectCard = useCallback((num: number) => {
    const isNew = !discoveredCards.has(num);
    setSelectedCard(num);

    if (isNew) {
      setDiscoveredCards((prev) => new Set(prev).add(num));
      setJustDiscovered(num);
    } else {
      setJustDiscovered(null);
    }
  }, [discoveredCards]);

  const handleCloseViewer = useCallback(() => {
    setSelectedCard(null);
    setJustDiscovered(null);
  }, []);

  const selectedEvidence = selectedCard !== null
    ? evidenceCards.find((c) => c.number === selectedCard) || null
    : null;

  return (
    <div class="space-y-6">
      {/* Character sheet distribution */}
      <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-bold text-purple-900">
              {'\uD83D\uDC65'} {'\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u30B7\u30FC\u30C8\u3092\u914D\u5E03'}
            </p>
            <p class="text-sm text-purple-700 mt-1">
              {'\u5404\u30D7\u30EC\u30A4\u30E4\u30FC\u306B\u62C5\u5F53\u30AD\u30E3\u30E9\u306E\u30B7\u30FC\u30C8\u3092\u6E21\u3057\u3066\u304F\u3060\u3055\u3044'}
            </p>
          </div>
          <button
            onClick={() => setShowQR(!showQR)}
            class="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors"
          >
            {showQR ? 'QR\u3092\u96A0\u3059' : 'QR\u30B3\u30FC\u30C9\u3092\u8868\u793A'}
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
                  alt={`${char.name} QR\u30B3\u30FC\u30C9`}
                  class="w-32 h-32 mx-auto"
                />
                <p class="font-bold text-sm mt-2">{char.name}</p>
                <p class="text-xs text-gray-500">{char.role}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Investigation header */}
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-black text-amber-900 flex items-center gap-2">
            <span>{'\uD83D\uDD0D'}</span>
            {'\u624B\u304C\u304B\u308A\u3092\u8ABF\u3079\u3088\u3046'}
          </h3>
          <div class={`px-3 py-1 rounded-full text-sm font-black ${
            allDiscovered
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}>
            {allDiscovered
              ? '\u2705 \u5168\u3066\u767A\u898B\uFF01'
              : `${discoveredCount} / ${totalCards}`}
          </div>
        </div>

        {/* Progress bar */}
        <div class="w-full bg-amber-100 rounded-full h-2.5 overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-700 ease-out ${
              allDiscovered ? 'bg-green-500' : 'bg-amber-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {!allDiscovered && (
          <p class="text-xs text-amber-700 mt-2">
            {'\u8A3C\u62E0\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3057\u3066\u3001\u624B\u304C\u304B\u308A\u3092\u96C6\u3081\u307E\u3057\u3087\u3046'}
          </p>
        )}
      </div>

      {/* Evidence card grid */}
      <div class="grid grid-cols-2 gap-3">
        {evidenceCards.map((card) => {
          const isDiscovered = discoveredCards.has(card.number);
          const isSelected = selectedCard === card.number;

          return (
            <button
              key={card.number}
              onClick={() => handleSelectCard(card.number)}
              class={`relative rounded-xl p-4 text-left transition-all duration-300 ${
                isSelected
                  ? 'bg-amber-50 border-2 border-amber-400 ring-2 ring-amber-200 scale-[1.02] shadow-md'
                  : isDiscovered
                    ? 'bg-emerald-50 border-2 border-emerald-300 hover:shadow-md hover:scale-[1.01]'
                    : 'bg-gray-100 border-2 border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-sm'
              }`}
            >
              {/* Card number badge */}
              <div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mb-2 ${
                isSelected
                  ? 'bg-amber-400 text-white'
                  : isDiscovered
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-300 text-gray-600'
              }`}>
                {isDiscovered ? '\u2713' : card.number}
              </div>

              {/* Title */}
              <p class={`font-bold text-sm leading-tight ${
                isSelected
                  ? 'text-amber-900'
                  : isDiscovered
                    ? 'text-emerald-900'
                    : 'text-gray-700'
              }`}>
                {card.title}
              </p>

              {/* Status label */}
              <p class={`text-xs mt-1.5 font-bold ${
                isSelected
                  ? 'text-amber-600'
                  : isDiscovered
                    ? 'text-emerald-600'
                    : 'text-gray-400'
              }`}>
                {isSelected
                  ? '\uD83D\uDCC4 \u95B2\u89A7\u4E2D'
                  : isDiscovered
                    ? '\u2705 \u767A\u898B\u6E08\u307F'
                    : '\uD83D\uDD0D \u8ABF\u3079\u308B'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Evidence viewer */}
      {selectedEvidence && (
        <EvidenceViewer
          card={selectedEvidence}
          isNewDiscovery={justDiscovered === selectedEvidence.number}
          onClose={handleCloseViewer}
        />
      )}

      {/* All discovered celebration */}
      {allDiscovered && !selectedCard && (
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p class="text-2xl mb-1">{'\uD83C\uDF89'}</p>
          <p class="font-black text-green-800">
            {'\u5168\u3066\u306E\u624B\u304C\u304B\u308A\u3092\u767A\u898B\u3057\u307E\u3057\u305F\uFF01'}
          </p>
          <p class="text-sm text-green-700 mt-1">
            {'\u8A3C\u62E0\u3092\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u305F\u3044\u5834\u5408\u306F\u3001\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3057\u3066\u304F\u3060\u3055\u3044'}
          </p>
        </div>
      )}
    </div>
  );
}
