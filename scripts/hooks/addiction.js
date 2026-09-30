import { MODULE_ID, FLAGS } from "../config.js";
import {
  getAddiction,
  getAddictionEffectIds,
  getAddictionEnabled,
  getAddictedSubstanceIds,
  getAeRole,
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
import { isPriorHigh } from "../data/prior-high.js";
import { prepareEffectPayload, effectChanges } from "../data/effect-data.js";
import { durationToSeconds } from "../data/withdrawal-duration.js";
import { d20Config } from "../data/roll-config.js";
import { rollOverdoseAndApply } from "./overdose.js";
import { SETTING_KEYS, COUPLING_DEFAULT } from "../settings.js";
import { logger } from "../logger.js";

const DEFAULT_SAVE_ABILITY = "con";
const POISONED_STATUS = "poisoned";

export function registerAddictionHooks() {
  // B.1: Save-on-use (post-activity).
  // dnd5e 4.x exposes `dnd5e.postUseActivity`. Signature confirmed in live
  // world; if it differs we fall back to wrapping `Activity#use` directly
  // (see comment in onPostUseActivity).
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);

  // B.3: Poisoned-coupling guard for linked-isolated mode.
  // External poisoned-clear cascades into our addiction AE's deletion under
  // Foundry's default "linked-cascade" semantics; this hook re-asserts the
  // addiction AE's persistence in linked-isolated mode by canceling the delete
  // unless we marked it intentional.
  Hooks.on("preDeleteActiveEffect", onPreDeleteActiveEffect);
}

async function onPostUseActivity(activity, _usageConfig, _results) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return;
  if (!isSubstance(item)) return;
  try {
    await runDosePipeline(actor, item);
  } catch (err) {
    logger.error("dose flow failed", err);
  }
}

/**
 * One dose, in order (spec D10): a dose during withdrawal cancels it (D7);
 * the addiction save; the high, scaled by current tolerance; tolerance +1
 * (every dose, D9); the overdose check against the new total. The only
 * post-use listener for substances. Simulate Dose runs it too.
 *
 * @param {Actor} actor
 * @param {Item}  item
 */
export async function runDosePipeline(actor, item) {
  await cancelWithdrawalOnRelapse(actor, item);
  if (getAddictionEnabled(item) && typeof getAddiction(item)?.save?.dc === "number") {
    await rollSaveAndApply(actor, item);
  }
  await applyAlteredEffectGated(actor, item);
  await incrementActorToleranceCount(actor, item);
  await rollOverdoseAndApply(actor, item);
}

async function cancelWithdrawalOnRelapse(actor, item) {
  const ids = actor.effects
    .filter((e) => getAeRole(e) === "withdrawal" && e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === item.id)
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
 */
export async function rollSaveAndApply(actor, item) {
  const addiction = getAddiction(item);
  if (!addiction) return;

  // Addicted means carrying the Addiction effect (spec D1): no second save.
  if (getAddictedSubstanceIds(actor).includes(item.id)) {
    return applyOutcome(actor, item, { alreadyAddicted: true });
  }

  const modifier = await consumeBypassIfAvailable(actor, item);
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
 * Apply a pre-determined outcome to the actor. This is the test seam: the
 * Quench suite calls it directly with a forced result.
 *
 * @param {Actor}  actor
 * @param {Item}   item
 * @param {Object} outcome
 * @param {boolean} [outcome.alreadyAddicted]
 * @param {import("../data/modifier-pipeline.js").ModifierResolution} [outcome.modifier]
 *   `resolution === "auto-pass"`: save is skipped, chat cites `source.name`.
 *   `resolution === "reroll-on-fail"`: save was rolled twice (second only if first failed); chat cites `source.name`.
 *   `resolution === "advantage"`: combined with `saveResult`, chat cites `source.name`.
 *   `resolution === "+N"`: save was rolled with `+bonus`; chat cites all `sources`.
 * @param {"success"|"fail"} [outcome.saveResult]
 * @param {number}            [outcome.saveTotal]
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
    return { applied: "extended" };
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
    outcome?.modifier?.resolution === "reroll-on-fail"
      ? (outcome.modifier.source?.name ?? "")
      : "";

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
    // Phase 1 no longer applies Withdrawal AE or sets the actor withdrawal
    // flag entry. Withdrawal onset is a Phase 2 event; see
    // scripts/hooks/long-rest-abstain.js (Task 13).
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
  const fn = actor.rollSavingThrow ?? actor.rollAbilitySave;
  if (typeof fn !== "function") {
    logger.warn("actor has no rollSavingThrow; skipping save");
    return null;
  }
  const firstRoll = (result) => (Array.isArray(result) ? (result[0] ?? null) : (result ?? null));
  // reroll-on-fail outranks advantage and +N at resolution time, so it rolls
  // twice with no modifiers.
  if (reroll) {
    const first = firstRoll(await fn.call(actor, d20Config(ability, dc)));
    if (!first || first.total >= dc) return first;
    return firstRoll(await fn.call(actor, d20Config(ability, dc))) ?? first;
  }
  return firstRoll(await fn.call(actor, d20Config(ability, dc, { advantage, bonus })));
}

/**
 * Apply the substance's addiction AE templates to the actor. Every entry in
 * `getAddictionEffectIds(item)` is cloned in a single batch so a GM can split
 * a complex addiction across multiple AEs and have all of them appear at once.
 * Adjusts `data.statuses` per the `addictionPoisonedCoupling` setting before
 * creation. Test seam: exported for Quench.
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
    return game.settings?.get?.(MODULE_ID, SETTING_KEYS.addictionPoisonedCoupling) ?? COUPLING_DEFAULT;
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
  if (nextCount === priorCount) return;
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
    data.system = { ...(data.system ?? {}), changes: attenuateChangeRows(effectChanges(data), count, curve) };
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
  // Marker AE: updates an existing tolerance AE's count flag, or applies an
  // authored tolerance AE template if none exists and count > 0.
  const existing = findEffectsByRole(actor, "tolerance").filter(
    (e) => e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === item.id,
  );
  for (const eff of existing) {
    await eff.update({ [`flags.${MODULE_ID}.count`]: count });
  }
  if (existing.length === 0 && count > 0) {
    const tplIds = getToleranceEffectIds(item) ?? [];
    const tpl =
      tplIds[0] && item.effects?.get?.(tplIds[0])
        ? item.effects.get(tplIds[0])
        : null;
    if (!tpl) return;
    const data = prepareEffectPayload(tpl.toObject(), {
      sourceSubstanceId: item.id,
      origin: item.uuid,
      role: "tolerance",
    });
    data.flags[MODULE_ID].count = count;
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  }
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
 * @param {{elapsedSeconds?: number}} [opts]  Simulate Dose starts mid-withdrawal.
 * @returns {Promise<ActiveEffect|null>} the first applied effect
 */
export async function applyWithdrawalEffect(actor, item, { elapsedSeconds = 0 } = {}) {
  const duration = getWithdrawalDuration(item);
  const total = duration ? durationToSeconds(duration.value, duration.unit) : 0;
  // 0 means permanent to prepareEffectPayload, so never let elapsed time reach it.
  const seconds = total > 0 ? Math.max(1, total - elapsedSeconds) : 0;
  const templates = findWithdrawalTemplates(item);
  const sources = templates.length > 0 ? templates.map((t) => t.toObject()) : [buildDefaultWithdrawalTemplate(item)];
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
    endsAt: new Date(now + seconds * 1000).toISOString(),
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
  if (ids.length > 0) return effects.filter((e) => ids.includes(e.id));
  return effects.filter((e) => /withdraw/i.test(e.name ?? ""));
}

