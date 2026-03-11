/**
 * Phase 94: Scenario unlock logic
 * vol.1-3: free, then RP thresholds for higher volumes
 */

const UNLOCK_THRESHOLDS: { maxVol: number; rp: number }[] = [
  { maxVol: 3, rp: 0 },
  { maxVol: 6, rp: 100 },
  { maxVol: 9, rp: 300 },
  { maxVol: 12, rp: 600 },
  { maxVol: 15, rp: 1000 },
  { maxVol: 18, rp: 1500 },
  { maxVol: Infinity, rp: 2000 },
];

/** Get the RP required to unlock a scenario at the given volume */
export function getUnlockThreshold(volume: number): number {
  for (const t of UNLOCK_THRESHOLDS) {
    if (volume <= t.maxVol) return t.rp;
  }
  return 2000;
}

/** Check if a scenario is unlocked */
export function isUnlocked(
  volume: number,
  totalRp: number,
  assignedSlugs?: Set<string>,
  slug?: string,
): boolean {
  // Assigned scenarios are always unlocked
  if (assignedSlugs && slug && assignedSlugs.has(slug)) return true;
  return totalRp >= getUnlockThreshold(volume);
}
