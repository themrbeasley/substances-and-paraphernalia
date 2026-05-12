import { MODULE_ID, FLAGS, SCHEMA } from "../config.js";
import {
  getKind,
  getCategory,
  getAddictionEnabled,
  getAddictionSave,
  getAddictionEffectIds,
  getWithdrawalEnabled,
  getWithdrawalMod,
  getWithdrawalEffectIds,
  getOverdose,
  getOverdoseEffectIds,
  getToleranceEnabled,
  getToleranceEffectIds,
  getSubtype,
  getAppliesTo,
  getModifier,
  setKind,
  setCategory,
  setAddictionEnabled,
  setAddictionSave,
  setAddictionEffectIds,
  setWithdrawalEnabled,
  setWithdrawalMod,
  setWithdrawalEffectIds,
  setOverdose,
  setOverdoseEffectIds,
  setToleranceEnabled,
  setToleranceEffectIds,
  setSubtype,
  setAppliesTo,
  setModifier,
} from "../data/flag-schema.js";
import { getEffectiveParaphernaliaSubtypes } from "../data/paraphernalia-subtypes.js";
import { writeModifierAsChanges } from "../data/modifier-flag.js";
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
    category: L("FISHUT.DetailsTab.Field.Category.Label"),
    categoryAny: L("FISHUT.DetailsTab.Field.Category.Any"),
    addictionHeader: L("FISHUT.DetailsTab.Addiction.Header"),
    addictionEnabled: L("FISHUT.DetailsTab.Addiction.Enabled"),
    saveAbility: L("FISHUT.DetailsTab.Field.SaveAbility"),
    saveAbilityHint: L("FISHUT.Details.SaveAbility.Hint"),
    saveDc: L("FISHUT.DetailsTab.Field.SaveDc"),
    addictionEffect: L("FISHUT.DetailsTab.Field.AddictionEffect.Label"),
    addictionEffectCreateTooltip: L("FISHUT.DetailsTab.Field.AddictionEffect.CreateTooltip"),
    withdrawalHeader: L("FISHUT.DetailsTab.Withdrawal.Header"),
    withdrawalEnabled: L("FISHUT.DetailsTab.Withdrawal.Enabled"),
    withdrawalMod: L("FISHUT.DetailsTab.Field.WithdrawalMod"),
    withdrawalEffect: L("FISHUT.DetailsTab.Field.WithdrawalEffect.Label"),
    withdrawalEffectTooltip: L("FISHUT.DetailsTab.Field.WithdrawalEffect.Tooltip"),
    withdrawalEffectCreateTooltip: L("FISHUT.DetailsTab.Field.WithdrawalEffect.CreateTooltip"),
    overdoseHeader: L("FISHUT.DetailsTab.Overdose.Header"),
    overdoseEnabled: L("FISHUT.DetailsTab.Overdose.Enabled"),
    overdoseChancePercent: L("FISHUT.DetailsTab.Overdose.ChancePercent"),
    overdoseDescription: L("FISHUT.DetailsTab.Overdose.Description"),
    overdoseTooltip: L("FISHUT.DetailsTab.Overdose.Tooltip"),
    overdoseEffect: L("FISHUT.DetailsTab.Field.OverdoseEffect.Label"),
    overdoseEffectTooltip: L("FISHUT.DetailsTab.Field.OverdoseEffect.Tooltip"),
    overdoseEffectCreateTooltip: L("FISHUT.DetailsTab.Field.OverdoseEffect.CreateTooltip"),
    toleranceHeader: L("FISHUT.DetailsTab.Tolerance.Header"),
    toleranceEnabled: L("FISHUT.DetailsTab.Tolerance.Enabled"),
    toleranceEffect: L("FISHUT.DetailsTab.Field.ToleranceEffect.Label"),
    toleranceEffectTooltip: L("FISHUT.DetailsTab.Field.ToleranceEffect.Tooltip"),
    toleranceEffectCreateTooltip: L("FISHUT.DetailsTab.Field.ToleranceEffect.CreateTooltip"),
    subtype: L("FISHUT.DetailsTab.Field.Subtype.Label"),
    subtypeNone: L("FISHUT.DetailsTab.Field.Subtype.None"),
    paraphernaliaPropertiesHeader: L("FISHUT.DetailsTab.ParaphernaliaProperties.FieldsetLegend"),
    substancePropertiesHeader: L("FISHUT.DetailsTab.SubstanceProperties.FieldsetLegend"),
    appliesTo: L("FISHUT.DetailsTab.AppliesTo.Label"),
    appliesToHint: L("FISHUT.DetailsTab.AppliesTo.Hint"),
    bypassHeader: L("FISHUT.DetailsTab.Bypass.Header"),
    bypassNoneHint: L("FISHUT.DetailsTab.Bypass.None.Hint"),
    bypassGrantButton: L("FISHUT.DetailsTab.Bypass.GrantButton"),
    bypassType: L("FISHUT.DetailsTab.Bypass.Type"),
    bypassUsesPerDay: L("FISHUT.DetailsTab.Bypass.UsesPerDay.Label"),
    bypassUsesPerDayPlaceholder: L("FISHUT.DetailsTab.Bypass.UsesPerDay.Placeholder"),
    bypassBonus: L("FISHUT.DetailsTab.Bypass.Bonus.Label"),
    effectEmpty: L("FISHUT.DetailsTab.EffectPicker.Empty"),
    effectDissociate: L("FISHUT.DetailsTab.EffectPicker.Dissociate"),
    effectDelete: L("FISHUT.DetailsTab.EffectPicker.Delete"),
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

  const categories = SCHEMA.categories.map((c) => ({
    id: c.id,
    label: L(c.labelKey),
    selected: c.id === category,
  }));

  return {
    categories,
    addiction: buildAddictionContext(item),
    withdrawal: buildWithdrawalContext(item),
    overdose: buildOverdoseContext(item),
    tolerance: buildToleranceContext(item),
  };
}

