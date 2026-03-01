/** シナリオデータの型定義とローダー */

export interface Character {
  id: string;
  name: string;
  role: string;
  isNPC: boolean;
  introContent: string;
  publicContent: string;
  fullContent: string;
}

export interface EvidenceCard {
  number: number;
  title: string;
  content: string;
}

export interface ScenarioData {
  title: string;
  fullTitle: string;
  series: string;
  seriesName: string;
  seriesOrder: number;
  volume: number;
  slug: string;
  subject: string;
  players: string;
  age: string;
  time: string;
  difficulty: string;
  synopsis: string;
  truth: string;
  learningGoals: string;
  common: string;
  evidenceCards: EvidenceCard[];
  evidence5: EvidenceCard | null;
  characters: Character[];
  solution: string;
  gmGuide: string;
}

/** 全シナリオデータを読み込む */
export function loadAllScenarios(): ScenarioData[] {
  const modules = import.meta.glob('/src/data/*.json', { eager: true, import: 'default' }) as Record<string, ScenarioData>;
  return Object.values(modules).sort((a, b) => {
    if (a.seriesOrder !== b.seriesOrder) return a.seriesOrder - b.seriesOrder;
    return a.volume - b.volume;
  });
}

/** slug でシナリオデータを取得 */
export function loadScenario(slug: string): ScenarioData | undefined {
  const all = loadAllScenarios();
  return all.find(s => s.slug === slug);
}
