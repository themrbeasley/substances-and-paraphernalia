// Hook choice: `dropActorSheetData`.
//
// We use `dropActorSheetData(actor, sheet, data)` because it fires on actor
// sheet drops with the actor in scope, lets us return `true` to allow the
// default item-creation path to proceed normally (the substance lands in the
// inventory regardless of the dialog outcome), and gives us a clean point to
// schedule the post-drop dialog. The alternative considered was
// `preCreateItem(item, data, options, userId)` — usable but it fires for every
// embedded item creation (including macro-created and migration paths), which
// would force more guarding here. `dropActorSheetData` is scoped to the
// drag-drop UX surface this task is about.
//
// We deliberately do NOT cancel the drop. The plan says the substance always
// lands; the dialog injects state onto the actor *afterward*. That avoids the
// re-create dance and keeps the user-visible behaviour consistent if a player
// (no dialog) does the drop.

import { MODULE_ID, FLAGS } from "../config.js";
import {
  isSubstance,
  getAddiction,
  getAddictionEffectId,
  getOverdose,
  getWithdrawalMod,
  setActorWithdrawalEntry,
} from "../data/flag-schema.js";
import { computeRestsRemaining } from "../data/withdrawal.js";
import { applyOrIncrementToleranceStack } from "./addiction.js";
import { applyOverdoseEffect } from "./overdose.js";
import { logger } from "../logger.js";

const DIALOG_TEMPLATE = `modules/${MODULE_ID}/templates/drag-to-inventory-dialog.hbs`;

const CHOICES = Object.freeze({
  ALTERED: "altered",
  ADDICTED: "addicted",
  WITHDRAWING: "withdrawing",
  TOLERANT: "tolerant",
  OVERDOSED: "overdosed",
  DECLINE: "decline",
});

export function registerDragToInventory() {
  Hooks.on("dropActorSheetData", onDropActorSheetData);
}

function onDropActorSheetData(actor, _sheet, data) {
  // Don't block the drop. Resolve the dropped Item document and, if it's a
  // substance dropped onto a PC/NPC by a GM/ASSISTANT, fire the dialog after
  // Foundry finishes the default create flow.
  resolveDroppedItem(data)
    .then((item) => {
      if (!item) return;
      if (!shouldShowDialog(game.user, actor, item)) return;
      return promptAndApply(actor, item);
    })
    .catch((err) => logger.error("drag-to-inventory dialog flow failed", err));
  return true;
}

/**
 * Resolve an Item document from a drop payload. Returns null for non-item
 * drops, drops we can't resolve, or anything that isn't a substance.
 *
 * @param {object} data
 * @returns {Promise<Item|null>}
 */
async function resolveDroppedItem(data) {
  if (!data || data.type !== "Item") return null;
  let item = null;
  try {
    if (data.uuid) {
      item = await fromUuid(data.uuid);
    } else if (data.data) {
      // Synthetic from-actor or from-pack drop; build a transient Item-like
      // wrapper. We only need flags + name + id-equivalent for the dialog.
      item = data.data;
    }
  } catch {
    item = null;
  }
  if (!item) return null;
  if (!isSubstance(item)) return null;
  return item;
}

/**
 * Permission + actor-type predicate. Player drops never raise the dialog;
 * non-character/non-npc actors never raise the dialog.
 *
 * @param {User} user
 * @param {Actor} actor
 * @param {Item} item
 * @returns {boolean}
 */
export function shouldShowDialog(user, actor, item) {
  if (!user || !actor || !item) return false;
  if (!isSubstance(item)) return false;
  if (actor.type !== "character" && actor.type !== "npc") return false;
  const role = user.role ?? 0;
  const isGM = user.isGM === true;
  const assistantOrAbove = role >= (CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return isGM || assistantOrAbove;
}

async function promptAndApply(actor, item) {
  const choice = await openDialog(actor, item);
  return applyDragOutcome(actor, item, choice);
}

async function openDialog(actor, item) {
  const body = game.i18n.format("FISHUT.DragInventory.Body", {
    actor: actor.name,
    item: item.name,
  });
  const content = await renderTemplate(DIALOG_TEMPLATE, { body });
  const buttons = [
    { action: CHOICES.ALTERED, label: game.i18n.localize("FISHUT.DragInventory.Button.Altered") },
    { action: CHOICES.ADDICTED, label: game.i18n.localize("FISHUT.DragInventory.Button.Addicted") },
    {
      action: CHOICES.WITHDRAWING,
      label: game.i18n.localize("FISHUT.DragInventory.Button.Withdrawing"),
    },
    { action: CHOICES.TOLERANT, label: game.i18n.localize("FISHUT.DragInventory.Button.Tolerant") },
    {
      action: CHOICES.OVERDOSED,
      label: game.i18n.localize("FISHUT.DragInventory.Button.Overdosed"),
    },
    {
      action: CHOICES.DECLINE,
      label: game.i18n.localize("FISHUT.DragInventory.Button.Decline"),
      default: true,
    },
  ];

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("FISHUT.DragInventory.Title", { item: item.name }),
    },
    content,
    buttons,
    rejectClose: false,
    modal: false,
  });

  // X-close → null/undefined → treat as Decline.
  return result || CHOICES.DECLINE;
}

