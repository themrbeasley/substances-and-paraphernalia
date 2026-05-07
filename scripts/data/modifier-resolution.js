/**
 * Pure selection logic for the AE-flag modifier pipeline.
 *
 * Kept dependency-free so Node `--test` can exercise selection without
 * pulling in Foundry globals or the world-config bootstrap. The Foundry-
 * coupled wrapper is `consumeBypassIfAvailable` in `modifier-pipeline.js`.
 *
 * @typedef {Object} ModifierCandidate
 * @property {string}   id              AE id (deterministic tie-breaker).
 * @property {string}   kind            Modifier kind, e.g. "bypass".
 * @property {string}   type            Modifier type, e.g. "auto-pass" / "advantage".
 * @property {string[]} appliesTo       Administrations the modifier covers.
 * @property {boolean}  [hasUsesConfig] True when the source item tracks per-day uses.
 * @property {number}   [usesRemaining] Numeric uses available now (only checked when hasUsesConfig).
 */

// auto-pass beats advantage; lower index = stronger.
const TIER_RANK = Object.freeze({
  "auto-pass": 0,
  advantage: 1,
});

/**
 * Pick the strongest matching bypass candidate for `administration`, or null.
 *
 * Filter:
 *  1. `kind === "bypass"`
 *  2. `appliesTo` is an array including `administration`
 *  3. `type` is a known tier (`auto-pass` or `advantage`)
 *  4. if `hasUsesConfig`, `usesRemaining > 0` (otherwise treat as unlimited)
 *
 * Composition:
 *  - `auto-pass` outranks `advantage`.
 *  - Within a tier, ascending lexicographic order on `id` for determinism.
 *
 * @param {string|null|undefined} administration
 * @param {ModifierCandidate[]}   candidates
 * @returns {ModifierCandidate|null}
 */
export function pickBypassResolution(administration, candidates) {
  if (!administration || !Array.isArray(candidates)) return null;
  const eligible = [];
  for (const c of candidates) {
    if (!c || c.kind !== "bypass") continue;
    if (!Array.isArray(c.appliesTo) || !c.appliesTo.includes(administration)) continue;
    if (TIER_RANK[c.type] === undefined) continue;
    if (c.hasUsesConfig && !(Number(c.usesRemaining) > 0)) continue;
    eligible.push(c);
  }
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const tr = TIER_RANK[a.type] - TIER_RANK[b.type];
    if (tr !== 0) return tr;
    return String(a.id).localeCompare(String(b.id));
  });
  return eligible[0];
}
