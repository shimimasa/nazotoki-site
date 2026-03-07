import { useState, useEffect } from 'preact/hooks';
import type { CharacterData } from '../types';
import SteppedContent from '../SteppedContent';
import GmNote from '../GmNote';

interface TruthPhaseProps {
  solutionHtml: string;
  learningGoalsHtml: string;
  truthHtml: string;
  reflections: string[];
  onReflectionChange: (index: number, value: string) => void;
  onAddReflection: () => void;
  onRemoveReflection: (index: number) => void;
  votes: Record<string, string>;
  characters: CharacterData[];
}

type TruthStage = 'votes' | 'solution' | 'learning' | 'reflection';

export default function TruthPhase({
  solutionHtml,
  learningGoalsHtml,
  truthHtml,
  reflections,
  onReflectionChange,
  onAddReflection,
  onRemoveReflection,
  votes,
  characters,
}: TruthPhaseProps) {
  const hasVotes = Object.keys(votes).length > 0;
  const [stage, setStage] = useState<TruthStage>(hasVotes ? 'votes' : 'solution');
  const [showTruth, setShowTruth] = useState(false);
  const [solutionDone, setSolutionDone] = useState(false);
  const [voteRevealAnim, setVoteRevealAnim] = useState(false);

  useEffect(() => {
    setStage(hasVotes ? 'votes' : 'solution');
    setSolutionDone(false);
  }, [solutionHtml, hasVotes]);

  // Trigger vote bar animation
  useEffect(() => {
    if (stage === 'votes') {
      const t = setTimeout(() => setVoteRevealAnim(true), 200);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const stageOrder: TruthStage[] = ['votes', 'solution', 'learning', 'reflection'];
  const stageIdx = stageOrder.indexOf(stage);

  return (
    <div class="space-y-6">
      {/* Progress indicator */}
      <div class="flex gap-1">
        {[
          { key: 'votes', label: '\uD83D\uDCCA \u6295\u7968', show: hasVotes },
          { key: 'solution', label: '\uD83C\uDFAC \u771F\u76F8', show: true },
          { key: 'learning', label: '\uD83D\uDCDD \u5B66\u3073', show: true },
          { key: 'reflection', label: '\uD83D\uDCAD \u632F\u308A\u8FD4\u308A', show: true },
        ].filter(s => s.show).map((s, i) => {
          const thisIdx = stageOrder.indexOf(s.key as TruthStage);
          const isCurrent = s.key === stage;
          const isPast = thisIdx < stageIdx;
          return (
            <div
              key={s.key}
              class={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all ${
                isCurrent
                  ? 'bg-amber-500 text-white'
                  : isPast
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      {/* ── Stage 1: Vote Results Review ── */}
      {stage === 'votes' && hasVotes && (
        <>
          <div class="bg-white rounded-xl border-2 border-red-200 p-6">
            <h3 class="text-lg font-black text-center mb-5">
              {'\uD83D\uDCCA \u307F\u3093\u306A\u306E\u63A8\u7406\u7D50\u679C'}
            </h3>

            {/* Vote bars */}
            <div class="space-y-3 mb-5">
              {characters.map((c) => {
                const voteCount = Object.values(votes).filter(
                  (v) => v === c.id,
                ).length;
                return (
                  <div key={c.id} class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <span class="font-black text-red-700 text-sm">
                        {c.name.charAt(0)}
                      </span>
                    </div>
                    <span class="font-bold text-sm w-16 shrink-0">{c.name}</span>
                    <div class="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                      <div
                        class="h-full bg-red-500 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: voteRevealAnim
                            ? `${Math.max((voteCount / characters.length) * 100, voteCount > 0 ? 15 : 0)}%`
                            : '0%',
                        }}
                      >
                        {voteCount > 0 && (
                          <span class="text-xs font-bold text-white">
                            {voteCount}{'\u7968'}
                          </span>
                        )}
                      </div>
                    </div>
                    {voteCount === 0 && (
                      <span class="text-xs text-gray-400">0{'\u7968'}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Who voted for whom */}
            <div class="pt-4 border-t border-gray-200 space-y-1.5">
              {characters.map((voter) => {
                const suspect = characters.find((c) => c.id === votes[voter.id]);
                return suspect ? (
                  <div key={voter.id} class="text-sm text-gray-600 flex items-center gap-2">
                    <span class="font-bold">{voter.name}</span>
                    <span class="text-gray-300">{'\u2192'}</span>
                    <span class="font-bold text-red-700">{suspect.name}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          <div class="text-center">
            <p class="text-sm text-gray-500 mb-3">
              {'\u307F\u3093\u306A\u306E\u63A8\u7406\u306F\u5408\u3063\u3066\u3044\u305F\u306E\u304B\uFF1F \u771F\u76F8\u3092\u898B\u3066\u307F\u307E\u3057\u3087\u3046\uFF01'}
            </p>
            <button
              onClick={() => setStage('solution')}
              class="px-8 py-4 bg-amber-600 text-white rounded-xl text-lg font-black hover:bg-amber-700 transition-colors shadow-lg animate-pulse"
            >
              {'\uD83C\uDFAC \u771F\u76F8\u3092\u898B\u308B'}
            </button>
          </div>
        </>
      )}

      {/* ── Stage 2: Solution (Event Reconstruction) ── */}
      {stageIdx >= stageOrder.indexOf('solution') && (
        <div class={stage === 'votes' ? 'hidden' : ''}>
          <GmNote>
            <p class="text-sm text-indigo-800">
              {'\u89E3\u6C7A\u7DE8\u3092\u5C11\u3057\u305A\u3064\u8AAD\u307F\u4E0A\u3052\u3066\u304F\u3060\u3055\u3044\u3002'}
              {'\u300C\u6B21\u3078\u300D\u30DC\u30BF\u30F3\u3067\u7D9A\u304D\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002'}
            </p>
          </GmNote>

          <div class="bg-white rounded-xl border-2 border-amber-300 p-6 sm:p-8 mt-4">
            <SteppedContent
              html={solutionHtml}
              onComplete={() => setSolutionDone(true)}
            />
          </div>

          {/* GM truth reference */}
          <div class="rounded-xl border border-gray-200 overflow-hidden bg-white mt-4">
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

          {/* Gate: Solution → Learning */}
          {solutionDone && stage === 'solution' && (
            <div class="text-center py-2 mt-4">
              <button
                onClick={() => setStage('learning')}
                class="px-6 py-3 bg-green-600 text-white rounded-xl font-black text-lg hover:bg-green-700 transition-colors shadow-lg animate-pulse"
              >
                {'\uD83D\uDCDD \u5B66\u3073\u3092\u898B\u308B'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Stage 3: Learning ── */}
      {(stage === 'learning' || stage === 'reflection') && (
        <div>
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
        </div>
      )}

      {/* Gate: Learning → Reflection */}
      {stage === 'learning' && (
        <div class="text-center py-2">
          <button
            onClick={() => setStage('reflection')}
            class="px-6 py-3 bg-green-600 text-white rounded-xl font-black text-lg hover:bg-green-700 transition-colors shadow-lg animate-pulse"
          >
            {'\uD83D\uDCAD \u632F\u308A\u8FD4\u308A\u3092\u66F8\u304F'}
          </button>
        </div>
      )}

      {/* ── Stage 4: Reflection ── */}
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
