import {
  detectSubject,
  detectVolume,
  recommendScenarios,
  type RecommendScenarioMeta,
} from '../../src/lib/recommend';

const scenarios: RecommendScenarioMeta[] = [
  {
    slug: 'science-file-vol1-lab',
    title: 'Science 1',
    series: 'science',
    seriesName: 'Science Files',
    difficulty: 'easy',
    subject: 'science',
    volume: 1,
  },
  {
    slug: 'science-file-vol2-lab',
    title: 'Science 2',
    series: 'science',
    seriesName: 'Science Files',
    difficulty: 'normal',
    subject: 'science',
    volume: 2,
  },
  {
    slug: 'science-file-vol3-lab',
    title: 'Science 3',
    series: 'science',
    seriesName: 'Science Files',
    difficulty: 'hard',
    subject: 'science',
    volume: 3,
  },
  {
    slug: 'shakai-file-vol1-map',
    title: 'Social 1',
    series: 'social',
    seriesName: 'Social Files',
    difficulty: 'easy',
    subject: 'social',
    volume: 1,
  },
  {
    slug: 'kokugo-mystery-vol1-book',
    title: 'Literature 1',
    series: 'literature',
    seriesName: 'Literature Mysteries',
    difficulty: 'normal',
    subject: 'literature',
    volume: 1,
  },
  {
    slug: 'suiri-puzzle-vol1-lock',
    title: 'Reasoning 1',
    series: 'reasoning',
    seriesName: 'Reasoning Puzzles',
    difficulty: 'hard',
    subject: 'reasoning',
    volume: 1,
  },
];

describe('detectSubject', () => {
  it('returns the same value for science slugs with the same prefix', () => {
    expect(detectSubject('science-file-vol1-a')).toBe(detectSubject('science-file-vol9-b'));
  });

  it('returns different values for science and social studies prefixes', () => {
    expect(detectSubject('science-file-vol1-a')).not.toBe(detectSubject('shakai-file-vol1-a'));
  });

  it('returns different values for literature and moral prefixes', () => {
    expect(detectSubject('kokugo-mystery-vol1-a')).not.toBe(detectSubject('moral-dilemma-vol1-a'));
  });

  it('falls back consistently for unknown slugs', () => {
    expect(detectSubject('unknown-slug')).toBe(detectSubject('another-unknown-slug'));
  });
});

describe('detectVolume', () => {
  it('extracts a one-digit volume number', () => {
    expect(detectVolume('science-file-vol1-lab')).toBe(1);
  });

  it('extracts a two-digit volume number', () => {
    expect(detectVolume('science-file-vol15-lab')).toBe(15);
  });

  it('returns 0 when no volume marker exists', () => {
    expect(detectVolume('science-file-no-number')).toBe(0);
  });
});

describe('recommendScenarios', () => {
  it('recommends volume 1 from each series when there is no play history', () => {
    const result = recommendScenarios(scenarios, []);

    expect(result.map((item) => item.slug)).toEqual([
      'science-file-vol1-lab',
      'shakai-file-vol1-map',
      'kokugo-mystery-vol1-book',
      'suiri-puzzle-vol1-lock',
    ]);
  });

  it('keeps one result per series on first-time recommendations', () => {
    const result = recommendScenarios(scenarios, []);

    expect(new Set(result.map((item) => item.series)).size).toBe(result.length);
  });

  it('prioritizes the next volume in a played series', () => {
    const result = recommendScenarios(scenarios, ['science-file-vol1-lab']);

    expect(result[0]?.slug).toBe('science-file-vol2-lab');
  });

  it('uses grade label to boost easy scenarios for lower grades', () => {
    const result = recommendScenarios(
      scenarios,
      ['science-file-vol1-lab', 'science-file-vol2-lab'],
      '2年',
      2,
    );

    expect(result[0]?.slug).toBe('shakai-file-vol1-map');
  });

  it('uses grade label to boost hard scenarios for higher grades', () => {
    const result = recommendScenarios(
      scenarios,
      ['science-file-vol1-lab', 'shakai-file-vol1-map'],
      '7年',
      2,
    );

    expect(result[0]?.slug).toBe('suiri-puzzle-vol1-lock');
    expect(result.map((item) => item.slug)).toContain('science-file-vol2-lab');
  });

  it('respects maxResults', () => {
    const result = recommendScenarios(scenarios, ['science-file-vol1-lab'], null, 3);

    expect(result).toHaveLength(3);
  });

  it('excludes scenarios that have already been played', () => {
    const result = recommendScenarios(scenarios, ['science-file-vol1-lab', 'shakai-file-vol1-map']);

    expect(result.map((item) => item.slug)).not.toContain('science-file-vol1-lab');
    expect(result.map((item) => item.slug)).not.toContain('shakai-file-vol1-map');
  });

  it('returns an empty array when every scenario is already played', () => {
    const result = recommendScenarios(
      scenarios,
      scenarios.map((scenario) => scenario.slug),
    );

    expect(result).toEqual([]);
  });
});
