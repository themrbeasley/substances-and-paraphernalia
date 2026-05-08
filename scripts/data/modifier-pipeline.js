import { MODULE_ID } from "../config.js";
import { getModifier } from "./flag-schema.js";
import { pickBypassResolution } from "./modifier-resolution.js";
import { composeTolerance } from "./tolerance.js";

/**
 * @typedef {"auto-pass" | "advantage" | "+N" | "none"} ModifierResolutionType
 *
 * @typedef {Object} ModifierResolution
 * @property {ModifierResolutionType} resolution
 * @property {ActiveEffect|null}   [source]   Primary contributing AE (first in `sources`).
 *                                            Kept for back-compat with v0.3 callers.
 * @property {ActiveEffect[]}      [sources]  All contributing AEs (auto-pass/advantage: 1, +N: ≥1).
 * @property {number}              [bonus]    Sum of bonuses for `+N`; 0 otherwise.
 */

const NONE = Object.freeze({ resolution: "none" });

/**
 * Walk the actor's applied AEs, find any whose modifier flag block matches
 * (`kind: "bypass"`, `appliesTo` includes the substance's administration,
 * uses available on the source item), pick the strongest by composition rule,
 * and consume one use on each contributing AE's source item if it tracks uses.
 *
 * Composition: auto-pass > advantage > +N. Within auto-pass / advantage,
 * deterministic ascending by AE id picks one. Within +N, ALL eligible AEs
 * contribute and their `bonus` values are summed. Per-day refresh of
 * `system.uses` rides on dnd5e's native recovery.
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
    if (block.kind !== "bypass") continue;

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
      bonus: Number(block.bonus) || 0,
      hasUsesConfig,
      usesRemaining,
    });
    links.set(id, { effect, sourceItem, hasUsesConfig });
  }

  const chosen = pickBypassResolution(administration, candidates);
  if (!chosen) return { ...NONE };

  const sourceEffects = [];
  for (const candidate of chosen.sources) {
    const link = links.get(candidate.id);
    if (!link) continue;
    if (link.sourceItem && link.hasUsesConfig) {
      const spent = Number(link.sourceItem.system?.uses?.spent) || 0;
      await link.sourceItem.update({ "system.uses.spent": spent + 1 });
    }
    if (link.effect) sourceEffects.push(link.effect);
  }

  return {
    resolution: chosen.resolution,
    source: sourceEffects[0] ?? null,
    sources: sourceEffects,
    bonus: chosen.bonus,
  };
}

/**
 * Walk the actor's applied AEs for `kind: "tolerance"` entries matching
 * `substanceId`, and compose their per-stack effects via `composeTolerance`.
 *
 * Stacks are read from `effect.flags[MODULE_ID].stacks` (default 1). No uses
 * are consumed — tolerance is a state, not a per-shot resource.
 *
 * @param {Actor}  actor
 * @param {string} substanceId
 * @returns {import("./tolerance.js").ComposedTolerance|null}
 *   `null` when no matching AE exists; otherwise the composed effect.
 */
export function consumeToleranceForSubstance(actor, substanceId) {
  if (!actor || !substanceId) return null;
  const effects = actor.appliedEffects ?? actor.effects ?? [];
  const candidates = [];
  for (const effect of effects) {
    const block = getModifier(effect);
    if (!block) continue;
    if (block.kind !== "tolerance") continue;
    if (block.substanceId !== substanceId) continue;
    const stacks = readStacks(effect);
    candidates.push({ ...block, stacks });
  }
  if (candidates.length === 0) return null;
  return composeTolerance(candidates);
}

function readStacks(effect) {
  const raw = Number(effect?.flags?.[MODULE_ID]?.stacks);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
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
