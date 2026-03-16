import { getUnlockThreshold, isUnlocked } from '../../src/lib/unlock';

describe('getUnlockThreshold', () => {
  it('returns 0 RP for volume 1', () => {
    expect(getUnlockThreshold(1)).toBe(0);
  });

  it('returns 0 RP for volume 3', () => {
    expect(getUnlockThreshold(3)).toBe(0);
  });

  it('returns 100 RP for volume 4', () => {
    expect(getUnlockThreshold(4)).toBe(100);
  });

  it('returns 100 RP for volume 6', () => {
    expect(getUnlockThreshold(6)).toBe(100);
  });

  it('returns 300 RP for volume 7', () => {
    expect(getUnlockThreshold(7)).toBe(300);
  });

  it('returns 2000 RP for volume 19 and above', () => {
    expect(getUnlockThreshold(19)).toBe(2000);
    expect(getUnlockThreshold(25)).toBe(2000);
  });
});

describe('isUnlocked', () => {
  it('treats free volumes as unlocked with 0 RP', () => {
    expect(isUnlocked(1, 0)).toBe(true);
  });

  it('returns false when RP is below the threshold', () => {
    expect(isUnlocked(5, 50)).toBe(false);
  });

  it('returns true when RP meets the threshold exactly', () => {
    expect(isUnlocked(5, 100)).toBe(true);
  });

  it('returns true for assigned scenarios even below the threshold', () => {
    expect(isUnlocked(19, 0, new Set(['assigned-slug']), 'assigned-slug')).toBe(true);
  });

  it('returns true for volume 0 edge cases', () => {
    expect(isUnlocked(0, 0)).toBe(true);
  });

  it('returns false when a high-volume scenario is still short on RP', () => {
    expect(isUnlocked(19, 1999)).toBe(false);
  });
});
