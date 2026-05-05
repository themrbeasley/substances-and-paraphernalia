/**
 * Module-wide constants. Sourced from scripts/data/schema.json so the manifest,
 * the lang file, the settings registrar, and any future builder UI all read
 * from one place.
 */

const schemaUrl = new URL("./data/schema.json", import.meta.url);
const rawSchema = await fetch(schemaUrl).then((r) => r.json());

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export const SCHEMA = deepFreeze(rawSchema);

export const MODULE_ID = SCHEMA.moduleId;
export const FLAG_SCOPE = SCHEMA.flagScope;
export const FLAGS = SCHEMA.flagKeys;

export const KIND_IDS = SCHEMA.kinds.map((k) => k.id);
export const CATEGORY_IDS = SCHEMA.categories.map((c) => c.id);
export const SETTING_IDS = SCHEMA.settings.map((s) => s.id);

/**
 * Display label key for any schema enum entry.
 * @param {"kinds"|"categories"|"settings"} group
 * @param {string} id
 * @returns {string|undefined}
 */
export function labelKey(group, id) {
  return SCHEMA[group]?.find((entry) => entry.id === id)?.labelKey;
}
