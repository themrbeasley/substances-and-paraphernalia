import { MODULE_ID, FLAGS } from "../config.js";

/**
 * @typedef {Object} ParaphernaliaInspection
 * @property {Item|null} item    The matching item on the actor, or null if none.
 * @property {boolean}   ready   True only when the item is present AND ready to use.
 * @property {"missing"|"unequipped"|"unattuned"|null} reason
 *   Why the candidate is not ready, or null if it is.
 */

/**
 * Locates a paraphernalia reference on an actor and reports its readiness.
 *
 * `ref` resolution:
 *  - A Compendium UUID (starts with `Compendium.`). Matched against
 *    `_stats.compendiumSource` first, then a direct `uuid` match. Stable when
 *    the source slug changes; what shipped substances should normally use to
 *    point at shipped paraphernalia.
 *  - Otherwise treated as a slug, matched against the `paraphernaliaId` flag
 *    on each item. The author-friendly path for user-built content.
 *
 * Readiness rules (gate, not just inventory presence):
 *  - Equipment paraphernalia must have `system.equipped === true`.
 *  - Consumable paraphernalia must have `system.quantity > 0`. dnd5e
 *    consumables have no equipped slot — quantity is the analogue.
 *  - Attunement-required paraphernalia (`system.attunement === "required"`)
 *    must have `system.attuned === true` on the actor's copy.
 *
 * @param {Actor} actor
 * @param {string} ref
 * @returns {ParaphernaliaInspection}
 */
export function inspectParaphernalia(actor, ref) {
  if (!actor || typeof ref !== "string" || ref.length === 0) {
    return { item: null, ready: false, reason: "missing" };
  }
  const items = actor.items;
  if (!items) return { item: null, ready: false, reason: "missing" };

  const isUuidRef = ref.startsWith("Compendium.");
  let candidate = null;
  for (const item of items) {
    if (isUuidRef) {
      const src = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
      if (src === ref || item.uuid === ref) { candidate = item; break; }
    } else {
      const slug = item.flags?.[MODULE_ID]?.[FLAGS.paraphernaliaId];
      if (slug === ref) { candidate = item; break; }
    }
  }
  if (!candidate) return { item: null, ready: false, reason: "missing" };

  const sys = candidate.system ?? {};

  if (candidate.type === "consumable") {
    const qty = sys.quantity;
    if (typeof qty === "number" && qty <= 0) {
      return { item: candidate, ready: false, reason: "missing" };
    }
  } else if (candidate.type === "equipment" && sys.equipped !== true) {
    return { item: candidate, ready: false, reason: "unequipped" };
  }

  if (sys.attunement === "required" && sys.attuned !== true) {
    return { item: candidate, ready: false, reason: "unattuned" };
  }

  return { item: candidate, ready: true, reason: null };
}

/**
 * Boolean readiness check. Convenience wrapper around `inspectParaphernalia`.
 *
 * @param {Actor} actor
 * @param {string} ref
 * @returns {boolean}
 */
export function actorHasParaphernalia(actor, ref) {
  return inspectParaphernalia(actor, ref).ready;
}
