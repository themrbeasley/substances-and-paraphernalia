/**
 * Paraphernalia subtype catalog — composition of built-in (schema-seeded)
 * subtypes and the world-managed custom list. Pure module: takes a custom
 * list as an argument, falls back to reading the world setting only when
 * Foundry globals are present. Unit-testable without `game`.
 */

import { MODULE_ID, SCHEMA } from "../config.js";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CUSTOM_SETTING_KEY = "customParaphernaliaSubtypes";

/**
 * @typedef {Object} ParaphernaliaSubtypeOption
 * @property {string}  id
 * @property {string}  labelKey  Localization key (built-ins) or empty for custom rows.
 * @property {string}  [label]   Resolved label for custom rows; built-ins render
 *                               via `labelKey`.
 * @property {boolean} readOnly  True for schema-seeded entries that the manager
 *                               UI should render but not allow deletion of.
 * @property {"builtin" | "custom"} source
 */

/**
 * Read the GM-managed custom list from world settings. Safe to call outside a
 * live Foundry world: returns `[]` when `game.settings` is absent.
 * @returns {Array<{ id: string, label: string }>}
 */
export function readCustomParaphernaliaSubtypes() {
  if (typeof game === "undefined" || !game?.settings?.get) return [];
  try {
    const value = game.settings.get(MODULE_ID, CUSTOM_SETTING_KEY);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Compose built-in subtypes with the custom list. Built-ins are flagged
 * `readOnly: true` so the manager UI renders them but blocks deletion.
 * Custom entries collide-check against built-in ids and earlier custom ids;
 * a colliding entry is dropped (last writer loses) so the composed list is
 * always id-unique.
 *
 * @param {{ custom?: Array<{ id: string, label: string }> }} [options]
 * @returns {ParaphernaliaSubtypeOption[]}
 */
export function getEffectiveParaphernaliaSubtypes({ custom } = {}) {
  const customList = custom ?? readCustomParaphernaliaSubtypes();
  const builtins = (SCHEMA.paraphernaliaSubtypes ?? []).map((s) => ({
    id: s.id,
    labelKey: s.labelKey,
    readOnly: true,
    source: "builtin",
  }));
  const seen = new Set(builtins.map((b) => b.id));
  const customs = [];
  for (const entry of customList) {
    if (!entry || typeof entry.id !== "string") continue;
    const id = entry.id.trim();
    if (!id || seen.has(id)) continue;
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : id;
    customs.push({ id, labelKey: "", label, readOnly: false, source: "custom" });
    seen.add(id);
  }
  return [...builtins, ...customs];
}

/**
 * Validate a proposed custom-subtype list against the built-in schema entries
 * and against duplicates within the proposed list itself.
 *
 * @param {Array<{ id: string, label: string }>} proposed
 * @returns {{ valid: boolean, errors: Array<{ index: number, code: string }> }}
 */
export function validateCustomParaphernaliaSubtypes(proposed) {
  const errors = [];
  const builtinIds = new Set((SCHEMA.paraphernaliaSubtypes ?? []).map((s) => s.id));
  const seen = new Set();
  proposed.forEach((entry, index) => {
    const id = String(entry?.id ?? "").trim();
    if (!id) {
      errors.push({ index, code: "missingId" });
      return;
    }
    if (!KEBAB.test(id)) {
      errors.push({ index, code: "notKebab" });
      return;
    }
    if (builtinIds.has(id)) {
      errors.push({ index, code: "collidesWithBuiltin" });
      return;
    }
    if (seen.has(id)) {
      errors.push({ index, code: "duplicate" });
      return;
    }
    seen.add(id);
  });
  return { valid: errors.length === 0, errors };
}
