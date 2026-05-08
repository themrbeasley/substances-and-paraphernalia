/**
 * Pure shape accessor for the AE-side modifier flag block.
 *
 * Kept dependency-free so Node `--test` can exercise round-trip without
 * pulling in Foundry globals or the world-config bootstrap. The Foundry-
 * coupled wrappers `getModifier` / `setModifier` live in `flag-schema.js`.
 *
 * @typedef {"bypass" | "tolerance"} ModifierKind
 *   v0.4 adds "tolerance" — actor-side stack-counted state (no per-shot consumption).
 *   "bypass" is the original paraphernalia-grants-save-relief pipeline.
 *
 * @typedef {"auto-pass" | "advantage" | "+N"} ModifierType
 *   For `kind: "bypass"` only. Tier strength: auto-pass > advantage > +N.
 *
 * @typedef {Object} ToleranceFactor
 * @property {number}  [durationFactor]   Per-stack additive delta on a 1.0 baseline.
 * @property {number}  [modifierFactor]   Per-stack additive delta on a 1.0 baseline.
 * @property {boolean} [dropAdvantage]    OR'd across stacks ≥ 1.
 *
 * @typedef {Object} WithdrawalAmplifyFactor
 * @property {number}  [durationFactor]
 * @property {number}  [modifierFactor]
 * @property {boolean} [addDisadvantage]
 *
 * @typedef {Object} ModifierBlock
 * @property {ModifierKind}  kind
 * @property {ModifierType}  [type]                  (bypass only)
 * @property {string[]}      [appliesTo]             (bypass only) Administrations the modifier applies to.
 * @property {number|string} [usesPerDay]            (bypass only) Numeric or formula (e.g. "@prof").
 * @property {number}        [bonus]                 (bypass, type === "+N")
 * @property {string}        [substanceId]           (tolerance only) Item id of the addictive substance.
 * @property {ToleranceFactor}         [attenuateAltered]   (tolerance only)
 * @property {number}                  [addictionDcBump]    (tolerance only)
 * @property {WithdrawalAmplifyFactor} [withdrawalAmplify]  (tolerance only)
 */

const MODIFIER_KEY = "modifier";

/**
 * Read the modifier block from a module-scoped flag namespace.
 *
 * @param {object|null|undefined} flagsScope
 *   The value of `effect.flags["substances-and-paraphernalia"]`.
 * @returns {ModifierBlock|null}
 */
export function readModifier(flagsScope) {
  return flagsScope?.[MODIFIER_KEY] ?? null;
}
