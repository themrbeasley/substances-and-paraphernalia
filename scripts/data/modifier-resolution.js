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
 * @property {string}   type            Modifier type — "auto-pass" | "reroll-on-fail" | "advantage" | "+N".
 * @property {string[]} appliesTo       Administrations the modifier covers.
 * @property {number}   [bonus]         For type === "+N" only — numeric bonus.
 * @property {boolean}  [hasUsesConfig] True when the source item tracks per-day uses.
 * @property {number}   [usesRemaining] Numeric uses available now (only checked when hasUsesConfig).
 *
 * @typedef {"auto-pass" | "reroll-on-fail" | "advantage" | "+N"} ModifierResolutionType
 *
 * @typedef {Object} BypassResolution
 * @property {ModifierResolutionType} resolution
 * @property {ModifierCandidate[]} sources
 *   Contributing candidates. Length 1 for auto-pass / advantage, ≥1 for +N.
 * @property {number} bonus  Sum of `bonus` over `+N` sources; 0 otherwise.
 */

// Lower index = stronger. auto-pass > reroll-on-fail > advantage > +N.
// reroll-on-fail and advantage are statistically equivalent for a flat d20 vs
// flat DC (P(pass) = 1 − q²), but reroll-on-fail composes more strongly with
// dnd5e per-roll features (Halfling Lucky, Bardic Inspiration, per-roll
// bonuses), so it sits one tier above advantage.
const TIER_RANK = Object.freeze({
  "auto-pass": 0,
  "reroll-on-fail": 1,
  advantage: 2,
  "+N": 3,
});

/**
 * Pick the strongest matching bypass resolution for `administration`, or null.
 *
 * Filter:
 *  1. `kind === "bypass"`
 *  2. `appliesTo` is an array including `administration`
 *  3. `type` is a known tier (`auto-pass` / `advantage` / `+N`)
 *  4. if `hasUsesConfig`, `usesRemaining > 0` (otherwise treat as unlimited)
 *
 * Composition:
 *  - any auto-pass present     → resolution = auto-pass;     deterministic ascending by id.
 *  - else any reroll-on-fail   → resolution = reroll-on-fail; deterministic ascending by id.
 *  - else any advantage        → resolution = advantage;      deterministic ascending by id.
 *  - else any +N               → resolution = +N; sources = all eligible +N (sorted by id),
 *                                bonus = sum of `bonus` across those sources.
 *
 * @param {string|null|undefined} administration
 * @param {ModifierCandidate[]}   candidates
 * @returns {BypassResolution|null}
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

  const byId = (a, b) => String(a.id).localeCompare(String(b.id));

  const autoPass = eligible.filter((c) => c.type === "auto-pass").sort(byId);
  if (autoPass.length > 0) {
    return { resolution: "auto-pass", sources: [autoPass[0]], bonus: 0 };
  }
  const reroll = eligible.filter((c) => c.type === "reroll-on-fail").sort(byId);
  if (reroll.length > 0) {
    return { resolution: "reroll-on-fail", sources: [reroll[0]], bonus: 0 };
  }
  const advantage = eligible.filter((c) => c.type === "advantage").sort(byId);
  if (advantage.length > 0) {
    return { resolution: "advantage", sources: [advantage[0]], bonus: 0 };
  }
  const plusN = eligible.filter((c) => c.type === "+N").sort(byId);
  if (plusN.length > 0) {
    const bonus = plusN.reduce((sum, c) => sum + (Number(c.bonus) || 0), 0);
    return { resolution: "+N", sources: plusN, bonus };
  }
  return null;
}
