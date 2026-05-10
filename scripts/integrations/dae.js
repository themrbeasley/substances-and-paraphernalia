import { MODULE_ID, FLAGS } from "../config.js";
import { isIntegrationSettingEnabled } from "./index.js";

/**
 * Detect whether an Active Effect needs DAE to apply correctly.
 *
 * Two signals, OR-combined:
 *  1. Implicit: any `change.mode` of CUSTOM (`0`). Vanilla 5e ships no handler
 *     for CUSTOM-mode changes — they only do something when DAE (or a peer
 *     module) is active to interpret them. This is the primary signal and
 *     covers the common case where authors reach for a CUSTOM-mode change
 *     because the keypath is a DAE-only formula (e.g. `+1d4` to all saves).
 *  2. Explicit: `effect.flags[MODULE_ID].requiresDae === true`. Authoring
 *     escape hatch — set on a per-AE basis from the item-settings form for
 *     edge cases the implicit signal misses.
 *
 * Returns false unconditionally when the user has disabled the DAE
 * integration via the `daeIntegration` world setting — they've opted out of
 * DAE-aware gating. The setting-only check here intentionally does not
 * short-circuit on `!isActive("dae")`: the consumer's missing-DAE warning
 * needs `aeRequiresDae` to keep returning true for AEs that need DAE while
 * DAE itself isn't installed.
 *
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function aeRequiresDae(effect) {
  if (!effect) return false;
  if (!isIntegrationSettingEnabled("dae")) return false;
  if (effect.flags?.[MODULE_ID]?.[FLAGS.requiresDae] === true) return true;
  const customMode = CONST?.ACTIVE_EFFECT_MODES?.CUSTOM ?? 0;
  const changes = Array.isArray(effect.changes) ? effect.changes : [];
  for (const change of changes) {
    if (change?.mode === customMode) return true;
  }
  return false;
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
