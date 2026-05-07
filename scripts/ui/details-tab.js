import { MODULE_ID, SCHEMA, labelKey } from "../config.js";
import {
  getKind,
  getCategory,
  getAddictionSave,
  getWithdrawalMod,
  getAddictionEffectId,
  getRequiredSubtypes,
  getSubtype,
  getModifier,
  setCategory,
  setAddictionSave,
  setWithdrawalMod,
  setAddictionEffectId,
  setRequiredSubtypes,
  setSubtype,
} from "../data/flag-schema.js";
import { logger } from "../logger.js";

const SECTION_TEMPLATE = `modules/${MODULE_ID}/templates/details-tab/section.hbs`;
const SUBSTANCE_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/substance-fields.hbs`;
const PARAPHERNALIA_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/paraphernalia-fields.hbs`;
const BYPASS_PARTIAL = `modules/${MODULE_ID}/templates/details-tab/bypass-section.hbs`;
const ELIGIBLE_ITEM_TYPES = new Set(["consumable", "equipment"]);
const INJECTED_MARKER = "data-fishut-details-injected";

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
  const kind = getKind(doc);
  if (kind !== "substance" && kind !== "paraphernalia") return;

  const detailsTab = htmlElement?.querySelector?.('section.tab[data-tab="details"]');
  if (!detailsTab) return;
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
    saveAbility: L("FISHUT.DetailsTab.Field.SaveAbility"),
    saveDc: L("FISHUT.DetailsTab.Field.SaveDc"),
    withdrawalMod: L("FISHUT.DetailsTab.Field.WithdrawalMod"),
    addictionEffect: L("FISHUT.DetailsTab.Field.AddictionEffect.Label"),
    subtype: L("FISHUT.DetailsTab.Field.Subtype.Label"),
    subtypeNone: L("FISHUT.DetailsTab.Field.Subtype.None"),
    subtypeCustomPlaceholder: L("FISHUT.DetailsTab.Field.Subtype.CustomPlaceholder"),
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
    bypassManageOnEffectsTab: L("FISHUT.DetailsTab.Bypass.ManageOnEffectsTab"),
  };
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildSubtypeOptions(currentId) {
  const seeded = (SCHEMA.paraphernaliaSubtypes ?? []).map((s) => ({
    id: s.id,
    label: L(s.labelKey),
  }));
  const seenIds = new Set(seeded.map((o) => o.id));
  const options = [...seeded];
  // Preserve a custom subtype that isn't in the schema seed list — keeps the
  // open-enum contract: GMs can mint their own subtype ids.
  if (currentId && !seenIds.has(currentId) && currentId !== "__custom__") {
    options.push({ id: currentId, label: currentId });
    seenIds.add(currentId);
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

function buildSubstanceContext(item) {
  const category = getCategory(item);
  const save = getAddictionSave(item) ?? { ability: "con", dc: null };
  const withdrawalMod = getWithdrawalMod(item);
  const addictionEffectId = getAddictionEffectId(item);
  const requiredSubtypeIds = getRequiredSubtypes(item) ?? [];

  const categories = SCHEMA.categories.map((c) => ({
    id: c.id,
    label: L(c.labelKey),
    selected: c.id === category,
  }));

  const noneLabel = L("FISHUT.DetailsTab.Field.AddictionEffect.None");
  const addictionEffectOptions = [
    { id: "", label: noneLabel, selected: !addictionEffectId },
    ...Array.from(item.effects ?? []).map((e) => ({
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
    save: {
      ability: currentAbility,
      abilityOptions,
      dc: Number.isFinite(save.dc) ? save.dc : "",
    },
    withdrawalMod: Number.isFinite(withdrawalMod) ? withdrawalMod : "",
    addictionEffectOptions,
    requiredSubtypes,
    subtypeAddOptions,
    canAddCustom: true,
  };
}

function buildParaphernaliaContext(item) {
  const category = getCategory(item);
  const subtype = getSubtype(item) ?? "";

  const categories = SCHEMA.categories.map((c) => ({
    id: c.id,
    label: L(c.labelKey),
    selected: c.id === category,
  }));

  const subtypeOptions = buildSubtypeOptions(subtype);
  const subtypeMatched = subtypeOptions.some((o) => o.id === subtype);
  const subtypeSelectOptions = subtypeOptions.map((o) => ({
    id: o.id,
    label: o.label,
    selected: o.id === subtype,
  }));

  return {
    categories,
    categoryAny: !category,
    subtype,
    subtypeSelectOptions,
    subtypeIsCustom: !!subtype && !subtypeMatched,
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
  const typeKey = labelKey("modifier.types", block.type);
  const typeLabel = typeKey ? L(typeKey) : (block.type ?? "");
  const appliesToList = Array.isArray(block.appliesTo) ? block.appliesTo : [];
  const appliesToText = appliesToList.length
    ? appliesToList
        .map((id) => {
          const k = labelKey("administrations", id);
          return k ? L(k) : id;
        })
        .join(", ")
    : L("FISHUT.DetailsTab.Bypass.AppliesTo.None");
  const usesPerDay = block.usesPerDay;
  const usesPerDayText =
    usesPerDay === undefined || usesPerDay === null || usesPerDay === ""
      ? L("FISHUT.DetailsTab.Bypass.UsesPerDay.None")
      : String(usesPerDay);
  return {
    present: true,
    typeLabel,
    appliesToText,
    usesPerDayText,
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
    persistField(item, flagField, target.value).catch((err) =>
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

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Persist a single scalar field. Exported for Quench coverage.
 * @param {Item} item
 * @param {string} field  Dotted path: category | save.ability | save.dc |
 *   withdrawalMod | addictionEffectId | subtype
 * @param {string} rawValue
 */
export async function persistField(item, field, rawValue) {
  switch (field) {
    case "category":
      return setCategory(item, rawValue || null);
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
    case "withdrawalMod":
      return setWithdrawalMod(item, parseIntOrNull(rawValue));
    case "addictionEffectId":
      return setAddictionEffectId(item, rawValue || null);
    case "subtype": {
      const id = (rawValue ?? "").trim();
      if (!id) return setSubtype(item, null);
      if (!KEBAB.test(id)) {
        logger.warn?.("details-tab persistField: subtype must be kebab-case", id);
        return null;
      }
      return setSubtype(item, id);
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
    const customInput = wrapper.querySelector('[data-fishut-add-subtype="custom"]');
    const selected = select?.value ?? "";
    const custom = customInput?.value?.trim() ?? "";
    const id = (custom || selected || "").trim();
    if (!id) return null;
    if (!KEBAB.test(id)) {
      logger.warn?.("details-tab add-required-subtype: id must be kebab-case", id);
      return null;
    }
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
 * Create a minimal-but-valid bypass AE on the paraphernalia item. Exported
 * for Quench coverage. Default shape is `{ kind: "bypass", type: "auto-pass",
 * appliesTo: [] }`; the user fills in `appliesTo` and `usesPerDay` on the
 * Effects tab. `transfer: true` so the AE auto-transfers onto an actor when
 * the item is owned, matching the dubious-pipe pattern.
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
          modifier: { kind: "bypass", type: "auto-pass", appliesTo: [] },
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
