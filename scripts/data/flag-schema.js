import { MODULE_ID, FLAGS } from "../config.js";
import { readModifier } from "./modifier-flag.js";

/**
 * @typedef {"substance" | "paraphernalia"} Kind
 * @typedef {"stimulant" | "mindAltering" | "performanceEnhancing"} Category
 * @typedef {"fantasy" | "sciFi" | "modern"} Setting
 * @typedef {"contact" | "ingested" | "inhaled" | "injury"} Administration
 *   Mirrors the dnd5e Poison subtype enum; carried on the consumable itself
 *   at `system.type.subtype`, not as a module flag.
 * @typedef {string} ParaphernaliaSubtype
 *   Open enum: schema.json seeds well-known ids ("pipe", "snuff-horn", …) but
 *   GMs may mint custom subtypes ad-hoc. A substance is satisfied when the
 *   actor owns a ready paraphernalia for each subtype in `requiredSubtypes`.
 *
 * @typedef {Object} AddictionSave
 * @property {string} ability    Standard 5e ability key (defaults to "con").
 * @property {number} dc
 *
 * @typedef {Object} AddictionBlock
 * @property {AddictionSave} save
 * @property {number} withdrawalMod    Positive integer; floor of withdrawal
 *   duration is `ceil(withdrawalMod / 2)` long rests.
 * @property {string} addictionEffectId
 *   The `_id` of the {Substance} Addiction AE on the substance item, cloned
 *   onto the actor when the addiction save fails.
 *
 * @typedef {"auto-pass"} AddictionSaveBypassType
 *   Reserved values (`"advantage"`, `"+N"`, `"reroll"`) are not yet implemented.
 *
 * @typedef {Object} AddictionSaveBypassBlock
 * @property {AddictionSaveBypassType} type
 * @property {Administration[]}        appliesTo
 * @property {number|string}           usesPerDay   Numeric or formula (e.g. "@prof").
 *
 * @typedef {Object} FishutFlags
 * @property {Kind} kind
 * @property {Category} [category]
 * @property {Setting} [setting]
 * @property {ParaphernaliaSubtype} [subtype]              Only when kind === "paraphernalia".
 * @property {ParaphernaliaSubtype[]} [requiredSubtypes]   Only when kind === "substance".
 * @property {AddictionBlock} [addiction]                  Only when kind === "substance".
 * @property {AddictionSaveBypassBlock} [addictionSaveBypass] Only when kind === "paraphernalia".
 * @property {number} [schemaVersion]
 *
 * @typedef {Object} WithdrawalEntry
 * @property {number} restsRemaining
 * @property {string} appliedAt    ISO-8601 timestamp.
 *
 * @typedef {Object<string, WithdrawalEntry>} WithdrawalMap
 *   Keyed by substance item `_id`.
 */

const DEFAULT_SAVE_ABILITY = "con";

// ─── Item flags (substance + paraphernalia common) ───────────────────────────

/** @param {Item} item */ export const getKind = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.kind) ?? null;

/** @param {Item} item */ export const getCategory = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.category) ?? null;

/** @param {Item} item */ export const getSetting = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.setting) ?? null;

/** @param {Item} item */ export const getSubtype = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.subtype) ?? null;

/** @param {Item} item @returns {string[]} */ export const getRequiredSubtypes = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.requiredSubtypes) ?? [];

/** @param {Item} item */ export const isSubstance = (item) => getKind(item) === "substance";

/** @param {Item} item */ export const isParaphernalia = (item) =>
  getKind(item) === "paraphernalia";

export const setKind = (item, value) => item.setFlag(MODULE_ID, FLAGS.kind, value);
export const setCategory = (item, value) => item.setFlag(MODULE_ID, FLAGS.category, value);
export const setSetting = (item, value) => item.setFlag(MODULE_ID, FLAGS.setting, value);
export const setSubtype = (item, value) => item.setFlag(MODULE_ID, FLAGS.subtype, value);
export const setRequiredSubtypes = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.requiredSubtypes, value);

// ─── Substance flags (addiction) ─────────────────────────────────────────────

/** @param {Item} item @returns {AddictionBlock|null} */
export const getAddiction = (item) => item?.getFlag?.(MODULE_ID, FLAGS.addiction) ?? null;

export const setAddiction = (item, value) => item.setFlag(MODULE_ID, FLAGS.addiction, value);

/** @param {Item} item @returns {AddictionSave|null} */
export const getAddictionSave = (item) => {
  const block = getAddiction(item);
  if (!block) return null;
  const save = block.save ?? {};
  return { ability: save.ability ?? DEFAULT_SAVE_ABILITY, dc: save.dc };
};

export const setAddictionSave = (item, save) => {
  const block = getAddiction(item) ?? {};
  return setAddiction(item, { ...block, save });
};

/** @param {Item} item */ export const getWithdrawalMod = (item) => getAddiction(item)?.withdrawalMod ?? null;

export const setWithdrawalMod = (item, value) => {
  const block = getAddiction(item) ?? {};
  return setAddiction(item, { ...block, withdrawalMod: value });
};

/** @param {Item} item */ export const getAddictionEffectId = (item) =>
  getAddiction(item)?.addictionEffectId ?? null;

export const setAddictionEffectId = (item, value) => {
  const block = getAddiction(item) ?? {};
  return setAddiction(item, { ...block, addictionEffectId: value });
};

// ─── Paraphernalia flag (addictionSaveBypass) ────────────────────────────────

/** @param {Item} item @returns {AddictionSaveBypassBlock|null} */
export const getAddictionSaveBypass = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.addictionSaveBypass) ?? null;

export const setAddictionSaveBypass = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.addictionSaveBypass, value);

// ─── Active Effect flag (sourceSubstanceId) ──────────────────────────────────

/** @param {ActiveEffect} effect */
export const getSourceSubstanceId = (effect) =>
  effect?.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] ?? null;

export const setSourceSubstanceId = (effect, value) =>
  effect.setFlag(MODULE_ID, FLAGS.sourceSubstanceId, value);

// ─── Active Effect flag (modifier — bypass/advantage pipeline) ───────────────

/**
 * @param {ActiveEffect} effect
 * @returns {import("./modifier-flag.js").ModifierBlock|null}
 */
export const getModifier = (effect) => readModifier(effect?.flags?.[MODULE_ID]);

export const setModifier = (effect, value) =>
  effect.setFlag(MODULE_ID, FLAGS.modifier, value);

// ─── Actor flags (withdrawal map) ────────────────────────────────────────────

/** @param {Actor} actor @returns {WithdrawalMap} */
export const getActorWithdrawal = (actor) =>
  actor?.getFlag?.(MODULE_ID, FLAGS.withdrawal) ?? {};

/** @param {Actor} actor @param {string} substanceId @returns {WithdrawalEntry|null} */
export const getActorWithdrawalEntry = (actor, substanceId) => {
  const map = getActorWithdrawal(actor);
  return map[substanceId] ?? null;
};

/**
 * @param {Actor} actor
 * @param {string} substanceId
 * @param {WithdrawalEntry} entry
 */
export const setActorWithdrawalEntry = async (actor, substanceId, entry) => {
  const map = { ...getActorWithdrawal(actor), [substanceId]: entry };
  return actor.setFlag(MODULE_ID, FLAGS.withdrawal, map);
};

/** @param {Actor} actor @param {string} substanceId */
export const clearActorWithdrawalEntry = async (actor, substanceId) => {
  const map = { ...getActorWithdrawal(actor) };
  if (!(substanceId in map)) return null;
  delete map[substanceId];
  return actor.setFlag(MODULE_ID, FLAGS.withdrawal, map);
};
