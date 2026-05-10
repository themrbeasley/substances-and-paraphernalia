/**
 * Pure gate-link match: does any owned paraphernalia cover the substance's
 * administration type. Foundry-free so Node `--test` can exercise it without
 * pulling in `game`, `Hooks`, etc. The Foundry-coupled wrapper in
 * `scripts/hooks/activity-gating.js` builds the candidate shape from
 * `actor.items`.
 *
 * @typedef {Object} OwnedParaphernalia
 * @property {string[]} appliesTo  Administrations the paraphernalia covers.
 * @property {boolean}  usable     True only when the item is ready (equipped /
 *                                 quantity > 0 / attuned, etc.).
 *
 * @param {OwnedParaphernalia[]} ownedParaphernalia
 * @param {string} admin  One of "contact" | "ingested" | "inhaled" | "injury".
 * @returns {boolean}
 */
export function actorSatisfiesAdmin(ownedParaphernalia, admin) {
  if (!Array.isArray(ownedParaphernalia)) return false;
  if (typeof admin !== "string" || admin.length === 0) return false;
  return ownedParaphernalia.some(
    (p) =>
      p?.usable === true &&
      Array.isArray(p?.appliesTo) &&
      p.appliesTo.includes(admin),
  );
}
