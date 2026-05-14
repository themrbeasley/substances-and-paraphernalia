// scripts/hooks/withdrawal-cleanup.js
/**
 * When DAE's Times-Up bundle removes a Withdrawal AE at duration expiry, clear
 * the matching actor-flag entry. Active actor-flag is canonical state; AE is
 * the UI mirror.
 *
 * Listens on `deleteActiveEffect`. Foundry V13 fires this hook with
 * `(effect, options, userId)`; we don't gate on userId because the same client
 * that owns the AE delete owns the actor flag write.
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
