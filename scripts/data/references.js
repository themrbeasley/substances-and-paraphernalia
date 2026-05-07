import { isParaphernalia, getSubtype } from "./flag-schema.js";

/**
 * @typedef {Object} ParaphernaliaInspection
 * @property {Item|null} item    The matching item on the actor, or null if none.
 * @property {boolean}   ready   True only when the item is present AND ready to use.
 * @property {"missing"|"unequipped"|"unattuned"|null} reason
 *   Why the candidate is not ready, or null if it is.
 */

/**
 * Decide readiness for a single paraphernalia item the actor owns.
 *
 * Readiness rules (gate, not just inventory presence):
 *  - Equipment paraphernalia must have `system.equipped === true`.
 *  - Consumable paraphernalia must have `system.quantity > 0`. dnd5e
 *    consumables have no equipped slot — quantity is the analogue.
 *  - Attunement-required paraphernalia (`system.attunement === "required"`)
 *    must have `system.attuned === true` on the actor's copy.
 *
 * @param {Item} item
 * @returns {ParaphernaliaInspection}
 */
export function inspectParaphernaliaItem(item) {
  if (!item) return { item: null, ready: false, reason: "missing" };
  const sys = item.system ?? {};

  if (item.type === "consumable") {
    const qty = sys.quantity;
    if (typeof qty === "number" && qty <= 0) {
      return { item, ready: false, reason: "missing" };
    }
  } else if (item.type === "equipment" && sys.equipped !== true) {
    return { item, ready: false, reason: "unequipped" };
  }

  if (sys.attunement === "required" && sys.attuned !== true) {
    return { item, ready: false, reason: "unattuned" };
  }

  return { item, ready: true, reason: null };
}

/**
 * Enumerate every paraphernalia of the given subtype the actor owns, with
 * readiness inspection for each. Returns an empty array when the actor has
 * none of that subtype.
 *
 * @param {Actor} actor
 * @param {string} subtype
 * @returns {ParaphernaliaInspection[]}
 */
export function inspectSubtypeOnActor(actor, subtype) {
  if (!actor || typeof subtype !== "string" || subtype.length === 0) return [];
  const items = actor.items;
  if (!items) return [];

  const matches = [];
  for (const item of items) {
    if (!isParaphernalia(item)) continue;
    if (getSubtype(item) !== subtype) continue;
    matches.push(inspectParaphernaliaItem(item));
  }
  return matches;
}

/**
 * Boolean readiness check: does the actor own ≥1 ready paraphernalia of the
 * given subtype.
 *
 * @param {Actor} actor
 * @param {string} subtype
 * @returns {boolean}
 */
export function actorHasSubtype(actor, subtype) {
  return inspectSubtypeOnActor(actor, subtype).some((i) => i.ready);
}

