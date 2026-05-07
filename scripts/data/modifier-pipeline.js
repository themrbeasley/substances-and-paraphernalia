import { getModifier } from "./flag-schema.js";
import { pickBypassResolution } from "./modifier-resolution.js";

/**
 * @typedef {"auto-pass" | "advantage" | "none"} ModifierResolutionType
 *
 * @typedef {Object} ModifierResolution
 * @property {ModifierResolutionType} resolution
 * @property {ActiveEffect|null}      [source]   AE that granted the resolution, when one exists.
 */

const NONE = Object.freeze({ resolution: "none" });

/**
 * Walk the actor's applied AEs, find any whose modifier flag block matches
 * (`kind: "bypass"`, `appliesTo` includes the substance's administration,
 * uses available on the source item), pick the strongest by composition rule,
 * and consume one use on the AE's source item if it tracks uses.
 *
 * Composition: `auto-pass` outranks `advantage`; within a tier, deterministic
 * ascending by AE id (so reload ordering of `appliedEffects` doesn't change
 * the choice). Per-day refresh of `system.uses` rides on dnd5e's native
 * recovery; the pipeline doesn't manage refresh.
 *
 * @param {Actor} actor
 * @param {Item}  substance
 * @returns {Promise<ModifierResolution>}
 */
export async function consumeBypassIfAvailable(actor, substance) {
  if (!actor || !substance) return { ...NONE };

  // Administration is the dnd5e Poison Type subtype on the consumable —
  // contact | ingested | inhaled | injury — not a module-owned flag.
  const administration = substance?.system?.type?.subtype || null;
  if (!administration) return { ...NONE };

  const effects = actor.appliedEffects ?? actor.effects ?? [];
  const candidates = [];
  // candidate.id → { effect, sourceItem, hasUsesConfig } for post-pick decrement.
  const links = new Map();

  for (const effect of effects) {
    const block = getModifier(effect);
    if (!block) continue;

    let sourceItem = null;
    let hasUsesConfig = false;
    let usesRemaining;
    if (block.usesPerDay !== undefined) {
      sourceItem = resolveSourceItem(actor, effect);
      const uses = sourceItem?.system?.uses;
      hasUsesConfig =
        !!uses &&
        uses.max !== undefined &&
        uses.max !== null &&
        uses.max !== "" &&
        uses.max !== 0;
      if (hasUsesConfig) {
        usesRemaining = typeof uses.value === "number" ? uses.value : Number(uses.value);
      }
    }

    const id = effect.id ?? effect._id ?? "";
    candidates.push({
      id,
      kind: block.kind,
      type: block.type,
      appliesTo: block.appliesTo,
      hasUsesConfig,
      usesRemaining,
    });
    links.set(id, { effect, sourceItem, hasUsesConfig });
  }

  const chosen = pickBypassResolution(administration, candidates);
  if (!chosen) return { ...NONE };

  const link = links.get(chosen.id);
  if (link?.sourceItem && link.hasUsesConfig) {
    const spent = Number(link.sourceItem.system?.uses?.spent) || 0;
    await link.sourceItem.update({ "system.uses.spent": spent + 1 });
  }
  return { resolution: chosen.type, source: link?.effect ?? null };
}

/**
 * Resolve the AE's source item — walks `effect.origin` for an `Item.<id>`
 * segment first (covers `transfer:true` AEs cloned onto an actor), falling
 * back to `fromUuidSync` for cross-document origins. Returns null when no
 * traceable item exists.
 *
 * @param {Actor}        actor
 * @param {ActiveEffect} effect
 * @returns {Item|null}
 */
function resolveSourceItem(actor, effect) {
  const origin = effect?.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;

  const match = origin.match(/Item\.([^.]+)/);
  if (match && typeof actor?.items?.get === "function") {
    const local = actor.items.get(match[1]);
    if (local) return local;
  }

  const sync = globalThis.fromUuidSync;
  if (typeof sync === "function") {
    try {
      const doc = sync(origin);
      if (doc?.documentName === "Item") return doc;
    } catch {
      /* unresolvable origin — fall through to null */
    }
  }
  return null;
}
