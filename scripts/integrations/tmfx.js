import { MODULE_ID, FLAGS } from "../config.js";
import { logger } from "../logger.js";
import { isActive, isIntegrationEnabled } from "./index.js";
import { parseTmfxConfig } from "../data/tmfx-config.js";

/**
 * TMFX (Token Magic FX) integration. Watches for `Altered by *` benefit AEs
 * being applied to or removed from an actor, looks up the source substance's
 * tmfx flag block, and dispatches either a TMFX preset or a Foundry macro
 * with `{ token, mode, substance, effect }`.
 *
 * The hook key is `flags[MODULE_ID].sourceSubstanceId` — see CLAUDE.md AE
 * naming contract. Name-based regex matching is reserved for the user-facing
 * `Remove {Substance}` macros; machine dispatch keys on the flag.
 *
 * Hooks are registered unconditionally so the user can flip
 * `tmfxIntegration` at runtime; each handler self-gates on
 * `isIntegrationEnabled("tmfx") && isActive("tokenmagic")`.
 */
export function registerTmfxIntegration() {
  Hooks.on("createActiveEffect", onAlteredAEApplied);
  Hooks.on("deleteActiveEffect", onAlteredAERemoved);
}

async function onAlteredAEApplied(effect) {
  if (!shouldDispatch(effect)) return;
  await dispatch(effect, "apply");
}

async function onAlteredAERemoved(effect) {
  if (!shouldDispatch(effect)) return;
  await dispatch(effect, "remove");
}

function shouldDispatch(effect) {
  if (!isIntegrationEnabled("tmfx")) return false;
  if (!isActive("tokenmagic")) return false;
  if (!effect?.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId]) return false;
  // Parent must be an Actor — `Altered by *` AEs live on actors, not items.
  // dnd5e item-AE creation also fires this hook; skip those by checking for
  // an `actor` parent. Foundry exposes the parent via `effect.parent`.
  const parent = effect.parent;
  if (!parent || parent.documentName !== "Actor") return false;
  return true;
}

async function dispatch(effect, mode) {
  const actor = effect.parent;
  const substanceId = effect.flags[MODULE_ID][FLAGS.sourceSubstanceId];
  const substance = resolveSubstance(actor, substanceId);
  if (!substance) {
    logger.warn(`tmfx: source substance ${substanceId} unresolved on ${actor?.name}`);
    return;
  }
  const config = parseTmfxConfig(substance);
  if (config.mode === "none") return;

  const tokens = actor.getActiveTokens?.(true, false) ?? [];
  if (tokens.length === 0) return;

  if (config.mode === "preset") {
    await dispatchPreset(tokens, config.presetName, mode, substance);
    return;
  }

  if (config.mode === "macro") {
    await dispatchMacro(tokens, config.macroUuid, mode, substance, effect);
  }
}

function resolveSubstance(actor, substanceId) {
  // Substance might live on the actor (dragged in) or be a world/compendium
  // item the AE was originally cloned from. Actor-embedded lookup is cheap;
  // fall back to fromUuidSync for compendium uuids stored as the id.
  return actor?.items?.get?.(substanceId) ?? globalThis.fromUuidSync?.(substanceId) ?? null;
}

async function dispatchPreset(tokens, presetName, mode, substance) {
  const TMFX = globalThis.TokenMagic;
  if (!TMFX) return;
  const filterId = `fishut-${substance.id}`;
  for (const token of tokens) {
    try {
      if (mode === "apply") {
        const params = TMFX.getPreset?.(presetName);
        if (!params) {
          logger.warn(`tmfx: preset "${presetName}" not found`);
          continue;
        }
        const stamped = (Array.isArray(params) ? params : [params]).map((p) => ({
          ...p,
          filterId,
        }));
        await TMFX.addUpdateFiltersOnToken?.(token, stamped);
      } else {
        await TMFX.deleteFiltersOnToken?.(token, filterId);
      }
    } catch (err) {
      logger.error(`tmfx: preset dispatch failed (${mode})`, err);
    }
  }
}

async function dispatchMacro(tokens, macroUuid, mode, substance, effect) {
  const macro = await globalThis.fromUuid?.(macroUuid);
  if (!macro?.execute) {
    logger.warn(`tmfx: macro ${macroUuid} unresolved or not executable`);
    return;
  }
  for (const token of tokens) {
    try {
      await macro.execute({ token, mode, substance, effect });
    } catch (err) {
      logger.error(`tmfx: macro dispatch failed (${mode})`, err);
    }
  }
}
