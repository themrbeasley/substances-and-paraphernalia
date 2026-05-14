import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import {
  getActorToleranceEntry,
  setActorToleranceEntry,
  clearActorToleranceEntry,
  getToleranceDecay,
  findEffectsByRole,
} from "../data/flag-schema.js";
import { decayCount } from "../data/tolerance.js";

export function registerToleranceDecay() {
  // intentional no-op; long-rest-abstain.js drives decay events directly
  logger.log("tolerance-decay: registered (no hook listeners; direct dispatch)");
}

export async function applyToleranceDecay(actor, substance) {
  const entry = getActorToleranceEntry(actor, substance.id);
  if (!entry || !Number.isFinite(Number(entry.count))) return 0;
  const decay = getToleranceDecay(substance);
  const nextCount = decayCount(entry.count, decay);
  const now = new Date().toISOString();
  if (nextCount === 0) {
    await clearActorToleranceEntry(actor, substance.id);
    const aes = findEffectsByRole(actor, "tolerance").filter(
      (e) => e.flags?.[MODULE_ID]?.sourceSubstanceId === substance.id,
    );
    for (const ae of aes) {
      await ae.delete({ fishutIntentional: true });
    }
  } else {
    await setActorToleranceEntry(actor, substance.id, {
      ...entry,
      count: nextCount,
      lastDecayedAt: now,
    });
    const aes = findEffectsByRole(actor, "tolerance").filter(
      (e) => e.flags?.[MODULE_ID]?.sourceSubstanceId === substance.id,
    );
    for (const ae of aes) {
      await ae.update({ [`flags.${MODULE_ID}.count`]: nextCount });
    }
  }
  return nextCount;
}
