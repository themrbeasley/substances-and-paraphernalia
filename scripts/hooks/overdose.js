import { MODULE_ID } from "../config.js";
import {
  getOverdose,
  getOverdoseEffectIds,
  getActorToleranceEntry,
  getWithdrawalDc,
} from "../data/flag-schema.js";
import { shouldRollOverdose, rollOverdoseChance } from "../data/overdose-gate.js";
import { snapDcToTier, tierProfile } from "../data/tier-table.js";
import { currentPoints } from "../data/tolerance.js";
import { prepareEffectPayload } from "../data/effect-data.js";

/**
 * Overdose runs as the last step of the dose pipeline (runDosePipeline in
 * addiction.js), after tolerance has risen for this dose.
 */

/**
 * Phase 1 overdose gate. Returns the created Overdose AE on hit, null
 * otherwise. Test seam: exported for Quench.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {() => number} [rng]   d100; defaults to Math.random-based 1..100.
 * @param {{ stillHigh?: boolean }} [opts] stillHigh: the dose came while this drug's
 *   high was still on the creature (spec D6); opens the roll even with no Withdrawal DC.
 * @returns {Promise<ActiveEffect|null>}
 */
export async function rollOverdoseAndApply(
  actor,
  item,
  rng = defaultD100,
  { stillHigh = false } = {},
) {
  const overdose = getOverdose(item);
  if (!overdose?.enabled) return null;

  // At the tolerance limit (tier table), or still under this drug's high (spec D6).
  let points = 0;
  let threshold = Infinity;
  const dc = getWithdrawalDc(item);
  if (Number.isFinite(dc)) {
    const profile = tierProfile(snapDcToTier(dc));
    const count = Number(getActorToleranceEntry(actor, item.id)?.count) || 0;
    points = currentPoints(count, profile.rate);
    threshold = profile.threshold;
  }
  const thresholdModifier = Number(actor?.getFlag?.(MODULE_ID, "overdose.thresholdModifier")) || 0;
  if (!shouldRollOverdose(points, threshold, thresholdModifier, stillHigh)) return null;

  const chanceModifier = Number(actor?.getFlag?.(MODULE_ID, "overdose.chanceModifier")) || 0;
  if (!rollOverdoseChance(rng, overdose.chancePercent, chanceModifier)) return null;

  const applied = await applyOverdoseEffect(actor, item, overdose);
  // The Details tab promises the description on a chat card when it triggers.
  await ChatMessage.create({
    content: game.i18n.format("FISHUT.Overdose.Triggered", {
      actor: actor.name,
      item: item.name,
      description: overdose.description ?? "",
    }),
    whisper: [],
  });
  return applied;
}

function defaultD100() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Apply the overdose marker AEs to an actor for a given substance.
 *
 * Test seam: exported so other flows (e.g. the drag-to-inventory dialog) can
 * apply the markers directly without a d100 roll.
 *
 * Every id in `getOverdoseEffectIds(item)` is cloned (preserving authored
 * Changes / icon / description) so a GM can split a complex overdose across
 * multiple AEs and have all of them appear at once. Falls back to the legacy
 * singular `block.effectId` field for pre-v0.4 content. If no templates are
 * authored, a minimal marker AE is built inline.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {{ description?: string, effectId?: string, effectIds?: string[] } | null | undefined} block
 * @returns {Promise<ActiveEffect|null>} the first applied effect (back-compat
 *   for callers that only inspect a single result).
 */
export async function applyOverdoseEffect(actor, item, block) {
  const name = game.i18n.format("FISHUT.Overdose.EffectName", { item: item.name });
  const description = block?.description ?? "";
  const templates = resolveOverdoseTemplates(item, block);
  const sources = templates.length > 0 ? templates : [null]; // null → built-in marker

  const payloads = sources.map((template) => {
    const base = template
      ? template.toObject()
      : { name, img: item.img ?? "icons/svg/poison.svg", description };
    return prepareEffectPayload(
      { ...base, name, description: description || base.description || "", transfer: false },
      { sourceSubstanceId: item.id, origin: item.uuid, role: "overdose" },
    );
  });

  const created = await actor.createEmbeddedDocuments("ActiveEffect", payloads);
  return created?.[0] ?? null;
}

function resolveOverdoseTemplates(item, block) {
  const effects = item?.effects;
  if (!effects) return [];
  const list = [...effects];
  const ids = getOverdoseEffectIds(item);
  // Legacy singular fallback in case the caller passed an unmigrated block directly.
  const legacy = ids.length === 0 && block?.effectId ? [block.effectId] : [];
  const sourceIds = ids.length > 0 ? ids : legacy;
  const resolved = [];
  const seen = new Set();
  for (const id of sourceIds) {
    const found = effects.get?.(id) ?? list.find((e) => e.id === id || e._id === id);
    if (found && !seen.has(found.id ?? found._id)) {
      resolved.push(found);
      seen.add(found.id ?? found._id);
    }
  }
  return resolved;
}
