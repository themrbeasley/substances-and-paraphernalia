import { MODULE_ID, FLAGS } from "../config.js";
import {
  getAddiction,
  getAddictionEffectId,
  getAddictionEnabled,
  getWithdrawalEffectId,
  getWithdrawalEnabled,
  getWithdrawalMod,
  getActorWithdrawal,
  getActorWithdrawalEntry,
  setActorWithdrawalEntry,
  clearActorWithdrawalEntry,
  getModifier,
  getToleranceEffectId,
  getToleranceEnabled,
  isSubstance,
} from "../data/flag-schema.js";
import { consumeBypassIfAvailable } from "../data/modifier-pipeline.js";
import { computeRestsRemaining } from "../data/withdrawal.js";
import { SETTING_KEYS, COUPLING_DEFAULT } from "../settings.js";
import { logger } from "../logger.js";

const DEFAULT_SAVE_ABILITY = "con";
const POISONED_STATUS = "poisoned";

export function registerAddictionHooks() {
  // B.1 — Save-on-use (post-activity).
  // dnd5e 4.x exposes `dnd5e.postUseActivity`. Signature confirmed in live
  // world; if it differs we fall back to wrapping `Activity#use` directly
  // (see comment in onPostUseActivity).
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);

  // B.2 — Long-rest withdrawal tick (GM-arbitrated).
  Hooks.on("dnd5e.restCompleted", onRestCompleted);

  // B.3 — Poisoned-coupling guard for linked-isolated mode.
  // External poisoned-clear cascades into our addiction AE's deletion under
  // Foundry's default "linked-cascade" semantics; this hook re-asserts the
  // addiction AE's persistence in linked-isolated mode by canceling the delete
  // unless we marked it intentional.
  Hooks.on("preDeleteActiveEffect", onPreDeleteActiveEffect);
}

async function onPostUseActivity(activity, _usageConfig, _results) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return;
  if (!isSubstance(item)) return;
  if (!getAddictionEnabled(item)) return;
  const addiction = getAddiction(item);
  if (!addiction || typeof addiction.save?.dc !== "number") return;

  try {
    await rollSaveAndApply(actor, item);
  } catch (err) {
    logger.error("addiction post-use flow failed", err);
  }
}

/**
 * Roll the addiction save (or skip if already-addicted / bypassed) and apply
 * the resulting state to the actor.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function rollSaveAndApply(actor, item) {
  const addiction = getAddiction(item);
  if (!addiction) return;

  const existing = getActorWithdrawalEntry(actor, item.id);
  if (existing) {
    return applyOutcome(actor, item, { alreadyAddicted: true });
  }

  const modifier = await consumeBypassIfAvailable(actor, item);
  if (modifier.resolution === "auto-pass") {
    return applyOutcome(actor, item, { modifier });
  }

  const ability = addiction.save?.ability ?? DEFAULT_SAVE_ABILITY;
  const dc = addiction.save.dc;
  const advantage = modifier.resolution === "advantage";
  const bonus = modifier.resolution === "+N" ? Number(modifier.bonus) || 0 : 0;
  const saveRoll = await rollSave(actor, ability, dc, { advantage, bonus });
  if (!saveRoll) return;
  const saveResult = saveRoll.total >= dc ? "success" : "fail";
  return applyOutcome(actor, item, { saveResult, saveTotal: saveRoll.total, modifier });
}

/**
 * Apply a pre-determined outcome to the actor. This is the test seam — the
 * Quench suite calls it directly with a forced result.
 *
 * @param {Actor}  actor
 * @param {Item}   item
 * @param {Object} outcome
 * @param {boolean} [outcome.alreadyAddicted]
 * @param {import("../data/modifier-pipeline.js").ModifierResolution} [outcome.modifier]
 *   `resolution === "auto-pass"`: save is skipped, chat cites `source.name`.
 *   `resolution === "advantage"`: combined with `saveResult`, chat cites `source.name`.
 *   `resolution === "+N"`: save was rolled with `+bonus`; chat cites all `sources`.
 * @param {"success"|"fail"} [outcome.saveResult]
 * @param {number}            [outcome.saveTotal]
 */
