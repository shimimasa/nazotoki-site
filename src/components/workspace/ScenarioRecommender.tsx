import { useMemo } from 'preact/hooks';
import { recommendScenarios, type RecommendedScenario } from '../../lib/recommend';

interface ScenarioItem {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
  subject?: string;
}

interface Props {
  scenarios: ScenarioItem[];
  playedSlugs: string[];
  gradeLabel?: string | null;
}

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  normal: 'bg-blue-100 text-blue-700',
  hard: 'bg-red-100 text-red-700',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'かんたん',
  normal: 'ふつう',
  hard: 'むずかしい',
};

export default function ScenarioRecommender({ scenarios, playedSlugs, gradeLabel }: Props) {
  const recommendations = useMemo(
    () => recommendScenarios(scenarios, playedSlugs, gradeLabel, 5),
    [scenarios, playedSlugs, gradeLabel],
  );

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h3 class="font-bold text-sm mb-3 text-amber-700">おすすめシナリオ</h3>
      <div class="flex gap-3 overflow-x-auto pb-2">
        {recommendations.map((r) => (
          <a
            key={r.slug}
            href={`/session/${r.slug}`}
            class="flex-shrink-0 w-48 bg-gray-50 rounded-lg border border-gray-200 p-3 hover:border-amber-300 hover:bg-amber-50 transition-colors"
          >
            <div class="font-bold text-sm text-gray-800 truncate">{r.title}</div>
            <div class="text-xs text-gray-500 mt-1">{r.seriesName}</div>
            <div class="flex items-center gap-1 mt-2">
              <span class={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DIFFICULTY_BADGE[r.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                {DIFFICULTY_LABEL[r.difficulty] || r.difficulty}
              </span>
              <span class="text-[10px] text-gray-400">{r.subject}</span>
            </div>
            <div class="text-[10px] text-amber-600 mt-2 font-medium">{r.reason}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
