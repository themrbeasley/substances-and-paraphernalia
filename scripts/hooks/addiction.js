import { MODULE_ID, FLAGS } from "../config.js";
import {
  getAddiction,
  getAddictionEffectIds,
  getAddictionEnabled,
  getAddictedSubstanceIds,
  getAeRole,
  hasAeRole,
  getWithdrawalEffectIds,
  getWithdrawalDuration,
  getToleranceEffectIds,
  getToleranceEnabled,
  findEffectsByRole,
  isSubstance,
  getWithdrawalDc,
  getAttenuationCurve,
  getActorToleranceEntry,
  setActorToleranceEntry,
  setActorWithdrawalEntry,
} from "../data/flag-schema.js";
import { consumeBypassIfAvailable } from "../data/modifier-pipeline.js";
import { snapDcToTier, tierProfile, DEFAULT_ATTENUATION_CURVE } from "../data/tier-table.js";
import { attenuateChangeRows } from "../data/tolerance.js";
import { isPriorHigh, isStrayHigh } from "../data/prior-high.js";
import { doseMarkerIds, dosesOthers } from "../data/dose-marker.js";
import { prepareEffectPayload, effectChanges } from "../data/effect-data.js";
import { withdrawalSeconds } from "../data/withdrawal-duration.js";
import { d20Config, rollWithoutSkipping } from "../data/roll-config.js";
import { rollOverdoseAndApply } from "./overdose.js";
import { spendConsumableGear } from "./activity-gating.js";
import { SETTING_KEYS, COUPLING_DEFAULT } from "../settings.js";
import { logger } from "../logger.js";

const DEFAULT_SAVE_ABILITY = "con";
const POISONED_STATUS = "poisoned";

export function registerAddictionHooks() {
  // Every substance use runs the dose pipeline.
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);

  // Poisoned-coupling guard for linked-isolated mode.
  // External poisoned-clear cascades into our addiction AE's deletion under
  // Foundry's default "linked-cascade" semantics; this hook re-asserts the
  // addiction AE's persistence in linked-isolated mode by canceling the delete
  // unless we marked it intentional.
  Hooks.on("preDeleteActiveEffect", onPreDeleteActiveEffect);

  // A drug copy made before v0.9.1 still lists its high on the activity, so
  // Midi-QoL or the chat card would apply a second, full-strength copy after
  // the dose pipeline. The module applies highs itself (spec D12).
  Hooks.on("preCreateActiveEffect", onPreCreateActiveEffect);
}

async function onPostUseActivity(activity, _usageConfig, _results) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return;
  if (!isSubstance(item)) return;
  // A dose-others activity doses its targets (scripts/hooks/dose-others.js), not its user.
  if (dosesOthers(activity, doseMarkerIds(item.effects))) return;
  // Each step catches its own errors; this catches anything outside them.
  try {
    // A gear-update failure must not skip the addiction save and the rest of the dose.
    await spendConsumableGear(actor, item).catch((err) =>
      logger.error("spending gear failed", err),
    );
    await runDosePipeline(actor, item);
  } catch (err) {
    logger.error("dose flow failed", err);
  }
}

/**
 * One dose, in order (spec D10): a dose during withdrawal cancels it (D7);
 * the addiction save; the high, scaled by current tolerance; tolerance +1
 * (every dose, D9); the overdose check against the new total, or because the
 * dose came while the drug's high was still on (D6). The only
 * post-use listener for substances. Simulate Dose runs it too.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {{forced?: boolean}} [opts]  `forced`: someone else dosed this creature
 *   (spec D1), so the addiction save skips the creature's own gear bonus.
 * @returns {Promise<Array<{step: string, message: string}>>} the steps that failed
 */