/**
 * Apply a chosen drag outcome to the actor. Pure-ish test seam — Quench calls
 * this directly, bypassing the dialog.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {"altered"|"addicted"|"withdrawing"|"tolerant"|"overdosed"|"decline"} choice
 * @returns {Promise<{applied: string, restsRemaining?: number}>}
 */
export async function applyDragOutcome(actor, item, choice) {
  if (!actor || !item) return { applied: "noop" };

  switch (choice) {
    case CHOICES.DECLINE:
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Decline", {
          actor: actor.name,
          item: item.name,
        }),
      );
      return { applied: "declined" };

    case CHOICES.ALTERED: {
      await applyBenefitEffects(actor, item);
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Altered", {
          actor: actor.name,
          item: item.name,
        }),
      );
      return { applied: "altered" };
    }

    case CHOICES.ADDICTED: {
      const addiction = getAddiction(item);
      if (!addiction) {
        logger.warn(`addicted: no addiction block on ${item.name}; skipping`);
        return { applied: "noop" };
      }
      const wMod = Number(getWithdrawalMod(item)) || 0;
      const rests = computeRestsRemaining(wMod, conMod(actor));
      await applyAddictionEffect(actor, item);
      await setActorWithdrawalEntry(actor, item.id, {
        restsRemaining: rests,
        appliedAt: new Date().toISOString(),
      });
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Addicted", {
          actor: actor.name,
          item: item.name,
          rests,
        }),
      );
      return { applied: "addicted", restsRemaining: rests };
    }

    case CHOICES.WITHDRAWING: {
      const addiction = getAddiction(item);
      if (!addiction) {
        logger.warn(`withdrawing: no addiction block on ${item.name}; skipping`);
        return { applied: "noop" };
      }
      const wMod = Number(getWithdrawalMod(item)) || 0;
      const rests = computeRestsRemaining(wMod, conMod(actor));
      await setActorWithdrawalEntry(actor, item.id, {
        restsRemaining: rests,
        appliedAt: new Date().toISOString(),
      });
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Withdrawing", {
          actor: actor.name,
          item: item.name,
          rests,
        }),
      );
      return { applied: "withdrawing", restsRemaining: rests };
    }

    case CHOICES.TOLERANT: {
      const effect = await applyOrIncrementToleranceStack(actor, item);
      const stacks = Number(effect?.flags?.[MODULE_ID]?.stacks) || 1;
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Tolerant", {
          actor: actor.name,
          item: item.name,
          stacks,
        }),
      );
      return { applied: "tolerant", stacks };
    }

    case CHOICES.OVERDOSED: {
      const block = getOverdose(item);
      const effect = await applyOverdoseEffect(actor, item, block);
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Overdosed", {
          actor: actor.name,
          item: item.name,
          description: block?.description ?? "",
        }),
      );
      return { applied: "overdosed", effectId: effect?.id ?? null };
    }

    default:
      return { applied: "noop" };
  }
}

function conMod(actor) {
  const mod = actor?.system?.abilities?.con?.mod;
  return typeof mod === "number" ? mod : 0;
}

async function applyBenefitEffects(actor, item) {
  const addictionId = getAddictionEffectId(item);
  const effects = item?.effects ? [...item.effects] : [];
  const benefits = effects.filter((e) => {
    const id = e.id ?? e._id;
    if (id && id === addictionId) return false;
    if (/addict/i.test(e.name ?? "")) return false;
    return true;
  });
  if (benefits.length === 0) return [];

  const payloads = benefits.map((effect) => {
    const data = typeof effect.toObject === "function" ? effect.toObject() : { ...effect };
    delete data._id;
    data.flags = data.flags ?? {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      [FLAGS.sourceSubstanceId]: item.id,
    };
    data.origin = item.uuid;
    data.disabled = false;
    if (data.duration) {
      data.duration.rounds = undefined;
      data.duration.seconds = undefined;
    }
    return data;
  });
  return actor.createEmbeddedDocuments("ActiveEffect", payloads);
}

async function applyAddictionEffect(actor, item) {
  const template = findAddictionTemplate(item);
  if (!template) {
    logger.warn(`addiction template not found on ${item.name}; chat-only fail outcome`);
    return null;
  }
  const data = typeof template.toObject === "function" ? template.toObject() : { ...template };
  delete data._id;
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = {
    ...(data.flags[MODULE_ID] ?? {}),
    [FLAGS.sourceSubstanceId]: item.id,
  };
  data.origin = item.uuid;
  data.disabled = false;
  if (data.duration) {
    data.duration.rounds = undefined;
    data.duration.seconds = undefined;
  }
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return created?.[0] ?? null;
}

function findAddictionTemplate(item) {
  const id = getAddictionEffectId(item);
  const effects = item?.effects;
  if (!effects) return null;
  if (id) {
    const direct = effects.get?.(id) ?? [...effects].find((e) => e.id === id || e._id === id);
    if (direct) return direct;
  }
  return [...effects].find((e) => /addict/i.test(e.name ?? "")) ?? null;
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
