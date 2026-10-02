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
    (p) => p?.usable === true && Array.isArray(p?.appliesTo) && p.appliesTo.includes(admin),
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

/**
 * Single-use gear with a use pool (Rolling Papers) has a use while the current
 * pack has one left or another pack is in the stack (a drop stacks quantity
 * onto a used-up pack without resetting `spent`). `max` may be a string.
 */
export function gearHasUse({ spent, max, quantity }) {
  return (Number(spent) || 0) < (Number(max) || 0) || Number(quantity ?? 1) > 1;
}

/**
 * The `{ spent, quantity }` after spending one use, rolled over the way dnd5e
 * consumes item uses: a used-up pack with more behind it is set aside first,
 * and finishing a pack opens the next one. The last pack stays at max.
 */
export function nextGearUses({ spent, max, quantity }) {
  const m = Number(max) || 0;
  let s = Number(spent) || 0;
  let q = Number(quantity ?? 1);
  if (s >= m && q > 1) [s, q] = [0, q - 1];
  s = Math.min(s + 1, m);
  if (s >= m && q > 1) [s, q] = [0, q - 1];
  return { spent: s, quantity: q };
}
