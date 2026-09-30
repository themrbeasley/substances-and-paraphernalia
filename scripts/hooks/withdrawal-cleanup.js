// scripts/hooks/withdrawal-cleanup.js
/**
 * When a substance's last withdrawal effect is deleted, clear the actor's
 * withdrawal record and end the addiction: finishing withdrawal is recovery
 * (spec D3, D8). A relapse deletes withdrawal with `options.fishutRelapse`
 * and leaves the addiction in place (D7).
 *
 * Deletes come from House Automation's "Delete expired effects" switch
 * (expiry), the Remove Withdrawal macro, a GM by hand, or a relapse.
 * Listens on `deleteActiveEffect` `(effect, options, userId)`. GM-arbitrated.
 */

import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import { clearActorWithdrawalEntry, getAeRole } from "../data/flag-schema.js";

export function registerWithdrawalCleanup() {
  Hooks.on("deleteActiveEffect", onDeleteActiveEffect);
}

async function onDeleteActiveEffect(effect, options, _userId) {
  if (getAeRole(effect) !== "withdrawal") return;
  const substanceId = effect.flags?.[MODULE_ID]?.sourceSubstanceId;
  const actor = effect.parent;
  if (!substanceId || actor?.documentName !== "Actor") return;
  // GM-arbiter: only the active GM writes, so clients don't double-write.
  if (game.users?.activeGM && game.users.activeGM !== game.user) return;
  // actor.effects, not appliedEffects: an expired effect can still be present.
  const mine = (role) =>
    actor.effects.filter((e) => getAeRole(e) === role && e.flags?.[MODULE_ID]?.sourceSubstanceId === substanceId);
  // A substance can clone several withdrawal templates; act when the last goes.
  if (mine("withdrawal").length > 0) return;
  try {
    await clearActorWithdrawalEntry(actor, substanceId);
    if (options?.fishutRelapse) return;
    const addictionIds = mine("addiction").map((e) => e.id);
    if (addictionIds.length === 0) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", addictionIds, { fishutIntentional: true });
    await ChatMessage.create({
      content: game.i18n.format("FISHUT.Withdrawal.Recovered", {
        actor: actor.name,
        item: actor.items.get(substanceId)?.name ?? effect.name,
      }),
      whisper: [],
    });
  } catch (e) {
    logger.warn("withdrawal-cleanup: failed", { actorId: actor.id, substanceId, error: e?.message });
  }
}
