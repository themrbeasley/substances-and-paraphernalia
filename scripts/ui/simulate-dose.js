// Simulate-dose authoring tool.
//
// Adds a "Simulate dose…" entry to the substance item-sheet's 3-dot header
// dropdown (dnd5e 5.2.5 ApplicationV2). Clicking it spawns an ephemeral test
// actor named `__fishut-test-<uuid>__<substance.name>`, embeds a clone of the
// substance, runs the same test seams the live `dnd5e.postUseActivity` flow
// uses (`rollSaveAndApply` + `rollOverdoseAndApply`), captures any chat output
// it produces, and renders a result dialog. The temp actor is reaped on dialog
// close. A `ready`-time orphan sweep cleans up actors left behind by crashes
// (GM-arbitrated).
//
// Injection strategy: we lazy-patch the item-sheet ApplicationV2 subclass'
// `_getHeaderControls()` on its first render and register a matching action
// handler in `DEFAULT_OPTIONS.actions`. Foundry's standard header-controls
// renderer then adds our entry to the 3-dot menu without us touching the DOM.
// The first render of any unpatched class triggers a re-render so the entry
// appears immediately for the currently-open sheet.

import { MODULE_ID, FLAGS } from "../config.js";
import {
  getAddiction,
  getOverdose,
  getWithdrawalDuration,
  isSubstance,
  setActorWithdrawalEntry,
} from "../data/flag-schema.js";
import { durationToSeconds } from "../data/withdrawal-duration.js";
import {
  applyAddictionEffect,
  applyWithdrawalEffect,
  rollSaveAndApply,
} from "../hooks/addiction.js";
import { rollOverdoseAndApply } from "../hooks/overdose.js";
import { logger } from "../logger.js";

const DIALOG_TEMPLATE = `modules/${MODULE_ID}/templates/simulate-dose-dialog.hbs`;
const RESULT_TEMPLATE = `modules/${MODULE_ID}/templates/simulate-dose-result.hbs`;
const TEST_ACTOR_PREFIX = "__fishut-test-";
const ACTION_ID = "fishutSimulateDose";
const PATCHED_CONSTRUCTORS = new WeakSet();

export function registerSimulateDose() {
  Hooks.on("renderApplicationV2", onRenderApplicationV2);
  Hooks.once("ready", () => {
    sweepOrphanedTestActors().catch((err) =>
      logger.error("simulate-dose: orphan sweep failed", err),
    );
  });
}

function onRenderApplicationV2(app, _htmlElement) {
  const doc = app?.document;
  if (!doc || doc.documentName !== "Item") return;
  if (doc.type !== "consumable") return;
  if (!isSubstance(doc)) return;

  const cls = app.constructor;
  if (!cls || PATCHED_CONSTRUCTORS.has(cls)) return;

  if (!patchSheetClass(cls)) return;
  PATCHED_CONSTRUCTORS.add(cls);

  // The current render computed _getHeaderControls before our patch took
  // effect. Force a fresh render so our entry appears for this sheet now.
  app.render({ force: false }).catch((err) => {
    logger.error("simulate-dose: re-render after patch failed", err);
  });
}

function patchSheetClass(cls) {
  if (typeof cls?.prototype?._getHeaderControls !== "function") {
    logger.warn?.(
      "simulate-dose: sheet class has no _getHeaderControls — patch skipped",
    );
    return false;
  }

  const originalGet = cls.prototype._getHeaderControls;
  cls.prototype._getHeaderControls = function patchedGetHeaderControls() {
    const controls = originalGet.call(this) ?? [];
    const doc = this.document;
    if (
      doc?.documentName === "Item" &&
      doc.type === "consumable" &&
      isSubstance(doc) &&
      !controls.some((c) => c.action === ACTION_ID)
    ) {
      controls.push({
        action: ACTION_ID,
        icon: "fa-solid fa-flask-vial",
        label: "FISHUT.SimulateDose.MenuLabel",
      });
    }
    return controls;
  };

  const actionHandler = function fishutSimulateDoseHandler() {
    openSimulateDoseDialog(this.document).catch((err) =>
      logger.error("simulate-dose: dialog open failed", err),
    );
  };

  // Shadow inherited DEFAULT_OPTIONS so we don't mutate a parent class' frozen
  // option object. mergeObject({ inplace: false }) returns a fresh deep copy.
  const own = Object.getOwnPropertyDescriptor(cls, "DEFAULT_OPTIONS");
  if (!own) {
    cls.DEFAULT_OPTIONS = foundry.utils.mergeObject(
      cls.DEFAULT_OPTIONS ?? {},
      { actions: { [ACTION_ID]: actionHandler } },
      { inplace: false },
    );
  } else {
    const actions = cls.DEFAULT_OPTIONS.actions ?? {};
    cls.DEFAULT_OPTIONS.actions = { ...actions, [ACTION_ID]: actionHandler };
  }
  return true;
}

