export interface RecommendScenarioMeta {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
  subject?: string;
  volume?: number;
}

export interface RecommendedScenario {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
  subject: string;
  reason: string;
}

export function detectSubject(slug: string): string {
  if (slug.startsWith('science-file')) return '理科';
  if (slug.startsWith('shakai-file')) return '社会';
  if (slug.startsWith('kokugo-mystery')) return '国語';
  if (slug.startsWith('suiri-puzzle')) return '算数';
  if (slug.startsWith('moral-dilemma')) return '道徳';
  return '総合';
}

export function detectVolume(slug: string): number {
  const m = slug.match(/vol(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function recommendScenarios(
  allScenarios: RecommendScenarioMeta[],
  playedSlugs: string[],
  gradeLabel?: string | null,
  maxResults = 5,
): RecommendedScenario[] {
  const playedSet = new Set(playedSlugs);

  // No play history → recommend vol.1 of each series
  if (playedSlugs.length === 0) {
    const seriesSeen = new Set<string>();
    const results: RecommendedScenario[] = [];
    for (const s of allScenarios) {
      const vol = s.volume ?? detectVolume(s.slug);
      if (vol === 1 && !seriesSeen.has(s.series)) {
        seriesSeen.add(s.series);
        results.push({
          ...s,
          subject: s.subject || detectSubject(s.slug),
          reason: 'はじめてのシナリオにおすすめです',
        });
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }

  // Count subjects played
  const subjectCount: Record<string, number> = {};
  for (const slug of playedSlugs) {
    const sub = detectSubject(slug);
    subjectCount[sub] = (subjectCount[sub] || 0) + 1;
  }
  const subjectValues = Object.values(subjectCount);
  const minSubjectCount = subjectValues.length > 0 ? Math.min(...subjectValues) : 0;
  const leastPlayedSubjects = new Set(
    Object.entries(subjectCount)
      .filter(([, c]) => c <= minSubjectCount + 1)
      .map(([s]) => s),
  );
  // Add subjects not played at all
  for (const sub of ['理科', '社会', '国語', '算数', '道徳']) {
    if (!(sub in subjectCount)) leastPlayedSubjects.add(sub);
  }

  // Played series/volumes for continuity
  const playedSeriesVols = new Map<string, number>();
  for (const slug of playedSlugs) {
    const s = allScenarios.find((sc) => sc.slug === slug);
    if (s) {
      const vol = s.volume ?? detectVolume(s.slug);
      const cur = playedSeriesVols.get(s.series) || 0;
      if (vol > cur) playedSeriesVols.set(s.series, vol);
    }
  }

  // Score candidates
  const candidates = allScenarios
    .filter((s) => !playedSet.has(s.slug))
    .map((s) => {
      const subject = s.subject || detectSubject(s.slug);
      const vol = s.volume ?? detectVolume(s.slug);
      let score = 0;
      let reason = 'おすすめのシナリオです';

      // Subject balance
      if (leastPlayedSubjects.has(subject)) {
        score += 3;
        reason = `${subject}が最近未実施です`;
      }

      // Series continuity
      const maxVol = playedSeriesVols.get(s.series) || 0;
      if (vol === maxVol + 1) {
        score += 2;
        reason = `${s.seriesName}の次巻です`;
      }

      // Difficulty match
      if (gradeLabel) {
        const grade = parseInt(gradeLabel.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(grade)) {
          if (s.difficulty === 'easy' && grade <= 3) score += 1;
          else if (s.difficulty === 'normal' && grade >= 4 && grade <= 6) score += 1;
          else if (s.difficulty === 'hard' && grade >= 7) score += 1;
        }
      }

      return { ...s, subject, reason, score };
    });

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxResults).map(({ score, ...rest }) => rest);
}