export async function applyOutcome(actor, item, outcome) {
  const addiction = getAddiction(item);
  if (!addiction) return;
  const withdrawalEnabled = getWithdrawalEnabled(item);
  const wMod = Number(getWithdrawalMod(item)) || 0;
  const newComputed = computeRestsRemaining(wMod, conMod(actor));

  if (outcome?.alreadyAddicted) {
    const current = getActorWithdrawalEntry(actor, item.id);
    const currentRests = Number(current?.restsRemaining) || 0;
    const next = Math.max(currentRests, newComputed);
    await setActorWithdrawalEntry(actor, item.id, {
      restsRemaining: next,
      appliedAt: current?.appliedAt ?? new Date().toISOString(),
    });
    await refreshAddictionEffect(actor, item);
    const key =
      next > currentRests
        ? "FISHUT.Addiction.Already.Extended"
        : "FISHUT.Addiction.Already.Maintained";
    await chat(game.i18n.format(key, { actor: actor.name, item: item.name, rests: next }));
    return { applied: "extended", restsRemaining: next };
  }

  if (outcome?.modifier?.resolution === "auto-pass") {
    await chat(
      game.i18n.format("FISHUT.Addiction.Save.Bypass", {
        actor: actor.name,
        item: item.name,
        paraphernalia: outcome.modifier.source?.name ?? "",
      }),
    );
    return { applied: "bypassed" };
  }

  const advantageSource =
    outcome?.modifier?.resolution === "advantage" ? (outcome.modifier.source?.name ?? "") : "";
  const isPlusN = outcome?.modifier?.resolution === "+N";
  const bonusValue = isPlusN ? Number(outcome.modifier.bonus) || 0 : 0;
  const bonusSources = isPlusN ? joinSourceNames(outcome.modifier) : "";

  if (outcome?.saveResult === "success") {
    let key = "FISHUT.Addiction.Save.Pass";
    if (advantageSource) key = "FISHUT.Addiction.Save.PassWithAdvantage";
    else if (isPlusN) key = "FISHUT.Addiction.Save.PassWithBonus";
    await chat(
      game.i18n.format(key, {
        actor: actor.name,
        item: item.name,
        source: advantageSource || bonusSources,
        bonus: bonusValue,
      }),
    );
    try {
      await applyOrIncrementToleranceStack(actor, item);
    } catch (err) {
      logger.error("tolerance stack flow failed", err);
    }
    return { applied: "passed" };
  }

  if (outcome?.saveResult === "fail") {
    await applyAddictionEffect(actor, item);
    if (withdrawalEnabled) {
      try {
        await applyWithdrawalEffect(actor, item);
      } catch (err) {
        logger.error("withdrawal effect flow failed", err);
      }
      await setActorWithdrawalEntry(actor, item.id, {
        restsRemaining: newComputed,
        appliedAt: new Date().toISOString(),
      });
    }
    let key;
    if (!withdrawalEnabled) {
      if (advantageSource) key = "FISHUT.Addiction.Save.FailNoWithdrawalWithAdvantage";
      else if (isPlusN) key = "FISHUT.Addiction.Save.FailNoWithdrawalWithBonus";
      else key = "FISHUT.Addiction.Save.FailNoWithdrawal";
    } else if (advantageSource) {
      key = "FISHUT.Addiction.Save.FailWithAdvantage";
    } else if (isPlusN) {
      key = "FISHUT.Addiction.Save.FailWithBonus";
    } else {
      key = "FISHUT.Addiction.Save.Fail";
    }
    await chat(
      game.i18n.format(key, {
        actor: actor.name,
        item: item.name,
        rests: newComputed,
        source: advantageSource || bonusSources,
        bonus: bonusValue,
      }),
    );
    return {
      applied: "addicted",
      restsRemaining: withdrawalEnabled ? newComputed : 0,
    };
  }
}

