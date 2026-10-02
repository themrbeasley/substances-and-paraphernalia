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
 * @property {string}   [id]       Item id (`pickGearToSpend` returns one).
 * @property {boolean}  [consumable] True for single-use gear (a consumable item).
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

/**
 * Which consumable gear a dose the user takes spends (spec D8): none when ready
 * reusable gear covers the administration, else the ready consumable with the
 * lowest id.
 *
 * @param {Array<{id: string, appliesTo: string[], usable: boolean, consumable: boolean}>} owned
 * @param {string} admin
 * @returns {string|null}
 */
export function pickGearToSpend(owned, admin) {
  const ready = (owned ?? []).filter(
    (p) => p?.usable === true && Array.isArray(p.appliesTo) && p.appliesTo.includes(admin),
  );
  if (ready.some((p) => !p.consumable)) return null;
  const consumables = ready
    .filter((p) => p.consumable)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return consumables[0]?.id ?? null;
}
