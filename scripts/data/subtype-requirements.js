import { inspectSubtypeOnActor } from "./references.js";
import { getRequiredSubtypes } from "./flag-schema.js";
import { pickGroupReason } from "./requirements-core.js";

/**
 * Evaluates whether an actor satisfies a substance's `requiredSubtypes`.
 *
 * Each entry in `subtypes` is an independent requirement: the actor must
 * own ≥1 *ready* paraphernalia of that subtype. An empty list is treated
 * as "no requirements" → satisfied.
 *
 * Each unsatisfied entry includes a `reason` describing the closest-to-ready
 * candidate of that subtype the actor owns ("unequipped", "unattuned", or
 * "missing" if none owned at all).
 *
 * @param {Actor} actor
 * @param {string[]} subtypes
 * @returns {{
 *   ok: boolean,
 *   missing: Array<{ subtype: string, reason: "missing"|"unequipped"|"unattuned" }>
 * }}
 */
export function evaluateSubtypeRequirements(actor, subtypes) {
  if (!Array.isArray(subtypes) || subtypes.length === 0) return { ok: true, missing: [] };

  const missing = [];
  for (const subtype of subtypes) {
    if (typeof subtype !== "string" || subtype.length === 0) continue;
    const inspections = inspectSubtypeOnActor(actor, subtype);
    // Actor owns no paraphernalia of this subtype at all — that's "missing".
    // pickGroupReason([]) returns null (its "no constraint" sentinel) and we
    // need the opposite signal here, so handle the empty case explicitly.
    if (inspections.length === 0) {
      missing.push({ subtype, reason: "missing" });
      continue;
    }
    const reason = pickGroupReason(inspections);
    if (reason === null) continue;
    missing.push({ subtype, reason });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Convenience: evaluate a substance item directly against an actor.
 * @param {Item} substance
 * @param {Actor} actor
 */
export function evaluateSubstance(substance, actor) {
  return evaluateSubtypeRequirements(actor, getRequiredSubtypes(substance));
}
