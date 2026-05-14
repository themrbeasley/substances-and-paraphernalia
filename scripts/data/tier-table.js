/**
 * Tier table — internal scaffold mapping a 5e DC ladder to Rate / Threshold /
 * MaxCount. The Withdrawal DC author-types becomes the snap key; the snapped
 * tier drives Tolerance/Overdose math only (the save itself rolls against the
 * authored DC, not the nominal tier DC).
 *
 * Why: hand-typing every mechanical knob per substance is footgun-rich.
 * Snapping a single DC field collapses six knobs into one, leaving Decay and
 * Chance as the only per-substance tuning levers.
 */

export const LADDER = Object.freeze([5, 10, 15, 20, 25, 30]);
export const RATES = Object.freeze([1, 2, 3, 5, 8, 13]);
export const THRESHOLDS = Object.freeze([8, 12, 15, 20, 24, 26]);
export const MAX_COUNTS = Object.freeze([8, 6, 5, 4, 3, 2]);
export const DEFAULT_ATTENUATION_CURVE = Object.freeze([1.0, 0.5, 0.25, 0.125, 0]);

/**
 * Snap an authored Withdrawal DC to its nearest tier on the {5,10,15,20,25,30}
 * ladder. Returns 1-based tier index.
 *
 * @param {number} dc
 * @returns {1|2|3|4|5|6}
 */
export function snapDcToTier(dc) {
  const n = Number(dc);
  if (!Number.isFinite(n)) return 1;
  if (n <= LADDER[0]) return 1;
  if (n >= LADDER[LADDER.length - 1]) return 6;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < LADDER.length; i++) {
    const distance = Math.abs(LADDER[i] - n);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return /** @type {1|2|3|4|5|6} */ (bestIndex + 1);
}

/**
 * @param {number} tier  1..6 (clamped if out of range).
 * @returns {{tier: number, dc: number, rate: number, threshold: number, maxCount: number}}
 */
export function tierProfile(tier) {
  const t = Math.max(1, Math.min(6, Math.trunc(Number(tier) || 1)));
  const i = t - 1;
  return { tier: t, dc: LADDER[i], rate: RATES[i], threshold: THRESHOLDS[i], maxCount: MAX_COUNTS[i] };
}