export async function runDosePipeline(actor, item, { forced = false } = {}) {
  // The dose is already spent, so each step catches its own error: one failure
  // must not cancel the rest of the dose (spec v0.9.2 D11).
  const failures = [];
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      logger.error(`dose step "${label}" failed for ${item.name}`, err);
      failures.push({ step: label, message: err?.message ?? String(err) });
    }
  };
  await step("relapse check", () => cancelWithdrawalOnRelapse(actor, item));
  if (getAddictionEnabled(item) && typeof getAddiction(item)?.save?.dc === "number") {
    await step("addiction save", () => rollSaveAndApply(actor, item, { forced }));
  }
  // Taking a drug while its high is still on you risks an overdose (spec D6).
  // `active` is false for a switched-off effect; `duration.expired` marks one that has run out.
  const stillHigh = actor.effects.some(
    (e) => isPriorHigh(e, item) && e.active && !e.duration?.expired,
  );
  await step("high", () => applyAlteredEffectGated(actor, item));
  await step("tolerance", () => incrementActorToleranceCount(actor, item));
  await step("overdose", () => rollOverdoseAndApply(actor, item, undefined, { stillHigh }));
  return failures;
}

async function cancelWithdrawalOnRelapse(actor, item) {
  const ids = actor.effects
    .filter(
      (e) =>
        hasAeRole(e, "withdrawal") && e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === item.id,
    )
    .map((e) => e.id);
  if (ids.length === 0) return;
  // withdrawal-cleanup.js reads fishutRelapse: clear the record, keep the addiction.
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { fishutRelapse: true });
  await chat(game.i18n.format("FISHUT.Withdrawal.Relapse", { actor: actor.name, item: item.name }));
}

/**
 * Roll the addiction save (or skip if already-addicted / bypassed) and apply
 * the resulting state to the actor.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {{forced?: boolean}} [opts]  `forced`: the dose was forced on the actor
 *   by someone else, so the actor's own bypass gear doesn't apply.
 */
export async function rollSaveAndApply(actor, item, { forced = false } = {}) {
  const addiction = getAddiction(item);
  if (!addiction) return;

  // Addicted means carrying the Addiction effect (spec D1): no second save.
  if (getAddictedSubstanceIds(actor).includes(item.id)) {
    return applyOutcome(actor, item, { alreadyAddicted: true });
  }

  // A forced dose doesn't go through the dosed creature's own kit (spec D1).
  const modifier = forced ? { resolution: null } : await consumeBypassIfAvailable(actor, item);
  if (modifier.resolution === "auto-pass") {
    return applyOutcome(actor, item, { modifier });
  }

  const ability = addiction.save?.ability ?? DEFAULT_SAVE_ABILITY;
  const dc = addiction.save.dc;
  const advantage = modifier.resolution === "advantage";
  const bonus = modifier.resolution === "+N" ? Number(modifier.bonus) || 0 : 0;
  const reroll = modifier.resolution === "reroll-on-fail";
  const saveRoll = await rollSave(actor, ability, dc, { advantage, bonus, reroll });
  if (!saveRoll) return;
  const saveResult = saveRoll.total >= dc ? "success" : "fail";
  return applyOutcome(actor, item, { saveResult, saveTotal: saveRoll.total, modifier });
}

/**
 * Apply a decided outcome to the actor and post its chat line.
 *
 * @param {Actor}  actor
 * @param {Item}   item
 * @param {Object} outcome
 * @param {boolean} [outcome.alreadyAddicted] the actor already carries this
 *   substance's Addiction effect: no save, the addiction continues.
 * @param {import("../data/modifier-pipeline.js").ModifierResolution} [outcome.modifier]
 *   `resolution === "auto-pass"`: save is skipped, chat cites `source.name`.
 *   `resolution === "reroll-on-fail"`: save was rolled twice (second only if first failed); chat cites `source.name`.
 *   `resolution === "advantage"`: combined with `saveResult`, chat cites `source.name`.
 *   `resolution === "+N"`: save was rolled with `+bonus`; chat cites all `sources`.
 * @param {"success"|"fail"} [outcome.saveResult]
 * @param {number}            [outcome.saveTotal]
 * @returns {Promise<{applied: "maintained"|"bypassed"|"passed"|"addicted"}|undefined>}
 */
