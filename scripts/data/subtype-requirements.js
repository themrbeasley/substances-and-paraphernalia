import { inspectSubtypeOnActor } from "./references.js";
import { getRequiredSubtypes } from "./flag-schema.js";
import { pickGroupReason } from "./requirements-core.js";

/**
 * Evaluates whether an actor satisfies a substance's `requiredSubtypes`.
 *
 * Top-level entries are AND requirements. An entry may be a bare string
 * (single subtype required) or a non-empty array of subtype strings
 * (OR-group: any one of these subtypes satisfies that slot, mirroring the
 * `requiredParaphernalia.anyOf` pattern at the subtype level).
 *
 * An empty list is treated as "no requirements" → satisfied.
 *
 * Each unsatisfied entry includes a `reason` describing the closest-to-ready
 * candidate the actor owns ("unequipped", "unattuned", or "missing" if none
 * owned at all). For OR-groups, `subtype` is reported as the original group
 * (string[]) so callers can render the alternatives.
 *
 * @param {Actor} actor
 * @param {(string|string[])[]} subtypes
 * @returns {{
 *   ok: boolean,
 *   missing: Array<{ subtype: string|string[], reason: "missing"|"unequipped"|"unattuned" }>
 * }}
 */
export function evaluateSubtypeRequirements(actor, subtypes) {
  if (!Array.isArray(subtypes) || subtypes.length === 0) return { ok: true, missing: [] };

  const missing = [];
  for (const entry of subtypes) {
    const group = normalizeEntry(entry);
    if (group.length === 0) continue;

    // Aggregate inspections across every subtype in the OR-group; the group is
    // satisfied if ANY subtype contributes a ready candidate.
    const inspections = group.flatMap((subtype) => inspectSubtypeOnActor(actor, subtype));
    if (inspections.length === 0) {
      missing.push({ subtype: reportShape(entry, group), reason: "missing" });
      continue;
    }
    const reason = pickGroupReason(inspections);
    if (reason === null) continue;
    missing.push({ subtype: reportShape(entry, group), reason });
  }
  return { ok: missing.length === 0, missing };
}

function normalizeEntry(entry) {
  if (typeof entry === "string" && entry.length > 0) return [entry];
  if (Array.isArray(entry)) return entry.filter((s) => typeof s === "string" && s.length > 0);
  return [];
}

function reportShape(originalEntry, normalized) {
  // Preserve caller's shape: bare string in → bare string out; array in → array out.
  if (typeof originalEntry === "string") return originalEntry;
  return normalized;
}

/**
 * Convenience: evaluate a substance item directly against an actor.
 * @param {Item} substance
 * @param {Actor} actor
 */
export function evaluateSubstance(substance, actor) {
  return evaluateSubtypeRequirements(actor, getRequiredSubtypes(substance));
}