/**
 * Open the simulate-dose dialog for a substance item. Exported for tests.
 * @param {Item} item
 */
export async function openSimulateDoseDialog(item) {
  if (!item || !isSubstance(item)) return null;
  const formValues = await openKnobsDialog(item);
  if (!formValues) return null;
  const result = await runSimulation({ substance: item, ...formValues });
  await openResultDialog(item, result);
  return result;
}

async function openKnobsDialog(item) {
  const context = { substance: { name: item.name } };
  const content = await foundry.applications.handlebars.renderTemplate(DIALOG_TEMPLATE, context);

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("FISHUT.SimulateDose.Title", { item: item.name }),
    },
    content,
    buttons: [
      {
        action: "run",
        label: game.i18n.localize("FISHUT.SimulateDose.Run"),
        default: true,
        callback: (_event, _button, dialog) => readFormValues(dialog),
      },
      {
        action: "cancel",
        label: game.i18n.localize("FISHUT.SimulateDose.Cancel"),
        callback: () => null,
      },
    ],
    rejectClose: false,
    modal: false,
  });
}

function readFormValues(dialog) {
  const root = dialog?.element ?? dialog;
  if (!root?.querySelector) return null;
  const conModInput = root.querySelector('[name="conMod"]');
  const stateInput = root.querySelector('[name="addictionState"]:checked');
  const conMod = Number.parseInt(conModInput?.value ?? "0", 10);
  const addictionState = stateInput?.value ?? "none";
  return {
    conMod: Number.isFinite(conMod) ? conMod : 0,
    addictionState,
  };
}

async function openResultDialog(item, result) {
  const summary = result?.ok
    ? game.i18n.format("FISHUT.SimulateDose.Result.Header", { item: item.name })
    : game.i18n.format("FISHUT.SimulateDose.Result.Error", { item: item.name });
  const noChatLabel = game.i18n.localize("FISHUT.SimulateDose.Result.NoChatCaptured");
  const aesHeader = game.i18n.localize("FISHUT.SimulateDose.Result.AEsHeader");
  const context = {
    summary,
    ok: result?.ok === true,
    error: result?.error ?? null,
    capturedContent: result?.capturedContent ?? "",
    hasCapturedContent: typeof result?.capturedContent === "string" && result.capturedContent.length > 0,
    finalAEs: result?.finalAEs ?? [],
    hasFinalAEs: Array.isArray(result?.finalAEs) && result.finalAEs.length > 0,
    noChatLabel,
    aesHeader,
  };
  const content = await foundry.applications.handlebars.renderTemplate(RESULT_TEMPLATE, context);
  return foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("FISHUT.SimulateDose.Result.Title", { item: item.name }),
    },
    content,
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("FISHUT.SimulateDose.Result.Ok"),
        default: true,
      },
    ],
    rejectClose: false,
    modal: false,
  });
}

/**
 * Run a simulated dose. Creates an ephemeral actor, embeds a clone of the
 * substance, optionally pre-seeds an addicted/withdrawing state, then
 * exercises the same test seams the live save/AE/overdose flow uses.
 * Captures `createChatMessage`-emitted content via a temporary listener and
 * reaps captured messages so the simulation does not pollute the live chat
 * log.
 *
 * @param {object} opts
 * @param {Item}   opts.substance
 * @param {number} [opts.conMod]
 * @param {"none"|"addicted"|"withdrawing"} [opts.addictionState]
 * @returns {Promise<{
 *   ok: boolean,
 *   capturedContent: string,
 *   finalAEs: string[],
 *   error?: string,
 * }>}
 */
export async function runSimulation({
  substance,
  conMod = 0,
  addictionState = "none",
} = {}) {
  if (!substance || !isSubstance(substance)) {
    return {
      ok: false,
      capturedContent: "",
      finalAEs: [],
      error: "simulate-dose: invalid substance",
    };
  }

  let testActor = null;
  const capturedIds = [];
  const captureFn = (msg) => {
    if (msg?.id) capturedIds.push(msg.id);
  };
  Hooks.on("createChatMessage", captureFn);
  const capturedContents = [];

  try {
    testActor = await createTestActor(substance, conMod);
    if (!testActor) throw new Error("simulate-dose: failed to create test actor");

    const embeddedSubstance = await embedSubstanceClone(testActor, substance);

    if (addictionState === "addicted" || addictionState === "withdrawing") {
      await preSeedAddictionState(testActor, embeddedSubstance, addictionState);
    }

    await rollSaveAndApply(testActor, embeddedSubstance);
    const overdoseBlock = getOverdose(embeddedSubstance);
    if (overdoseBlock?.enabled === true) {
      await rollOverdoseAndApply(testActor, embeddedSubstance, overdoseBlock);
    }

    // Snapshot final AEs before cleanup so the result dialog has data.
    const finalAEs = [...(testActor.effects ?? [])].map((e) => e.name).filter(Boolean);

    // Drain captured chat content from the in-memory documents *before*
    // deletion (deletion will purge them from `game.messages`).
    for (const id of capturedIds) {
      const msg = game.messages?.get?.(id);
      if (msg?.content) capturedContents.push(msg.content);
    }

    return {
      ok: true,
      capturedContent: capturedContents.join("\n<hr/>\n"),
      finalAEs,
    };
  } catch (err) {
    logger.error("simulate-dose: simulation failed", err);
    return {
      ok: false,
      capturedContent: capturedContents.join("\n<hr/>\n"),
      finalAEs: [],
      error: err?.message ?? String(err),
    };
  } finally {
    Hooks.off("createChatMessage", captureFn);
    // Reap captured chat messages so simulation artifacts do not pollute the
    // live chat log. Best-effort — failures are non-fatal.
    if (capturedIds.length > 0) {
      try {
        await ChatMessage.deleteDocuments(capturedIds);
      } catch (err) {
        logger.warn("simulate-dose: chat cleanup partial failure", err);
      }
    }
    if (testActor && !testActor.destroyed) {
      try {
        await testActor.delete();
      } catch (err) {
        logger.warn("simulate-dose: test-actor cleanup failed", err);
      }
    }
  }
}

