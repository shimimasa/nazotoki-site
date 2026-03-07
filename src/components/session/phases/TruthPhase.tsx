import { useState, useEffect, useRef } from 'preact/hooks';
import { splitHtmlByHr } from '../splitHtml';
import GmNote from '../GmNote';

interface TruthPhaseProps {
  solutionHtml: string;
  learningGoalsHtml: string;
  truthHtml: string;
  reflections: string[];
  onReflectionChange: (index: number, value: string) => void;
  onAddReflection: () => void;
  onRemoveReflection: (index: number) => void;
}

type TruthStage = 'solution' | 'learning' | 'reflection';

export default function TruthPhase({
  solutionHtml,
  learningGoalsHtml,
  truthHtml,
  reflections,
  onReflectionChange,
  onAddReflection,
  onRemoveReflection,
}: TruthPhaseProps) {
  const [showTruth, setShowTruth] = useState(false);
  const [stage, setStage] = useState<TruthStage>('solution');

  // Solution stepping
  const sections = splitHtmlByHr(solutionHtml);
  const total = sections.length;
  const [visibleCount, setVisibleCount] = useState(1);
  const [animating, setAnimating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const solutionDone = visibleCount >= total;

  // Reset on html change
  useEffect(() => {
    setVisibleCount(1);
    setStage('solution');
  }, [solutionHtml]);

  const handleNextSection = () => {
    if (solutionDone) return;
    setAnimating(true);
    setVisibleCount((c) => c + 1);
    setTimeout(() => {
      setAnimating(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const handleAdvanceStage = () => {
    if (stage === 'solution') setStage('learning');
    else if (stage === 'learning') setStage('reflection');
  };

  const stageIndex = stage === 'solution' ? 0 : stage === 'learning' ? 1 : 2;

  return (
    <div class="space-y-6">
      {/* Stage tabs */}
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(['solution', 'learning', 'reflection'] as TruthStage[]).map((s, i) => {
          const labels = [
            '\uD83C\uDFAC \u89E3\u6C7A\u7DE8',
            '\uD83D\uDCDD \u5B66\u3073',
            '\uD83D\uDCAD \u632F\u308A\u8FD4\u308A',
          ];
          const unlocked = i <= stageIndex;
          return (
            <button
              key={s}
              onClick={() => unlocked && setStage(s)}
              class={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                s === stage
                  ? 'bg-white shadow text-amber-800'
                  : unlocked
                    ? 'text-gray-500 hover:text-gray-700'
                    : 'text-gray-300 cursor-not-allowed'
              }`}
              disabled={!unlocked}
            >
              {labels[i]}
            </button>
          );
        })}
      </div>

      {/* Stage: Solution */}
      {stage === 'solution' && (
        <>
          <GmNote>
            <p class="text-sm text-indigo-800">
              {'\u89E3\u6C7A\u7DE8\u3092\u5C11\u3057\u305A\u3064\u8AAD\u307F\u4E0A\u3052\u3066\u304F\u3060\u3055\u3044\u3002'}
              {'\u300C\u6B21\u3078\u300D\u30DC\u30BF\u30F3\u3067\u7D9A\u304D\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002'}
            </p>
          </GmNote>

          <div class="bg-white rounded-xl border-2 border-amber-300 p-6 sm:p-8">
            <div class="prose prose-lg max-w-none space-y-4">
              {total <= 1 ? (
                <div dangerouslySetInnerHTML={{ __html: solutionHtml }} />
              ) : (
                sections.slice(0, visibleCount).map((sec, i) => {
                  const isLatest = i === visibleCount - 1 && visibleCount > 1;
                  return (
                    <div
                      key={i}
                      class={`transition-all duration-500 ${
                        isLatest && animating
                          ? 'opacity-0 translate-y-4'
                          : 'opacity-100 translate-y-0'
                      }`}
                      dangerouslySetInnerHTML={{ __html: sec }}
                    />
                  );
                })
              )}
            </div>

            <div ref={bottomRef} />

            {total > 1 && (
              <div class="flex items-center justify-between pt-4 mt-4 border-t border-amber-100">
                <span class="text-xs text-gray-400 font-bold">
                  {visibleCount} / {total}
                </span>
                {!solutionDone ? (
                  <button
                    onClick={handleNextSection}
                    class="px-5 py-2.5 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors"
                  >
                    {'\u25B6 \u7D9A\u304D\u3092\u8AAD\u3080'}
                  </button>
                ) : (
                  <button
                    onClick={handleAdvanceStage}
                    class="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
                  >
                    {'\u2705 \u5B66\u3073\u3078\u9032\u3080'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* GM truth (collapsible, always available) */}
          <div class="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setShowTruth(!showTruth)}
              class="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span class="px-2 py-0.5 bg-gray-600 text-white text-xs font-black rounded">
                GM
              </span>
              <span class="flex-1 text-sm font-bold text-gray-700">
                {showTruth ? '\u25B2 \u4E8B\u4EF6\u306E\u771F\u76F8\u3092\u9589\u3058\u308B' : '\u25BC \u4E8B\u4EF6\u306E\u771F\u76F8\uFF08\u78BA\u8A8D\u7528\uFF09'}
              </span>
            </button>
            {showTruth && (
              <div
                class="px-4 pb-4 prose max-w-none border-t border-gray-100 pt-3"
                dangerouslySetInnerHTML={{ __html: truthHtml }}
              />
            )}
          </div>
        </>
      )}

      {/* Stage: Learning */}
      {stage === 'learning' && (
        <>
          {learningGoalsHtml ? (
            <div class="bg-green-50 rounded-xl border border-green-200 p-6">
              <h3 class="text-lg font-black text-green-900 mb-3">
                {'\uD83D\uDCDD \u5B66\u7FD2\u30DD\u30A4\u30F3\u30C8'}
              </h3>
              <div
                class="prose prose-sm max-w-none text-green-900"
                dangerouslySetInnerHTML={{ __html: learningGoalsHtml }}
              />
            </div>
          ) : (
            <div class="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
              {'\u3053\u306E\u30B7\u30CA\u30EA\u30AA\u306B\u306F\u5B66\u7FD2\u30DD\u30A4\u30F3\u30C8\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002'}
            </div>
          )}

          <div class="flex justify-end">
            <button
              onClick={handleAdvanceStage}
              class="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
            >
              {'\uD83D\uDCAD \u632F\u308A\u8FD4\u308A\u3078\u9032\u3080'}
            </button>
          </div>
        </>
      )}

      {/* Stage: Reflection */}
      {stage === 'reflection' && (
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <h3 class="text-lg font-black mb-3">
            {'\uD83D\uDCAD \u632F\u308A\u8FD4\u308A'}
          </h3>
          <p class="text-sm text-gray-500 mb-4">
            {'\u53C2\u52A0\u8005\u305D\u308C\u305E\u308C\u306E\u611F\u60F3\u3084\u6C17\u3065\u304D\u3092\u8A18\u9332\u3057\u307E\u3057\u3087\u3046\u3002'}
          </p>

          <div class="space-y-3">
            {reflections.map((text, i) => (
              <div key={i} class="flex gap-2">
                <span class="text-sm text-gray-400 pt-2 w-6 text-right flex-shrink-0">
                  {i + 1}.
                </span>
                <textarea
                  value={text}
                  onInput={(e) =>
                    onReflectionChange(
                      i,
                      (e.target as HTMLTextAreaElement).value,
                    )
                  }
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  rows={2}
                  placeholder={`\u53C2\u52A0\u8005${i + 1}\u306E\u632F\u308A\u8FD4\u308A\u2026`}
                />
                {reflections.length > 1 && (
                  <button
                    onClick={() => onRemoveReflection(i)}
                    class="text-gray-300 hover:text-red-400 px-1 transition-colors"
                    title={'\u524A\u9664'}
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onAddReflection}
            class="mt-3 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            + {'\u8FFD\u52A0'}
          </button>
        </div>
      )}
    </div>
  );
}
