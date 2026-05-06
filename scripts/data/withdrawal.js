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
 *
 * The `ceil(wMod / 2)` floor ensures very-tough actors still owe at least
 * half the substance's withdrawalMod in rests (rounded up).
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
