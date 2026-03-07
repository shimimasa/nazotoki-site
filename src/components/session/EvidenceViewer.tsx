import { useState, useEffect } from 'preact/hooks';
import type { EvidenceCardData } from './types';

interface EvidenceViewerProps {
  card: EvidenceCardData;
  /** True only on the first reveal of this card */
  isNewDiscovery: boolean;
  onClose: () => void;
}

export default function EvidenceViewer({
  card,
  isNewDiscovery,
  onClose,
}: EvidenceViewerProps) {
  const [entered, setEntered] = useState(false);
  const [discoveryFlash, setDiscoveryFlash] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const t1 = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t1);
  }, [card.number]);

  useEffect(() => {
    if (!isNewDiscovery) return;
    setDiscoveryFlash(true);
    const t = setTimeout(() => setDiscoveryFlash(false), 800);
    return () => clearTimeout(t);
  }, [card.number, isNewDiscovery]);

  // Reset entrance when card changes
  useEffect(() => {
    setEntered(false);
    const t = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t);
  }, [card.number]);

  return (
    <div
      class={`relative bg-white rounded-2xl border-2 overflow-hidden transition-all duration-500 ${
        entered
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-6 scale-95'
      } ${
        discoveryFlash
          ? 'border-amber-400 shadow-lg shadow-amber-200/50'
          : 'border-emerald-300'
      }`}
    >
      {/* Discovery flash overlay */}
      {discoveryFlash && (
        <div class="absolute inset-0 bg-amber-100/40 animate-pulse pointer-events-none z-10" />
      )}

      {/* Header */}
      <div class="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
        <h4 class="font-black text-emerald-900 flex items-center gap-2">
          {discoveryFlash ? (
            <span class="text-lg animate-bounce">{'\uD83D\uDD0D'}</span>
          ) : (
            <span class="text-emerald-600">{'\u2705'}</span>
          )}
          {'\u8A3C\u62E0'}{card.number}: {card.title}
        </h4>
        <button
          onClick={onClose}
          class="text-gray-400 hover:text-gray-600 transition-colors text-lg px-1"
          title={'\u9589\u3058\u308B'}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Content */}
      <div
        class="p-5 sm:p-6 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: card.contentHtml }}
      />

      {/* Footer */}
      <div class="px-5 pb-4 flex justify-end">
        <button
          onClick={onClose}
          class="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-xl text-sm font-bold hover:bg-emerald-200 transition-colors"
        >
          OK{'\u3001\u6B21\u306E\u8A3C\u62E0\u3092\u8ABF\u3079\u3088\u3046'}
        </button>
      </div>
    </div>
  );
}
