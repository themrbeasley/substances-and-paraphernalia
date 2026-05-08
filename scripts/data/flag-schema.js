import { MODULE_ID, FLAGS } from "../config.js";
import {
  readModifier,
  readModifierFromChanges,
  mergeModifierIntoChanges,
} from "./modifier-flag.js";

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
 * @property {boolean} [enabled]   Defaults to true when omitted; false disables
 *   the post-use addiction save (and AE application) entirely.
 * @property {AddictionSave} save
 * @property {string} [addictionEffectId]
 *   The `_id` of the {Substance} Addiction AE on the substance item, cloned
 *   onto the actor when the addiction save fails.
 *
 * @typedef {Object} WithdrawalBlock
 * @property {boolean} [enabled]   Defaults to true when omitted; false skips
 *   withdrawal AE application and actor-flag bookkeeping on save fail (the
 *   addiction AE persists with no rest-tick countdown).
 * @property {number} [mod]        Positive integer; floor of withdrawal
 *   duration is `ceil(mod / 2)` long rests.
 * @property {string} [effectId]   `_id` of a withdrawal AE template on the
 *   same item; the long-rest tick clones it onto the actor when withdrawal
 *   applies. If unset, falls back to the v0.3 default behavior.
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

/**
 * Whether the post-use addiction save runs at all. Undefined defaults to true
 * so legacy items without the flag continue to behave as before.
 * @param {Item} item @returns {boolean}
 */
export const getAddictionEnabled = (item) => getAddiction(item)?.enabled !== false;

export const setAddictionEnabled = (item, value) => {
  const block = getAddiction(item) ?? {};
  return setAddiction(item, { ...block, enabled: !!value });
};

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

/** @param {Item} item */ export const getAddictionEffectId = (item) =>
  getAddiction(item)?.addictionEffectId ?? null;

export const setAddictionEffectId = (item, value) => {
  const block = getAddiction(item) ?? {};
  return setAddiction(item, { ...block, addictionEffectId: value });
};

// ─── Substance flags (withdrawal block, item-level) ──────────────────────────

/**
 * Item-level withdrawal block. Distinct from the actor-level `flags.withdrawal`
 * map (`WithdrawalMap`); Foundry namespaces flags per document so a substance
 * item's `withdrawal` is the authored block while an actor's `withdrawal` is
 * the runtime per-substance entry map.
 * @param {Item} item @returns {WithdrawalBlock|null}
 */
export const getWithdrawal = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.withdrawal) ?? null;

export const setWithdrawal = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.withdrawal, value);

/**
 * Whether withdrawal AE application + actor-flag bookkeeping runs on save fail.
 * Undefined defaults to true.
 * @param {Item} item @returns {boolean}
 */
export const getWithdrawalEnabled = (item) => getWithdrawal(item)?.enabled !== false;

export const setWithdrawalEnabled = (item, value) => {
  const block = getWithdrawal(item) ?? {};
  return setWithdrawal(item, { ...block, enabled: !!value });
};

/** @param {Item} item */ export const getWithdrawalMod = (item) =>
  getWithdrawal(item)?.mod ?? null;

export const setWithdrawalMod = (item, value) => {
  const block = getWithdrawal(item) ?? {};
  return setWithdrawal(item, { ...block, mod: value });
};

/**
 * Item-level pointer to a withdrawal AE template that lives on the same item.
 * The long-rest tick clones this AE onto the actor when withdrawal applies; if
 * unset, falls back to the v0.3 default behavior.
 * @param {Item} item @returns {string|null}
 */
export const getWithdrawalEffectId = (item) => getWithdrawal(item)?.effectId ?? null;

export const setWithdrawalEffectId = (item, value) => {
  const block = getWithdrawal(item) ?? {};
  return setWithdrawal(item, { ...block, effectId: value });
};

// ─── Substance flags (overdose) ──────────────────────────────────────────────

/**
 * @typedef {Object} OverdoseBlock
 * @property {boolean} enabled
 * @property {number}  chancePercent  Integer 1–100; per-consumption d100 chance.
 * @property {string}  description    Free-text shown in the chat card on hit.
 * @property {string}  [effectId]     `_id` of an overdose marker AE template on
 *   the same item; cloned onto the actor when overdose fires. If unset, a
 *   minimal marker AE is built inline.
 */

/** @param {Item} item @returns {OverdoseBlock|null} */
export const getOverdose = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.overdose) ?? null;

export const setOverdose = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.overdose, value);

/** @param {Item} item @returns {string|null} */
export const getOverdoseEffectId = (item) => getOverdose(item)?.effectId ?? null;

export const setOverdoseEffectId = (item, value) => {
  const block = getOverdose(item) ?? {};
  return setOverdose(item, { ...block, effectId: value });
};

// ─── Substance flags (tolerance) ─────────────────────────────────────────────

/**
 * @typedef {Object} ToleranceBlock
 * @property {boolean} [enabled]   Defaults to true when omitted; false skips
 *   the auto-stack on save pass.
 * @property {string}  [effectId]  `_id` of a tolerance AE template on the same
 *   item; cloned onto the actor (with `flags.stacks: 1`) on the first save
 *   pass. If unset, falls back to the built-in default tolerance template
 *   discovered via name regex.
 */

/** @param {Item} item @returns {ToleranceBlock|null} */
export const getTolerance = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.tolerance) ?? null;

export const setTolerance = (item, value) =>
  item.setFlag(MODULE_ID, FLAGS.tolerance, value);

/**
 * Whether tolerance auto-stacking runs on save pass. Undefined defaults to true.
 * @param {Item} item @returns {boolean}
 */
export const getToleranceEnabled = (item) => getTolerance(item)?.enabled !== false;

export const setToleranceEnabled = (item, value) => {
  const block = getTolerance(item) ?? {};
  return setTolerance(item, { ...block, enabled: !!value });
};

/** @param {Item} item @returns {string|null} */
export const getToleranceEffectId = (item) => getTolerance(item)?.effectId ?? null;

export const setToleranceEffectId = (item, value) => {
  const block = getTolerance(item) ?? {};
  return setTolerance(item, { ...block, effectId: value });
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

// ─── Active Effect modifier block (stored as Change rows) ────────────────────

/**
 * Read the modifier block from an AE.
 *
 * v0.4 canonical storage is `effect.changes[]` rows whose key starts with
 * `flags.<scope>.modifier.` so the standard Foundry "Changes" tab is the
 * editable surface. Falls back to the legacy `effect.flags.<scope>.modifier`
 * shape so pre-v0.4 authored content (and Quench fixtures that haven't been
 * migrated) keep working.
 *
 * @param {ActiveEffect} effect
 * @returns {import("./modifier-flag.js").ModifierBlock|null}
 */
export const getModifier = (effect) => {
  if (!effect) return null;
  const fromChanges = readModifierFromChanges(effect.changes, MODULE_ID);
  if (fromChanges) return fromChanges;
  return readModifier(effect.flags?.[MODULE_ID]);
};

/**
 * Write the modifier block to an AE's `changes[]` array, preserving any
 * non-modifier rows the GM authored alongside it.
 *
 * @param {ActiveEffect} effect
 * @param {import("./modifier-flag.js").ModifierBlock} value
 */
export const setModifier = (effect, value) => {
  const changes = mergeModifierIntoChanges(effect?.changes, value, MODULE_ID);
  return effect.update({ changes });
};

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
