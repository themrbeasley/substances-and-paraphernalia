import { MODULE_ID, FLAGS } from "../config.js";
import {
  getOverdose,
  getOverdoseEffectIds,
  isSubstance,
  getActorToleranceEntry,
  getWithdrawalDc,
} from "../data/flag-schema.js";
import { shouldRollOverdose, rollOverdoseChance } from "../data/overdose-gate.js";
import { snapDcToTier, tierProfile } from "../data/tier-table.js";
import { currentPoints } from "../data/tolerance.js";
import { logger } from "../logger.js";

/**
 * Overdose runs alongside the addiction save in `dnd5e.postUseActivity`.
 * Independent of addiction outcome — a saved dose can still overdose.
 */
export function registerOverdoseHooks() {
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
}

async function onPostUseActivity(activity, _usageConfig, _results) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return;
  if (!isSubstance(item)) return;

  try {
    await rollOverdoseAndApply(actor, item);
  } catch (err) {
    logger.error("overdose post-use flow failed", err);
  }
}

/**
 * Phase 1 overdose gate. Returns the created Overdose AE on hit, null
 * otherwise. Test seam — exported for Quench.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {() => number} [rng]   d100 — defaults to Math.random-based 1..100.
 * @returns {Promise<ActiveEffect|null>}
 */
export async function rollOverdoseAndApply(actor, item, rng = defaultD100) {
  const overdose = getOverdose(item);
  if (!overdose?.enabled) return null;

  const dc = getWithdrawalDc(item);
  if (!Number.isFinite(dc)) return null;
  const profile = tierProfile(snapDcToTier(dc));
  const count = Number(getActorToleranceEntry(actor, item.id)?.count) || 0;
  const points = currentPoints(count, profile.rate);

  const thresholdModifier = Number(
    actor?.getFlag?.(MODULE_ID, "overdose.thresholdModifier"),
  ) || 0;
  if (!shouldRollOverdose(points, profile.threshold, thresholdModifier)) return null;

  const chanceModifier = Number(
    actor?.getFlag?.(MODULE_ID, "overdose.chanceModifier"),
  ) || 0;
  if (!rollOverdoseChance(rng, overdose.chancePercent, chanceModifier)) return null;

  return applyOverdoseEffect(actor, item, overdose);
}

function defaultD100() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Apply the overdose marker AEs to an actor for a given substance.
 *
 * Test seam — exported so other flows (e.g. the drag-to-inventory dialog) can
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
      : {
          name,
          img: item.img ?? "icons/svg/poison.svg",
          description,
          disabled: false,
          transfer: false,
        };
    const data = {
      ...base,
      name,
      description: description || base.description || "",
      origin: item.uuid,
      disabled: false,
      transfer: false,
      flags: {
        ...(base.flags ?? {}),
        [MODULE_ID]: {
          ...(base.flags?.[MODULE_ID] ?? {}),
          [FLAGS.sourceSubstanceId]: item.id,
          aeRole: "overdose",
        },
      },
    };
    delete data._id;
    return data;
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

