import { getAdministration, getAddictionSaveBypass, getRequiredParaphernalia } from "./flag-schema.js";
import { inspectParaphernalia } from "./references.js";
import { pickBypassCandidate } from "./bypass-match.js";

/**
 * @typedef {Object} BypassOutcome
 * @property {boolean} bypassed
 * @property {Item}    [paraphernalia]
 * @property {string}  [type]
 */

/**
 * Inspect the actor's gate-satisfying paraphernalia for a matching addiction-
 * save bypass. If one is found and has uses remaining, consume one use and
 * return `{ bypassed: true, paraphernalia, type }`. Otherwise return
 * `{ bypassed: false }`.
 *
 * Refusal cases (return `{ bypassed: false }` so the save rolls normally):
 *  - Substance has no `administration` flag.
 *  - Substance has no `requiredParaphernalia`.
 *  - No gate-satisfying paraphernalia grants a matching `addictionSaveBypass`.
 *  - All matching grantors have 0 uses remaining for the day.
 *
 * The bypass-grantor must appear in one of the substance's `anyOf` groups —
 * we never bypass a save using a paraphernalia the substance doesn't list as
 * required gear. Per-day refresh of `system.uses` rides on dnd5e's native
 * recovery; this helper does not manage refresh.
 *
 * Selection is deterministic: substance group order, then `anyOf` order. The
 * first ready+matching+uses-available candidate wins.
 *
 * @param {Actor} actor
 * @param {Item}  substance
 * @returns {Promise<BypassOutcome>}
 */
export async function consumeBypassIfAvailable(actor, substance) {
  if (!actor || !substance) return { bypassed: false };

  const administration = getAdministration(substance);
  if (!administration) return { bypassed: false };

  const groups = getRequiredParaphernalia(substance);
  if (!Array.isArray(groups) || groups.length === 0) return { bypassed: false };

  const candidates = [];
  for (const group of groups) {
    const refs = Array.isArray(group?.anyOf) ? group.anyOf : [];
    for (const ref of refs) {
      const { item, ready } = inspectParaphernalia(actor, ref);
      if (!item) continue;
      const uses = item.system?.uses;
      const hasUsesConfig =
        !!uses &&
        uses.max !== undefined &&
        uses.max !== null &&
        uses.max !== "" &&
        uses.max !== 0;
      const usesRemaining = hasUsesConfig
        ? typeof uses.value === "number"
          ? uses.value
          : Number(uses.value)
        : undefined;
      candidates.push({
        ready,
        item,
        bypass: getAddictionSaveBypass(item),
        hasUsesConfig,
        usesRemaining,
      });
    }
  }

  const chosen = pickBypassCandidate(administration, candidates);
  if (!chosen) return { bypassed: false };

  const item = chosen.item;
  if (chosen.hasUsesConfig) {
    const spent = Number(item.system?.uses?.spent) || 0;
    await item.update({ "system.uses.spent": spent + 1 });
  }
  return { bypassed: true, paraphernalia: item, type: chosen.bypass.type };
}
