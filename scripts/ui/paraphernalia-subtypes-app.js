/**
 * Paraphernalia Subtype Manager — ApplicationV2 form attached to the world
 * setting `customParaphernaliaSubtypes` via `game.settings.registerMenu`.
 * Reads the composed list from `getEffectiveParaphernaliaSubtypes()` so
 * built-ins render alongside (but distinct from) GM-managed customs.
 */

import { MODULE_ID, SCHEMA } from "../config.js";
import {
  CUSTOM_SETTING_KEY,
  getEffectiveParaphernaliaSubtypes,
  readCustomParaphernaliaSubtypes,
  validateCustomParaphernaliaSubtypes,
} from "../data/paraphernalia-subtypes.js";
import { logger } from "../logger.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/paraphernalia-subtypes-app.hbs`;

function L(key, args) {
  if (typeof game === "undefined" || !game?.i18n) return key;
  return args ? game.i18n.format(key, args) : game.i18n.localize(key);
}

const errorMessageKey = (code) =>
  ({
    missingId: "FISHUT.ParaphernaliaManager.Error.MissingId",
    notKebab: "FISHUT.ParaphernaliaManager.Error.NotKebab",
    collidesWithBuiltin: "FISHUT.ParaphernaliaManager.Error.CollidesWithBuiltin",
    duplicate: "FISHUT.ParaphernaliaManager.Error.Duplicate",
  })[code] ?? "FISHUT.ParaphernaliaManager.Error.Generic";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry?.applications?.api ?? {};

/** Construction is gated to inside a live Foundry world (Application API present). */
export class ParaphernaliaSubtypesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fishut-paraphernalia-subtypes",
    classes: ["fishut", "paraphernalia-subtypes"],
    tag: "form",
    window: {
      title: "FISHUT.Settings.ManageParaphernaliaSubtypes.Name",
      icon: "fa-solid fa-prescription-bottle-medical",
      contentClasses: ["standard-form"],
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: ParaphernaliaSubtypesApp._onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
    actions: {
      addRow: ParaphernaliaSubtypesApp._onAddRow,
      removeRow: ParaphernaliaSubtypesApp._onRemoveRow,
    },
  };

  static PARTS = {
    form: { template: TEMPLATE },
  };

  /** @type {Array<{ id: string, label: string }>} */
  #pending = null;

  /** @override */
  async _prepareContext() {
    const customs = this.#pending ?? readCustomParaphernaliaSubtypes();
    const composed = getEffectiveParaphernaliaSubtypes({ custom: customs });
    const builtins = composed
      .filter((s) => s.source === "builtin")
      .map((s) => ({ id: s.id, label: L(s.labelKey) }));
    return {
      builtins,
      customs: customs.map((c) => ({ id: c.id ?? "", label: c.label ?? "" })),
      labels: {
        intro: L("FISHUT.ParaphernaliaManager.Intro"),
        builtinsHeader: L("FISHUT.ParaphernaliaManager.BuiltinsHeader"),
        customsHeader: L("FISHUT.ParaphernaliaManager.CustomsHeader"),
        emptyHint: L("FISHUT.ParaphernaliaManager.EmptyHint"),
        addRow: L("FISHUT.ParaphernaliaManager.AddRow"),
        removeRow: L("FISHUT.ParaphernaliaManager.RemoveRow"),
        readOnlyMarker: L("FISHUT.ParaphernaliaManager.ReadOnlyMarker"),
        idPlaceholder: L("FISHUT.ParaphernaliaManager.IdPlaceholder"),
        labelPlaceholder: L("FISHUT.ParaphernaliaManager.LabelPlaceholder"),
        save: L("FISHUT.ParaphernaliaManager.Save"),
      },
    };
  }

  /**
   * Read the current row inputs out of the live form before re-rendering or
   * submitting. ApplicationV2 forms hand this back as a flat object — we
   * regroup it back into an array using the indexed `customs.<i>.<key>` names.
   * @returns {Array<{ id: string, label: string }>}
   */
  _readFormRows() {
    const form = this.element;
    if (!form) return [];
    const fd = new foundry.applications.ux.FormDataExtended(form).object;
    return collectRows(fd);
  }

  static async _onAddRow(_event, _target) {
    const rows = this._readFormRows();
    rows.push({ id: "", label: "" });
    this.#pending = rows;
    await this.render({ force: false });
  }

  static async _onRemoveRow(event, target) {
    const index = Number(target?.dataset?.index ?? -1);
    if (!Number.isInteger(index) || index < 0) return;
    const rows = this._readFormRows();
    if (index >= rows.length) return;
    rows.splice(index, 1);
    this.#pending = rows;
    await this.render({ force: false });
  }

  static async _onSubmit(_event, _form, formData) {
    const proposed = collectRows(formData?.object ?? {});
    const trimmed = proposed.map((r) => ({
      id: String(r.id ?? "").trim(),
      label: String(r.label ?? "").trim(),
    }));
    const validation = validateCustomParaphernaliaSubtypes(trimmed);
    if (!validation.valid) {
      const messages = validation.errors.map((e) =>
        L(errorMessageKey(e.code), { index: e.index + 1 }),
      );
      ui?.notifications?.error?.(messages.join("\n"));
      this.#pending = trimmed;
      await this.render({ force: false });
      throw new Error("paraphernalia subtype validation failed");
    }
    await game.settings.set(MODULE_ID, CUSTOM_SETTING_KEY, trimmed);
    this.#pending = null;
    logger.log(
      `paraphernalia subtype manager wrote ${trimmed.length} custom entr${
        trimmed.length === 1 ? "y" : "ies"
      } (${SCHEMA.paraphernaliaSubtypes?.length ?? 0} built-ins)`,
    );
    ui?.notifications?.info?.(L("FISHUT.ParaphernaliaManager.Saved"));
  }
}

/**
 * Reshape the flat `customs.0.id`, `customs.0.label`, `customs.1.id`… form
 * payload back into an ordered array. Resilient to gaps left by mid-edit
 * removals (we densify on read).
 */
function collectRows(flat) {
  const rows = [];
  for (const [key, value] of Object.entries(flat ?? {})) {
    const m = /^customs\.(\d+)\.(id|label)$/.exec(key);
    if (!m) continue;
    const idx = Number(m[1]);
    const which = m[2];
    rows[idx] ??= { id: "", label: "" };
    rows[idx][which] = value ?? "";
  }
  return rows.filter(Boolean);
}
