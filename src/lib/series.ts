export const SERIES_CONFIG: Record<string, {
  name: string;
  subject: string;
  color: string;
  bgLight: string;
  border: string;
  text: string;
  emoji: string;
}> = {
  'time-travel': {
    name: 'タイムトラベル探偵団',
    subject: '歴史（社会科）',
    color: 'bg-amber-600',
    bgLight: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    emoji: '🕰️',
  },
  'literature': {
    name: '名作文学ミステリー',
    subject: '国語',
    color: 'bg-indigo-700',
    bgLight: 'bg-indigo-50',
    border: 'border-indigo-300',
    text: 'text-indigo-800',
    emoji: '📖',
  },
  'popculture': {
    name: 'マンガ教養ミステリー',
    subject: 'ポップカルチャー',
    color: 'bg-purple-600',
    bgLight: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-800',
    emoji: '🎭',
  },
  'math': {
    name: '数字の迷宮',
    subject: '算数',
    color: 'bg-emerald-600',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    emoji: '🔢',
  },
  'science': {
    name: 'サイエンス捜査班',
    subject: '理科',
    color: 'bg-blue-600',
    bgLight: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
    emoji: '🔬',
  },
  'moral': {
    name: '答えのない法廷',
    subject: '道徳',
    color: 'bg-orange-600',
    bgLight: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-800',
    emoji: '⚖️',
  },
};

export function getSeriesConfig(series: string) {
  return SERIES_CONFIG[series] || SERIES_CONFIG['time-travel'];
}
