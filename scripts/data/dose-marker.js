import { MODULE_ID } from "../config.js";
import { isSubstance } from "./flag-schema.js";

/**
 * The dose marker (spec v0.10.0 D1): an effect on a drug, role "dose", that a
 * dose-others activity lists. Whatever applies it to a creature (Midi, DAE,
 * the dnd5e Apply button) delivers a dose; scripts/hooks/dose-others.js
 * cancels the marker and runs the dose on that creature.
 */
export const DOSE_ROLE = "dose";

/** @returns {string[]} ids of the drug's dose-marker effects */
export function doseMarkerIds(effects) {
  return [...(effects ?? [])]
    .filter((e) => e?.flags?.[MODULE_ID]?.aeRole === DOSE_ROLE)
    .map((e) => e._id ?? e.id);
}

/**
 * An activity that lists a dose marker, or places a cloud (a Midi region
 * behavior, like the gas bomb) whose own activity doses whoever is in it,
 * doses others, not its user.
 */
export function dosesOthers(activity, markerIds) {
  if (activity?.regionBehavior?.enabled === true) return true;
  return [...(activity?.effects ?? [])].some((ref) => markerIds.includes(ref?._id));
}

/** The activity a relapse uses: the first one that doses the user. */
export function firstSelfDoseActivity(activities, markerIds) {
  return [...(activities ?? [])].find((a) => !dosesOthers(a, markerIds)) ?? null;
}

/** Does this activity spend the drug itself (its own uses)? Cloud ticks don't. */
export function spendsDrug(activity) {
  return [...(activity?.consumption?.targets ?? [])].some(
    (t) => t?.type === "itemUses" && !t?.target,
  );
}

// The optional prefix lets a world item ("Item.<id>...") match, not only owned or compendium ones.
const ITEM_UUID = /^((?:.*?\.)?Item\.[A-Za-z0-9]{16})(?:\.|$)/;

/** The drug's Item uuid from the activity uuid DAE records, else the origin. */
export function drugUuidFrom({ activityUuid, origin } = {}) {
  for (const uuid of [activityUuid, origin]) {
    const m = typeof uuid === "string" ? uuid.match(ITEM_UUID) : null;
    if (m) return m[1];
  }
  return null;
}

/** The turn a dose lands in (spec D2, once per turn): combat round and turn, else world time. */
export function doseTurn(combat, worldTime) {
  return combat?.started ? `${combat.id}.${combat.round}.${combat.turn}` : `time.${worldTime}`;
}

/** Whether a dose lands (spec D2): a cloud tick and another dose of the same drug don't both land on a creature in one turn. */
export function doseLands(previous, turn, tick) {
  return !(previous?.turn === turn && (tick || previous.tick));
}

/** The dosed creature's own copy: same id, else a drug with the same name. */
export function findOwnCopy(items, source) {
  const list = [...(items ?? [])];
  return (
    list.find((i) => i.id === source.id) ??
    list.find((i) => i.name === source.name && isSubstance(i)) ??
    null
  );
}

/**
 * Create-data for an empty (0-dose) copy of a drug. It keeps the compendium
 * source, so dnd5e stacks a later drop of the same drug onto it, and sits
 * loose in the inventory, not in the thrower's container.
 */
export function emptyCopyData(sourceData) {
  const data = structuredClone(sourceData);
  data.system = {
    ...(data.system ?? {}),
    quantity: 0,
    uses: { ...(data.system?.uses ?? {}), spent: 0 },
    container: null,
  };
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  const compendiumSource = data._stats?.compendiumSource;
  delete data._stats;
  if (compendiumSource) data._stats = { compendiumSource };
  return data;
}
