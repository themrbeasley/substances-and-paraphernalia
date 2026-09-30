// Hook choice: `dropActorSheetData`.
//
// We use `dropActorSheetData(actor, sheet, data)` because it fires on actor
// sheet drops with the actor in scope, lets us return `true` to allow the
// default item-creation path to proceed normally (the substance lands in the
// inventory regardless of the dialog outcome), and gives us a clean point to
// schedule the post-drop dialog. The alternative considered was
// `preCreateItem(item, data, options, userId)`, usable but it fires for every
// embedded item creation (including macro-created and migration paths), which
// would force more guarding here. `dropActorSheetData` is scoped to the
// drag-drop UX surface this task is about.
//
// We deliberately do NOT cancel the drop. The plan says the substance always
// lands; the dialog injects state onto the actor *afterward*. That avoids the
// re-create dance and keeps the user-visible behaviour consistent if a player
// (no dialog) does the drop.

import { MODULE_ID } from "../config.js";
import {
  isSubstance,
  getAddiction,
  getAddictionEffectIds,
  getWithdrawalEffectIds,
  getOverdose,
  getOverdoseEffectIds,
  getToleranceEffectIds,
  getWithdrawalDuration,
  getAddictedSubstanceIds,
  getActorWithdrawalEntry,
  getActorToleranceEntry,
} from "../data/flag-schema.js";
import { prepareEffectPayload } from "../data/effect-data.js";
import { applyAddictionEffect, applyWithdrawalEffect, incrementActorToleranceCount } from "./addiction.js";
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
  return applyDragOutcome(actor, ownedCopy(actor, item), choice);
}

// Key effects to the character's own copy of the drug, not the dropped
// original: dnd5e can stack the drop into an item the character already has.
function ownedCopy(actor, item) {
  return (
    actor.items.get(item.id) ??
    actor.items.find((i) => i._stats?.compendiumSource === item.uuid && i.name === item.name) ??
    item
  );
}

async function openDialog(actor, item) {
  const body = game.i18n.format("FISHUT.DragInventory.Body", {
    actor: actor.name,
    item: item.name,
  });
  const content = await foundry.applications.handlebars.renderTemplate(DIALOG_TEMPLATE, { body });
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
 * Apply a chosen drag outcome to the actor. Pure-ish test seam: Quench calls
 * this directly, bypassing the dialog.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {"altered"|"addicted"|"withdrawing"|"tolerant"|"overdosed"|"decline"} choice
 * @returns {Promise<{applied: string, endsAt?: string, stacks?: number, effectId?: string|null}>}
 *   `endsAt` is only returned for `withdrawing`.
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
      if (!getAddiction(item)) {
        logger.warn(`addicted: no addiction block on ${item.name}; skipping`);
        return { applied: "noop" };
      }
      // Already addicted: don't stack a second Addiction effect (spec D1).
      if (!getAddictedSubstanceIds(actor).includes(item.id)) await applyAddictionEffect(actor, item);
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Addicted", {
          actor: actor.name,
          item: item.name,
          duration: humanizeDuration(getWithdrawalDuration(item)),
        }),
      );
      return { applied: "addicted" };
    }

    case CHOICES.WITHDRAWING: {
      if (!getAddiction(item)) {
        logger.warn(`withdrawing: no addiction block on ${item.name}; skipping`);
        return { applied: "noop" };
      }
      // Only the addicted go through withdrawal (spec D1, D3).
      if (!getAddictedSubstanceIds(actor).includes(item.id)) await applyAddictionEffect(actor, item);
      await applyWithdrawalEffect(actor, item);
      await chat(
        game.i18n.format("FISHUT.DragInventory.Applied.Withdrawing", {
          actor: actor.name,
          item: item.name,
          duration: humanizeDuration(getWithdrawalDuration(item)),
        }),
      );
      return { applied: "withdrawing", endsAt: getActorWithdrawalEntry(actor, item.id)?.endsAt };
    }

    case CHOICES.TOLERANT: {
      await incrementActorToleranceCount(actor, item);
      const stacks = Number(getActorToleranceEntry(actor, item.id)?.count) || 1;
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

function humanizeDuration(duration) {
  const value = Number(duration?.value) || 0;
  // prepareEffectPayload makes a missing or non-positive duration permanent.
  if (value <= 0) return "indefinitely";
  const unit =
    value === 1 && typeof duration.unit === "string"
      ? duration.unit.replace(/s$/, "")
      : duration.unit;
  return `${value} ${unit}`;
}

async function applyBenefitEffects(actor, item) {
  const reservedIds = new Set([
    ...getAddictionEffectIds(item),
    ...getWithdrawalEffectIds(item),
    ...getOverdoseEffectIds(item),
    ...getToleranceEffectIds(item),
  ]);
  const effects = item?.effects ? [...item.effects] : [];
  const benefits = effects.filter((e) => {
    const id = e.id ?? e._id;
    if (id && reservedIds.has(id)) return false;
    const name = e.name ?? "";
    if (/addict/i.test(name)) return false;
    if (/withdraw/i.test(name)) return false;
    if (/overdose/i.test(name)) return false;
    if (/tolerance/i.test(name)) return false;
    return true;
  });
  if (benefits.length === 0) return [];

  const payloads = benefits.map((effect) =>
    prepareEffectPayload(typeof effect.toObject === "function" ? effect.toObject() : { ...effect }, {
      sourceSubstanceId: item.id,
      origin: item.uuid,
      duration: null,
    }),
  );
  return actor.createEmbeddedDocuments("ActiveEffect", payloads);
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
