/**
 * Pure helpers for the addiction withdrawal duration formula.
 *
 * Kept dependency-free so Node `--test` can import this module directly
 * without pulling in Foundry globals.
 */

/**
 * Compute the number of long rests of withdrawal an actor should suffer after
 * failing an addiction save.
 *
 * Formula: `max(wMod − abilityMod, ceil(wMod / 2))`, clamped to a minimum of 1.
 * floor clamp prevents a high-Con character from waving off withdrawal entirely.
 *
 * @param {number} wMod        The substance's `withdrawalMod`.
 * @param {number} abilityMod  The actor's relevant ability modifier (Con by default).
 * @returns {number}           Long rests of withdrawal owed (>= 1).
 */
export function computeRestsRemaining(wMod, abilityMod) {
  const w = Number(wMod) || 0;
  const a = Number(abilityMod) || 0;
  const floor = Math.ceil(w / 2);
  const computed = Math.max(w - a, floor);
  return Math.max(1, computed);
}

/**
 * Cosmetic-only preview of withdrawal duration for the Details-tab authoring
 * surface. Reuses computeRestsRemaining so the UI preview can never drift from
 * the engine's actual computation.
 *
 * @param {number} withdrawalMod   The substance's withdrawalMod (Details-tab input).
 * @param {number} [assumedConMod] Defaults to 0 — the author has no character context
 *                                 at item-edit time, so the preview must disclose
 *                                 the assumption in its display string.
 * @returns {number}               Long rests of withdrawal owed (>= 1).
 */
export function previewWithdrawalDuration(withdrawalMod, assumedConMod = 0) {
  return computeRestsRemaining(withdrawalMod, assumedConMod);
}
