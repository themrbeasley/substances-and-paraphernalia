import { MODULE_ID } from "../config.js";
import { isSubstance } from "../data/flag-schema.js";
import {
  DOSE_ROLE,
  drugUuidFrom,
  doseTurn,
  doseLands,
  spendsDrug,
  findOwnCopy,
  emptyCopyData,
} from "../data/dose-marker.js";
import { runDosePipeline } from "./addiction.js";
import { logger } from "../logger.js";

/** `${creature uuid}|${drug uuid}` → { turn, tick } of that drug's last dose on that creature. */
// ponytail: per-client map, so a dose made on one client and a cloud tick on another aren't deduped; move it to an actor flag if the live test shows that.
const lastDose = new Map();

export function registerDoseOthers() {
  Hooks.on("preCreateActiveEffect", onPreCreateDoseMarker);
}

/**
 * A dose marker landing on a creature (spec D1). Foundry only cancels on an
 * immediate false, so cancel now and run the dose without waiting. DAE creates
 * effects on creatures the user doesn't own on the GM's client, so the dose
 * runs where the creature can be written.
 *
 * @param {ActiveEffect} effect
 * @returns {false|undefined} false cancels the marker; it never stays on the creature
 */
export function onPreCreateDoseMarker(effect, _data, _options, _userId) {
  const actor = effect?.parent;
  if (actor?.documentName !== "Actor") return undefined;
  if (effect.flags?.[MODULE_ID]?.aeRole !== DOSE_ROLE) return undefined;
  const activityUuid = effect.flags?.dae?.activity;
  const uuid = drugUuidFrom({ activityUuid, origin: effect.origin });
  // Only a cloud tick (an activity that spends nothing) is limited (spec D2): the cloud doses
  // a creature at most once per turn, and a tick and a direct dose don't both land in one turn.
  const activityId =
    typeof activityUuid === "string" ? activityUuid.split(".Activity.")[1] : undefined;
  const drug = fromUuidSync(uuid, { strict: false });
  const activity = activityId ? drug?.system?.activities?.get(activityId) : undefined;
  const tick = activity ? !spendsDrug(activity) : false;
  const key = `${actor.uuid}|${uuid}`;
  const turn = doseTurn(game.combat, game.time.worldTime);
  if (!doseLands(lastDose.get(key), turn, tick)) {
    // Tell the GM why nothing happened. Not awaited: the cancel must stay synchronous.
    ChatMessage.create({
      content: game.i18n.format("FISHUT.Dose.Skipped", {
        target: actor.name,
        item: drug?.name ?? uuid,
      }),
      whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
    }).catch((err) => logger.error("dose skipped message failed", err));
    return false;
  }
  lastDose.set(key, { turn, tick });
  doseCreature(actor, uuid).catch((err) => logger.error("dose on a creature failed", err));
  return false;
}

/**
 * Dose a creature with a drug: against their own copy, made empty if needed.
 *
 * @param {Actor} actor
 * @param {string|null} drugUuid  the dosing drug's Item uuid
 */
export async function doseCreature(actor, drugUuid) {
  const source = drugUuid ? await fromUuid(drugUuid) : null;
  if (!source || !isSubstance(source)) {
    logger.warn(`dose marker on ${actor.name} names no drug (${drugUuid}); nothing happens`);
    return;
  }
  let own = findOwnCopy(actor.items, source);
  if (!own) {
    const data = emptyCopyData(source.toObject());
    const keepId = !actor.items.has(data._id);
    if (!keepId) delete data._id;
    [own] = await actor.createEmbeddedDocuments("Item", [data], { keepId });
  }
  await ChatMessage.create({
    content: game.i18n.format("FISHUT.Dose.Landed", { target: actor.name, item: own.name }),
    whisper: [],
  });
  await runDosePipeline(actor, own, { forced: true });
}
