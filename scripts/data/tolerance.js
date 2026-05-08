/**
 * Tolerance composition — pure helper that sums per-stack tolerance effects
 * across one or more `kind: "tolerance"` AE candidates for a given substance.
 *
 * Per-stack interpretation (best-judgment default; see ROADMAP / sprint plan):
 * - `addictionDcBump`: additive, bonus *= stacks. (3 stacks × +1 = +3 DC.)
 * - `attenuateAltered.durationFactor`, `attenuateAltered.modifierFactor`,
 *   `withdrawalAmplify.durationFactor`, `withdrawalAmplify.modifierFactor`:
 *   the per-stack value is treated as an *additive delta to apply* to a
 *   neutral 1.0 baseline. Applied result = `1 + delta * stacks` (clamped
 *   non-negative). Authors choose sign: `attenuateAltered.durationFactor:
 *   -0.1` × 3 stacks = duration × 0.7. `withdrawalAmplify.durationFactor:
 *   0.1` × 3 stacks = duration × 1.3.
 * - `attenuateAltered.dropAdvantage`, `withdrawalAmplify.addDisadvantage`:
 *   booleans, OR'd across all candidates with stacks ≥ 1.
 *
 * Across multiple AEs (multiple actor-side tolerance effects matching the
 * substance — in normal use this should be exactly one but we don't assume
 * it), values are summed: result = sum(per-AE result).
 */

const ZERO_BASELINE = {
  attenuateAltered: { durationFactor: 1, modifierFactor: 1, dropAdvantage: false },
  addictionDcBump: 0,
  withdrawalAmplify: { durationFactor: 1, modifierFactor: 1, addDisadvantage: false },
};

function readStacks(candidate) {
  const raw = Number(candidate?.stacks);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

function readNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readBoolean(value) {
  return value === true;
}

/**
 * @typedef {Object} ToleranceCandidate
 * @property {number} [stacks]
 * @property {{ durationFactor?: number, modifierFactor?: number, dropAdvantage?: boolean }} [attenuateAltered]
 * @property {number} [addictionDcBump]
 * @property {{ durationFactor?: number, modifierFactor?: number, addDisadvantage?: boolean }} [withdrawalAmplify]
 */

/**
 * @typedef {Object} ComposedTolerance
 * @property {{ durationFactor: number, modifierFactor: number, dropAdvantage: boolean }} attenuateAltered
 * @property {number} addictionDcBump
 * @property {{ durationFactor: number, modifierFactor: number, addDisadvantage: boolean }} withdrawalAmplify
 */

/**
 * Compose a tolerance effect from one-or-more matching AE candidates.
 * Pure: takes the candidate descriptors directly, returns the composed result.
 *
 * @param {ToleranceCandidate[]} candidates
 * @returns {ComposedTolerance}
 */
export function composeTolerance(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return structuredCloneSafe(ZERO_BASELINE);
  }

  let attDuration = 1;
  let attModifier = 1;
  let attDropAdvantage = false;
  let dcBump = 0;
  let wdDuration = 1;
  let wdModifier = 1;
  let wdAddDisadvantage = false;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const stacks = readStacks(candidate);

    const att = candidate.attenuateAltered ?? {};
    attDuration += readNumber(att.durationFactor) * stacks;
    attModifier += readNumber(att.modifierFactor) * stacks;
    if (readBoolean(att.dropAdvantage) && stacks >= 1) attDropAdvantage = true;

    dcBump += readNumber(candidate.addictionDcBump) * stacks;

    const wd = candidate.withdrawalAmplify ?? {};
    wdDuration += readNumber(wd.durationFactor) * stacks;
    wdModifier += readNumber(wd.modifierFactor) * stacks;
    if (readBoolean(wd.addDisadvantage) && stacks >= 1) wdAddDisadvantage = true;
  }

  return {
    attenuateAltered: {
      durationFactor: Math.max(0, attDuration),
      modifierFactor: Math.max(0, attModifier),
      dropAdvantage: attDropAdvantage,
    },
    addictionDcBump: dcBump,
    withdrawalAmplify: {
      durationFactor: Math.max(0, wdDuration),
      modifierFactor: Math.max(0, wdModifier),
      addDisadvantage: wdAddDisadvantage,
    },
  };
}

/**
 * @returns {ComposedTolerance} A fresh zero-effect baseline (factor 1, bumps 0).
 */
export function zeroTolerance() {
  return structuredCloneSafe(ZERO_BASELINE);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