function joinSourceNames(modifier) {
  const sources = Array.isArray(modifier?.sources) ? modifier.sources : [];
  const names = sources.map((s) => s?.name).filter((n) => typeof n === "string" && n.length > 0);
  return names.join(", ");
}

function conMod(actor) {
  const mod = actor?.system?.abilities?.con?.mod;
  return typeof mod === "number" ? mod : 0;
}

async function rollSave(actor, ability, dc, { advantage = false, bonus = 0 } = {}) {
  if (typeof actor.rollAbilitySave !== "function" && typeof actor.rollSavingThrow !== "function") {
    logger.warn("actor has no rollAbilitySave/rollSavingThrow; skipping save");
    return null;
  }
  // dnd5e 4.x prefers `rollSavingThrow` (the 3.x `rollAbilitySave` still
  // exists as an alias on most builds). Try the modern name first.
  const fn = actor.rollSavingThrow ?? actor.rollAbilitySave;
  const config = {
    ability,
    target: dc,
    targetValue: dc,
    advantage,
    fastForward: false,
    chatMessage: true,
  };
  if (Number.isFinite(bonus) && bonus !== 0) config.parts = [String(bonus)];
  const roll = await fn.call(actor, config);
  // Handle both single-roll and array-roll return shapes.
  if (Array.isArray(roll)) return roll[0] ?? null;
  return roll ?? null;
}

/**
 * Apply the substance's addiction AE to the actor (cloned from the authored
 * template). Adjusts `data.statuses` per the `addictionPoisonedCoupling`
 * setting before creation. Test seam — exported for Quench.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function applyAddictionEffect(actor, item) {
  const template = findAddictionTemplate(item);
  if (!template) {
    logger.warn(`addiction template not found on ${item.name}; chat-only fail outcome`);
    return null;
  }
  const data = template.toObject();
  delete data._id;
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = { ...(data.flags[MODULE_ID] ?? {}), [FLAGS.sourceSubstanceId]: item.id };
  data.origin = item.uuid;
  data.disabled = false;
  if (data.duration) {
    data.duration.rounds = undefined;
    data.duration.seconds = undefined;
  }
  applyCouplingMode(data, readCouplingMode());
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return created?.[0] ?? null;
}

function readCouplingMode() {
  try {
    return game.settings?.get?.(MODULE_ID, SETTING_KEYS.addictionPoisonedCoupling) ?? COUPLING_DEFAULT;
  } catch {
    return COUPLING_DEFAULT;
  }
}

function applyCouplingMode(data, mode) {
  // linked-cascade and linked-isolated both keep the template's poisoned status.
  // independent strips poisoned so addiction does not imply the condition at all.
  if (mode === "independent") {
    data.statuses = (data.statuses ?? []).filter((s) => s !== POISONED_STATUS);
  }
}

async function refreshAddictionEffect(actor, item) {
  const existing = findAppliedAddictionEffect(actor, item.id);
  if (existing) return existing;
  return applyAddictionEffect(actor, item);
}

function findAddictionTemplate(item) {
  const id = getAddictionEffectId(item);
  const effects = item?.effects;
  if (!effects) return null;
  if (id) {
    const direct = effects.get?.(id) ?? [...effects].find((e) => e.id === id || e._id === id);
    if (direct) return direct;
  }
  // Fallback: name contains "addict" (case-insensitive).
  return [...effects].find((e) => /addict/i.test(e.name ?? "")) ?? null;
}

function findAppliedAddictionEffect(actor, substanceId) {
  if (!actor?.effects) return null;
  for (const effect of actor.effects) {
    if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
    // Tolerance and withdrawal AEs share the sourceSubstanceId flag — disambiguate by name.
    if (/tolerance/i.test(effect.name ?? "")) continue;
    if (/withdraw/i.test(effect.name ?? "")) continue;
    if (/addict/i.test(effect.name ?? "")) return effect;
    // Pre-v0.4 effects without an "addict" name still match by flag for backwards-compat.
    return effect;
  }
  return null;
}

/**
 * Identify an applied addiction AE on an actor — used by the linked-isolated
 * coupling guard to decide whether to block external deletes. Exported as part
 * of the public API so macros and integrations can reuse the same predicate.
 *
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isAppliedAddictionEffect(effect) {
  if (!effect) return false;
  if (!effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId]) return false;
  const name = effect.name ?? "";
  if (/tolerance/i.test(name)) return false;
  if (/withdraw/i.test(name)) return false;
  // Either an "addict"-named AE or a pre-v0.4 unnamed-by-convention AE counts.
  return true;
}

/**
 * Test seam — Quench calls this to exercise the linked-isolated guard with a
 * deterministic options object. Returns `false` to cancel the delete.
 *
 * @param {ActiveEffect} effect
 * @param {object}       [options]
 * @param {string}       [_userId]
 * @returns {boolean} false to cancel the delete; void/true to allow.
 */