export async function applyOutcome(actor, item, outcome) {
  const addiction = getAddiction(item);
  if (!addiction) return;

  if (outcome?.alreadyAddicted) {
    await chat(
      game.i18n.format("FISHUT.Addiction.Already.Maintained", {
        actor: actor.name,
        item: item.name,
      }),
    );
    return { applied: "maintained" };
  }

  if (outcome?.modifier?.resolution === "auto-pass") {
    await chat(
      game.i18n.format("FISHUT.Addiction.Save.Bypass", {
        actor: actor.name,
        item: item.name,
        paraphernalia: outcome.modifier.source?.name ?? "",
      }),
    );
    return { applied: "bypassed" };
  }

  const advantageSource =
    outcome?.modifier?.resolution === "advantage" ? (outcome.modifier.source?.name ?? "") : "";
  const isPlusN = outcome?.modifier?.resolution === "+N";
  const bonusValue = isPlusN ? Number(outcome.modifier.bonus) || 0 : 0;
  const bonusSources = isPlusN ? joinSourceNames(outcome.modifier) : "";
  const rerollSource =
    outcome?.modifier?.resolution === "reroll-on-fail" ? (outcome.modifier.source?.name ?? "") : "";

  if (outcome?.saveResult === "success") {
    let key = "FISHUT.Addiction.Save.Pass";
    if (rerollSource) key = "FISHUT.Addiction.Save.PassWithReroll";
    else if (advantageSource) key = "FISHUT.Addiction.Save.PassWithAdvantage";
    else if (isPlusN) key = "FISHUT.Addiction.Save.PassWithBonus";
    await chat(
      game.i18n.format(key, {
        actor: actor.name,
        item: item.name,
        source: rerollSource || advantageSource || bonusSources,
        bonus: bonusValue,
      }),
    );
    return { applied: "passed" };
  }

  if (outcome?.saveResult === "fail") {
    await applyAddictionEffect(actor, item);
    // Withdrawal doesn't start here: it starts at a Long Rest
    // (scripts/hooks/long-rest-abstain.js).
    let key;
    if (rerollSource) key = "FISHUT.Addiction.Save.FailWithReroll";
    else if (advantageSource) key = "FISHUT.Addiction.Save.FailWithAdvantage";
    else if (isPlusN) key = "FISHUT.Addiction.Save.FailWithBonus";
    else key = "FISHUT.Addiction.Save.Fail";
    await chat(
      game.i18n.format(key, {
        actor: actor.name,
        item: item.name,
        source: rerollSource || advantageSource || bonusSources,
        bonus: bonusValue,
      }),
    );
    return { applied: "addicted" };
  }
}

function joinSourceNames(modifier) {
  const sources = Array.isArray(modifier?.sources) ? modifier.sources : [];
  const names = sources.map((s) => s?.name).filter((n) => typeof n === "string" && n.length > 0);
  return names.join(", ");
}

async function rollSave(actor, ability, dc, { advantage = false, bonus = 0, reroll = false } = {}) {
  if (typeof actor.rollSavingThrow !== "function") {
    logger.warn("actor has no rollSavingThrow; skipping save");
    return null;
  }
  // A closed roll window rolls anyway, so closing it can't dodge addiction.
  const roll = (config, dialog) => actor.rollSavingThrow(config, dialog);
  // reroll-on-fail outranks advantage and +N at resolution time, so it rolls
  // twice with no modifiers.
  if (reroll) {
    const first = await rollWithoutSkipping(roll, d20Config(ability, dc));
    if (!first || first.total >= dc) return first;
    return (await rollWithoutSkipping(roll, d20Config(ability, dc))) ?? first;
  }
  return rollWithoutSkipping(roll, d20Config(ability, dc, { advantage, bonus }));
}

/**
 * Apply the substance's addiction AE templates to the actor. Every entry in
 * `getAddictionEffectIds(item)` is cloned in a single batch so a GM can split
 * a complex addiction across multiple AEs and have all of them appear at once.
 * Adjusts `data.statuses` per the `addictionPoisonedCoupling` setting before
 * creation.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @returns {Promise<ActiveEffect|null>} the first applied effect (back-compat
 *   for callers that only inspect a single result), or null if no templates
 *   were found.
 */
