import { MODULE_ID } from "../config.js";
import { isSubstance } from "../data/flag-schema.js";
import { DOSE_ROLE, drugUuidFrom, doseTurn, findOwnCopy, emptyCopyData } from "../data/dose-marker.js";
import { runDosePipeline } from "./addiction.js";
import { logger } from "../logger.js";

/** `${creature uuid}|${drug uuid}` → the turn that creature was last dosed by that drug. */
// ponytail: per-client map, so a burst marker made on one client and a tick on another aren't deduped; move it to an actor flag if the live test shows that.
const lastDoseTurn = new Map();

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
  const uuid = drugUuidFrom({ activityUuid: effect.flags?.dae?.activity, origin: effect.origin });
  // One dose of a drug per creature per turn (spec D2): a gas bomb's burst and the
  // entry tick Foundry fires when Midi adds the cloud's behavior land in the same turn.
  const key = `${actor.uuid}|${uuid}`;
  const turn = doseTurn(game.combat, game.time.worldTime);
  if (lastDoseTurn.get(key) === turn) {
    logger.log(`${actor.name} was already dosed by ${uuid} this turn; skipping`);
    return false;
  }
  lastDoseTurn.set(key, turn);
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
