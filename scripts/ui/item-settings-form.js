import { MODULE_ID, FLAGS, SCHEMA } from "../config.js";
import { logger } from "../logger.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/item-settings-form.hbs`;
const HEADER_ACTION = "fishut-substance-settings";
const ELIGIBLE_ITEM_TYPES = new Set(["consumable", "equipment"]);

/**
 * ApplicationV2 form for editing the module's item flags. Bound to a single
 * Item document; opened via the 3-dot header menu on the dnd5e item sheet.
 *
 * Draft model:
 *  - `#draft` mirrors the persisted flag block but adds UI-only fields (e.g.
 *    `addictionSaveBypass.enabled`, comma-joined `tagsText`). Treat it as the
 *    single source of truth while the form is open.
 *  - `_prepareContext()` renders from the draft.
 *  - Plain inputs sync DOM → draft on every change via `_onChangeForm`.
 *  - Action buttons (add/remove group/row) mutate the draft directly and
 *    call `render()`.
 *  - Submit serializes the draft into the canonical flag block and writes a
 *    single `item.update({ flags.<MODULE_ID>: <block> })`.
 */
export class ItemSubstanceSettings extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: "fishut-item-settings-{id}",
    classes: ["fishut", "fishut-item-settings"],
    tag: "form",
    window: { icon: "fa-solid fa-flask", contentClasses: ["standard-form"] },
    position: { width: 560, height: "auto" },
    form: {
      handler: ItemSubstanceSettings._onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
    actions: {
      "add-required-group": ItemSubstanceSettings._onAddGroup,
      "remove-required-group": ItemSubstanceSettings._onRemoveGroup,
      "add-required-row": ItemSubstanceSettings._onAddRow,
      "remove-required-row": ItemSubstanceSettings._onRemoveRow,
    },
  };

  static PARTS = { form: { template: TEMPLATE } };

  /** @type {Item} */ document;
  /** @type {object} */ #draft;

  constructor(options = {}) {
    super(options);
    this.document = options.document;
    this.#draft = ItemSubstanceSettings.#initDraft(this.document);
  }

  get title() {
    return game.i18n.format("FISHUT.ItemSettings.Title", { item: this.document?.name ?? "" });
  }

  // ─── Context ─────────────────────────────────────────────────────────────

  async _prepareContext() {
    const draft = this.#draft;
    const effects = Array.from(this.document?.effects ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      requiresDae: e.flags?.[MODULE_ID]?.requiresDae === true,
    }));
    return {
      draft,
      effects,
      kinds: SCHEMA.kinds,
      categories: SCHEMA.categories,
      settings: SCHEMA.settings,
      administrations: SCHEMA.administrations,
      addictionSaveBypassTypes: SCHEMA.addictionSaveBypassTypes,
      isSubstance: draft.kind === "substance",
      isParaphernalia: draft.kind === "paraphernalia",
      showKindSpecific: draft.kind === "substance" || draft.kind === "paraphernalia",
    };
  }

  // ─── Render hooks ────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;
    // Sync on any input change so action handlers see fresh values.
    root.addEventListener("change", this.#onAnyChange);
    root.addEventListener("input", this.#onAnyChange);
  }

  _onClose(options) {
    const root = this.element;
    if (root) {
      root.removeEventListener("change", this.#onAnyChange);
      root.removeEventListener("input", this.#onAnyChange);
    }
    super._onClose?.(options);
  }

  #onAnyChange = (event) => {
    const target = event.target;
    if (!target || !target.name) return;
    this.#syncFromDom();
    if (target.dataset?.fishutRerender) {
      this.render();
    }
  };

  // ─── Action handlers ─────────────────────────────────────────────────────

  static _onAddGroup() {
    this.#syncFromDom();
    this.#draft.requiredParaphernalia.push({ anyOf: [""] });
    this.render();
  }

  static _onRemoveGroup(_event, target) {
    this.#syncFromDom();
    const idx = Number(target.dataset.group);
    if (Number.isInteger(idx)) this.#draft.requiredParaphernalia.splice(idx, 1);
    this.render();
  }

  static _onAddRow(_event, target) {
    this.#syncFromDom();
    const idx = Number(target.dataset.group);
    const group = this.#draft.requiredParaphernalia[idx];
    if (group) group.anyOf.push("");
    this.render();
  }

  static _onRemoveRow(_event, target) {
    this.#syncFromDom();
    const gIdx = Number(target.dataset.group);
    const rIdx = Number(target.dataset.row);
    const group = this.#draft.requiredParaphernalia[gIdx];
    if (group && Number.isInteger(rIdx)) group.anyOf.splice(rIdx, 1);
    this.render();
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

  static async _onSubmit(_event, _form, _formData) {
    this.#syncFromDom();
    const block = ItemSubstanceSettings.#buildFlagBlock(this.#draft);
    const update = { [`flags.${MODULE_ID}`]: block };

    // Per-AE requiresDae (write each AE individually).
    const aeUpdates = [];
    for (const [effectId, requires] of Object.entries(this.#draft.effectRequiresDae ?? {})) {
      aeUpdates.push({
        _id: effectId,
        [`flags.${MODULE_ID}.${FLAGS.requiresDae}`]: !!requires,
      });
    }

    try {
      await this.document.update(update);
      if (aeUpdates.length) {
        await this.document.updateEmbeddedDocuments("ActiveEffect", aeUpdates);
      }
    } catch (err) {
      logger.error("ItemSubstanceSettings submit failed", err);
      ui.notifications?.error("Failed to save item settings — see console.");
    }
  }

  // ─── DOM → draft sync ────────────────────────────────────────────────────

  #syncFromDom() {
    const form = this.element;
    if (!form) return;
    const draft = this.#draft;

    // Plain scalar fields.
    const scalar = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
    draft.kind = scalar("kind") || null;
    draft.setting = scalar("setting") || null;
    draft.category = scalar("category") || null;
    draft.administration = scalar("administration") || null;
    draft.paraphernaliaId = scalar("paraphernaliaId") || null;
    draft.tagsText = scalar("tags") ?? "";

    draft.addiction.save.ability = scalar("addiction.save.ability") || "con";
    draft.addiction.save.dc = parseIntOrNull(scalar("addiction.save.dc"));
    draft.addiction.withdrawalMod = parseIntOrNull(scalar("addiction.withdrawalMod"));
    draft.addiction.addictionEffectId = scalar("addiction.addictionEffectId") || null;

    draft.addictionSaveBypass.enabled =
      form.querySelector('[name="addictionSaveBypass.enabled"]')?.checked === true;
    draft.addictionSaveBypass.type = scalar("addictionSaveBypass.type") || "auto-pass";
    draft.addictionSaveBypass.usesPerDay = scalar("addictionSaveBypass.usesPerDay") || "";

    // appliesTo: collect checked admin ids.
    const applies = [];
    for (const admin of SCHEMA.administrations) {
      const cb = form.querySelector(`[name="addictionSaveBypass.appliesTo.${admin.id}"]`);
      if (cb?.checked) applies.push(admin.id);
    }
    draft.addictionSaveBypass.appliesTo = applies;

    // requiredParaphernalia: harvest by name pattern.
    const groups = draft.requiredParaphernalia ?? [];
    for (let g = 0; g < groups.length; g++) {
      const refs = groups[g].anyOf ?? [];
      for (let r = 0; r < refs.length; r++) {
        const v = scalar(`requiredParaphernalia.${g}.${r}`);
        groups[g].anyOf[r] = v;
      }
    }

    // Per-AE requiresDae overrides.
    draft.effectRequiresDae = {};
    for (const eff of this.document?.effects ?? []) {
      const cb = form.querySelector(`[name="effectRequiresDae.${eff.id}"]`);
      if (cb) draft.effectRequiresDae[eff.id] = cb.checked === true;
    }
  }

  // ─── Draft init / build ──────────────────────────────────────────────────

  static #initDraft(item) {
    const flags = item?.flags?.[MODULE_ID] ?? {};
    const addiction = flags[FLAGS.addiction] ?? {};
    const bypass = flags[FLAGS.addictionSaveBypass] ?? null;
    const tags = Array.isArray(flags[FLAGS.tags]) ? flags[FLAGS.tags] : [];
    const groups = Array.isArray(flags[FLAGS.requiredParaphernalia])
      ? flags[FLAGS.requiredParaphernalia].map((g) => ({ anyOf: [...(g?.anyOf ?? [])] }))
      : [];

    return {
      kind: flags[FLAGS.kind] ?? null,
      setting: flags[FLAGS.setting] ?? null,
      category: flags[FLAGS.category] ?? null,
      administration: flags[FLAGS.administration] ?? null,
      paraphernaliaId: flags[FLAGS.paraphernaliaId] ?? null,
      tagsText: tags.join(", "),
      requiredParaphernalia: groups,
      addiction: {
        save: {
          ability: addiction?.save?.ability ?? "con",
          dc: Number.isFinite(addiction?.save?.dc) ? addiction.save.dc : null,
        },
        withdrawalMod: Number.isFinite(addiction?.withdrawalMod) ? addiction.withdrawalMod : null,
        addictionEffectId: addiction?.addictionEffectId ?? null,
      },
      addictionSaveBypass: {
        enabled: !!bypass,
        type: bypass?.type ?? "auto-pass",
        appliesTo: Array.isArray(bypass?.appliesTo) ? [...bypass.appliesTo] : [],
        usesPerDay: bypass?.usesPerDay != null ? String(bypass.usesPerDay) : "",
      },
      effectRequiresDae: {},
    };
  }

  /**
   * Convert draft → canonical flag block. Drops fields that don't apply to
   * the current `kind` and prunes empty rows/groups.
   */
  static #buildFlagBlock(draft) {
    const block = {};
    if (!draft.kind) return block;

    block[FLAGS.kind] = draft.kind;
    if (draft.setting) block[FLAGS.setting] = draft.setting;

    const tags = parseTagsText(draft.tagsText);
    if (tags.length) block[FLAGS.tags] = tags;

    block[FLAGS.schemaVersion] = 2;

    if (draft.kind === "substance") {
      if (draft.category) block[FLAGS.category] = draft.category;
      if (draft.administration) block[FLAGS.administration] = draft.administration;

      const groups = (draft.requiredParaphernalia ?? [])
        .map((g) => ({ anyOf: (g.anyOf ?? []).map((s) => s.trim()).filter(Boolean) }))
        .filter((g) => g.anyOf.length > 0);
      if (groups.length) block[FLAGS.requiredParaphernalia] = groups;

      const addiction = {};
      const ability = (draft.addiction.save.ability ?? "con").trim() || "con";
      const dc = draft.addiction.save.dc;
      if (Number.isFinite(dc)) addiction.save = { ability, dc };
      if (Number.isFinite(draft.addiction.withdrawalMod)) {
        addiction.withdrawalMod = draft.addiction.withdrawalMod;
      }
      if (draft.addiction.addictionEffectId) {
        addiction.addictionEffectId = draft.addiction.addictionEffectId;
      }
      if (Object.keys(addiction).length) block[FLAGS.addiction] = addiction;
    } else if (draft.kind === "paraphernalia") {
      if (draft.paraphernaliaId) block[FLAGS.paraphernaliaId] = draft.paraphernaliaId.trim();

      if (draft.addictionSaveBypass?.enabled) {
        const bypass = {
          type: draft.addictionSaveBypass.type || "auto-pass",
          appliesTo: [...(draft.addictionSaveBypass.appliesTo ?? [])],
          usesPerDay: coerceUsesPerDay(draft.addictionSaveBypass.usesPerDay),
        };
        block[FLAGS.addictionSaveBypass] = bypass;
      }
    }

    return block;
  }
}

function parseIntOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseTagsText(text) {
  if (typeof text !== "string") return [];
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function coerceUsesPerDay(text) {
  if (text == null) return 0;
  const trimmed = String(text).trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : trimmed;
}

// ─── 3-dot menu integration ──────────────────────────────────────────────────

/**
 * Adds a "Substance/Paraphernalia" entry to the dnd5e item sheet's header
 * controls. The generic ApplicationV2 hook gives us a stable surface — we
 * gate on the document being an Item of an eligible type.
 */
export function registerItemSettingsForm() {
  // Register Handlebars helpers used by the template.
  registerHelpersOnce();

  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const doc = app?.document;
    if (!doc || doc.documentName !== "Item") return;
    if (!ELIGIBLE_ITEM_TYPES.has(doc.type)) return;
    if (controls.some((c) => c.action === HEADER_ACTION)) return;

    controls.push({
      action: HEADER_ACTION,
      icon: "fa-solid fa-flask",
      label: game.i18n.localize("FISHUT.ItemSettings.MenuLabel"),
      visible: true,
      onClick: () => openFor(doc),
      ownership: "OWNER",
    });
  });
}

export function openFor(item) {
  if (!item) return null;
  const app = new ItemSubstanceSettings({ document: item });
  app.render(true);
  return app;
}

let helpersRegistered = false;
function registerHelpersOnce() {
  if (helpersRegistered) return;
  const H = globalThis.Handlebars;
  if (!H) return;
  if (!H.helpers.eq) H.registerHelper("eq", (a, b) => a === b);
  if (!H.helpers.add) H.registerHelper("add", (a, b) => Number(a) + Number(b));
  if (!H.helpers.includes)
    H.registerHelper("includes", (haystack, needle) =>
      Array.isArray(haystack) ? haystack.includes(needle) : false,
    );
  helpersRegistered = true;
}
