/**
 * Pure overdose helpers — threshold gate + chance roll.
 *
 * Why split: the threshold check runs against tier-derived state and is
 * deterministic. The chance roll is the only stochastic step. Splitting them
 * makes the engine's Phase 1 flow auditable (a chat card can show "below
 * threshold, no roll" vs. "rolled X vs Y, hit").
 */

/**
 * @param {number} points              Current Tolerance Points (Count × Rate).
 * @param {number} threshold           Tier-derived base threshold.
 * @param {number} thresholdModifier   Sum of `actor.flags.S&P.overdose.thresholdModifier`.
 * @returns {boolean}
 */
export function shouldRollOverdose(points, threshold, thresholdModifier) {
  const p = Number(points);
  const t = Number(threshold);
  const m = Number(thresholdModifier);
  if (!Number.isFinite(p) || !Number.isFinite(t)) return false;
  const effective = t + (Number.isFinite(m) ? m : 0);
  return p >= effective;
}

/**
 * @param {() => number} rng          1..100 inclusive (d100).
 * @param {number} chancePercent      Authored 0..100.
 * @param {number} chanceModifier     Sum of `actor.flags.S&P.overdose.chanceModifier`.
 * @returns {boolean}                 true → apply Overdose AE.
 */
export function rollOverdoseChance(rng, chancePercent, chanceModifier) {
  const base = Number(chancePercent);
  const mod = Number(chanceModifier);
  if (!Number.isFinite(base)) return false;
  const effective = Math.max(0, Math.min(100, base + (Number.isFinite(mod) ? mod : 0)));
  if (effective <= 0) return false;
  const roll = Math.trunc(Number(rng()));
  return roll <= effective;
}
