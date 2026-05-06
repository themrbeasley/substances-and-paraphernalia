import { MODULE_ID, FLAGS } from "../config.js";

/**
 * @typedef {"substance" | "paraphernalia"} Kind
 * @typedef {"stimulant" | "mindAltering" | "performanceEnhancing"} Category
 * @typedef {"fantasy" | "sciFi" | "modern"} Setting
 * @typedef {"inhaled" | "ingested" | "injected" | "sublingual" | "topical"} Administration
 * @typedef {{ anyOf: string[] }} ParaphernaliaGroup
 *   A single requirement group. The substance is satisfied for this group if
 *   the actor possesses ANY one of the referenced paraphernalia. Multiple
 *   groups in `requiredParaphernalia` are AND-combined.
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
 * @property {string[]} [tags]
 * @property {string} [paraphernaliaId]            Only set when kind === "paraphernalia".
 * @property {ParaphernaliaGroup[]} [requiredParaphernalia]  Only set when kind === "substance".
 * @property {Administration} [administration]     Only set when kind === "substance".
 * @property {AddictionBlock} [addiction]          Only set when kind === "substance".
 * @property {AddictionSaveBypassBlock} [addictionSaveBypass] Only set when kind === "paraphernalia".
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

/** @param {Item} item */ export const getTags = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.tags) ?? [];

/** @param {Item} item */ export const getParaphernaliaId = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.paraphernaliaId) ?? null;

/** @param {Item} item */ export const getRequiredParaphernalia = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.requiredParaphernalia) ?? [];

/** @param {Item} item */ export const isSubstance = (item) => getKind(item) === "substance";

/** @param {Item} item */ export const isParaphernalia = (item) =>
  getKind(item) === "paraphernalia";

export const setKind = (item, value) => item.setFlag(MODULE_ID, FLAGS.kind, value);
export const setCategory = (item, value) => item.setFlag(MODULE_ID, FLAGS.category, value);
export const setSetting = (item, value) => item.setFlag(MODULE_ID, FLAGS.setting, value);
export const setTags = (item, value) => item.setFlag(MODULE_ID, FLAGS.tags, value);
export const setParaphernaliaId = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.paraphernaliaId, value);
export const setRequiredParaphernalia = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.requiredParaphernalia, value);

// ─── Substance flags (administration + addiction) ────────────────────────────

/** @param {Item} item @returns {Administration|null} */
export const getAdministration = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.administration) ?? null;

export const setAdministration = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.administration, value);

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
