import { MODULE_ID } from "../config.js";
import { isSubstance } from "./flag-schema.js";

/**
 * Is `effect` an earlier high from `item` that a new dose should replace?
 * The module's own copies carry sourceSubstanceId. A copy Midi-QoL, DAE or the
 * dnd5e chat card applied has none; its origin is the item's uuid or a uuid
 * under it (the template effect's or the activity's). A high is tagged aeRole
 * "altered"; an untagged one (hand-made drugs) is known by its name, the same
 * fallback every other lookup uses.
 *
 * @param {{name?: string, flags?: object, origin?: string}} effect
 * @param {{id: string, uuid: string}} item
 * @returns {boolean}
 */
export function isPriorHigh(effect, item) {
  const flags = effect?.flags?.[MODULE_ID];
  const isHigh = flags?.aeRole ? flags.aeRole === "altered" : /altered/i.test(effect?.name ?? "");
  if (!isHigh) return false;
  const sid = flags?.sourceSubstanceId;
  if (sid) return sid === item.id;
  const origin = effect?.origin;
  return typeof origin === "string" && (origin === item.uuid || origin.startsWith(`${item.uuid}.`));
}

/**
 * Is `effect` a copy of one of the actor's drug highs that something other
 * than the module is applying (Midi-QoL, DAE, the dnd5e chat card)? It has no
 * sourceSubstanceId, and its origin is under a drug item the actor owns.
 *
 * @param {{flags?: object, origin?: string}} effect
 * @param {{items?: Iterable<object>}} actor
 * @returns {boolean}
 */
export function isStrayHigh(effect, actor) {
  if (effect?.flags?.[MODULE_ID]?.sourceSubstanceId) return false;
  return [...(actor?.items ?? [])].some((item) => isPriorHigh(effect, item) && isSubstance(item));
}

/**
 * A drug's high templates: the effects tagged aeRole "altered", else (an
 * untagged hand-made drug) the ones named "altered". The dose pipeline and the
 * drag dialog both pick highs here, so neither picks up the dose marker.
 *
 * @param {{effects?: Iterable<object>}} item
 * @returns {object[]}
 */
export function findAlteredTemplates(item) {
  const list = [...(item?.effects ?? [])];
  const byRole = list.filter((e) => e?.flags?.[MODULE_ID]?.aeRole === "altered");
  return byRole.length > 0 ? byRole : list.filter((e) => /altered/i.test(e?.name ?? ""));
}
