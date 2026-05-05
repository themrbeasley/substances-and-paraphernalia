import { MODULE_ID, SCHEMA } from "./config.js";
import { logger } from "./logger.js";

/**
 * Ordered list of migrators. Each runs once when the world's stored
 * dataVersion is below the migrator's `to` value. Empty at v0.1.0 — first
 * real migrator lands when the data shape changes.
 *
 * @type {Array<{ from: number, to: number, run: () => Promise<void> }>}
 */
const MIGRATORS = [];

export function registerMigrationSettings() {
  game.settings.register(MODULE_ID, "dataVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
}

export async function runMigrations() {
  const target = SCHEMA.schemaVersion;
  const stored = game.settings.get(MODULE_ID, "dataVersion") ?? 0;
  if (stored >= target) return;
  if (!game.user.isGM) return;

  for (const m of MIGRATORS) {
    if (m.to <= stored) continue;
    if (m.to > target) break;
    logger.warn(`Running migration ${m.from} → ${m.to}`);
    await m.run();
  }

  await game.settings.set(MODULE_ID, "dataVersion", target);
}
