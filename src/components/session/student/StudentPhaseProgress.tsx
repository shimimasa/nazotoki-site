import type { JSX } from 'preact';
import Furi from './Furi';

const ALL_PHASES = [
  { key: 'intro', icon: '\uD83D\uDCD6', label: '\u5C0E\u5165', reading: '\u3069\u3046\u306B\u3085\u3046' },
  { key: 'explore', icon: '\uD83D\uDD0D', label: '\u63A2\u7D22', reading: '\u305F\u3093\u3055\u304F' },
  { key: 'twist', icon: '\u26A1', label: '\u53CD\u8EE2', reading: '\u306F\u3093\u3066\u3093' },
  { key: 'discuss', icon: '\uD83D\uDCAC', label: '\u8B70\u8AD6', reading: '\u304E\u308D\u3093' },
  { key: 'vote', icon: '\uD83D\uDDF3\uFE0F', label: '\u6295\u7968', reading: '\u3068\u3046\u3072\u3087\u3046' },
  { key: 'truth', icon: '\uD83C\uDFAC', label: '\u771F\u76F8', reading: '\u3057\u3093\u305D\u3046' },
];

const ALL_ORDER = ['prep', 'intro', 'explore', 'twist', 'discuss', 'vote', 'truth'];

interface Props {
  currentPhase: string;
  skipTwist?: boolean;
  furigana?: boolean;
}

export default function StudentPhaseProgress({ currentPhase, skipTwist, furigana = false }: Props) {
  const PHASES = skipTwist ? ALL_PHASES.filter((p) => p.key !== 'twist') : ALL_PHASES;
  const ORDER = skipTwist ? ALL_ORDER.filter((k) => k !== 'twist') : ALL_ORDER;
  const curIdx = ORDER.indexOf(currentPhase);

  const items: JSX.Element[] = [];
  PHASES.forEach((p, i) => {
    const idx = ORDER.indexOf(p.key);
    const active = p.key === currentPhase;
    const done = idx < curIdx;

    if (i > 0) {
      items.push(
        <div
          key={`l${i}`}
          class={`flex-1 h-0.5 self-start mt-3.5 ${
            idx <= curIdx ? 'bg-amber-300' : 'bg-gray-200'
          } transition-colors duration-500`}
        />
      );
    }
    items.push(
      <div key={p.key} class="flex flex-col items-center shrink-0">
        <div
          class={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
            active
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-200 scale-110'
              : done
                ? 'bg-amber-300 text-white'
                : 'bg-gray-100 text-gray-300'
          }`}
        >
          {done ? '\u2713' : p.icon}
        </div>
        <span
          class={`text-[10px] font-bold mt-0.5 transition-colors ${
            active ? 'text-amber-700' : done ? 'text-amber-400' : 'text-gray-300'
          }`}
        >
          <Furi f={p.reading} on={furigana}>{p.label}</Furi>
        </span>
      </div>
    );
  });

  return (
    <div class="flex items-center mb-5 px-2">
      {items}
    </div>
  );
}
