/**
 * Pure shape accessor for the AE-side modifier flag block.
 *
 * Kept dependency-free so Node `--test` can exercise round-trip without
 * pulling in Foundry globals or the world-config bootstrap. The Foundry-
 * coupled wrappers `getModifier` / `setModifier` live in `flag-schema.js`.
 *
 * @typedef {"bypass"} ModifierKind
 *   The pipeline-supported modifier kinds. v0.3 ships only "bypass".
 *
 * @typedef {"auto-pass" | "advantage"} ModifierType
 *   v0.3 ships only "auto-pass" and "advantage".
 *
 * @typedef {Object} ModifierBlock
 * @property {ModifierKind} kind
 * @property {ModifierType} type
 * @property {string[]}     appliesTo     Administrations the modifier applies to.
 * @property {number|string} [usesPerDay] Numeric or formula (e.g. "@prof").
 * @property {number}        [bonus]      Reserved for v0.4 `+N` types.
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