export async function applyAddictionEffect(actor, item) {
  const templates = findAddictionTemplates(item);
  if (templates.length === 0) {
    logger.warn(`addiction template not found on ${item.name}; chat-only fail outcome`);
    return null;
  }
  const couplingMode = readCouplingMode();
  const payloads = templates.map((template) => buildAddictionPayload(template, item, couplingMode));
  const created = await actor.createEmbeddedDocuments("ActiveEffect", payloads);
  return created?.[0] ?? null;
}

function buildAddictionPayload(template, item, couplingMode) {
  const data = prepareEffectPayload(template.toObject(), {
    sourceSubstanceId: item.id,
    origin: item.uuid,
    role: "addiction",
    duration: null,
  });
  applyCouplingMode(data, couplingMode);
  return data;
}

function readCouplingMode() {
  try {
    return (
      game.settings?.get?.(MODULE_ID, SETTING_KEYS.addictionPoisonedCoupling) ?? COUPLING_DEFAULT
    );
  } catch {
    return COUPLING_DEFAULT;
  }
}

function applyCouplingMode(data, mode) {
  // linked-cascade and linked-isolated both keep the template's poisoned status.
  // independent strips poisoned so addiction does not imply the condition at all.
  if (mode === "independent") {
    data.statuses = (data.statuses ?? []).filter((s) => s !== POISONED_STATUS);
  }
}

function findAddictionTemplates(item) {
  const effects = item?.effects;
  if (!effects) return [];
  const list = [...effects];
  const ids = getAddictionEffectIds(item);
  const resolved = [];
  const seen = new Set();
  for (const id of ids) {
    const found = effects.get?.(id) ?? list.find((e) => e.id === id || e._id === id);
    if (found && !seen.has(found.id ?? found._id)) {
      resolved.push(found);
      seen.add(found.id ?? found._id);
    }
  }
  if (resolved.length > 0) return resolved;
  // Fallback: any effect whose name contains "addict" (case-insensitive).
  return list.filter((e) => /addict/i.test(e.name ?? ""));
}

/**
 * Identify an applied addiction AE on an actor. Used by the linked-isolated
 * coupling guard to decide whether to block external deletes. Exported as part
 * of the public API so macros and integrations can reuse the same predicate.
 *
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isAppliedAddictionEffect(effect) {
  if (!effect?.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId]) return false;
  // Highs and overdose markers carry a source id too; only addictions count,
  // or the linked-isolated guard would block House Automation from expiring them.
  const role = getAeRole(effect);
  return role ? role === "addiction" : /addict/i.test(effect.name ?? "");
}

/**
 * Test seam: Quench calls this to exercise the linked-isolated guard with a
 * deterministic options object. Returns `false` to cancel the delete.
 *
 * @param {ActiveEffect} effect
 * @param {object}       [options]
 * @param {string}       [_userId]
 * @returns {boolean} false to cancel the delete; void/true to allow.
 */
export function onPreDeleteActiveEffect(effect, options, _userId) {
  if (options?.fishutIntentional === true) return undefined;
  if (readCouplingMode() !== "linked-isolated") return undefined;
  if (!isAppliedAddictionEffect(effect)) return undefined;
  logger.log(
    `linked-isolated: blocking external delete of addiction AE "${effect.name}" on ${effect.parent?.name ?? "actor"}`,
  );
  return false;
}

/**
 * Cancel a copy of a drug's high that something other than the module is
 * applying (see isStrayHigh). Cancelling instead of deleting afterwards keeps
 * the module high's Token Magic filter on the token: both copies use the same
 * filter name. Returns false to cancel the creation.
 *
 * @param {ActiveEffect} effect
 * @returns {false|undefined}
 */
