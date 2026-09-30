import { MODULE_ID, FLAGS } from "../config.js";
import { effectChanges } from "../data/effect-data.js";

/**
 * Detect whether an Active Effect needs DAE to apply correctly.
 *
 * Two signals, OR-combined:
 *  1. Implicit: any change row of V14 type `"custom"`. Core and dnd5e ship no
 *     handler for custom changes; they only do something when DAE (or a peer
 *     module) interprets them, e.g. `macro.tokenMagic`.
 *  2. Explicit: `effect.flags[MODULE_ID].requiresDae === true`. Authoring
 *     escape hatch for edge cases the implicit signal misses.
 *
 * DAE is a `relationships.requires` module, so the function always assumes
 * DAE is present.
 *
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function aeRequiresDae(effect) {
  if (!effect) return false;
  if (effect.flags?.[MODULE_ID]?.[FLAGS.requiresDae] === true) return true;
  return effectChanges(effect).some((change) => change?.type === "custom");
}

/**
 * @param {Item} item
 * @returns {ActiveEffect[]}  AEs on this item that need DAE.
 */
export function itemDaeRequiringEffects(item) {
  const effects = item?.effects;
  if (!effects) return [];
  const out = [];
  for (const effect of effects) {
    if (aeRequiresDae(effect)) out.push(effect);
  }
  return out;
}
