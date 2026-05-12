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
 * Engine-default soft caps for tolerance composition. Per-substance authoring
 * can override individual fields via `flags[MODULE_ID].tolerance.caps`; the
 * engine merges authored values over these defaults at apply/compose time.
 *
 * - `maxStacks`: per-candidate stack clamp — readStacks(candidate) is clipped
 *   to at most this before multiplying through.
 * - `modifierFactorFloor`: final `attenuateAltered.modifierFactor` is floored
 *   to this value (the buff's "wears off" factor can't fall below ¼).
 * - `addictionDcBumpCap`: cumulative additive DC bump is clamped at this.
 * - `withdrawalDurationFactorCap`: final `withdrawalAmplify.durationFactor` is
 *   clamped at this multiplier (withdrawal can't stack past 2× duration).
 *
 * `withdrawalAmplify.modifierFactor` and `attenuateAltered.durationFactor`
 * intentionally have no caps in v0.7 — they're untouched by this knob set.
 */
export const TOLERANCE_DEFAULT_CAPS = Object.freeze({
  maxStacks: 5,
  modifierFactorFloor: 0.25,
  addictionDcBumpCap: 5,
  withdrawalDurationFactorCap: 2.0,
});

/**
 * Compose a tolerance effect from one-or-more matching AE candidates.
 * Pure: takes the candidate descriptors directly, returns the composed result.
 *
 * @param {ToleranceCandidate[]} candidates
 * @param {Partial<typeof TOLERANCE_DEFAULT_CAPS>|null} [caps] When omitted /
 *   null, no clamping is applied (legacy pre-v0.7 behavior — preserved so
 *   pure-function callers without a substance handle keep the v0.6 semantics).
 *   Callers that want clamping pass an explicit caps object; production paths
 *   route through {@link getToleranceCaps} which merges authored overrides
 *   over {@link TOLERANCE_DEFAULT_CAPS}.
 * @returns {ComposedTolerance}
 */
export function composeTolerance(candidates, caps = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return structuredCloneSafe(ZERO_BASELINE);
  }

  // Per-candidate stack clamp. Only applied when `caps.maxStacks` is a finite
  // number — when caps is null we pass through readStacks() unchanged.
  const maxStacks = caps?.maxStacks;
  const clampStacks = (n) =>
    Number.isFinite(maxStacks) ? Math.min(n, maxStacks) : n;

  let attDuration = 1;
  let attModifier = 1;
  let attDropAdvantage = false;
  let dcBump = 0;
  let wdDuration = 1;
  let wdModifier = 1;
  let wdAddDisadvantage = false;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const stacks = clampStacks(readStacks(candidate));

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

  // Final post-sum caps. Each is only applied when its respective caps field
  // is a finite number, leaving room for authoring to disable an individual
  // cap by setting it to e.g. `null` without disturbing the others.
  const floor = caps?.modifierFactorFloor;
  if (Number.isFinite(floor)) {
    attModifier = Math.max(floor, attModifier);
  }
  const dcCap = caps?.addictionDcBumpCap;
  if (Number.isFinite(dcCap)) {
    dcBump = Math.min(dcCap, dcBump);
  }
  const wdDurCap = caps?.withdrawalDurationFactorCap;
  if (Number.isFinite(wdDurCap)) {
    wdDuration = Math.min(wdDurCap, wdDuration);
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
