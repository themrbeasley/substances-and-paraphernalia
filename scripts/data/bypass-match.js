/**
 * Pure selection logic for paraphernalia-granted addiction-save bypass.
 *
 * Kept dependency-free so Node `--test` can import this module directly
 * without pulling in Foundry globals or the world-config bootstrap.
 *
 * @typedef {Object} BypassCandidate
 * @property {boolean} ready                         Gate-satisfying on the actor.
 * @property {{appliesTo: string[], type: string}|null|undefined} bypass
 *           The paraphernalia's `addictionSaveBypass` flag block, or null.
 * @property {boolean} [hasUsesConfig]               True when the paraphernalia
 *           tracks per-day uses (`system.uses.max` is a meaningful value).
 * @property {number}  [usesRemaining]               Numeric uses available now.
 *           Only consulted when `hasUsesConfig` is true.
 */

/**
 * Pick the first candidate that grants a matching auto-pass bypass with uses
 * available, or `null` if none qualifies.
 *
 * Selection is deterministic: input order is preserved (callers feed
 * substance-group order, then `anyOf` order). Selection criteria:
 *  1. `ready === true`
 *  2. `bypass.appliesTo` is a non-empty array including `administration`
 *  3. if `hasUsesConfig`, `usesRemaining > 0` (otherwise treat as unlimited)
 *
 * @param {string|undefined|null} administration
 * @param {BypassCandidate[]}     candidates
 * @returns {BypassCandidate|null}
 */
export function pickBypassCandidate(administration, candidates) {
  if (!administration || !Array.isArray(candidates)) return null;
  for (const c of candidates) {
    if (!c?.ready) continue;
    const bypass = c.bypass;
    if (!bypass || !Array.isArray(bypass.appliesTo)) continue;
    if (!bypass.appliesTo.includes(administration)) continue;
    if (c.hasUsesConfig && !(Number(c.usesRemaining) > 0)) continue;
    return c;
  }
  return null;
}