export function onPreDeleteActiveEffect(effect, options, _userId) {
  if (options?.fishutIntentional === true) return undefined;
  if (readCouplingMode() !== "linked-isolated") return undefined;
  if (!isAppliedAddictionEffect(effect)) return undefined;
  logger.log(
    `linked-isolated: blocking external delete of addiction AE "${effect.name}" on ${effect.parent?.name ?? "actor"}`,
  );
  return false;
}

async function onRestCompleted(actor, restData) {
  if (!restData?.longRest) return;
  if (!actor) return;
  // GM-arbiter: only the active GM ticks, to prevent multi-client double-tick.
  if (game.users?.activeGM && game.users.activeGM !== game.user) return;

  const map = getActorWithdrawal(actor);
  const ids = Object.keys(map);
  if (ids.length === 0) return;

  for (const substanceId of ids) {
    const entry = map[substanceId];
    const next = (Number(entry?.restsRemaining) || 0) - 1;
    const effect = findAppliedAddictionEffect(actor, substanceId);
    if (next <= 0) {
      await clearActorWithdrawalEntry(actor, substanceId);
      if (effect) await effect.delete({ fishutIntentional: true });
      const withdrawalEffect = findAppliedWithdrawalEffect(actor, substanceId);
      if (withdrawalEffect) await withdrawalEffect.delete({ fishutIntentional: true });
      const name = effect?.name ?? game.i18n.localize("FISHUT.Kind.Substance");
      await chat(
        game.i18n.format("FISHUT.Withdrawal.Tick.Cleared", { actor: actor.name, effect: name }),
      );
    } else {
      await setActorWithdrawalEntry(actor, substanceId, {
        restsRemaining: next,
        appliedAt: entry?.appliedAt ?? new Date().toISOString(),
      });
      const name = effect?.name ?? game.i18n.localize("FISHUT.Kind.Substance");
      await chat(
        game.i18n.format("FISHUT.Withdrawal.Tick.Remaining", {
          actor: actor.name,
          effect: name,
          rests: next,
        }),
      );
    }
  }
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}