async function createTestActor(substance, conMod) {
  const id = foundry.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10);
  const name = `${TEST_ACTOR_PREFIX}${id}__${substance.name}`;
  const conValue = 10 + 2 * (Number.isFinite(conMod) ? conMod : 0);
  return Actor.create({
    name,
    type: "character",
    system: {
      abilities: { con: { value: conValue } },
    },
  });
}

async function embedSubstanceClone(actor, sourceItem) {
  const sourceData = sourceItem.toObject();
  delete sourceData._id;

  // Capture original effect ids by name so we can remap id-pointing flags
  // (`addiction.addictionEffectId`, `withdrawal.effectId`) onto the cloned AEs.
  const originalIdByName = new Map();
  for (const ae of sourceItem.effects ?? []) {
    if (ae.name) originalIdByName.set(ae.name, ae.id ?? ae._id);
  }
  for (const ae of sourceData.effects ?? []) {
    delete ae._id;
  }

  const [embedded] = await actor.createEmbeddedDocuments("Item", [sourceData]);

  const remap = new Map();
  for (const newAe of embedded.effects ?? []) {
    const originalId = originalIdByName.get(newAe.name ?? "");
    if (originalId) remap.set(originalId, newAe.id);
  }

  const updates = {};
  const oldAddict = sourceItem.flags?.[MODULE_ID]?.[FLAGS.addiction]?.addictionEffectId;
  if (oldAddict && remap.has(oldAddict)) {
    updates[`flags.${MODULE_ID}.${FLAGS.addiction}.addictionEffectId`] = remap.get(oldAddict);
  }
  const oldWithdraw = sourceItem.flags?.[MODULE_ID]?.[FLAGS.withdrawal]?.effectId;
  if (oldWithdraw && remap.has(oldWithdraw)) {
    updates[`flags.${MODULE_ID}.${FLAGS.withdrawal}.effectId`] = remap.get(oldWithdraw);
  }
  if (Object.keys(updates).length > 0) {
    await embedded.update(updates);
  }
  return embedded;
}

async function preSeedAddictionState(actor, item, state) {
  const addiction = getAddiction(item);
  if (!addiction) return;
  const duration = getWithdrawalDuration(item);
  const seconds = duration ? durationToSeconds(duration.value, duration.unit) : 0;
  const now = new Date();
  const appliedAt = now.toISOString();
  // "addicted" → window fully ahead; "withdrawing" → already half-elapsed so
  // the simulated actor lands mid-withdrawal rather than at the leading edge.
  const elapsedSeconds = state === "withdrawing" ? Math.floor(seconds / 2) : 0;
  const endsAt = new Date(now.getTime() + (seconds - elapsedSeconds) * 1000).toISOString();
  if (state === "addicted") {
    await applyAddictionEffect(actor, item);
  }
  await applyWithdrawalEffect(actor, item).catch(() => null);
  await setActorWithdrawalEntry(actor, item.id, { appliedAt, endsAt });
}

/**
 * GM-arbitrated sweep of `__fishut-test-*` actor leftovers. Exported for tests.
 * Returns the count of actors deleted.
 */
export async function sweepOrphanedTestActors() {
  if (typeof game === "undefined" || !game?.actors) return 0;
  if (game.users?.activeGM && game.users.activeGM !== game.user) return 0;
  const orphans = [...game.actors].filter((a) =>
    typeof a?.name === "string" && a.name.startsWith(TEST_ACTOR_PREFIX),
  );
  let count = 0;
  for (const actor of orphans) {
    try {
      await actor.delete();
      count += 1;
    } catch (err) {
      logger.warn(`simulate-dose: failed to delete orphan ${actor.name}`, err);
    }
  }
  if (count > 0) logger.log(`simulate-dose: swept ${count} orphan test actor(s)`);
  return count;
}
