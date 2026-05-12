import { MODULE_ID, FLAGS } from "../config.js";
import {
  getOverdose,
  getOverdoseEffectIds,
  isSubstance,
  findEffectsByRole,
  getSourceSubstanceId,
} from "../data/flag-schema.js";
import { rollOverdose } from "../data/overdose.js";
import { computeAdjustedOverdoseChance } from "../data/overdose-interaction.js";
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
  const block = getOverdose(item);
  if (!block || block.enabled !== true) return;

  try {
    await rollOverdoseAndApply(actor, item, block);
  } catch (err) {
    logger.error("overdose post-use flow failed", err);
  }
}

/**
 * Test seam — Quench calls this directly with a deterministic `randomFn`.
 *
 * The returned `chancePercent` reflects the **post-adjustment** chance — i.e.
 * the value the d100 was rolled against after tolerance modulation, not the
 * authored `block.chancePercent`.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {{ enabled?: boolean, chancePercent?: number, description?: string,
 *          toleranceInteraction?: "none"|"mitigate"|"compound",
 *          toleranceInteractionMagnitude?: number }} block
 * @param {{ randomFn?: () => number }} [opts]
 */
export async function rollOverdoseAndApply(actor, item, block, { randomFn } = {}) {
  if (!block || block.enabled !== true) return null;
  const baseChance = Number(block.chancePercent) || 0;
  if (baseChance <= 0) return null;

  // Read tolerance stacks at roll time, NOT at AE apply time — per spec §2.4,
  // the addiction-AE listener and this overdose listener fire in the same
  // postUseActivity cycle and listener order is not guaranteed. Reading here
  // means we see the *prior* stack count if addiction's stack-increment has
  // not yet run; that's intentional (the new stack only takes effect from
  // the next consumption forward, which matches "tolerance grows over time").
  const toleranceEffects = findEffectsByRole(actor, "tolerance").filter(
    (e) => getSourceSubstanceId(e) === item.id,
  );
  const stacks = toleranceEffects.reduce((sum, e) => {
    const raw = Number(e.flags?.[MODULE_ID]?.stacks);
    if (!Number.isFinite(raw)) return sum + 1; // missing/garbage → default 1
    return sum + Math.max(0, raw);
  }, 0);
  const mode = block.toleranceInteraction ?? "none";
  const rawMagnitude = Number(block.toleranceInteractionMagnitude);
  const magnitude = Number.isFinite(rawMagnitude) ? rawMagnitude : 0;
  const adjustedChance = computeAdjustedOverdoseChance(baseChance, stacks, mode, magnitude);
  if (adjustedChance <= 0) return null;

  const result = rollOverdose(adjustedChance, randomFn ?? Math.random);
  if (!result.hit) return { hit: false, roll: result.roll, chancePercent: result.chancePercent };

  const effect = await applyOverdoseEffect(actor, item, block);
  await chat(
    game.i18n.format("FISHUT.Overdose.Triggered", {
      actor: actor.name,
      item: item.name,
      description: block.description ?? "",
    }),
  );
  return {
    hit: true,
    roll: result.roll,
    chancePercent: result.chancePercent,
    effectId: effect?.id ?? null,
  };
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

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
