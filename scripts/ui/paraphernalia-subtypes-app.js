/**
 * Paraphernalia Subtype Manager — ApplicationV2 form attached to the world
 * setting `customParaphernaliaSubtypes` via `game.settings.registerMenu`.
 * Reads the composed list from `getEffectiveParaphernaliaSubtypes()` so
 * built-ins render alongside (but distinct from) GM-managed customs.
 *
 * UX: chip-cloud with built-ins as locked chips and customs as removable
 * chips. A persistent input row + Add button below the cloud appends new
 * customs (validating before commit); Save writes the final list and closes.
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
      addChip: ParaphernaliaSubtypesApp._onAddChip,
      removeChip: ParaphernaliaSubtypesApp._onRemoveChip,
    },
  };

  static PARTS = {
    form: { template: TEMPLATE },
  };

  /**
   * In-flight custom list. Null until the user makes any edit, after which it
   * shadows the persisted setting until Save (or close-without-save discards).
   * @type {Array<{ id: string, label: string }> | null}
   */
  _pending = null;

  /** @returns {Array<{ id: string, label: string }>} */
  _currentCustoms() {
    return this._pending ?? readCustomParaphernaliaSubtypes();
  }

  /** @override */
  async _prepareContext() {
    const customs = this._currentCustoms();
    const composed = getEffectiveParaphernaliaSubtypes({ custom: customs });
    const builtins = composed
      .filter((s) => s.source === "builtin")
      .map((s) => ({ id: s.id, label: L(s.labelKey) }));
    return {
      builtins,
      customs: customs.map((c) => ({ id: c.id ?? "", label: c.label ?? "" })),
      labels: {
        intro: L("FISHUT.ParaphernaliaManager.Intro"),
        emptyHint: L("FISHUT.ParaphernaliaManager.EmptyHint"),
        addRow: L("FISHUT.ParaphernaliaManager.AddRow"),
        removeRow: L("FISHUT.ParaphernaliaManager.RemoveRow"),
        readOnlyTooltip: L("FISHUT.ParaphernaliaManager.ReadOnlyMarker"),
        idPlaceholder: L("FISHUT.ParaphernaliaManager.IdPlaceholder"),
        labelPlaceholder: L("FISHUT.ParaphernaliaManager.LabelPlaceholder"),
        save: L("FISHUT.ParaphernaliaManager.Save"),
      },
    };
  }

  static async _onAddChip(_event, _target) {
    const form = this.element;
    if (!form) return;
    const idInput = form.querySelector('[name="newId"]');
    const labelInput = form.querySelector('[name="newLabel"]');
    const id = String(idInput?.value ?? "").trim();
    const labelRaw = String(labelInput?.value ?? "").trim();
    if (!id) {
      ui?.notifications?.error?.(L("FISHUT.ParaphernaliaManager.Error.MissingId", { index: "" }));
      return;
    }
    const proposed = [...this._currentCustoms(), { id, label: labelRaw || id }];
    const validation = validateCustomParaphernaliaSubtypes(proposed);
    if (!validation.valid) {
      const newEntryErrors = validation.errors.filter((e) => e.index === proposed.length - 1);
      const errors = newEntryErrors.length > 0 ? newEntryErrors : validation.errors;
      const messages = errors.map((e) => L(errorMessageKey(e.code), { index: e.index + 1 }));
      ui?.notifications?.error?.(messages.join("\n"));
      return;
    }
    this._pending = proposed;
    await this.render({ force: false });
  }

  static async _onRemoveChip(_event, target) {
    const id = target?.dataset?.id;
    if (!id) return;
    const filtered = this._currentCustoms().filter((c) => c.id !== id);
    this._pending = filtered;
    await this.render({ force: false });
  }

  static async _onSubmit(_event, _form, _formData) {
    const customs = this._currentCustoms();
    const trimmed = customs.map((r) => ({
      id: String(r.id ?? "").trim(),
      label: String(r.label ?? "").trim(),
    }));
    const validation = validateCustomParaphernaliaSubtypes(trimmed);
    if (!validation.valid) {
      const messages = validation.errors.map((e) =>
        L(errorMessageKey(e.code), { index: e.index + 1 }),
      );
      ui?.notifications?.error?.(messages.join("\n"));
      this._pending = trimmed;
      throw new Error("paraphernalia subtype validation failed");
    }
    await game.settings.set(MODULE_ID, CUSTOM_SETTING_KEY, trimmed);
    this._pending = null;
    logger.log(
      `paraphernalia subtype manager wrote ${trimmed.length} custom entr${
        trimmed.length === 1 ? "y" : "ies"
      } (${SCHEMA.paraphernaliaSubtypes?.length ?? 0} built-ins)`,
    );
    ui?.notifications?.info?.(L("FISHUT.ParaphernaliaManager.Saved"));
  }
}