export function onPreCreateActiveEffect(effect, _data, _options, _userId) {
  const actor = effect?.parent;
  if (actor?.documentName !== "Actor") return undefined;
  if (!isStrayHigh(effect, actor)) return undefined;
  logger.log(`skipped a second copy of a drug's high on ${actor.name}; the module applies it`);
  return false;
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}

/**
 * Increment the actor's tolerance Count for a substance. Clamps at the
 * tier-derived MaxCount. Reapplies the Tolerance AE so its stack indicator
 * (or marker) reflects the new state.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function incrementActorToleranceCount(actor, item) {
  if (!getToleranceEnabled(item)) return;
  const dc = getWithdrawalDc(item);
  if (!Number.isFinite(dc)) return;
  const profile = tierProfile(snapDcToTier(dc));
  const prior = getActorToleranceEntry(actor, item.id);
  const priorCount = Number(prior?.count) || 0;
  const nextCount = Math.min(profile.maxCount, priorCount + 1);
  // At the cap the count doesn't move, but the marker may still be missing
  // (tolerance built up before the marker existed).
  if (nextCount === priorCount) return refreshToleranceMarkerAe(actor, item, nextCount);
  await setActorToleranceEntry(actor, item.id, {
    count: nextCount,
    lastIncrementedAt: new Date().toISOString(),
    lastDecayedAt: prior?.lastDecayedAt,
  });
  await refreshToleranceMarkerAe(actor, item, nextCount);
}

/**
 * Apply the substance's Altered effects (every altered template: Stellar Mist
 * ships a visual and a save bonus), scaling each numeric Change-row `value` by
 * the attenuation curve at the actor's current tolerance count. Earlier highs
 * from this substance are deleted first, so a re-dose replaces rather than
 * stacks.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @returns {Promise<ActiveEffect|null>} the first applied effect
 */
export async function applyAlteredEffectGated(actor, item) {
  const count = Number(getActorToleranceEntry(actor, item.id)?.count) || 0;
  const curve = getAttenuationCurve(item) ?? DEFAULT_ATTENUATION_CURVE;
  // actor.effects, not appliedEffects: the item's own transfer templates never
  // match, and an expired high that was never deleted still does.
  const priorIds = actor.effects.filter((e) => isPriorHigh(e, item)).map((e) => e.id);
  if (priorIds.length > 0) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", priorIds, { fishutIntentional: true });
  }
  const templates = findAlteredTemplates(item);
  if (templates.length === 0) return null;
  const payloads = templates.map((template) => {
    const data = prepareEffectPayload(template.toObject(), {
      sourceSubstanceId: item.id,
      origin: item.uuid,
      role: "altered",
    });
    data.system = {
      ...(data.system ?? {}),
      changes: attenuateChangeRows(effectChanges(data), count, curve),
    };
    return data;
  });
  const created = await actor.createEmbeddedDocuments("ActiveEffect", payloads);
  return created?.[0] ?? null;
}

function findAlteredTemplates(item) {
  const list = [...(item?.effects ?? [])];
  const byRole = list.filter((e) => e.flags?.[MODULE_ID]?.aeRole === "altered");
  return byRole.length > 0 ? byRole : list.filter((e) => /altered/i.test(e.name ?? ""));
}

