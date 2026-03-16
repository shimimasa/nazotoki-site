export interface CurriculumEntry {
  grade?: string;
  unit?: string;
}

export type CurriculumMap = Record<string, CurriculumEntry>;

export interface RecommendationsPersonaData {
  id: string;
  title: string;
  emoji: string;
  description: string;
  color: string;
  link?: string;
  scenarios: string[];
}

export interface RecommendationsSeriesComparison {
  series: string;
  audience: string;
  scene: string;
  difficultyRange: string;
  highlight: string;
}

export interface RecommendationsData {
  siteUpdatedAt?: string;
  personas: RecommendationsPersonaData[];
  featured: string[];
  labels: Record<string, string[]>;
  seriesComparison: RecommendationsSeriesComparison[];
}

export interface UseCaseData {
  id: string;
  label: string;
  labelColor: string;
  scene: string;
  time: string;
  target: string;
  comment: string;
  icon: string;
  verified: boolean;
  verifiedLabel?: string;
}
