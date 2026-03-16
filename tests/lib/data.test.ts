import { loadAllScenarios, loadScenario } from '../../src/lib/data';

describe('loadAllScenarios', () => {
  it('loads scenario data from the generated JSON modules', () => {
    const scenarios = loadAllScenarios();

    expect(scenarios.length).toBeGreaterThan(0);
  });

  it('sorts scenarios by seriesOrder then volume', () => {
    const scenarios = loadAllScenarios();

    for (let index = 1; index < scenarios.length; index += 1) {
      const previous = scenarios[index - 1];
      const current = scenarios[index];
      const isSorted =
        previous.seriesOrder < current.seriesOrder ||
        (previous.seriesOrder === current.seriesOrder && previous.volume <= current.volume);

      expect(isSorted).toBe(true);
    }
  });

  it('returns unique slugs', () => {
    const scenarios = loadAllScenarios();
    const slugs = scenarios.map((scenario) => scenario.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('loadScenario', () => {
  it('returns an existing scenario by slug', () => {
    const scenario = loadScenario('literature-01-run-melos');

    expect(scenario?.slug).toBe('literature-01-run-melos');
    expect(scenario?.title).toBeTruthy();
  });

  it('returns undefined for an unknown slug', () => {
    expect(loadScenario('missing-scenario')).toBeUndefined();
  });
});
