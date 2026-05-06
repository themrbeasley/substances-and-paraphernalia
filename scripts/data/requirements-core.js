/**
 * Pure logic for the AND-of-OR requirement evaluator.
 *
 * Kept dependency-free so Node `--test` can import this module directly
 * without pulling in Foundry globals or the world-config bootstrap.
 */

// Per-group reason ranking: when a group is unsatisfied, report the candidate
// closest to ready so the user knows the easiest fix.
const REASON_RANK = { unattuned: 2, unequipped: 1, missing: 0 };

/**
 * @typedef {{ ready: boolean, reason: ("missing"|"unequipped"|"unattuned"|null) }} GroupInspection
 */

/**
 * Decide whether an `anyOf` group is satisfied. Given an array of pre-resolved
 * inspections (one per `anyOf` ref), returns either `null` (group satisfied —
 * at least one candidate is ready) or the closest-to-ready reason.
 *
 * Empty input returns `null`: a group with no constraints is trivially
 * satisfied. Callers that treat empty groups differently must guard upstream.
 *
 * @param {GroupInspection[]} inspections
 * @returns {("missing"|"unequipped"|"unattuned"|null)}
 */
export function pickGroupReason(inspections) {
  if (!Array.isArray(inspections) || inspections.length === 0) return null;
  if (inspections.some((i) => i?.ready)) return null;
  const best = inspections.reduce((a, b) =>
    (REASON_RANK[b?.reason] ?? -1) > (REASON_RANK[a?.reason] ?? -1) ? b : a,
  );
  return best?.reason ?? "missing";
}
