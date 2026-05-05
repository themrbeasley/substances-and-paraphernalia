import { MODULE_ID, FLAGS } from "../config.js";

/**
 * @typedef {"substance" | "paraphernalia"} Kind
 * @typedef {"stimulant" | "mindAltering" | "performanceEnhancing"} Category
 * @typedef {"fantasy" | "sciFi" | "modern"} Setting
 * @typedef {{ anyOf: string[] }} ParaphernaliaGroup
 *   A single requirement group. The substance is satisfied for this group if
 *   the actor possesses ANY one of the referenced paraphernalia. Multiple
 *   groups in `requiredParaphernalia` are AND-combined.
 *
 * @typedef {Object} FishutFlags
 * @property {Kind} kind
 * @property {Category} [category]
 * @property {Setting} [setting]
 * @property {string[]} [tags]
 * @property {string} [paraphernaliaId]            Only set when kind === "paraphernalia".
 * @property {ParaphernaliaGroup[]} [requiredParaphernalia]  Only set when kind === "substance".
 * @property {boolean} [requiresDae]
 * @property {number} [schemaVersion]
 */

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

/** @param {Item} item */ export const requiresDae = (item) =>
  item?.getFlag?.(MODULE_ID, FLAGS.requiresDae) === true;

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
