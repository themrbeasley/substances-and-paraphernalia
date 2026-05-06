import { inspectParaphernalia } from "./references.js";
import { getRequiredParaphernalia } from "./flag-schema.js";
import { pickGroupReason } from "./requirements-core.js";

/**
 * Evaluates whether an actor satisfies a substance's requiredParaphernalia.
 *
 * `requiredParaphernalia` is an AND-of-OR structure: the outer array is
 * AND-combined; within each entry, the `anyOf` array is OR-combined. An empty
 * outer array is treated as "no requirements" → satisfied.
 *
 * Each unsatisfied group includes a `reason` describing the closest-to-ready
 * candidate ("unequipped" or "unattuned" if any candidate is on the actor but
 * not ready, otherwise "missing").
 *
 * @param {Actor} actor
 * @param {Array<{anyOf: string[]}>} groups
 * @returns {{ ok: boolean, missing: Array<{anyOf: string[], reason: "missing"|"unequipped"|"unattuned"}> }}
 */
export function evaluateRequirements(actor, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return { ok: true, missing: [] };

  const missing = [];
  for (const group of groups) {
    const refs = Array.isArray(group?.anyOf) ? group.anyOf : [];
    if (refs.length === 0) continue;

    const inspections = refs.map((ref) => inspectParaphernalia(actor, ref));
    const reason = pickGroupReason(inspections);
    if (reason === null) continue;
    missing.push({ anyOf: refs, reason });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Convenience: evaluate a substance item directly against an actor.
 * @param {Item} substance
 * @param {Actor} actor
 */
export function evaluateSubstance(substance, actor) {
  return evaluateRequirements(actor, getRequiredParaphernalia(substance));
}
