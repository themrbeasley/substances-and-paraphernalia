import { inspectParaphernalia } from "./references.js";
import { getRequiredParaphernalia } from "./flag-schema.js";

// Per-group reason ranking: when a group is unsatisfied, report the candidate
// closest to ready so the user knows the easiest fix.
const REASON_RANK = { unattuned: 2, unequipped: 1, missing: 0 };

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
    if (inspections.some((i) => i.ready)) continue;

    const best = inspections.reduce((a, b) =>
      (REASON_RANK[b.reason] ?? -1) > (REASON_RANK[a.reason] ?? -1) ? b : a,
    );
    missing.push({ anyOf: refs, reason: best.reason ?? "missing" });
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
