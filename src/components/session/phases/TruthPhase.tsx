import { useState } from 'preact/hooks';

interface TruthPhaseProps {
  solutionHtml: string;
  learningGoalsHtml: string;
  truthHtml: string;
  reflections: string[];
  onReflectionChange: (index: number, value: string) => void;
  onAddReflection: () => void;
  onRemoveReflection: (index: number) => void;
}

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

  return (
    <div class="space-y-6">
      {/* 解決編（読み上げ） */}
      <div class="bg-white rounded-xl border-2 border-amber-300 p-6 sm:p-8">
        <h3 class="text-2xl font-black text-amber-800 mb-2">🎬 解決編</h3>
        <p class="text-sm text-gray-500 mb-4">
          以下を参加者に読み上げてください。
        </p>
        <div
          class="prose prose-lg max-w-none solution-content"
          dangerouslySetInnerHTML={{ __html: solutionHtml }}
        />
      </div>

      {/* 事件の真相（GM用メモ） */}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowTruth(!showTruth)}
          class="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <span class="font-bold text-sm">
            🔓 事件の真相（GM確認用）
          </span>
          <span class="text-gray-400">{showTruth ? '▲' : '▼'}</span>
        </button>
        {showTruth && (
          <div
            class="px-6 pb-6 prose max-w-none border-t border-gray-100 pt-4"
            dangerouslySetInnerHTML={{ __html: truthHtml }}
          />
        )}
      </div>

      {/* 学習ポイント */}
      {learningGoalsHtml && (
        <div class="bg-green-50 rounded-xl border border-green-200 p-6">
          <h3 class="text-lg font-black text-green-900 mb-3">
            📝 学習ポイント
          </h3>
          <div
            class="prose prose-sm max-w-none text-green-900"
            dangerouslySetInnerHTML={{ __html: learningGoalsHtml }}
          />
        </div>
      )}

      {/* 振り返り入力 */}
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="text-lg font-black mb-3">💭 振り返り</h3>
        <p class="text-sm text-gray-500 mb-4">
          参加者それぞれの感想や気づきを記録しましょう。
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
                placeholder={`参加者${i + 1}の振り返り…`}
              />
              {reflections.length > 1 && (
                <button
                  onClick={() => onRemoveReflection(i)}
                  class="text-gray-300 hover:text-red-400 px-1 transition-colors"
                  title="削除"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onAddReflection}
          class="mt-3 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          + 追加
        </button>
      </div>
    </div>
  );
}
