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
