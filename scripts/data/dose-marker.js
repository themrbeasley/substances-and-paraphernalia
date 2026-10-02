import { MODULE_ID } from "../config.js";

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

/** An activity that lists a dose marker doses its targets, not its user. */
export function dosesOthers(activity, markerIds) {
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

/** The dosed creature's own copy: same id, else a drug with the same name. */
export function findOwnCopy(items, source) {
  const list = [...(items ?? [])];
  return (
    list.find((i) => i.id === source.id) ??
    list.find((i) => i.name === source.name && i.flags?.[MODULE_ID]?.kind === "substance") ??
    null
  );
}

/** Create-data for an empty (0-dose) copy of a drug. */
export function emptyCopyData(sourceData) {
  const data = structuredClone(sourceData);
  data.system = {
    ...(data.system ?? {}),
    quantity: 0,
    uses: { ...(data.system?.uses ?? {}), spent: 0 },
  };
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data._stats;
  return data;
}