/**
 * Increment an existing tolerance stack AE for this (actor, substance) pair, or
 * apply a new one (templated from the substance's authored tolerance AE, or a
 * built-in default). Test seam — exported for Quench.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function applyOrIncrementToleranceStack(actor, item) {
  if (!getToleranceEnabled(item)) return null;
  const existing = findAppliedToleranceEffect(actor, item.id);
  if (existing) {
    const currentStacks = Number(existing.flags?.[MODULE_ID]?.stacks) || 1;
    const nextStacks = currentStacks + 1;
    await existing.update({
      [`flags.${MODULE_ID}.stacks`]: nextStacks,
      name: formatToleranceName(item, nextStacks),
    });
    return existing;
  }
  return applyToleranceEffect(actor, item);
}

async function applyToleranceEffect(actor, item) {
  const template = findToleranceTemplate(item);
  const baseData = template ? template.toObject() : buildDefaultToleranceTemplate(item);
  delete baseData._id;
  baseData.flags = baseData.flags ?? {};
  const moduleFlags = { ...(baseData.flags[MODULE_ID] ?? {}) };
  moduleFlags[FLAGS.sourceSubstanceId] = item.id;
  moduleFlags.stacks = 1;
  const existingModifier = moduleFlags[FLAGS.modifier] ?? {};
  moduleFlags[FLAGS.modifier] = {
    ...existingModifier,
    kind: "tolerance",
    substanceId: item.id,
  };
  baseData.flags[MODULE_ID] = moduleFlags;
  baseData.name = formatToleranceName(item, 1);
  baseData.origin = item.uuid;
  baseData.disabled = false;
  baseData.transfer = false;
  if (baseData.duration) {
    baseData.duration.rounds = undefined;
    baseData.duration.seconds = undefined;
  }
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [baseData]);
  return created?.[0] ?? null;
}

function buildDefaultToleranceTemplate(item) {
  return {
    name: formatToleranceName(item, 1),
    img: item.img ?? "icons/svg/upgrade.svg",
    changes: [],
    description: "",
    flags: {},
  };
}

function formatToleranceName(item, stacks) {
  return game.i18n.format("FISHUT.Tolerance.EffectName", {
    item: item.name,
    stacks,
  });
}

function findToleranceTemplate(item) {
  const effects = item?.effects;
  if (!effects) return null;
  const authoredId = getToleranceEffectId(item);
  if (authoredId) {
    const authored = effects.get?.(authoredId) ?? null;
    if (authored) return authored;
  }
  const list = [...effects];
  const byModifier = list.find((e) => getModifier(e)?.kind === "tolerance");
  if (byModifier) return byModifier;
  return list.find((e) => /tolerance/i.test(e.name ?? "")) ?? null;
}

function findAppliedToleranceEffect(actor, substanceId) {
  if (!actor?.effects) return null;
  for (const effect of actor.effects) {
    if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
    if (getModifier(effect)?.kind === "tolerance") return effect;
    if (/tolerance/i.test(effect.name ?? "")) return effect;
  }
  return null;
}

/**
 * Apply the substance's authored withdrawal AE template to the actor. No-op if
 * `getWithdrawalEffectId(item)` is unset (v0.3 behavior preserved). The applied
 * AE name must contain `withdraw`; mismatched templates log a warning and skip.
 * Test seam — exported for Quench.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function applyWithdrawalEffect(actor, item) {
  const template = findWithdrawalTemplate(item);
  if (!template) return null;
  if (!/withdraw/i.test(template.name ?? "")) {
    logger.warn(
      `withdrawal template "${template.name}" on ${item.name} does not contain "withdraw"; skipping`,
    );
    return null;
  }
  const data = template.toObject();
  delete data._id;
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = { ...(data.flags[MODULE_ID] ?? {}), [FLAGS.sourceSubstanceId]: item.id };
  data.origin = item.uuid;
  data.disabled = false;
  data.transfer = false;
  if (data.duration) {
    data.duration.rounds = undefined;
    data.duration.seconds = undefined;
  }
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return created?.[0] ?? null;
}

function findWithdrawalTemplate(item) {
  const id = getWithdrawalEffectId(item);
  if (!id) return null;
  const effects = item?.effects;
  if (!effects) return null;
  return effects.get?.(id) ?? [...effects].find((e) => e.id === id || e._id === id) ?? null;
}

function findAppliedWithdrawalEffect(actor, substanceId) {
  if (!actor?.effects) return null;
  for (const effect of actor.effects) {
    if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
    if (/withdraw/i.test(effect.name ?? "")) return effect;
  }
  return null;
}
