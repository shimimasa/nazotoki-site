import { SERIES_CONFIG, getSeriesConfig } from '../../src/lib/series';

describe('SERIES_CONFIG', () => {
  it('contains all expected series keys', () => {
    const keys = Object.keys(SERIES_CONFIG);
    expect(keys.length).toBeGreaterThanOrEqual(15);
    expect(keys).toContain('science');
    expect(keys).toContain('moral');
    expect(keys).toContain('math');
    expect(keys).toContain('digital');
    expect(keys).toContain('civics');
  });

  it('each series has required fields', () => {
    for (const [key, config] of Object.entries(SERIES_CONFIG)) {
      expect(config.name).toBeTruthy();
      expect(config.subject).toBeTruthy();
      expect(config.color).toBeTruthy();
      expect(config.emoji).toBeTruthy();
    }
  });

  it('no duplicate series names', () => {
    const names = Object.values(SERIES_CONFIG).map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('getSeriesConfig', () => {
  it('returns config for known series', () => {
    const config = getSeriesConfig('science');
    expect(config.name).toBe('サイエンス捜査班');
    expect(config.subject).toBe('理科');
  });

  it('returns fallback for unknown series', () => {
    const config = getSeriesConfig('nonexistent');
    expect(config).toBeDefined();
    expect(config.name).toBeTruthy();
  });

  it('returns config for series with hyphen', () => {
    const config = getSeriesConfig('time-travel');
    expect(config.name).toBe('タイムトラベル探偵団');
  });
});
