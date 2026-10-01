// scripts/hooks/withdrawal-cleanup.js
/**
 * When a substance's last withdrawal effect is deleted, clear the actor's
 * withdrawal record and end the addiction: finishing withdrawal is recovery
 * (spec D3, D8). A relapse deletes withdrawal with `options.fishutRelapse`
 * and leaves the addiction in place (D7).
 *
 * Deletes come from House Automation's "Delete expired effects" switch
 * (expiry), the Remove Withdrawal macro, a GM by hand, or a relapse.
 * Listens on `deleteActiveEffect` `(effect, options, userId)`. The active GM
 * runs it; with no GM online every client tries (only owners can write), so
 * a player can still recover.
 */

import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import { clearActorWithdrawalEntry, hasAeRole } from "../data/flag-schema.js";
import { recoveryAction } from "../data/recovery.js";

// Several withdrawal effects of one substance deleted in one batch are all gone
// from actor.effects before the first hook runs, so every handler would pass the
// "last one" check. Handlers run their synchronous part before any awaits, so a
// claim taken there lets exactly one of them act.
const inFlight = new Set();

export function registerWithdrawalCleanup() {
  Hooks.on("deleteActiveEffect", onDeleteActiveEffect);
}

async function onDeleteActiveEffect(effect, options, _userId) {
  if (!hasAeRole(effect, "withdrawal")) return;
  const substanceId = effect.flags?.[MODULE_ID]?.sourceSubstanceId;
  const actor = effect.parent;
  if (!substanceId || actor?.documentName !== "Actor") return;
  // The active GM writes, so clients don't double-write. With no GM online,
  // every client tries; only owners can write.
  if (game.users?.activeGM && game.users.activeGM !== game.user) return;
  // actor.effects, not appliedEffects: an expired effect can still be present.
  const mine = (role) =>
    actor.effects.filter((e) => hasAeRole(e, role) && e.flags?.[MODULE_ID]?.sourceSubstanceId === substanceId);
  // A substance can clone several withdrawal templates; act when the last goes.
  const addictionIds = mine("addiction").map((e) => e.id);
  const action = recoveryAction({
    withdrawalsLeft: mine("withdrawal").length,
    relapse: Boolean(options?.fishutRelapse),
    addicted: addictionIds.length > 0,
  });
  if (action === "wait") return;
  // uuid, not id: unlinked tokens of one base actor share its id.
  const key = `${actor.uuid}:${substanceId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await clearActorWithdrawalEntry(actor, substanceId);
    if (action === "clear") return;
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
  } finally {
    inFlight.delete(key);
  }
}
