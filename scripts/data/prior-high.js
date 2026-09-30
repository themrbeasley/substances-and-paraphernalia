import { MODULE_ID } from "../config.js";

/**
 * Is `effect` an earlier high from `item` that a new dose should replace?
 * The module's own copies carry sourceSubstanceId. A copy Midi-QoL, DAE or the
 * dnd5e chat card applied has none; its origin is the item's uuid or a uuid
 * under it (the template effect's or the activity's).
 *
 * @param {{flags?: object, origin?: string}} effect
 * @param {{id: string, uuid: string}} item
 * @returns {boolean}
 */
export function isPriorHigh(effect, item) {
  const flags = effect?.flags?.[MODULE_ID];
  if (flags?.aeRole !== "altered") return false;
  const sid = flags.sourceSubstanceId;
  if (sid) return sid === item.id;
  const origin = effect?.origin;
  return typeof origin === "string" && (origin === item.uuid || origin.startsWith(`${item.uuid}.`));
}