function buildAddictionContext(item) {
  const enabled = getAddictionEnabled(item);
  const save = getAddictionSave(item) ?? { ability: "con", dc: null };
  const attachedIds = getAddictionEffectIds(item);

  const allEffects = Array.from(item.effects ?? []);
  // Addiction picker has no name-substring filter — any AE on the item is a
  // valid addiction-template candidate. Author intent is the source of truth.
  const { availableEffects, attachedEffects } = buildEffectPicker(
    allEffects,
    attachedIds,
    () => true,
  );

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
    availableEffects,
    attachedEffects,
  };
}

function buildWithdrawalContext(item) {
  const enabled = getWithdrawalEnabled(item);
  const withdrawalMod = getWithdrawalMod(item);
  const attachedIds = getWithdrawalEffectIds(item);

  const allEffects = Array.from(item.effects ?? []);
  // Withdrawal picker only lists AEs whose name contains "withdraw"
  // (case-insensitive) — same naming contract enforced by validate-content
  // and the long-rest tick. Stale ids are preserved as `isStale` rows so
  // re-saving doesn't silently drop the pointer.
  const { availableEffects, attachedEffects } = buildEffectPicker(
    allEffects,
    attachedIds,
    (e) => /withdraw/i.test(e.name ?? ""),
  );

  return {
    enabled,
    fieldsDisabled: !enabled,
    mod: Number.isFinite(withdrawalMod) ? withdrawalMod : "",
    availableEffects,
    attachedEffects,
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

  const attachedIds = getOverdoseEffectIds(item);
  const allEffects = Array.from(item.effects ?? []);
  // Overdose picker only lists AEs whose name contains "overdose"
  // (case-insensitive) per the AE-naming contract.
  const { availableEffects, attachedEffects } = buildEffectPicker(
    allEffects,
    attachedIds,
    (e) => /overdose/i.test(e.name ?? ""),
  );

  return {
    enabled,
    chancePercent,
    description,
    fieldsDisabled: !enabled,
    availableEffects,
    attachedEffects,
  };
}

function buildToleranceContext(item) {
  // Tolerance defaults to enabled when the flag is unset (legacy compat) —
  // matches the auto-stack-on-save-pass behavior the engine has shipped with.
  const enabled = getToleranceEnabled(item);
  const attachedIds = getToleranceEffectIds(item);

  const allEffects = Array.from(item.effects ?? []);
  // Tolerance picker lists AEs whose name contains "tolerance"
  // (case-insensitive) OR carry a `modifier.kind === "tolerance"` flag block —
  // either heuristic is sufficient to mark the AE as a tolerance template.
  const { availableEffects, attachedEffects } = buildEffectPicker(
    allEffects,
    attachedIds,
    (e) => /tolerance/i.test(e.name ?? "") || getModifier(e)?.kind === "tolerance",
  );

  return {
    enabled,
    fieldsDisabled: !enabled,
    availableEffects,
    attachedEffects,
  };
}

// Shared shape builder for the multi-attach effect picker. Returns:
//   - `availableEffects`: AEs that pass the `predicate` filter, each carrying
//     `{ id, name, selected }` so the `<multi-select>` can show the current
//     attachment as the selected set.
//   - `attachedEffects`: one row per id in `attachedIds`, in author order.
//     Each row is `{ id, name, img, isStale }`. Stale ids (id present in
//     attached list but no AE on the item, or AE no longer matches predicate)
//     are flagged so the UI can surface them as removable.
const FALLBACK_AE_IMG = "icons/svg/aura.svg";
function buildEffectPicker(allEffects, attachedIds, predicate) {
  const idToEffect = new Map(allEffects.map((e) => [e.id, e]));
  const attachedSet = new Set(attachedIds);
  const candidates = allEffects.filter((e) => predicate(e));

  // Stale ids: attached but the AE either doesn't exist anymore on the item,
  // or it's an existing AE that no longer satisfies the predicate (renamed).
  // Either way, surface it so the GM can dissociate explicitly. Synthesise an
  // option for the multi-select so its selected state stays consistent.
  const staleAttached = attachedIds.filter((id) => {
    const e = idToEffect.get(id);
    return !e || !predicate(e);
  });
  const candidateIds = new Set(candidates.map((c) => c.id));
  const availableEffects = [
    ...candidates.map((e) => ({
      id: e.id,
      name: e.name,
      selected: attachedSet.has(e.id),
    })),
    ...staleAttached
      .filter((id) => !candidateIds.has(id))
      .map((id) => ({
        id,
        name: idToEffect.get(id)?.name ?? id,
        selected: true,
      })),
  ];

  const attachedEffects = attachedIds.map((id) => {
    const e = idToEffect.get(id);
    if (!e) {
      return { id, name: id, img: FALLBACK_AE_IMG, isStale: true };
    }
    return {
      id,
      name: e.name,
      img: e.img ?? FALLBACK_AE_IMG,
      isStale: !predicate(e),
    };
  });

  return { availableEffects, attachedEffects };
}

export function buildParaphernaliaContext(item) {
  const subtype = getSubtype(item) ?? "";

  const subtypeOptions = buildSubtypeOptions(subtype);
  const subtypeSelectOptions = subtypeOptions.map((o) => ({
    id: o.id,
    label: o.label,
    selected: o.id === subtype,
  }));

  const applied = new Set(getAppliesTo(item));
  const adminOptions = SCHEMA.administrations.map(({ id, labelKey }) => ({
    id,
    label: L(labelKey),
    checked: applied.has(id),
  }));

  return {
    subtype,
    subtypeSelectOptions,
    adminOptions,
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

  const usesPerDay = block.usesPerDay;
  const usesPerDayValue =
    usesPerDay === undefined || usesPerDay === null ? "" : String(usesPerDay);

  const isPlusN = currentType === "+N";
  const rawBonus = Number(block.bonus);
  const bonusValue = Number.isFinite(rawBonus) ? String(Math.trunc(rawBonus)) : "";

  return {
    present: true,
    typeOptions,
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

    const multiField = target.dataset?.fishutMulti;
    if (multiField) {
      event.stopPropagation();
      const ids = readMultiSelectValue(target);
      persistMultiField(item, multiField, ids).catch((err) =>
        logger.error("details-tab persistMultiField failed", err),
      );
      return;
    }

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

// Foundry V13 `<multi-select>` (`HTMLMultiSelectElement`) reports its value as
// either a Set of selected ids or an Array depending on subtype. Normalise to
// a deduped string array so persistMultiField stays type-stable.
function readMultiSelectValue(target) {
  const raw = target?.value;
  if (raw == null) return [];
  if (Array.isArray(raw)) return [...new Set(raw.map(String).filter(Boolean))];
  if (raw instanceof Set) return [...new Set([...raw].map(String).filter(Boolean))];
  if (typeof raw[Symbol.iterator] === "function") {
    return [...new Set(Array.from(raw).map(String).filter(Boolean))];
  }
  return [String(raw)];
}

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Persist a single scalar field. Exported for Quench coverage.
 *
 * Effect-id arrays (`addiction.effectIds`, `withdrawal.effectIds`,
 * `overdose.effectIds`, `tolerance.effectIds`) are not handled here — they
 * flow through `persistMultiField` which is fed by the multi-select change
 * branch in `wireDetails`.
 *
 * @param {Item} item
 * @param {string} field  Dotted path: category | addiction.enabled |
 *   save.ability | save.dc | withdrawal.enabled | withdrawal.mod | subtype |
 *   overdose.* | tolerance.enabled | bypass.*
 * @param {string} rawValue
 * @param {HTMLElement} [target]
 *   The form control whose change fired. Reserved for future toggles that
 *   need to read additional data attributes off the control.
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
    case "withdrawal.enabled":
      return setWithdrawalEnabled(item, rawValue === "true");
    case "withdrawal.mod":
      return setWithdrawalMod(item, parseIntOrNull(rawValue));
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
    case "tolerance.enabled":
      return setToleranceEnabled(item, rawValue === "true");
    case "subtype": {
      const id = (rawValue ?? "").trim();
      if (!id) return setSubtype(item, null);
      if (!KEBAB.test(id)) {
        logger.warn?.("details-tab persistField: subtype must be kebab-case", id);
        return null;
      }
      return setSubtype(item, id);
    }
    case "appliesTo": {
      const adminId = target?.dataset?.fishutAdmin;
      if (!adminId) return null;
      const checked = rawValue === "true";
      return persistAppliesTo(item, adminId, checked);
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
    default:
      logger.warn?.("details-tab persistField: unknown field", field);
      return null;
  }
}

/**
 * Persist a `<multi-select>` value. Routes the field name to the matching
 * plural setter on `flag-schema.js`. Exported for Quench coverage.
 *
 * @param {Item} item
 * @param {string} field  One of `addiction.effectIds`, `withdrawal.effectIds`,
 *   `overdose.effectIds`, `tolerance.effectIds`.
 * @param {string[]} ids  Selected effect ids, deduped.
 */
export async function persistMultiField(item, field, ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  switch (field) {
    case "addiction.effectIds":
      return setAddictionEffectIds(item, list);
    case "withdrawal.effectIds":
      return setWithdrawalEffectIds(item, list);
    case "overdose.effectIds":
      return setOverdoseEffectIds(item, list);
    case "tolerance.effectIds":
      return setToleranceEffectIds(item, list);
    default:
      logger.warn?.("details-tab persistMultiField: unknown field", field);
      return null;
  }
}

async function dispatchAction(button, wrapper, item) {
  const action = button.dataset.fishutAction;

  if (action === "grant-bypass") {
    return createBypassStubAE(item);
  }
  if (action === "create-addiction-ae") {
    return createAddictionStubAE(item);
  }
  if (action === "create-withdrawal-ae") {
    return createWithdrawalStubAE(item);
  }
  if (action === "create-overdose-ae") {
    return createOverdoseStubAE(item);
  }
  if (action === "create-tolerance-ae") {
    return createToleranceStubAE(item);
  }

  // Multi-attach effect-list controls. Each `<li>` row in the picker emits
  // either `dissociate-X-ae` (drop the id from the persisted list, keep the AE
  // around for re-attaching later) or `delete-X-ae` (drop the id AND delete
  // the embedded AE). The slot is encoded in the action name; the AE id rides
  // on `data-fishut-effect-id`.
  const effectMatch = /^(dissociate|delete)-(addiction|withdrawal|overdose|tolerance)-ae$/.exec(
    action ?? "",
  );
  if (effectMatch) {
    const [, op, slot] = effectMatch;
    const effectId = button.dataset.fishutEffectId;
    if (!effectId) return null;
    return mutateEffectListForSlot(item, slot, effectId, op);
  }

  logger.warn?.("details-tab dispatchAction: unknown action", action);
  return null;
}

// Effect-list mutation shared across the four substance slots. `op` is either
// "dissociate" (just drop the id from the slot's effect-id list) or "delete"
// (drop the id AND delete the embedded ActiveEffect itself). All persistence
// goes through the plural setter, which keeps the on-disk list authoritative.
async function mutateEffectListForSlot(item, slot, effectId, op) {
  const accessors = SLOT_ACCESSORS[slot];
  if (!accessors) {
    logger.warn?.("details-tab mutateEffectListForSlot: unknown slot", slot);
    return null;
  }
  const current = accessors.get(item) ?? [];
  const next = current.filter((id) => id !== effectId);
  await accessors.set(item, next);
  if (op === "delete") {
    const effect = item.effects?.get?.(effectId) ?? null;
    if (effect) {
      try {
        await effect.delete();
      } catch (err) {
        logger.error("details-tab effect delete failed", err);
      }
    }
  }
  return null;
}

const SLOT_ACCESSORS = {
  addiction: { get: getAddictionEffectIds, set: setAddictionEffectIds },
  withdrawal: { get: getWithdrawalEffectIds, set: setWithdrawalEffectIds },
  overdose: { get: getOverdoseEffectIds, set: setOverdoseEffectIds },
  tolerance: { get: getToleranceEffectIds, set: setToleranceEffectIds },
};

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
  const block = {
    kind: "bypass",
    type: "+N",
    appliesTo: [],
    bonus: 1,
    usesPerDay: 1,
  };
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/aura.svg",
      transfer: true,
      changes: writeModifierAsChanges(block, MODULE_ID),
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  return created?.[0] ?? null;
}

// Create a blank addiction-template AE on the substance item and auto-select it
// as the active addiction effect. `transfer: false` because addiction templates
// are applied programmatically on save fail, not by item ownership. Name must
// contain `addict` (case-insensitive) per the AE-naming contract.
export async function createAddictionStubAE(item) {
  const name = game.i18n.format("FISHUT.DetailsTab.Field.AddictionEffect.AeName.Default", {
    item: item.name,
  });
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/aura.svg",
      transfer: false,
      changes: [],
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  const effect = created?.[0] ?? null;
  if (effect?.id) {
    await setAddictionEffectIds(item, [...getAddictionEffectIds(item), effect.id]);
  }
  return effect;
}

// Create a blank withdrawal-template AE on the substance item and auto-select
// it as the active withdrawal effect. `transfer: false` because withdrawal
// templates are applied programmatically at long-rest tick. Name must contain
// `withdraw` (case-insensitive) per the AE-naming contract.
export async function createWithdrawalStubAE(item) {
  const name = game.i18n.format("FISHUT.DetailsTab.Field.WithdrawalEffect.AeName.Default", {
    item: item.name,
  });
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/aura.svg",
      transfer: false,
      changes: [],
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  const effect = created?.[0] ?? null;
  if (effect?.id) {
    await setWithdrawalEffectIds(item, [...getWithdrawalEffectIds(item), effect.id]);
  }
  return effect;
}

// Create a blank overdose-marker AE on the substance item and auto-select it
// as the active overdose effect. `transfer: false` because the marker is
// applied programmatically on a d100 hit in the postUseActivity flow. Name
// must contain `overdose` (case-insensitive) per the AE-naming contract.
export async function createOverdoseStubAE(item) {
  const name = game.i18n.format("FISHUT.DetailsTab.Field.OverdoseEffect.AeName.Default", {
    item: item.name,
  });
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/poison.svg",
      transfer: false,
      changes: [],
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  const effect = created?.[0] ?? null;
  if (effect?.id) {
    await setOverdoseEffectIds(item, [...getOverdoseEffectIds(item), effect.id]);
  }
  return effect;
}

// Create a blank tolerance-template AE on the substance item, pre-stamped with
// the modifier flag block so the engine recognises it as a tolerance template
// and so the Effects tab surfaces the per-stack tunables (addictionDcBump,
// withdrawalAmplify, attenuateAltered) as editable Changes for the GM to
// extend. `transfer: false` because tolerance is applied programmatically on
// addiction-save pass. Name must contain `tolerance` (case-insensitive).
export async function createToleranceStubAE(item) {
  const name = game.i18n.format("FISHUT.DetailsTab.Field.ToleranceEffect.AeName.Default", {
    item: item.name,
  });
  const block = {
    kind: "tolerance",
    substanceId: item.id,
    addictionDcBump: 1,
    attenuateAltered: { durationFactor: 0, modifierFactor: 0, dropAdvantage: false },
    withdrawalAmplify: { durationFactor: 0, modifierFactor: 0, addDisadvantage: false },
  };
  const data = [
    {
      name,
      img: item.img ?? "icons/svg/aura.svg",
      transfer: false,
      changes: writeModifierAsChanges(block, MODULE_ID),
    },
  ];
  const created = await item.createEmbeddedDocuments("ActiveEffect", data);
  const effect = created?.[0] ?? null;
  if (effect?.id) {
    await setToleranceEffectIds(item, [...getToleranceEffectIds(item), effect.id]);
  }
  return effect;
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

// Toggle membership of `adminId` in the paraphernalia item's `appliesTo` flag.
async function persistAppliesTo(item, adminId, checked) {
  const current = getAppliesTo(item);
  const has = current.includes(adminId);
  let next;
  if (checked && !has) next = [...current, adminId];
  else if (!checked && has) next = current.filter((a) => a !== adminId);
  else return null;
  return setAppliesTo(item, next);
}

