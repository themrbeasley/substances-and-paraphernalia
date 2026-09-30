// scripts/hooks/withdrawal-cleanup.js
/**
 * When a Withdrawal AE is deleted, clear the matching actor-flag entry. The
 * actor flag is canonical state; the AE is the UI mirror.
 *
 * On V14, core expires timed AEs itself; they are deleted (and this hook
 * fires) only when `CONFIG.ActiveEffect.expiryAction` is "delete", which the
 * House Automation module sets. Manual deletes and the Remove Withdrawal
 * macro fire it too.
 *
 * Listens on `deleteActiveEffect` `(effect, options, userId)`. GM-arbitrated.
 */

import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import { clearActorWithdrawalEntry, getAeRole } from "../data/flag-schema.js";

export function registerWithdrawalCleanup() {
  Hooks.on("deleteActiveEffect", async (effect, _options, _userId) => {
    if (!effect) return;
    if (getAeRole(effect) !== "withdrawal") return;
    const substanceId = effect.flags?.[MODULE_ID]?.sourceSubstanceId;
    if (!substanceId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    // GM-arbiter: only the active GM clears flags to prevent multi-client double-write.
    if (game.users?.activeGM && game.users.activeGM !== game.user) return;
    try {
      await clearActorWithdrawalEntry(actor, substanceId);
      logger.log(
        `withdrawal-cleanup: cleared actor flag entry for ${actor.name} / ${substanceId}`,
      );
    } catch (e) {
      logger.warn("withdrawal-cleanup: clear failed", { actorId: actor.id, substanceId, error: e?.message });
    }
  });
}
