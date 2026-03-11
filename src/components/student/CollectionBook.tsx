import { useState, useMemo } from 'preact/hooks';

// --- Types ---

interface ScenarioMeta {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  characterNames: string[];
  evidenceTitles: string[];
}

interface Props {
  scenarios: ScenarioMeta[];
  playedSlugs: Set<string>;
  seriesConfig: Record<string, { name: string; emoji: string; color: string }>;
}

// --- Component ---

export default function CollectionBook({ scenarios, playedSlugs, seriesConfig }: Props) {
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'characters' | 'evidence'>('characters');

  const seriesKeys = Object.keys(seriesConfig);

  const filtered = useMemo(
    () => seriesFilter === 'all' ? scenarios : scenarios.filter(s => s.series === seriesFilter),
    [scenarios, seriesFilter],
  );

  // Collection stats
  const totalChars = scenarios.reduce((sum, s) => sum + s.characterNames.length, 0);
  const collectedChars = scenarios
    .filter(s => playedSlugs.has(s.slug))
    .reduce((sum, s) => sum + s.characterNames.length, 0);
  const totalEvidence = scenarios.reduce((sum, s) => sum + s.evidenceTitles.length, 0);
  const collectedEvidence = scenarios
    .filter(s => playedSlugs.has(s.slug))
    .reduce((sum, s) => sum + s.evidenceTitles.length, 0);

  const charPct = totalChars > 0 ? Math.round((collectedChars / totalChars) * 100) : 0;
  const evidPct = totalEvidence > 0 ? Math.round((collectedEvidence / totalEvidence) * 100) : 0;

  return (
    <div class="space-y-3">
      {/* Collection rate */}
      <div class="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
        <h3 class="text-sm font-black text-purple-800 mb-3">&#128214; コレクション率</h3>
        <div class="space-y-2">
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-purple-700 font-bold">&#128100; キャラクター</span>
              <span class="text-purple-600">{collectedChars}/{totalChars} ({charPct}%)</span>
            </div>
            <div class="w-full h-2.5 bg-purple-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${charPct}%` }}
              />
            </div>
          </div>
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-pink-700 font-bold">&#128269; 証拠カード</span>
              <span class="text-pink-600">{collectedEvidence}/{totalEvidence} ({evidPct}%)</span>
            </div>
            <div class="w-full h-2.5 bg-pink-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${evidPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* View mode toggle */}
      <div class="flex gap-2">
        <button
          onClick={() => setViewMode('characters')}
          class={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
            viewMode === 'characters'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          &#128100; キャラクター
        </button>
        <button
          onClick={() => setViewMode('evidence')}
          class={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
            viewMode === 'evidence'
              ? 'bg-pink-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          &#128269; 証拠カード
        </button>
      </div>

      {/* Series filter */}
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setSeriesFilter('all')}
          class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            seriesFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          すべて
        </button>
        {seriesKeys.map(key => (
          <button
            key={key}
            onClick={() => setSeriesFilter(key)}
            class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              seriesFilter === key ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {seriesConfig[key]?.emoji} {seriesConfig[key]?.name}
          </button>
        ))}
      </div>

      {/* Collection grid */}
      {viewMode === 'characters' ? (
        <div class="space-y-3">
          {filtered.map(scenario => {
            const played = playedSlugs.has(scenario.slug);
            const cfg = seriesConfig[scenario.series];
            return (
              <div key={scenario.slug} class="bg-white border border-gray-200 rounded-xl p-3">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm">{cfg?.emoji || '🔍'}</span>
                  <span class={`text-xs font-bold truncate ${played ? 'text-gray-800' : 'text-gray-400'}`}>
                    {played ? scenario.title : '???'}
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                  {scenario.characterNames.map((name, i) => (
                    <div
                      key={i}
                      class={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${
                        played
                          ? 'bg-purple-50 border border-purple-200'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <span class="text-base shrink-0">
                        {played ? '&#128100;' : '&#10068;'}
                      </span>
                      <span class={`font-bold truncate ${played ? 'text-purple-800' : 'text-gray-300'}`}>
                        {played ? name : '???'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div class="space-y-3">
          {filtered.map(scenario => {
            const played = playedSlugs.has(scenario.slug);
            const cfg = seriesConfig[scenario.series];
            return (
              <div key={scenario.slug} class="bg-white border border-gray-200 rounded-xl p-3">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm">{cfg?.emoji || '🔍'}</span>
                  <span class={`text-xs font-bold truncate ${played ? 'text-gray-800' : 'text-gray-400'}`}>
                    {played ? scenario.title : '???'}
                  </span>
                </div>
                <div class="space-y-1.5">
                  {scenario.evidenceTitles.map((title, i) => (
                    <div
                      key={i}
                      class={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${
                        played
                          ? 'bg-pink-50 border border-pink-200'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <span class={`text-xs font-black shrink-0 w-5 h-5 flex items-center justify-center rounded ${
                        played ? 'bg-pink-200 text-pink-700' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {i + 1}
                      </span>
                      <span class={`font-bold truncate ${played ? 'text-pink-800' : 'text-gray-300'}`}>
                        {played ? title : '???'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
