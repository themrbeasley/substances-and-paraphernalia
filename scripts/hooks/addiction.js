import { MODULE_ID, FLAGS } from "../config.js";
import {
  getAddiction,
  getAddictionEffectId,
  getActorWithdrawal,
  getActorWithdrawalEntry,
  setActorWithdrawalEntry,
  clearActorWithdrawalEntry,
  isSubstance,
} from "../data/flag-schema.js";
import { consumeBypassIfAvailable } from "../data/save-bypass.js";
import { computeRestsRemaining } from "../data/withdrawal.js";
import { logger } from "../logger.js";

const DEFAULT_SAVE_ABILITY = "con";

export function registerAddictionHooks() {
  // B.1 — Save-on-use (post-activity).
  // dnd5e 4.x exposes `dnd5e.postUseActivity`. Signature confirmed in live
  // world; if it differs we fall back to wrapping `Activity#use` directly
  // (see comment in onPostUseActivity).
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);

  // B.2 — Long-rest withdrawal tick (GM-arbitrated).
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
}

async function onPostUseActivity(activity, _usageConfig, _results) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return;
  if (!isSubstance(item)) return;
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

  const bypass = await consumeBypassIfAvailable(actor, item);
  if (bypass.bypassed) {
    return applyOutcome(actor, item, { bypass });
  }

  const ability = addiction.save?.ability ?? DEFAULT_SAVE_ABILITY;
  const dc = addiction.save.dc;
  const saveRoll = await rollSave(actor, ability, dc);
  if (!saveRoll) return;
  const saveResult = saveRoll.total >= dc ? "success" : "fail";
  return applyOutcome(actor, item, { saveResult, saveTotal: saveRoll.total });
}

/**
 * Apply a pre-determined outcome to the actor. This is the test seam — the
 * Quench suite calls it directly with a forced result.
 *
 * @param {Actor}  actor
 * @param {Item}   item
 * @param {Object} outcome
 * @param {boolean} [outcome.alreadyAddicted]
 * @param {{bypassed: true, paraphernalia: Item, type: string}} [outcome.bypass]
 * @param {"success"|"fail"} [outcome.saveResult]
 * @param {number}            [outcome.saveTotal]
 */
export async function applyOutcome(actor, item, outcome) {
  const addiction = getAddiction(item);
  if (!addiction) return;
  const wMod = Number(addiction.withdrawalMod) || 0;
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

  if (outcome?.bypass?.bypassed) {
    await chat(
      game.i18n.format("FISHUT.Addiction.Save.Bypass", {
        actor: actor.name,
        item: item.name,
        paraphernalia: outcome.bypass.paraphernalia?.name ?? "",
      }),
    );
    return { applied: "bypassed" };
  }

  if (outcome?.saveResult === "success") {
    await chat(
      game.i18n.format("FISHUT.Addiction.Save.Pass", { actor: actor.name, item: item.name }),
    );
    return { applied: "passed" };
  }

  if (outcome?.saveResult === "fail") {
    await applyAddictionEffect(actor, item);
    await setActorWithdrawalEntry(actor, item.id, {
      restsRemaining: newComputed,
      appliedAt: new Date().toISOString(),
    });
    await chat(
      game.i18n.format("FISHUT.Addiction.Save.Fail", {
        actor: actor.name,
        item: item.name,
        rests: newComputed,
      }),
    );
    return { applied: "addicted", restsRemaining: newComputed };
  }
}

function conMod(actor) {
  const mod = actor?.system?.abilities?.con?.mod;
  return typeof mod === "number" ? mod : 0;
}

async function rollSave(actor, ability, dc) {
  if (typeof actor.rollAbilitySave !== "function" && typeof actor.rollSavingThrow !== "function") {
    logger.warn("actor has no rollAbilitySave/rollSavingThrow; skipping save");
    return null;
  }
  // dnd5e 4.x prefers `rollSavingThrow` (the 3.x `rollAbilitySave` still
  // exists as an alias on most builds). Try the modern name first.
  const fn = actor.rollSavingThrow ?? actor.rollAbilitySave;
  const roll = await fn.call(actor, {
    ability,
    target: dc,
    targetValue: dc,
    fastForward: false,
    chatMessage: true,
  });
  // Handle both single-roll and array-roll return shapes.
  if (Array.isArray(roll)) return roll[0] ?? null;
  return roll ?? null;
}

async function applyAddictionEffect(actor, item) {
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
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return created?.[0] ?? null;
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
    if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === substanceId) return effect;
  }
  return null;
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
      if (effect) await effect.delete();
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
