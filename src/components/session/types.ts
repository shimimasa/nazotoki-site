export interface EvidenceCardData {
  number: number;
  title: string;
  contentHtml: string;
}

export interface CharacterData {
  id: string;
  name: string;
  role: string;
  url: string;
  qrDataUrl: string;
  imageUrl?: string;  // Phase 157
}

export interface SessionScenarioData {
  slug: string;
  title: string;
  fullTitle: string;
  series: string;
  seriesName: string;
  subject: string;
  players: string;
  age: string;
  time: string;
  difficulty: string;
  synopsisHtml: string;
  commonHtml: string;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  gmGuideHtml: string;
  discussionHtml: string;
  solutionHtml: string;
  learningGoalsHtml: string;
  truthHtml: string;
  playableCharacters: CharacterData[];
  thumbnailUrl?: string;
}

export const PHASE_CONFIG = [
  { key: 'prep', label: '準備', icon: '⚙️', defaultSeconds: 0 },
  { key: 'intro', label: '導入', icon: '📖', defaultSeconds: 180 },
  { key: 'explore', label: '探索', icon: '🔍', defaultSeconds: 600 },
  { key: 'twist', label: '反転', icon: '⚡', defaultSeconds: 300 },
  { key: 'discuss', label: '議論', icon: '💬', defaultSeconds: 600 },
  { key: 'vote', label: '投票', icon: '🗳️', defaultSeconds: 420 },
  { key: 'truth', label: '真相', icon: '🎬', defaultSeconds: 300 },
] as const;

export type PhaseKey = (typeof PHASE_CONFIG)[number]['key'];