async function refreshToleranceMarkerAe(actor, item, count) {
  // The marker shows tolerance on the character (spec v0.9.2 D8): the drug's
  // tolerance template if it ships one, else a plain marker with no Changes
  // and no duration (no token icon). Its name carries the count.
  const existing = findEffectsByRole(actor, "tolerance").filter(
    (e) => e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === item.id,
  );
  const name = toleranceMarkerName(item, count);
  for (const eff of existing) {
    await eff.update({ name, [`flags.${MODULE_ID}.count`]: count });
  }
  if (existing.length > 0 || count <= 0) return;
  const tpl = toleranceTemplate(item);
  const base = tpl ? tpl.toObject() : { img: item.img ?? "icons/svg/aura.svg", description: "" };
  const data = prepareEffectPayload(
    { ...base, name, transfer: false },
    { sourceSubstanceId: item.id, origin: item.uuid, role: "tolerance" },
  );
  data.flags[MODULE_ID].count = count;
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

function toleranceTemplate(item) {
  const id = (getToleranceEffectIds(item) ?? [])[0];
  return id ? (item.effects?.get?.(id) ?? null) : null;
}

/**
 * The tolerance marker's name with the current count: "Tolerance to X (2)",
 * or the drug's own tolerance template name plus " (2)".
 *
 * @param {Item} item
 * @param {number} count
 * @returns {string}
 */
export function toleranceMarkerName(item, count) {
  const tpl = toleranceTemplate(item);
  if (tpl) return `${tpl.name} (${count})`;
  return game.i18n.format("FISHUT.Tolerance.EffectName", { item: item.name, stacks: count });
}

/**
 * Start withdrawal from a substance: clone its withdrawal templates onto the
 * actor with the authored duration and record it in the actor's withdrawal
 * record (spec D2). The only place withdrawal starts. Templates come from
 * `withdrawal.effectIds`, else effects named "withdraw", else a built-in
 * default that carries the vignette color.
 *
 * @param {Actor} actor
 * @param {Item}  item
 * @param {{elapsedSeconds?: number, halved?: boolean}} [opts]  `elapsedSeconds`:
 *   Simulate Dose starts mid-withdrawal. `halved`: the Constitution save passed,
 *   so withdrawal lasts half the authored length (permanent stays permanent).
 * @returns {Promise<ActiveEffect|null>} the first applied effect
 */
export async function applyWithdrawalEffect(
  actor,
  item,
  { elapsedSeconds = 0, halved = false } = {},
) {
  const total = withdrawalSeconds(getWithdrawalDuration(item), { halved });
  // 0 means permanent to prepareEffectPayload, so never let elapsed time reach it.
  const seconds = total > 0 ? Math.max(1, total - elapsedSeconds) : 0;
  const templates = findWithdrawalTemplates(item);
  const sources =
    templates.length > 0
      ? templates.map((t) => t.toObject())
      : [buildDefaultWithdrawalTemplate(item)];
  const payloads = sources.map((data) => {
    const payload = prepareEffectPayload(data, {
      sourceSubstanceId: item.id,
      origin: item.uuid,
      role: "withdrawal",
      duration: seconds,
    });
    payload.transfer = false;
    return payload;
  });
  const created = await actor.createEmbeddedDocuments("ActiveEffect", payloads);
  const now = Date.now();
  await setActorWithdrawalEntry(actor, item.id, {
    appliedAt: new Date(now).toISOString(),
    // A permanent withdrawal has no end.
    endsAt: seconds > 0 ? new Date(now + seconds * 1000).toISOString() : null,
  });
  return created?.[0] ?? null;
}

function buildDefaultWithdrawalTemplate(item) {
  // Default withdrawal AE drives the vignette via an AE Change row applying
  // to `actor.flags.<scope>.vignetteColor`. The addiction AE already carries
  // the `poisoned` status so we don't re-apply it here (validate-content warns
  // on the duplicate).
  return {
    name: game.i18n.format("FISHUT.DetailsTab.Field.WithdrawalEffect.AeName.Default", {
      item: item.name,
    }),
    img: item.img ?? "icons/svg/blood.svg",
    statuses: [],
    description: "",
    system: {
      changes: [
        {
          key: `flags.${MODULE_ID}.vignetteColor`,
          type: "override",
          value: "#a02020",
          priority: 20,
        },
      ],
    },
    flags: {
      [MODULE_ID]: {
        aeRole: "withdrawal",
      },
    },
  };
}

function findWithdrawalTemplates(item) {
  const effects = [...(item?.effects ?? [])];
  const ids = getWithdrawalEffectIds(item);
  const resolved = effects.filter((e) => ids.includes(e.id));
  if (resolved.length > 0) return resolved;
  // Stale or missing ids: fall back to the name, like findAddictionTemplates.
  return effects.filter((e) => /withdraw/i.test(e.name ?? ""));
}
