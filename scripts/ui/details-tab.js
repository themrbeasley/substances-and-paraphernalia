import { MODULE_ID, FLAGS, SCHEMA } from "../config.js";
import {
  getKind,
  getCategory,
  getAddictionEnabled,
  getAddictionSave,
  getAddictionEffectId,
  getWithdrawalEnabled,
  getWithdrawalMod,
  getWithdrawalEffectId,
  getOverdose,
  getRequiredSubtypes,
  getSubtype,
  getModifier,
  setKind,
  setCategory,
  setAddictionEnabled,
  setAddictionSave,
  setAddictionEffectId,
  setWithdrawalEnabled,
  setWithdrawalMod,
  setWithdrawalEffectId,
  setOverdose,
  setRequiredSubtypes,
  setSubtype,
  setModifier,
} from "../data/flag-schema.js";
import { getEffectiveParaphernaliaSubtypes } from "../data/paraphernalia-subtypes.js";
import { logger } from "../logger.js";

const SECTION_TEMPLATE = `modules/${MODULE_ID}/templates/details-tab/section.hbs`;
const SUBSTANCE_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/substance-fields.hbs`;
const PARAPHERNALIA_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/paraphernalia-fields.hbs`;
const BYPASS_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/bypass-section.hbs`;
const ELIGIBLE_ITEM_TYPES = new Set(["consumable", "equipment"]);
const KIND_BY_ITEM_TYPE = { consumable: "substance", equipment: "paraphernalia" };
const INJECTED_MARKER = "data-fishut-details-injected";
const TOGGLE_MARKER = "data-fishut-toggle-injected";

// Hook: dnd5e 5.2.5 item sheets are ApplicationV2; the generic V2 render hook
// fires once the rendered HTMLElement is in place, with payload
// `(app, htmlElement, context, options)`. We gate on `app.document` being an
// Item of an eligible type (consumable | equipment) whose kind flag is
// substance or paraphernalia, and locate the Details *panel* via
// `section.tab[data-tab="details"]` — the nav button (`<a data-tab="details">`)
// has the same data-tab and would otherwise win `querySelector` first-match.
// V1 sheets (`renderItemSheet5e`) are not back-supported.
export function registerDetailsTab() {
  Hooks.on("renderApplicationV2", onRenderApplicationV2);
}

// Inject the master "Illicit Substance" / "Paraphernalia" checkbox alongside
// dnd5e's Properties checkboxes (Magical / Adamantine / Stealth Disadvantage
// for equipment; Magical for consumable). dnd5e 5.2 wraps those in a
// `<dnd5e-checkbox-group>` web component, so we target that first. If the
// markup shifts, fall back to a `<div>` (NOT a fieldset) so the authoring-
// section anchor below isn't fooled into placing itself relative to our own
// fallback wrapper.
function injectKindToggle(detailsTab, item) {
  if (detailsTab.querySelector(`[${TOGGLE_MARKER}]`)) return;

  const intendedKind = KIND_BY_ITEM_TYPE[item.type];
  if (!intendedKind) return;
  const isEnabled = getKind(item) === intendedKind;

  const labelText =
    intendedKind === "substance"
      ? L("FISHUT.DetailsTab.Toggle.Substance")
      : L("FISHUT.DetailsTab.Toggle.Paraphernalia");

  const wrapper = document.createElement("label");
  wrapper.setAttribute(TOGGLE_MARKER, "");
  wrapper.classList.add("checkbox", "fishut-kind-toggle");
  // Use dnd5e's <dnd5e-checkbox> web component so the box renders with the
  // same shadow-DOM styling as the sibling Magical / Adamantine / etc.
  // checkboxes. Falls back to a native input if the component isn't defined
  // (older dnd5e or non-V2 sheet).
  const useWebComponent =
    typeof window !== "undefined" &&
    window.customElements?.get("dnd5e-checkbox");
  const input = document.createElement(
    useWebComponent ? "dnd5e-checkbox" : "input",
  );
  if (!useWebComponent) input.type = "checkbox";
  if (isEnabled) input.setAttribute("checked", "");
  input.dataset.fishutKindToggle = intendedKind;
  wrapper.appendChild(input);
  wrapper.appendChild(document.createTextNode(` ${labelText}`));

  input.addEventListener("change", (event) => {
    event.stopPropagation();
    persistKindToggle(item, intendedKind, input.checked === true).catch((err) =>
      logger.error("details-tab kind-toggle failed", err),
    );
  });

  const host = findPropertiesHost(detailsTab);
  if (host) {
    host.appendChild(wrapper);
    return;
  }

  const fallback = document.createElement("div");
  fallback.classList.add("fishut-kind-toggle-fallback");
  fallback.appendChild(wrapper);
  detailsTab.insertBefore(fallback, detailsTab.firstChild);
}

// Locate the dnd5e Item-Properties container so the kind-toggle slots in
// alongside Magical/Adamantine/etc. dnd5e 5.2 emits `<dnd5e-checkbox-group>`
// for the property list; older fallbacks use plain inputs whose name targets
// `system.properties`.
function findPropertiesHost(detailsTab) {
  const ckGroup = detailsTab.querySelector("dnd5e-checkbox-group");
  if (ckGroup) return ckGroup;
  const propInput = detailsTab.querySelector(
    '[name="system.properties"], [name^="system.properties."]',
  );
  return propInput?.closest("fieldset, .form-group") ?? null;
}

/**
 * Toggle the item-level `kind` flag. Exported for Quench coverage.
 * @param {Item} item
 * @param {"substance"|"paraphernalia"} intendedKind
 * @param {boolean} checked
 */
export async function persistKindToggle(item, intendedKind, checked) {
  if (checked) return setKind(item, intendedKind);
  return item.unsetFlag(MODULE_ID, FLAGS.kind);
}

let templatesLoaded = false;
async function ensureTemplates() {
  if (templatesLoaded) return;
  await foundry.applications.handlebars.loadTemplates({
    "fishut-details-substance": SUBSTANCE_PARTIAL,
    "fishut-details-paraphernalia": PARAPHERNALIA_PARTIAL,
    "fishut-details-bypass": BYPASS_PARTIAL,
  });
  templatesLoaded = true;
}

async function onRenderApplicationV2(app, htmlElement) {
  const doc = app?.document;
  if (!doc || doc.documentName !== "Item") return;
  if (!ELIGIBLE_ITEM_TYPES.has(doc.type)) return;

  const detailsTab = htmlElement?.querySelector?.('section.tab[data-tab="details"]');
  if (!detailsTab) return;

  // Toggle checkbox always renders for eligible item types so a fresh item can
  // be marked substance/paraphernalia. The authoring section below only renders
  // when the kind flag is set.
  injectKindToggle(detailsTab, doc);

  const kind = getKind(doc);
  if (kind !== "substance" && kind !== "paraphernalia") return;
  if (detailsTab.querySelector(`[${INJECTED_MARKER}]`)) return;

  try {
    await ensureTemplates();
    const context = {
      kind,
      isSubstance: kind === "substance",
      isParaphernalia: kind === "paraphernalia",
      itemName: doc.name,
      labels: buildLabels(),
      substance: kind === "substance" ? buildSubstanceContext(doc) : null,
      paraphernalia: kind === "paraphernalia" ? buildParaphernaliaContext(doc) : null,
    };
    const html = await foundry.applications.handlebars.renderTemplate(
      SECTION_TEMPLATE,
      context,
    );
    const wrapper = document.createElement("div");
    wrapper.setAttribute(INJECTED_MARKER, "");
    wrapper.innerHTML = html;
    // Insert between the first card (Consumable/Equipment Details) and the
    // next sibling (Usage). Falls back to append if the panel has no cards
    // yet (shouldn't happen for consumable/equipment, but be defensive).
    const firstCard = detailsTab.querySelector(":scope > fieldset");
    if (firstCard?.nextSibling) {
      detailsTab.insertBefore(wrapper, firstCard.nextSibling);
    } else if (firstCard) {
      detailsTab.appendChild(wrapper);
    } else {
      detailsTab.appendChild(wrapper);
    }
    wireDetails(wrapper, doc);
  } catch (err) {
    logger.error("details-tab inject failed", err);
  }
}

// ─── Context builders ──────────────────────────────────────────────────────

// Pre-resolve labels in JS rather than relying on the Handlebars `{{localize}}`
// helper. dnd5e's V2 sheet template scope doesn't expose Foundry's globally-
// registered helpers reliably here — pre-resolving sidesteps that whole
// question and keeps the templates trivial.
function L(key) {
  return game.i18n.localize(key);
}

function buildLabels() {
  return {
    sectionHeader: L("FISHUT.DetailsTab.SectionHeader"),
    category: L("FISHUT.DetailsTab.Field.Category.Label"),
    categoryAny: L("FISHUT.DetailsTab.Field.Category.Any"),
    addictionHeader: L("FISHUT.DetailsTab.Addiction.Header"),
    addictionEnabled: L("FISHUT.DetailsTab.Addiction.Enabled"),
    saveAbility: L("FISHUT.DetailsTab.Field.SaveAbility"),
    saveDc: L("FISHUT.DetailsTab.Field.SaveDc"),
    addictionEffect: L("FISHUT.DetailsTab.Field.AddictionEffect.Label"),
    withdrawalHeader: L("FISHUT.DetailsTab.Withdrawal.Header"),
    withdrawalEnabled: L("FISHUT.DetailsTab.Withdrawal.Enabled"),
    withdrawalMod: L("FISHUT.DetailsTab.Field.WithdrawalMod"),
    withdrawalEffect: L("FISHUT.DetailsTab.Field.WithdrawalEffect.Label"),
    withdrawalEffectTooltip: L("FISHUT.DetailsTab.Field.WithdrawalEffect.Tooltip"),
    overdoseHeader: L("FISHUT.DetailsTab.Overdose.Header"),
    overdoseEnabled: L("FISHUT.DetailsTab.Overdose.Enabled"),
    overdoseChancePercent: L("FISHUT.DetailsTab.Overdose.ChancePercent"),
    overdoseDescription: L("FISHUT.DetailsTab.Overdose.Description"),
    overdoseTooltip: L("FISHUT.DetailsTab.Overdose.Tooltip"),
    subtype: L("FISHUT.DetailsTab.Field.Subtype.Label"),
    subtypeNone: L("FISHUT.DetailsTab.Field.Subtype.None"),
    requiredSubtypes: L("FISHUT.DetailsTab.Field.RequiredSubtypes.Label"),
    requiredSubtypesAdd: L("FISHUT.DetailsTab.Field.RequiredSubtypes.Add"),
    requiredSubtypesEmpty: L("FISHUT.DetailsTab.Field.RequiredSubtypes.Empty"),
    requiredSubtypesRemove: L("FISHUT.DetailsTab.Field.RequiredSubtypes.Remove"),
    bypassHeader: L("FISHUT.DetailsTab.Bypass.Header"),
    bypassNoneHint: L("FISHUT.DetailsTab.Bypass.None.Hint"),
    bypassGrantButton: L("FISHUT.DetailsTab.Bypass.GrantButton"),
    bypassType: L("FISHUT.DetailsTab.Bypass.Type"),
    bypassAppliesTo: L("FISHUT.DetailsTab.Bypass.AppliesTo.Label"),
    bypassUsesPerDay: L("FISHUT.DetailsTab.Bypass.UsesPerDay.Label"),
    bypassUsesPerDayPlaceholder: L("FISHUT.DetailsTab.Bypass.UsesPerDay.Placeholder"),
    bypassBonus: L("FISHUT.DetailsTab.Bypass.Bonus.Label"),
  };
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildSubtypeOptions(currentId) {
  // Composed list = built-ins (read from schema) + GM-managed customs (read
  // from the world setting). Built-ins resolve via labelKey; customs carry
  // their own resolved label.
  const composed = getEffectiveParaphernaliaSubtypes();
  const seeded = composed.map((s) => ({
    id: s.id,
    label: s.source === "builtin" ? L(s.labelKey) : (s.label ?? s.id),
  }));
  const seenIds = new Set(seeded.map((o) => o.id));
  const options = [...seeded];
  // Preserve a saved subtype that's no longer in the composed list (e.g. GM
  // removed a custom after authoring) so re-saving doesn't silently change it.
  if (currentId && !seenIds.has(currentId) && currentId !== "__custom__") {
    options.push({ id: currentId, label: currentId });
    seenIds.add(currentId);
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

function buildSubstanceContext(item) {
  const category = getCategory(item);
  const requiredSubtypeIds = getRequiredSubtypes(item) ?? [];

  const categories = SCHEMA.categories.map((c) => ({
    id: c.id,
    label: L(c.labelKey),
    selected: c.id === category,
  }));

  const subtypeCatalog = buildSubtypeOptions(null);
  const subtypeLabelById = new Map(subtypeCatalog.map((o) => [o.id, o.label]));
  const usedIds = new Set(requiredSubtypeIds);
  const requiredSubtypes = requiredSubtypeIds.map((id, idx) => ({
    idx,
    id,
    label: subtypeLabelById.get(id) ?? id,
  }));
  const subtypeAddOptions = subtypeCatalog
    .filter((o) => !usedIds.has(o.id))
    .map((o) => ({ id: o.id, label: o.label }));

  return {
    categories,
    addiction: buildAddictionContext(item),
    withdrawal: buildWithdrawalContext(item),
    overdose: buildOverdoseContext(item),
    requiredSubtypes,
    subtypeAddOptions,
  };
}

function buildAddictionContext(item) {
  const enabled = getAddictionEnabled(item);
  const save = getAddictionSave(item) ?? { ability: "con", dc: null };
  const addictionEffectId = getAddictionEffectId(item);

  const allEffects = Array.from(item.effects ?? []);
  const noneLabel = L("FISHUT.DetailsTab.Field.AddictionEffect.None");
  const addictionEffectOptions = [
    { id: "", label: noneLabel, selected: !addictionEffectId },
    ...allEffects.map((e) => ({
      id: e.id,
      label: e.name,
      selected: e.id === addictionEffectId,
    })),
  ];

  const currentAbility = save.ability ?? "con";
  const abilityEntries = Object.entries(CONFIG?.DND5E?.abilities ?? {});
  const abilityOptions = abilityEntries.map(([id, entry]) => ({
    id,
    label: entry?.label ? L(entry.label) : id,
    selected: id === currentAbility,
  }));
  // Preserve a saved ability that's no longer in CONFIG (e.g. GM removed a
  // custom ability after authoring) so re-saving doesn't silently change it.
  if (currentAbility && !abilityOptions.some((o) => o.selected)) {
    abilityOptions.unshift({ id: currentAbility, label: currentAbility, selected: true });
  }

  return {
    enabled,
    fieldsDisabled: !enabled,
    save: {
      ability: currentAbility,
      abilityOptions,
      dc: Number.isFinite(save.dc) ? save.dc : "",
    },
    addictionEffectOptions,
  };
}

function buildWithdrawalContext(item) {
  const enabled = getWithdrawalEnabled(item);
  const withdrawalMod = getWithdrawalMod(item);
  const withdrawalEffectId = getWithdrawalEffectId(item);

  const allEffects = Array.from(item.effects ?? []);
  // Withdrawal-effect picker only lists AEs whose name contains "withdraw"
  // (case-insensitive) — same naming contract enforced by validate-content
  // and the long-rest tick. If the saved id no longer matches the contract
  // (e.g. AE renamed), preserve it as a synthetic option so re-saving doesn't
  // silently drop the pointer.
  const withdrawalNoneLabel = L("FISHUT.DetailsTab.Field.WithdrawalEffect.None");
  const withdrawAes = allEffects.filter((e) => /withdraw/i.test(e.name ?? ""));
  const withdrawalEffectOptions = [
    { id: "", label: withdrawalNoneLabel, selected: !withdrawalEffectId },
    ...withdrawAes.map((e) => ({
      id: e.id,
      label: e.name,
      selected: e.id === withdrawalEffectId,
    })),
  ];
  if (
    withdrawalEffectId &&
    !withdrawalEffectOptions.some((o) => o.id === withdrawalEffectId)
  ) {
    const stale = allEffects.find((e) => e.id === withdrawalEffectId);
    withdrawalEffectOptions.push({
      id: withdrawalEffectId,
      label: stale?.name ?? withdrawalEffectId,
      selected: true,
    });
  }

  return {
    enabled,
    fieldsDisabled: !enabled,
    mod: Number.isFinite(withdrawalMod) ? withdrawalMod : "",
    withdrawalEffectOptions,
  };
}

function buildOverdoseContext(item) {
  const block = getOverdose(item) ?? {};
  const enabled = block.enabled === true;
  const rawChance = Number(block.chancePercent);
  // Default to 5% per SPEC.md authoring example. Inert when `enabled` is
  // false but kept in the context so the field doesn't blank when toggled
  // off and re-on.
  const chancePercent = Number.isFinite(rawChance) ? rawChance : 5;
  const description = typeof block.description === "string" ? block.description : "";
  return {
    enabled,
    chancePercent,
    description,
    fieldsDisabled: !enabled,
  };
}

export function buildParaphernaliaContext(item) {
  const subtype = getSubtype(item) ?? "";

  const subtypeOptions = buildSubtypeOptions(subtype);
  const subtypeSelectOptions = subtypeOptions.map((o) => ({
    id: o.id,
    label: o.label,
    selected: o.id === subtype,
  }));

  return {
    subtype,
    subtypeSelectOptions,
    bypass: buildBypassDisplay(findBypassEffect(item)),
  };
}

function findBypassEffect(item) {
  for (const effect of item.effects ?? []) {
    const block = getModifier(effect);
    if (block?.kind === "bypass") return { effect, block };
  }
  return null;
}

function buildBypassDisplay(match) {
  if (!match) return { present: false };
  const { block } = match;
  const currentType = block.type ?? "+N";
  const typeOptions = SCHEMA.modifier.types.map((t) => ({
    id: t.id,
    label: L(t.labelKey),
    selected: t.id === currentType,
  }));

  const appliesToList = Array.isArray(block.appliesTo) ? block.appliesTo : [];
  const appliesToOptions = SCHEMA.administrations.map((a) => ({
    id: a.id,
    label: L(a.labelKey),
    checked: appliesToList.includes(a.id),
  }));

  const usesPerDay = block.usesPerDay;
  const usesPerDayValue =
    usesPerDay === undefined || usesPerDay === null ? "" : String(usesPerDay);

  const isPlusN = currentType === "+N";
  const rawBonus = Number(block.bonus);
  const bonusValue = Number.isFinite(rawBonus) ? String(Math.trunc(rawBonus)) : "";

  return {
    present: true,
    typeOptions,
    appliesToOptions,
    usesPerDayValue,
    isPlusN,
    bonusValue,
  };
}

// ─── Wiring ────────────────────────────────────────────────────────────────

function wireDetails(wrapper, item) {
  wrapper.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const flagField = target.dataset?.fishutFlag;
    if (!flagField) return;
    event.stopPropagation();
    const rawValue = readFieldValue(target);
    persistField(item, flagField, rawValue, target).catch((err) =>
      logger.error("details-tab persistField failed", err),
    );
  });

  wrapper.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-fishut-action]");
    if (!button || !wrapper.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchAction(button, wrapper, item).catch((err) =>
      logger.error("details-tab dispatchAction failed", err),
    );
  });
}

// Read the user-visible value off a form control. Native checkboxes and the
// dnd5e-checkbox web component report state via `.checked`; everything else
// uses `.value`. Boolean values are stringified to "true" / "false" so
// persistField can stay scalar-friendly.
function readFieldValue(target) {
  const isCheckbox =
    target.matches?.("dnd5e-checkbox, input[type='checkbox']") === true;
  if (isCheckbox) return target.checked === true ? "true" : "false";
  return typeof target.value === "string" ? target.value : "";
}

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Persist a single scalar field. Exported for Quench coverage.
 * @param {Item} item
 * @param {string} field  Dotted path: category | addiction.enabled |
 *   save.ability | save.dc | addictionEffectId | withdrawal.enabled |
 *   withdrawal.mod | withdrawal.effectId | subtype | overdose.* | bypass.*
 * @param {string} rawValue
 * @param {HTMLElement} [target]
 *   The form control whose change fired. Required for `bypass.appliesTo`,
 *   which encodes the administration id in `data-fishut-bypass-admin` and
 *   reports a checked/unchecked toggle (not a value).
 */
export async function persistField(item, field, rawValue, target) {
  switch (field) {
    case "category":
      return setCategory(item, rawValue || null);
    case "addiction.enabled":
      return setAddictionEnabled(item, rawValue === "true");
    case "save.ability": {
      const current = getAddictionSave(item) ?? { ability: "con", dc: null };
      const ability = (rawValue || "con").trim() || "con";
      return setAddictionSave(item, { ability, dc: current.dc });
    }
    case "save.dc": {
      const current = getAddictionSave(item) ?? { ability: "con", dc: null };
      return setAddictionSave(item, {
        ability: current.ability ?? "con",
        dc: parseIntOrNull(rawValue),
      });
    }
    case "addictionEffectId":
      return setAddictionEffectId(item, rawValue || null);
    case "withdrawal.enabled":
      return setWithdrawalEnabled(item, rawValue === "true");
    case "withdrawal.mod":
      return setWithdrawalMod(item, parseIntOrNull(rawValue));
    case "withdrawal.effectId":
      return setWithdrawalEffectId(item, rawValue || null);
    case "overdose.enabled":
      return persistOverdoseField(item, "enabled", rawValue === "true");
    case "overdose.chancePercent": {
      const n = parseIntOrNull(rawValue);
      // Validator hard-requires 1..100 when enabled; clamp here so a user
      // typing "0" or "200" doesn't write an out-of-range value.
      const clamped =
        n === null ? null : Math.max(1, Math.min(100, n));
      return persistOverdoseField(item, "chancePercent", clamped);
    }
    case "overdose.description":
      return persistOverdoseField(item, "description", rawValue ?? "");
    case "subtype": {
      const id = (rawValue ?? "").trim();
      if (!id) return setSubtype(item, null);
      if (!KEBAB.test(id)) {
        logger.warn?.("details-tab persistField: subtype must be kebab-case", id);
        return null;
      }
      return setSubtype(item, id);
    }
    case "bypass.type":
      return persistBypassField(item, "type", rawValue || "+N");
    case "bypass.usesPerDay": {
      // Empty string → unset (unlimited). Numbers clamped at 0.
      if (rawValue === "" || rawValue == null) {
        return persistBypassField(item, "usesPerDay", null);
      }
      const n = parseIntOrNull(rawValue);
      const clamped = n === null ? null : Math.max(0, n);
      return persistBypassField(item, "usesPerDay", clamped);
    }
    case "bypass.bonus": {
      if (rawValue === "" || rawValue == null) {
        return persistBypassField(item, "bonus", null);
      }
      return persistBypassField(item, "bonus", parseIntOrNull(rawValue));
    }
    case "bypass.appliesTo": {
      const adminId = target?.dataset?.fishutBypassAdmin;
      if (!adminId) return null;
      const checked = rawValue === "true";
      return persistBypassAppliesTo(item, adminId, checked);
    }
    default:
      logger.warn?.("details-tab persistField: unknown field", field);
      return null;
  }
}

async function dispatchAction(button, wrapper, item) {
  const action = button.dataset.fishutAction;

  if (action === "grant-bypass") {
    return createBypassStubAE(item);
  }
  if (action === "add-required-subtype") {
    const select = wrapper.querySelector('[data-fishut-add-subtype="select"]');
    const id = (select?.value ?? "").trim();
    if (!id) return null;
    const current = getRequiredSubtypes(item) ?? [];
    if (current.includes(id)) return null;
    return setRequiredSubtypes(item, [...current, id]);
  }
  if (action === "remove-required-subtype") {
    const id = button.dataset.fishutSubtype;
    if (!id) return null;
    const current = getRequiredSubtypes(item) ?? [];
    const next = current.filter((s) => s !== id);
    return setRequiredSubtypes(item, next);
  }

  logger.warn?.("details-tab dispatchAction: unknown action", action);
  return null;
}

/**
 * Create a minimal-but-valid save-modifier AE on the paraphernalia item.
 * Exported for Quench coverage. Default shape is `{ kind: "bypass",
 * type: "+N", appliesTo: [] }`; the user fills in `bonus`, `appliesTo`, and
 * `usesPerDay` on the Effects tab. `transfer: true` so the AE auto-transfers
 * onto an actor when the item is owned, matching the dubious-pipe pattern.
 * @param {Item} item
 */
export async function createBypassStubAE(item) {
  const name = game.i18n.format("FISHUT.DetailsTab.Bypass.AeName.Default", {
    item: item.name,
  });
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/aura.svg",
      transfer: true,
      changes: [],
      flags: {
        [MODULE_ID]: {
          modifier: { kind: "bypass", type: "+N", appliesTo: [] },
        },
      },
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  return created?.[0] ?? null;
}

function parseIntOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// `setOverdose` writes the whole `OverdoseBlock`, so per-subfield edits read
// the existing block (or default to a 5%-disabled stub), patch the one key,
// and write it back. Default `chancePercent` of 5 matches the authoring UI.
async function persistOverdoseField(item, key, value) {
  const current = getOverdose(item) ?? {};
  const merged = {
    enabled: current.enabled === true,
    chancePercent: Number.isFinite(Number(current.chancePercent))
      ? Number(current.chancePercent)
      : 5,
    description: typeof current.description === "string" ? current.description : "",
    [key]: value,
  };
  return setOverdose(item, merged);
}

// Patch a single key on the bypass AE's modifier flag block. Reads the
// current block, merges the new value, writes via setModifier. `null` for
// `usesPerDay` / `bonus` strips the key so the validator's "unset = unlimited"
// /"no bonus" semantics hold.
async function persistBypassField(item, key, value) {
  const match = findBypassEffect(item);
  if (!match) {
    logger.warn?.("details-tab persistBypassField: no bypass AE on item");
    return null;
  }
  const { effect, block } = match;
  const merged = { ...block };
  if (value === null && (key === "usesPerDay" || key === "bonus")) {
    delete merged[key];
  } else {
    merged[key] = value;
  }
  return setModifier(effect, merged);
}

// Toggle membership of `adminId` in the bypass AE's `appliesTo` array.
async function persistBypassAppliesTo(item, adminId, checked) {
  const match = findBypassEffect(item);
  if (!match) {
    logger.warn?.("details-tab persistBypassAppliesTo: no bypass AE on item");
    return null;
  }
  const { effect, block } = match;
  const current = Array.isArray(block.appliesTo) ? block.appliesTo : [];
  const has = current.includes(adminId);
  let next;
  if (checked && !has) next = [...current, adminId];
  else if (!checked && has) next = current.filter((a) => a !== adminId);
  else return null;
  return setModifier(effect, { ...block, appliesTo: next });
}
