/**
 * Quench integration suite for substances-and-paraphernalia.
 *
 * Loaded conditionally from `scripts/module.mjs` when the `quench` module is
 * active. Registers batches on the `quenchReady` hook.
 *
 * Run via the Quench panel in the test world. Each batch is independent and
 * cleans up after itself with try/finally so a failing test does not pollute
 * the world with orphan actors or items.
 */

import { MODULE_ID, FLAGS } from "../../scripts/config.js";
import {
  getAddiction,
  getAddictionEffectIds,
  getAddictionSave,
  getWithdrawalEffectIds,
  getCategory,
  getKind,
  getModifier,
  getOverdose,
  getSubtype,
  getWithdrawalMod,
  getActorWithdrawal,
  getActorWithdrawalEntry,
  isParaphernalia,
  isSubstance,
} from "../../scripts/data/flag-schema.js";
import { defaultAbstainDc } from "../../scripts/data/abstain.js";
import { processAbstainFailure } from "../../scripts/hooks/long-rest-abstain.js";
import { actorHasSubtype, inspectSubtypeOnActor } from "../../scripts/data/references.js";
import {
  buildParaphernaliaContext,
  createBypassStubAE,
  persistField,
  persistKindToggle,
  persistMultiField,
} from "../../scripts/ui/details-tab.js";
import { computeRestsRemaining } from "../../scripts/data/withdrawal.js";
import { rollSaveAndApply } from "../../scripts/hooks/addiction.js";
import { rollOverdoseAndApply } from "../../scripts/hooks/overdose.js";
import { logger } from "../../scripts/logger.js";
import { applyDragOutcome, shouldShowDialog } from "../../scripts/hooks/drag-to-inventory.js";
import { runSimulation, sweepOrphanedTestActors } from "../../scripts/ui/simulate-dose.js";
import { PRESETS, PRESET_LIBRARY, verifyTmfxPresets } from "../../scripts/integrations/tmfx.js";
import { registerPhase1AddictionOnly } from "./phase1-addiction-only.test.mjs";
import { registerPhase1OverdoseGate } from "./phase1-overdose-gate.test.mjs";
import { registerPhase1ToleranceIncrement } from "./phase1-tolerance-increment.test.mjs";
import { registerPhase1AlteredAttenuation } from "./phase1-altered-attenuation.test.mjs";
import { registerPhase2AbstainPass } from "./phase2-abstain-pass.test.mjs";
import { registerPhase2AbstainFail } from "./phase2-abstain-fail.test.mjs";
import { registerPhase2AbstainFailConFail } from "./phase2-abstain-fail-con-fail.test.mjs";
import { registerPhase2ForcedAbstain } from "./phase2-forced-abstain.test.mjs";
import { registerPhase2DefaultUse } from "./phase2-default-use.test.mjs";

const BATCH_PREFIX = "substances-and-paraphernalia";

/**
 * Register every Quench batch the module ships. Wire-point: called from
 * `scripts/module.mjs` at `init` when `quench` is active.
 */
export function registerQuenchSuite() {
  Hooks.on("quenchReady", (quench) => {
    quench.registerBatch(
      `${BATCH_PREFIX}.contracts-substances`,
      contractsSubstancesBatch,
      { displayName: "S&P · Substance shape contract" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.contracts-paraphernalia`,
      contractsParaphernaliaBatch,
      { displayName: "S&P · Paraphernalia shape contract" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.references`,
      referencesBatch,
      { displayName: "S&P · subtype readiness on actor" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.addiction`,
      addictionBatch,
      { displayName: "S&P · Addiction outcomes + long-rest tick" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.bypass`,
      bypassBatch,
      { displayName: "S&P · Save bypass (consumeBypassIfAvailable)" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.overdose`,
      overdoseBatch,
      { displayName: "S&P · Overdose d100 + marker AE" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.tolerance-stack`,
      toleranceStackBatch,
      { displayName: "S&P · Tolerance auto-stack on save pass" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.withdrawal-template`,
      withdrawalTemplateBatch,
      { displayName: "S&P · Withdrawal AE template selection" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.details-tab-substance-persistence`,
      detailsTabSubstancePersistenceBatch,
      { displayName: "S&P · Details-tab substance field persistence" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.details-tab-paraphernalia-persistence`,
      detailsTabParaphernaliaPersistenceBatch,
      { displayName: "S&P · Details-tab paraphernalia field persistence" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.grant-bypass-button`,
      grantBypassButtonBatch,
      { displayName: "S&P · Grant-bypass button creates stub AE" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.bypass-section-display`,
      bypassSectionDisplayBatch,
      { displayName: "S&P · Bypass section +N display" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.kind-toggle`,
      kindToggleBatch,
      { displayName: "S&P · Details-tab kind toggle round-trip" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.drag-to-inventory-dialog`,
      dragToInventoryBatch,
      { displayName: "S&P · Drag-to-inventory state injection" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.coupling-modes`,
      couplingModesBatch,
      { displayName: "S&P · Poisoned-coupling tri-state at AE-apply" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.simulate-dose-roundtrip`,
      simulateDoseBatch,
      { displayName: "S&P · Simulate-dose round-trip + cleanup" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.long-rest-abstain-flow`,
      longRestAbstainFlowBatch,
      { displayName: "S&P · Long-rest abstain flow" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.remove-x-macros`,
      removeXMacrosBatch,
      { displayName: "S&P · Remove-X macro presence" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.withdrawal-vignette`,
      withdrawalVignetteBatch,
      { displayName: "S&P · Withdrawal vignette mounts to #interface" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.tmfx-presets`,
      tmfxPresetsBatch,
      { displayName: "S&P · TMFX preset round-trip" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.ae-role-rename`,
      aeRoleRenameBatch,
      { displayName: "S&P · aeRole — renamed AE still removable" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.ae-role-fallback-warn`,
      aeRoleFallbackWarnBatch,
      { displayName: "S&P · aeRole — hand-authored AE without flag warn-logs" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.overdose-tolerance-interaction`,
      overdoseToleranceInteractionBatch,
      { displayName: "S&P · Overdose × Tolerance — adjusted d100" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.abstain-fail-consumes`,
      abstainFailConsumesBatch,
      { displayName: "S&P · Voluntary Abstain · fail triggers consumption" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.abstain-fail-soft`,
      abstainFailSoftBatch,
      { displayName: "S&P · Voluntary Abstain · fail soft-fail" },
    );
    registerPhase1AddictionOnly(quench);
    registerPhase1OverdoseGate(quench);
    registerPhase1ToleranceIncrement(quench);
    registerPhase1AlteredAttenuation(quench);
    registerPhase2AbstainPass(quench);
    registerPhase2AbstainFail(quench);
    registerPhase2AbstainFailConFail(quench);
    registerPhase2ForcedAbstain(quench);
    registerPhase2DefaultUse(quench);
  });
}

// ─── Batch: Overdose × Tolerance interaction ────────────────────────────────

function overdoseToleranceInteractionBatch(context) {
  const { describe, it, assert, beforeEach, afterEach } = context;
  describe("S&P · Overdose × Tolerance — adjusted d100 reflects mode + stacks", () => {
    let actor, substance;
    beforeEach(async () => {
      const cls = CONFIG.Actor.documentClass;
      actor = await cls.create({ name: "Quench OD×Tol", type: "character" });
      // Build an in-memory substance with overdose enabled + tolerance interaction.
      const data = {
        name: "Quench Mitigate Substance",
        type: "consumable",
        system: { type: { value: "poison", subtype: "ingested" } },
        flags: {
          "substances-and-paraphernalia": {
            kind: "substance",
            schemaVersion: 3,
            overdose: {
              enabled: true,
              chancePercent: 50,
              toleranceInteraction: "mitigate",
              toleranceInteractionMagnitude: 10,
            },
            addiction: { enabled: false },
          },
        },
      };
      [substance] = await actor.createEmbeddedDocuments("Item", [data]);
      // Pre-stage 3 tolerance stacks.
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Tolerance: Quench Mitigate Substance",
          icon: "icons/svg/poison.svg",
          flags: {
            "substances-and-paraphernalia": {
              aeRole: "tolerance",
              sourceSubstanceId: substance.id,
              stacks: 3,
            },
          },
        },
      ]);
    });
    afterEach(async () => {
      if (actor) await actor.delete();
    });

    it("mitigate × 3 stacks × 10 magnitude reduces 50% → 20%; a roll of 30 misses", async () => {
      const block = game.modules.get("substances-and-paraphernalia").api.flagSchema.getOverdose(substance);
      // Stub randomFn so the d100 returns exactly 30 (= floor(0.29 * 100) + 1).
      const result = await rollOverdoseAndApply(actor, substance, block, { randomFn: () => 0.29 });
      assert.ok(result, "rollOverdoseAndApply returns a result object");
      assert.equal(result.hit, false, "roll 30 vs adjusted 20% must miss (50 − 30 = 20)");
    });

    it("compound × 3 stacks × 10 magnitude raises 50% → 80%; a roll of 70 hits", async () => {
      await substance.update({
        "flags.substances-and-paraphernalia.overdose.toleranceInteraction": "compound",
      });
      const block = game.modules.get("substances-and-paraphernalia").api.flagSchema.getOverdose(substance);
      const result = await rollOverdoseAndApply(actor, substance, block, { randomFn: () => 0.69 });
      assert.equal(result.hit, true, "roll 70 vs adjusted 80% must hit (50 + 30 = 80)");
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ADMIN_VALUES = new Set(["contact", "ingested", "inhaled", "injury"]);

async function loadPackItems(packId) {
  const pack = game.packs.get(`${MODULE_ID}.${packId}`);
  if (!pack) return [];
  return pack.getDocuments();
}

async function makeActor(name = "S&P Quench Test Actor") {
  return Actor.create({ name, type: "character" });
}

async function deleteActor(actor) {
  if (actor && !actor.destroyed) await actor.delete();
}

/** Build a substance item embedded on the actor with full addiction shape. */
async function embedSubstance(actor, overrides = {}) {
  const data = foundry.utils.mergeObject(
    {
      name: overrides.name ?? "Test Substance",
      type: "consumable",
      img: "icons/svg/mystery-man.svg",
      system: {
        quantity: 1,
        uses: { spent: 0, max: "1" },
        type: { value: "poison", subtype: "inhaled" },
      },
      effects: [
        {
          name: "Test Substance Addiction",
          icon: "icons/svg/poison.svg",
          changes: [],
          disabled: false,
          transfer: false,
          duration: {},
          flags: {},
        },
      ],
      flags: {
        [MODULE_ID]: {
          [FLAGS.kind]: "substance",
          [FLAGS.setting]: "fantasy",
          [FLAGS.category]: "stimulant",
          [FLAGS.addiction]: {
            save: { ability: "con", dc: 13 },
            withdrawalMod: 4,
          },
          [FLAGS.schemaVersion]: 2,
        },
      },
    },
    overrides,
  );
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  // Wire the addiction effect ID now that the AE has a real _id on the embedded item.
  const ae = item.effects?.contents?.[0] ?? null;
  if (ae) {
    await item.update({ [`flags.${MODULE_ID}.${FLAGS.addiction}.addictionEffectIds`]: [ae.id] });
  }
  return item;
}

/** Build a paraphernalia item embedded on the actor. */
async function embedParaphernalia(actor, overrides = {}) {
  const data = foundry.utils.mergeObject(
    {
      name: overrides.name ?? "Test Paraphernalia",
      type: "equipment",
      img: "icons/svg/mystery-man.svg",
      system: { equipped: true },
      flags: {
        [MODULE_ID]: {
          [FLAGS.kind]: "paraphernalia",
          [FLAGS.setting]: "fantasy",
          [FLAGS.subtype]: overrides.flags?.[MODULE_ID]?.[FLAGS.subtype] ?? "pipe",
          [FLAGS.schemaVersion]: 2,
        },
      },
    },
    overrides,
  );
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item;
}

function findAppliedAddictionEffect(actor, substanceId) {
  for (const effect of actor.effects ?? []) {
    if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === substanceId) return effect;
  }
  return null;
}

function api() {
  return game.modules.get(MODULE_ID)?.api ?? {};
}

// ─── Batch: Substance shape contract ────────────────────────────────────────

function contractsSubstancesBatch(context) {
  const { describe, it, assert, before } = context;

  describe("every shipped substance", () => {
    let substances;

    before(async () => {
      substances = (await loadPackItems("fishut-illicit-substance")).filter(isSubstance);
    });

    it("declares schemaVersion 2", () => {
      for (const item of substances) {
        const v = item.flags?.[MODULE_ID]?.[FLAGS.schemaVersion];
        assert.equal(v, 2, `${item.name}: schemaVersion must be 2 (got ${v})`);
      }
    });

    it("is a poison-type consumable with a valid subtype administration", () => {
      for (const item of substances) {
        assert.equal(
          item.system?.type?.value,
          "poison",
          `${item.name}: system.type.value must be "poison" (got ${item.system?.type?.value})`,
        );
        const a = item.system?.type?.subtype;
        assert.ok(
          ADMIN_VALUES.has(a),
          `${item.name}: system.type.subtype must be one of ${[...ADMIN_VALUES].join("|")}, got ${a}`,
        );
      }
    });

    it("declares a numeric addiction.save.dc", () => {
      for (const item of substances) {
        const dc = getAddiction(item)?.save?.dc;
        assert.equal(typeof dc, "number", `${item.name}: addiction.save.dc must be numeric (got ${dc})`);
      }
    });

    it("declares a positive integer withdrawalMod", () => {
      for (const item of substances) {
        const w = getAddiction(item)?.withdrawalMod;
        assert.ok(
          Number.isInteger(w) && w > 0,
          `${item.name}: withdrawalMod must be a positive integer (got ${w})`,
        );
      }
    });

    it("references at least one addiction AE that exists on the same item and matches /addict/i", () => {
      for (const item of substances) {
        const ids = getAddictionEffectIds(item);
        assert.ok(
          Array.isArray(ids) && ids.length > 0,
          `${item.name}: addictionEffectIds must be a non-empty array`,
        );
        for (const id of ids) {
          const ae =
            item.effects?.get?.(id) ?? [...(item.effects ?? [])].find((e) => e.id === id || e._id === id);
          assert.ok(ae, `${item.name}: addiction effect id ${id} not found on item.effects`);
          assert.match(
            ae.name ?? "",
            /addict/i,
            `${item.name}: addiction AE name "${ae.name}" must contain "addict"`,
          );
        }
      }
    });
  });
}

// ─── Batch: Paraphernalia shape contract ────────────────────────────────────

function contractsParaphernaliaBatch(context) {
  const { describe, it, assert, before } = context;

  describe("every shipped paraphernalia", () => {
    let paraphernalia;

    before(async () => {
      paraphernalia = (await loadPackItems("fishut-illicit-paraphernalia")).filter(isParaphernalia);
    });

    it("declares schemaVersion 2", () => {
      for (const item of paraphernalia) {
        const v = item.flags?.[MODULE_ID]?.[FLAGS.schemaVersion];
        assert.equal(v, 2, `${item.name}: schemaVersion must be 2 (got ${v})`);
      }
    });

    it("never declares the legacy item-level addictionSaveBypass flag (removed in v0.3)", () => {
      for (const item of paraphernalia) {
        const legacy = item.flags?.[MODULE_ID]?.addictionSaveBypass;
        assert.equal(
          legacy,
          undefined,
          `${item.name}: legacy "addictionSaveBypass" flag is removed; declare bypass via a transfer:true AE modifier block`,
        );
      }
    });

    describe("with a bypass-granting AE", () => {
      const VALID_TYPES = new Set(["auto-pass", "advantage"]);

      function bypassEffectsOf(item) {
        const out = [];
        for (const effect of item.effects ?? []) {
          const block = getModifier(effect);
          if (block?.kind === "bypass") out.push({ effect, block });
        }
        return out;
      }

      it("declares transfer:true on each bypass-granting AE", () => {
        for (const item of paraphernalia) {
          for (const { effect } of bypassEffectsOf(item)) {
            assert.equal(
              effect.transfer,
              true,
              `${item.name} effect "${effect.name}": bypass-granting AE must declare transfer:true`,
            );
          }
        }
      });

      it("declares modifier.type as one of auto-pass | advantage", () => {
        for (const item of paraphernalia) {
          for (const { effect, block } of bypassEffectsOf(item)) {
            assert.ok(
              VALID_TYPES.has(block.type),
              `${item.name} effect "${effect.name}": modifier.type must be auto-pass|advantage (got ${block.type})`,
            );
          }
        }
      });

      it("declares appliesTo as a non-empty array of valid administrations", () => {
        for (const item of paraphernalia) {
          for (const { effect, block } of bypassEffectsOf(item)) {
            assert.ok(
              Array.isArray(block.appliesTo) && block.appliesTo.length > 0,
              `${item.name} effect "${effect.name}": appliesTo must be a non-empty array`,
            );
            for (const a of block.appliesTo) {
              assert.ok(
                ADMIN_VALUES.has(a),
                `${item.name} effect "${effect.name}": appliesTo contains invalid administration "${a}"`,
              );
            }
          }
        }
      });

      it("ships with system.uses.recovery: day/recoverAll when usesPerDay is declared", () => {
        for (const item of paraphernalia) {
          const declaresDailyUses = bypassEffectsOf(item).some(
            ({ block }) =>
              block.usesPerDay !== undefined &&
              block.usesPerDay !== null &&
              block.usesPerDay !== "",
          );
          if (!declaresDailyUses) continue;
          const recovery = item.system?.uses?.recovery;
          assert.ok(
            Array.isArray(recovery) &&
              recovery.some((r) => r?.period === "day" && r?.type === "recoverAll"),
            `${item.name}: usesPerDay-bounded bypass requires system.uses.recovery: [{ period: "day", type: "recoverAll" }]`,
          );
        }
      });
    });
  });
}

// ─── Batch: subtype readiness on actor ──────────────────────────────────────

function referencesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("inspectSubtypeOnActor(actor, subtype) + actorHasSubtype(actor, subtype)", () => {
    let actor;

    before(async () => {
      actor = await makeActor("S&P refs test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    it("returns an empty array when the actor owns no paraphernalia of that subtype", () => {
      assert.deepEqual(inspectSubtypeOnActor(actor, "absent-subtype"), []);
      assert.equal(actorHasSubtype(actor, "absent-subtype"), false);
    });

    it("returns ready when an equipped paraphernalia matches the subtype", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Equipped Test Pipe",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "pipe");
        assert.equal(arr.length, 1);
        assert.equal(arr[0].ready, true);
        assert.equal(arr[0].reason, null);
        assert.equal(arr[0].item?.id, item.id);
        assert.equal(actorHasSubtype(actor, "pipe"), true);
      } finally {
        await item.delete();
      }
    });

    it("reports unequipped when equipment paraphernalia isn't equipped", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Unequipped Test Pipe",
        system: { equipped: false },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "pipe");
        assert.equal(arr.length, 1);
        assert.equal(arr[0].ready, false);
        assert.equal(arr[0].reason, "unequipped");
        assert.equal(actorHasSubtype(actor, "pipe"), false);
      } finally {
        await item.delete();
      }
    });

    it("reports missing when consumable paraphernalia quantity is 0", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Empty Test Papers",
        type: "consumable",
        system: { quantity: 0 },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "papers" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "papers");
        assert.equal(arr.length, 1);
        assert.equal(arr[0].ready, false);
        assert.equal(arr[0].reason, "missing");
        assert.equal(actorHasSubtype(actor, "papers"), false);
      } finally {
        await item.delete();
      }
    });

    it("reports unattuned when attunement is required but not satisfied", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Unattuned Test Pipe",
        system: { equipped: true, attunement: "required", attuned: false },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "pipe");
        assert.equal(arr.length, 1);
        assert.equal(arr[0].ready, false);
        assert.equal(arr[0].reason, "unattuned");
        assert.equal(actorHasSubtype(actor, "pipe"), false);
      } finally {
        await item.delete();
      }
    });

    it("enumerates every owned paraphernalia of the given subtype", async () => {
      const a = await embedParaphernalia(actor, {
        name: "Brass Pipe",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
      const b = await embedParaphernalia(actor, {
        name: "Clay Pipe",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "pipe");
        assert.equal(arr.length, 2, "both pipes should be enumerated");
        assert.ok(arr.every((i) => i.ready));
      } finally {
        await a.delete();
        await b.delete();
      }
    });
  });
}

// ─── Batch: Addiction outcomes + long-rest tick ─────────────────────────────

function addictionBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("module.api.addiction.applyOutcome", () => {
    let actor, substance;

    before(async () => {
      actor = await makeActor("S&P addiction test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      substance = await embedSubstance(actor, { name: "Quench Test Substance" });
    });

    afterEach(async () => {
      // Clean both the substance and any AE/flag state it produced.
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
      if (substance && actor.items.get(substance.id)) await substance.delete();
    });

    it("on saveResult=fail applies AE + sets withdrawal flag with restsRemaining", async () => {
      await api().addiction.applyOutcome(actor, substance, { saveResult: "fail" });
      const entry = getActorWithdrawalEntry(actor, substance.id);
      assert.ok(entry, "withdrawal entry should be set");
      // Default actor con mod is 0 → restsRemaining = max(4 − 0, ceil(4/2)) = 4
      assert.equal(entry.restsRemaining, 4);
      const ae = findAppliedAddictionEffect(actor, substance.id);
      assert.ok(ae, "applied addiction AE should exist on actor");
      assert.match(ae.name ?? "", /addict/i);
    });

    it("on saveResult=success applies no AE and sets no flag", async () => {
      await api().addiction.applyOutcome(actor, substance, { saveResult: "success" });
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
    });

    it("on alreadyAddicted re-use extends restsRemaining to max(current, newComputed)", async () => {
      // Seed a low rests count first.
      await api().addiction.applyOutcome(actor, substance, { saveResult: "fail" });
      const before = getActorWithdrawalEntry(actor, substance.id);
      // Drop it artificially to verify the max() guard.
      await actor.setFlag(MODULE_ID, FLAGS.withdrawal, {
        ...getActorWithdrawal(actor),
        [substance.id]: { ...before, restsRemaining: 1 },
      });

      await api().addiction.applyOutcome(actor, substance, { alreadyAddicted: true });
      const after = getActorWithdrawalEntry(actor, substance.id);
      assert.equal(after.restsRemaining, 4, "should clamp up to newComputed (4)");
    });

    it("on auto-pass modifier outcome posts chat + applies no AE/flag", async () => {
      await api().addiction.applyOutcome(actor, substance, {
        modifier: { resolution: "auto-pass", source: { name: "Test Pipe" } },
      });
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
    });

    it("on saveResult=success with advantage modifier cites the source in chat", async () => {
      const before = game.messages.size;
      await api().addiction.applyOutcome(actor, substance, {
        saveResult: "success",
        modifier: { resolution: "advantage", source: { name: "Advantage Pipe" } },
      });
      // Most recent chat message should reference the advantage source.
      const last = [...game.messages].at(-1);
      assert.ok(last && game.messages.size > before, "a chat message should be posted");
      assert.match(last.content ?? "", /Advantage Pipe/);
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
    });

    it("on saveResult=fail with advantage modifier still applies AE/flag and cites source", async () => {
      const before = game.messages.size;
      await api().addiction.applyOutcome(actor, substance, {
        saveResult: "fail",
        modifier: { resolution: "advantage", source: { name: "Unlucky Pipe" } },
      });
      const last = [...game.messages].at(-1);
      assert.ok(last && game.messages.size > before, "a chat message should be posted");
      assert.match(last.content ?? "", /Unlucky Pipe/);
      const entry = getActorWithdrawalEntry(actor, substance.id);
      assert.ok(entry, "withdrawal entry should still be set on failed save");
      const ae = findAppliedAddictionEffect(actor, substance.id);
      assert.ok(ae, "addiction AE should still be applied on failed save");
    });
  });

  describe("dnd5e.restCompleted long-rest tick", () => {
    let actor, substance;

    before(async () => {
      actor = await makeActor("S&P rest test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      substance = await embedSubstance(actor, { name: "Rest Test Substance" });
      await api().addiction.applyOutcome(actor, substance, { saveResult: "fail" });
    });

    afterEach(async () => {
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
      if (substance && actor.items.get(substance.id)) await substance.delete();
    });

    it("decrements restsRemaining on long rest", async () => {
      await Hooks.callAll("dnd5e.restCompleted", actor, { longRest: true });
      const entry = getActorWithdrawalEntry(actor, substance.id);
      assert.equal(entry?.restsRemaining, 3);
    });

    it("clears AE + flag once restsRemaining reaches 0", async () => {
      // 4 long rests should clear (4 → 3 → 2 → 1 → 0/cleared).
      for (let i = 0; i < 4; i++) {
        await Hooks.callAll("dnd5e.restCompleted", actor, { longRest: true });
      }
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
    });

    it("is a no-op for short rests", async () => {
      const before = getActorWithdrawalEntry(actor, substance.id)?.restsRemaining;
      await Hooks.callAll("dnd5e.restCompleted", actor, { longRest: false });
      const after = getActorWithdrawalEntry(actor, substance.id)?.restsRemaining;
      assert.equal(after, before);
    });
  });
}

// ─── Batch: Save bypass (consumeBypassIfAvailable) ──────────────────────────

function bypassBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("module.api.saveBypass.consumeBypassIfAvailable", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P bypass test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
    });

    async function makePipe({
      appliesTo = ["inhaled"],
      type = "auto-pass",
      usesMax = "4",
      spent = 0,
      includeUsesPerDay = true,
    } = {}) {
      const modifier = { kind: "bypass", type, appliesTo };
      if (includeUsesPerDay) modifier.usesPerDay = usesMax;
      const pipe = await embedParaphernalia(actor, {
        name: "Test Bypass Pipe",
        system: {
          equipped: true,
          attunement: "required",
          attuned: true,
          uses: {
            spent,
            max: usesMax,
            recovery: [{ period: "day", type: "recoverAll" }],
          },
        },
        flags: {
          [MODULE_ID]: {
            [FLAGS.subtype]: "pipe",
            [FLAGS.appliesTo]: appliesTo,
          },
        },
        effects: [
          {
            name: "Test Bypass Pipe — Bypass",
            icon: "icons/svg/aura.svg",
            transfer: true,
            disabled: false,
            duration: {},
            changes: [],
            flags: { [MODULE_ID]: { [FLAGS.modifier]: modifier } },
          },
        ],
      });
      cleanup.push(pipe);
      return pipe;
    }

    async function makeSubstance({ administration = "inhaled" } = {}) {
      const sub = await embedSubstance(actor, {
        name: "Test Bypass Substance",
        system: { type: { value: "poison", subtype: administration ?? "" } },
      });
      cleanup.push(sub);
      return sub;
    }

    it("returns auto-pass and increments pipe.system.uses.spent when matching AE is ready", async () => {
      const pipe = await makePipe();
      const sub = await makeSubstance();
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "auto-pass");
      assert.ok(result.source, "bypass result must cite the granting AE");
      assert.equal(actor.items.get(pipe.id).system.uses.spent, 1);
    });

    it("returns resolution:none when substance has no administration", async () => {
      await makePipe();
      const sub = await makeSubstance({ administration: undefined });
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "none");
    });

    it("returns resolution:none when AE.appliesTo does not cover the administration", async () => {
      await makePipe({ appliesTo: ["contact"] });
      const sub = await makeSubstance({ administration: "inhaled" });
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "none");
    });

    it("returns resolution:none when source-item uses are exhausted", async () => {
      await makePipe({ usesMax: "2", spent: 2 });
      const sub = await makeSubstance();
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "none");
    });

    it("returns auto-pass without decrementing when usesPerDay is not declared", async () => {
      const pipe = await makePipe({ includeUsesPerDay: false, usesMax: 0, spent: 0 });
      const sub = await makeSubstance();
      const before = actor.items.get(pipe.id).system.uses.spent;
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "auto-pass");
      assert.equal(actor.items.get(pipe.id).system.uses.spent, before);
    });

    it("returns resolution:advantage and cites the AE source when only an advantage AE matches", async () => {
      await makePipe({ type: "advantage" });
      const sub = await makeSubstance();
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.resolution, "advantage");
      assert.ok(result.source, "advantage result must cite the granting AE");
    });
  });

  describe("addiction save path with advantage modifier", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P advantage save test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      // Wipe any addiction state the path may have applied.
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
    });

    async function withSavingThrowStub(forcedTotal, fn) {
      const original = actor.rollSavingThrow ?? actor.rollAbilitySave;
      const calls = [];
      const stub = async (config) => {
        calls.push(config);
        return { total: forcedTotal };
      };
      actor.rollSavingThrow = stub;
      actor.rollAbilitySave = stub;
      try {
        await fn(calls);
      } finally {
        if (original) {
          actor.rollSavingThrow = original;
          actor.rollAbilitySave = original;
        } else {
          delete actor.rollSavingThrow;
          delete actor.rollAbilitySave;
        }
      }
    }

    it("calls rollSavingThrow with advantage:true when an advantage AE matches", async () => {
      const pipe = await embedParaphernalia(actor, {
        name: "Advantage Pipe",
        system: {
          equipped: true,
          attunement: "required",
          attuned: true,
          uses: { spent: 0, max: "4", recovery: [{ period: "day", type: "recoverAll" }] },
        },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe", [FLAGS.appliesTo]: ["inhaled"] } },
        effects: [
          {
            name: "Advantage Pipe — Bypass",
            icon: "icons/svg/aura.svg",
            transfer: true,
            disabled: false,
            duration: {},
            changes: [],
            flags: {
              [MODULE_ID]: {
                [FLAGS.modifier]: {
                  kind: "bypass",
                  type: "advantage",
                  appliesTo: ["inhaled"],
                  usesPerDay: "4",
                },
              },
            },
          },
        ],
      });
      cleanup.push(pipe);
      const sub = await embedSubstance(actor, {
        name: "Advantage Test Substance",
        system: { type: { value: "poison", subtype: "inhaled" } },
      });
      cleanup.push(sub);

      await withSavingThrowStub(99 /* force success */, async (calls) => {
        const before = game.messages.size;
        await api().addiction.rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 1, "rollSavingThrow must be called exactly once");
        assert.equal(
          calls[0].advantage,
          true,
          "rollSavingThrow must receive advantage:true when an advantage AE matches",
        );
        const last = [...game.messages].at(-1);
        assert.ok(game.messages.size > before, "a chat message should be posted");
        assert.match(last.content ?? "", /Advantage Pipe/);
      });
    });

    it("calls rollSavingThrow without advantage and posts the plain pass message when no modifier matches", async () => {
      const sub = await embedSubstance(actor, {
        name: "No-Modifier Substance",
        system: { type: { value: "poison", subtype: "inhaled" } },
      });
      cleanup.push(sub);

      await withSavingThrowStub(99, async (calls) => {
        const before = game.messages.size;
        await api().addiction.rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 1);
        assert.equal(
          calls[0].advantage,
          false,
          "advantage must default to false when no modifier matches",
        );
        const last = [...game.messages].at(-1);
        assert.ok(game.messages.size > before);
        assert.doesNotMatch(last.content ?? "", /advantage/i, "plain pass message must not mention advantage");
      });
    });
  });

  describe("addiction save path with reroll-on-fail modifier", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P reroll save test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
    });

    async function withSavingThrowSequence(totals, fn) {
      const original = actor.rollSavingThrow ?? actor.rollAbilitySave;
      const calls = [];
      let i = 0;
      const stub = async (config) => {
        calls.push(config);
        if (i >= totals.length) {
          throw new Error(
            `withSavingThrowSequence: ${i + 1}th save call exceeds provided totals (${totals.length})`,
          );
        }
        return { total: totals[i++] };
      };
      actor.rollSavingThrow = stub;
      actor.rollAbilitySave = stub;
      try {
        await fn(calls);
      } finally {
        if (original) {
          actor.rollSavingThrow = original;
          actor.rollAbilitySave = original;
        } else {
          delete actor.rollSavingThrow;
          delete actor.rollAbilitySave;
        }
      }
    }

    async function makeRerollVial({ appliesTo = ["ingested"], usesMax = "1", spent = 0 } = {}) {
      const item = await embedParaphernalia(actor, {
        name: "Reroll Test Vial",
        system: {
          equipped: true,
          attunement: "",
          attuned: false,
          uses: {
            spent,
            max: usesMax,
            recovery: [{ period: "day", type: "recoverAll" }],
          },
        },
        flags: {
          [MODULE_ID]: {
            [FLAGS.subtype]: "vial",
            [FLAGS.appliesTo]: appliesTo,
          },
        },
        effects: [
          {
            name: "Reroll Test Vial — Bypass",
            icon: "icons/svg/aura.svg",
            transfer: true,
            disabled: false,
            duration: {},
            changes: [],
            flags: {
              [MODULE_ID]: {
                [FLAGS.modifier]: {
                  kind: "bypass",
                  type: "reroll-on-fail",
                  appliesTo,
                  usesPerDay: usesMax,
                },
              },
            },
          },
        ],
      });
      cleanup.push(item);
      return item;
    }

    async function makeIngestedSubstance({ dc = 15 } = {}) {
      const sub = await embedSubstance(actor, {
        name: "Reroll Test Substance",
        system: { type: { value: "poison", subtype: "ingested" } },
        flags: {
          [MODULE_ID]: {
            addiction: { enabled: true, save: { ability: "con", dc } },
            withdrawal: { enabled: true },
            withdrawalMod: 2,
          },
        },
      });
      cleanup.push(sub);
      return sub;
    }

    it("rolls a second save when the first fails and uses the second result", async () => {
      await makeRerollVial();
      const sub = await makeIngestedSubstance({ dc: 15 });
      await withSavingThrowSequence([5, 20], async (calls) => {
        await rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 2, "expected exactly two save calls");
        // Neither call should set advantage or carry a bonus parts row.
        assert.notEqual(calls[0].advantage, true);
        assert.notEqual(calls[1].advantage, true);
        assert.equal(calls[0].parts, undefined);
        assert.equal(calls[1].parts, undefined);
      });
    });

    it("stops after the first save when it succeeds", async () => {
      await makeRerollVial();
      const sub = await makeIngestedSubstance({ dc: 15 });
      await withSavingThrowSequence([20], async (calls) => {
        await rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 1, "second save must not fire when first passes");
      });
    });

    it("consumes exactly one use regardless of whether the reroll fires", async () => {
      const vial = await makeRerollVial({ usesMax: "1", spent: 0 });
      const sub = await makeIngestedSubstance({ dc: 15 });
      await withSavingThrowSequence([5, 20], async () => {
        await rollSaveAndApply(actor, sub);
      });
      assert.equal(actor.items.get(vial.id).system.uses.spent, 1);
    });

    it("applies the addicted state when both rolls fail", async () => {
      await makeRerollVial();
      const sub = await makeIngestedSubstance({ dc: 15 });
      await withSavingThrowSequence([3, 5], async () => {
        await rollSaveAndApply(actor, sub);
      });
      const entry = getActorWithdrawalEntry(actor, sub.id);
      assert.ok(entry, "withdrawal entry must exist after both-fail outcome");
      assert.ok(findAppliedAddictionEffect(actor, sub.id), "addiction AE must be applied");
    });
  });

  describe("addiction save path with +N modifier", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P plus-N save test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
    });

    async function withSavingThrowStub(forcedTotal, fn) {
      const original = actor.rollSavingThrow ?? actor.rollAbilitySave;
      const calls = [];
      const stub = async (config) => {
        calls.push(config);
        return { total: forcedTotal };
      };
      actor.rollSavingThrow = stub;
      actor.rollAbilitySave = stub;
      try {
        await fn(calls);
      } finally {
        if (original) {
          actor.rollSavingThrow = original;
          actor.rollAbilitySave = original;
        } else {
          delete actor.rollSavingThrow;
          delete actor.rollAbilitySave;
        }
      }
    }

    async function makePlusNPipe({ name, bonus, appliesTo = ["inhaled"] } = {}) {
      const pipe = await embedParaphernalia(actor, {
        name,
        system: {
          equipped: true,
          attunement: "required",
          attuned: true,
          uses: { spent: 0, max: "4", recovery: [{ period: "day", type: "recoverAll" }] },
        },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe", [FLAGS.appliesTo]: appliesTo } },
        effects: [
          {
            name: `${name} — Bypass`,
            icon: "icons/svg/aura.svg",
            transfer: true,
            disabled: false,
            duration: {},
            changes: [],
            flags: {
              [MODULE_ID]: {
                [FLAGS.modifier]: {
                  kind: "bypass",
                  type: "+N",
                  appliesTo,
                  bonus,
                  usesPerDay: "4",
                },
              },
            },
          },
        ],
      });
      cleanup.push(pipe);
      return pipe;
    }

    async function makePlusNSubstance() {
      const sub = await embedSubstance(actor, {
        name: "+N Test Substance",
        system: { type: { value: "poison", subtype: "inhaled" } },
      });
      cleanup.push(sub);
      return sub;
    }

    it("passes the +N bonus to rollSavingThrow.parts and cites the AE in chat", async () => {
      await makePlusNPipe({ name: "Lucky Pipe", bonus: 2 });
      const sub = await makePlusNSubstance();
      await withSavingThrowStub(99, async (calls) => {
        const before = game.messages.size;
        await api().addiction.rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 1, "rollSavingThrow must be called exactly once");
        assert.equal(calls[0].advantage, false, "advantage must default to false for +N");
        assert.deepEqual(
          calls[0].parts,
          ["2"],
          "rollSavingThrow must receive parts:['2'] when a +N AE matches",
        );
        assert.ok(game.messages.size > before);
        const last = [...game.messages].at(-1);
        assert.match(last.content ?? "", /Lucky Pipe — Bypass/);
        assert.match(last.content ?? "", /\+2/);
      });
    });

    it("sums bonuses across multiple +N AEs and lists each source in chat", async () => {
      await makePlusNPipe({ name: "Pipe A", bonus: 1 });
      await makePlusNPipe({ name: "Pipe B", bonus: 3 });
      const sub = await makePlusNSubstance();
      await withSavingThrowStub(99, async (calls) => {
        await api().addiction.rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 1);
        assert.deepEqual(
          calls[0].parts,
          ["4"],
          "+N parts must reflect the summed bonus across all matching AEs",
        );
        const last = [...game.messages].at(-1);
        assert.match(last.content ?? "", /Pipe A — Bypass/);
        assert.match(last.content ?? "", /Pipe B — Bypass/);
        assert.match(last.content ?? "", /\+4/);
      });
    });

    it("does not pass parts when no +N AEs match — auto-pass beats +N", async () => {
      // Auto-pass paraphernalia paired with a +N paraphernalia — auto-pass wins,
      // save is bypassed, parts should not appear because rollSavingThrow is skipped.
      await embedParaphernalia(actor, {
        name: "Auto Pipe",
        system: {
          equipped: true,
          attunement: "required",
          attuned: true,
          uses: { spent: 0, max: "4", recovery: [{ period: "day", type: "recoverAll" }] },
        },
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe", [FLAGS.appliesTo]: ["inhaled"] } },
        effects: [
          {
            name: "Auto Pipe — Bypass",
            icon: "icons/svg/aura.svg",
            transfer: true,
            disabled: false,
            duration: {},
            changes: [],
            flags: {
              [MODULE_ID]: {
                [FLAGS.modifier]: {
                  kind: "bypass",
                  type: "auto-pass",
                  appliesTo: ["inhaled"],
                  usesPerDay: "4",
                },
              },
            },
          },
        ],
      }).then((pipe) => cleanup.push(pipe));
      await makePlusNPipe({ name: "Backup Pipe", bonus: 5 });
      const sub = await makePlusNSubstance();
      await withSavingThrowStub(99, async (calls) => {
        await api().addiction.rollSaveAndApply(actor, sub);
        assert.equal(calls.length, 0, "auto-pass should bypass — rollSavingThrow not called");
        const last = [...game.messages].at(-1);
        assert.match(last.content ?? "", /Auto Pipe — Bypass/);
        assert.doesNotMatch(last.content ?? "", /Backup Pipe/);
      });
    });
  });
}

// ─── Batch: Overdose d100 + marker AE ───────────────────────────────────────

function overdoseBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("module.api.overdose.rollOverdoseAndApply", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P overdose test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      // Sweep any overdose marker AEs the test left behind.
      for (const effect of [...(actor.effects ?? [])]) {
        if (/overdose/i.test(effect.name ?? "")) await effect.delete();
      }
    });

    async function makeOverdoseSubstance({ enabled = true, chancePercent = 50, description = "Test desc." } = {}) {
      const sub = await embedSubstance(actor, {
        name: "Overdose Test Substance",
        flags: {
          [MODULE_ID]: {
            [FLAGS.overdose]: { enabled, chancePercent, description },
          },
        },
      });
      cleanup.push(sub);
      return sub;
    }

    function findOverdoseEffect(substanceId) {
      for (const effect of actor.effects ?? []) {
        if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
        if (/overdose/i.test(effect.name ?? "")) return effect;
      }
      return null;
    }

    it("does nothing when overdose flag is absent", async () => {
      const sub = await embedSubstance(actor, { name: "No-overdose Substance" });
      cleanup.push(sub);
      const result = await api().overdose.rollOverdoseAndApply(
        actor,
        sub,
        null,
        { randomFn: () => 0 /* always hits if it ran */ },
      );
      assert.equal(result, null, "should short-circuit with no overdose block");
      assert.equal(findOverdoseEffect(sub.id), null);
    });

    it("does nothing when enabled === false", async () => {
      const sub = await makeOverdoseSubstance({ enabled: false, chancePercent: 100 });
      const result = await api().overdose.rollOverdoseAndApply(
        actor,
        sub,
        { enabled: false, chancePercent: 100, description: "x" },
        { randomFn: () => 0 },
      );
      assert.equal(result, null);
      assert.equal(findOverdoseEffect(sub.id), null);
    });

    it("applies marker AE and posts chat card on hit (deterministic randomFn)", async () => {
      const sub = await makeOverdoseSubstance({ chancePercent: 50, description: "Heart pounds." });
      const before = game.messages.size;
      const result = await api().overdose.rollOverdoseAndApply(
        actor,
        sub,
        { enabled: true, chancePercent: 50, description: "Heart pounds." },
        { randomFn: () => 0 /* roll = 1, always ≤ 50 */ },
      );
      assert.equal(result.hit, true);
      const effect = findOverdoseEffect(sub.id);
      assert.ok(effect, "marker AE must exist on the actor");
      assert.match(effect.name ?? "", /overdose/i, "marker AE name must contain 'overdose'");
      assert.match(effect.name ?? "", /Overdose Test Substance/);
      assert.ok(game.messages.size > before, "chat card must be posted");
      const last = [...game.messages].at(-1);
      assert.match(last.content ?? "", /Heart pounds/);
    });

    it("does not apply marker AE on miss", async () => {
      const sub = await makeOverdoseSubstance({ chancePercent: 5, description: "x" });
      const before = game.messages.size;
      const result = await api().overdose.rollOverdoseAndApply(
        actor,
        sub,
        { enabled: true, chancePercent: 5, description: "x" },
        { randomFn: () => 0.99 /* roll = 100, > 5 */ },
      );
      assert.equal(result.hit, false);
      assert.equal(findOverdoseEffect(sub.id), null);
      assert.equal(game.messages.size, before, "no chat card on miss");
    });

    it("marker AE carries sourceSubstanceId pointing at the substance item", async () => {
      const sub = await makeOverdoseSubstance({ chancePercent: 100, description: "x" });
      await api().overdose.rollOverdoseAndApply(
        actor,
        sub,
        { enabled: true, chancePercent: 100, description: "x" },
        { randomFn: () => 0 },
      );
      const effect = findOverdoseEffect(sub.id);
      assert.ok(effect);
      assert.equal(effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], sub.id);
    });
  });
}

// ─── Batch: Tolerance auto-stack on save pass ───────────────────────────────

function toleranceStackBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("module.api.addiction.applyOrIncrementToleranceStack", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P tolerance stack test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      // Sweep any tolerance AEs the test left behind.
      for (const effect of [...(actor.effects ?? [])]) {
        if (/tolerance/i.test(effect.name ?? "")) await effect.delete();
      }
    });

    async function makeSubstance(name) {
      const sub = await embedSubstance(actor, { name });
      cleanup.push(sub);
      return sub;
    }

    function findToleranceEffect(substanceId) {
      for (const effect of actor.effects ?? []) {
        if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
        if (/tolerance/i.test(effect.name ?? "")) return effect;
      }
      return null;
    }

    it("first call applies a tolerance AE with stacks: 1", async () => {
      const sub = await makeSubstance("Tolerance Test Substance A");
      const effect = await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      assert.ok(effect, "AE must be created");
      assert.match(effect.name ?? "", /tolerance/i, "AE name must contain 'tolerance'");
      assert.match(effect.name ?? "", /Tolerance Test Substance A/);
      assert.equal(effect.flags?.[MODULE_ID]?.stacks, 1);
      assert.equal(effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], sub.id);
      assert.equal(getModifier(effect)?.kind, "tolerance");
      assert.equal(getModifier(effect)?.substanceId, sub.id);
    });

    it("second call on the same substance increments the same AE to stacks: 2", async () => {
      const sub = await makeSubstance("Tolerance Test Substance B");
      const first = await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      const second = await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      assert.equal(first.id, second.id, "must be the same AE, not a new one");
      assert.equal(second.flags?.[MODULE_ID]?.stacks, 2);
      // Only one tolerance AE for this substance.
      const matches = [...(actor.effects ?? [])].filter(
        (e) =>
          e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === sub.id &&
          /tolerance/i.test(e.name ?? ""),
      );
      assert.equal(matches.length, 1);
    });

    it("third call increments to stacks: 3", async () => {
      const sub = await makeSubstance("Tolerance Test Substance C");
      await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      const third = await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      assert.equal(third.flags?.[MODULE_ID]?.stacks, 3);
    });

    it("different substances get independent tolerance AEs", async () => {
      const subA = await makeSubstance("Tolerance Multi A");
      const subB = await makeSubstance("Tolerance Multi B");
      const aeA = await api().addiction.applyOrIncrementToleranceStack(actor, subA);
      const aeB = await api().addiction.applyOrIncrementToleranceStack(actor, subB);
      assert.notEqual(aeA.id, aeB.id);
      assert.equal(aeA.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], subA.id);
      assert.equal(aeB.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], subB.id);
      // Re-stacking subA must not affect subB.
      const aeA2 = await api().addiction.applyOrIncrementToleranceStack(actor, subA);
      assert.equal(aeA.id, aeA2.id);
      assert.equal(aeA2.flags?.[MODULE_ID]?.stacks, 2);
      assert.equal(findToleranceEffect(subB.id).flags?.[MODULE_ID]?.stacks, 1);
    });

    it("uses the substance's authored tolerance AE template when present", async () => {
      const sub = await makeSubstance("Tolerance Templated Substance");
      // Add a tolerance template AE on the substance item itself.
      await sub.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Tolerance Template (authored)",
          icon: "icons/svg/upgrade.svg",
          changes: [],
          flags: {
            [MODULE_ID]: {
              [FLAGS.modifier]: {
                kind: "tolerance",
                substanceId: sub.id,
                addictionDcBump: 1,
              },
            },
          },
        },
      ]);
      const effect = await api().addiction.applyOrIncrementToleranceStack(actor, sub);
      assert.ok(effect);
      assert.equal(getModifier(effect)?.addictionDcBump, 1, "should carry authored field");
      // Name should be normalized for stack-count display, not the template's name.
      assert.match(effect.name ?? "", /tolerance/i);
      assert.match(effect.name ?? "", /Tolerance Templated Substance/);
    });

    it("applyOutcome on save pass auto-stacks tolerance for that substance", async () => {
      const sub = await makeSubstance("Tolerance via applyOutcome");
      await api().addiction.applyOutcome(actor, sub, {
        saveResult: "success",
        saveTotal: 99,
      });
      const effect = findToleranceEffect(sub.id);
      assert.ok(effect, "save pass must auto-stack a tolerance AE");
      assert.equal(effect.flags?.[MODULE_ID]?.stacks, 1);
      await api().addiction.applyOutcome(actor, sub, {
        saveResult: "success",
        saveTotal: 99,
      });
      const after = findToleranceEffect(sub.id);
      assert.equal(after.flags?.[MODULE_ID]?.stacks, 2);
    });
  });
}

// ─── Batch: Withdrawal AE template selection ───────────────────────────────

function withdrawalTemplateBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("module.api.addiction.applyWithdrawalEffect", () => {
    let actor;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P withdrawal template test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      // Sweep any addiction/withdrawal AEs left behind.
      for (const effect of [...(actor.effects ?? [])]) {
        const name = effect.name ?? "";
        if (/addict|withdraw/i.test(name)) await effect.delete().catch(() => {});
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
    });

    async function makeSubstance(name, withdrawalAeName = null) {
      const sub = await embedSubstance(actor, { name });
      if (withdrawalAeName) {
        const [ae] = await sub.createEmbeddedDocuments("ActiveEffect", [
          {
            name: withdrawalAeName,
            icon: "icons/svg/sleep.svg",
            changes: [],
            disabled: false,
            transfer: false,
            duration: {},
            flags: {},
          },
        ]);
        await sub.update({ [`flags.${MODULE_ID}.${FLAGS.withdrawal}.effectId`]: ae.id });
      }
      cleanup.push(sub);
      return sub;
    }

    function findAppliedWithdrawalAE(substanceId) {
      for (const effect of actor.effects ?? []) {
        if (effect.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] !== substanceId) continue;
        if (/withdraw/i.test(effect.name ?? "")) return effect;
      }
      return null;
    }

    it("falls back to a default withdrawal AE when no template authored (v0.5)", async () => {
      const sub = await makeSubstance("Withdrawal Test A");
      const result = await api().addiction.applyWithdrawalEffect(actor, sub);
      assert.ok(result, "default withdrawal AE should be created");
      assert.match(result.name ?? "", /withdraw/i);
      assert.equal(result.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], sub.id);
      assert.ok(
        (result.statuses ?? []).includes?.("poisoned") || result.statuses?.has?.("poisoned"),
        "default withdrawal AE should carry the poisoned status",
      );
      assert.equal(findAppliedWithdrawalAE(sub.id)?.id, result.id);
    });

    it("applies the authored withdrawal AE when withdrawalEffectId is set", async () => {
      const sub = await makeSubstance("Withdrawal Test B", "Withdrawal Bite — Test B");
      const result = await api().addiction.applyWithdrawalEffect(actor, sub);
      assert.ok(result, "withdrawal AE should be created on the actor");
      assert.match(result.name ?? "", /withdraw/i);
      assert.equal(result.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId], sub.id);
      assert.equal(findAppliedWithdrawalAE(sub.id)?.id, result.id);
    });

    it("skips authored templates whose name lacks 'withdraw' and falls back to default", async () => {
      const sub = await embedSubstance(actor, { name: "Withdrawal Test C" });
      cleanup.push(sub);
      const [ae] = await sub.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Bad Template (no keyword)",
          icon: "icons/svg/sleep.svg",
          changes: [],
          disabled: false,
          transfer: false,
          duration: {},
          flags: {},
        },
      ]);
      await sub.update({ [`flags.${MODULE_ID}.${FLAGS.withdrawal}.effectId`]: ae.id });
      const result = await api().addiction.applyWithdrawalEffect(actor, sub);
      assert.ok(result, "default AE should be applied when authored template is invalid");
      assert.match(result.name ?? "", /withdraw/i);
      assert.notEqual(result.name, "Bad Template (no keyword)");
    });

    it("applyOutcome on saveResult=fail also applies authored withdrawal AE", async () => {
      const sub = await makeSubstance("Withdrawal Test D", "Withdrawal — D");
      await api().addiction.applyOutcome(actor, sub, { saveResult: "fail" });
      // Both addiction AE and withdrawal AE should be present.
      const addictionAE = findAppliedAddictionEffect(actor, sub.id);
      assert.ok(addictionAE, "addiction AE must be applied on save fail");
      assert.match(addictionAE.name ?? "", /addict/i);
      const withdrawalAE = findAppliedWithdrawalAE(sub.id);
      assert.ok(withdrawalAE, "withdrawal AE must be applied alongside addiction on save fail");
      assert.match(withdrawalAE.name ?? "", /withdraw/i);
      assert.notEqual(addictionAE.id, withdrawalAE.id);
    });

    it("applyOutcome on saveResult=fail applies default withdrawal AE when no template authored", async () => {
      const sub = await makeSubstance("Withdrawal Test E");
      await api().addiction.applyOutcome(actor, sub, { saveResult: "fail" });
      assert.ok(findAppliedAddictionEffect(actor, sub.id), "addiction AE still applies");
      const withdrawalAE = findAppliedWithdrawalAE(sub.id);
      assert.ok(withdrawalAE, "default withdrawal AE should be applied");
      assert.match(withdrawalAE.name ?? "", /withdraw/i);
    });

    it("long-rest tick at restsRemaining=0 removes both addiction and withdrawal AEs", async () => {
      const sub = await makeSubstance("Withdrawal Test F", "Withdrawal — F");
      await api().addiction.applyOutcome(actor, sub, { saveResult: "fail" });
      assert.ok(findAppliedAddictionEffect(actor, sub.id));
      assert.ok(findAppliedWithdrawalAE(sub.id));
      // withdrawalMod=4, conMod=0 → restsRemaining=4. Tick 4 times.
      for (let i = 0; i < 4; i++) {
        await Hooks.callAll("dnd5e.restCompleted", actor, { longRest: true });
      }
      assert.equal(getActorWithdrawalEntry(actor, sub.id), null);
      assert.equal(findAppliedAddictionEffect(actor, sub.id), null);
      assert.equal(findAppliedWithdrawalAE(sub.id), null, "withdrawal AE must be removed at 0");
    });
  });
}

// ─── Batch: Details-tab substance field persistence ─────────────────────────

function detailsTabSubstancePersistenceBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("persistField round-trips through flag-schema accessors", () => {
    let actor, substance;

    before(async () => {
      actor = await makeActor("S&P details-tab persistence test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      substance = await embedSubstance(actor, { name: "Details-tab Test Substance" });
    });

    afterEach(async () => {
      if (substance && actor.items.get(substance.id)) await substance.delete();
    });

    it("persists category and clears on empty value", async () => {
      await persistField(substance, "category", "performanceEnhancing");
      assert.equal(getCategory(substance), "performanceEnhancing");
      await persistField(substance, "category", "");
      assert.equal(getCategory(substance), null);
    });

    it("persists save.ability while preserving save.dc", async () => {
      const dcBefore = getAddictionSave(substance)?.dc;
      await persistField(substance, "save.ability", "wis");
      const after = getAddictionSave(substance);
      assert.equal(after?.ability, "wis");
      assert.equal(after?.dc, dcBefore);
    });

    it("falls back to 'con' when save.ability is empty", async () => {
      await persistField(substance, "save.ability", "");
      assert.equal(getAddictionSave(substance)?.ability, "con");
    });

    it("persists save.dc as integer while preserving save.ability", async () => {
      const abilityBefore = getAddictionSave(substance)?.ability;
      await persistField(substance, "save.dc", "17");
      const after = getAddictionSave(substance);
      assert.equal(after?.dc, 17);
      assert.equal(after?.ability, abilityBefore);
    });

    it("clears save.dc when value is empty", async () => {
      await persistField(substance, "save.dc", "");
      assert.equal(getAddictionSave(substance)?.dc, null);
    });

    it("persists withdrawal.mod as integer", async () => {
      await persistField(substance, "withdrawal.mod", "6");
      assert.equal(getWithdrawalMod(substance), 6);
    });

    it("clears withdrawal.mod when value is empty", async () => {
      await persistField(substance, "withdrawal.mod", "");
      assert.equal(getWithdrawalMod(substance), null);
    });

    it("persists addiction.effectIds and clears on empty list", async () => {
      const ae = substance.effects?.contents?.[0];
      assert.ok(ae, "embedSubstance should produce one AE");
      await persistMultiField(substance, "addiction.effectIds", [ae.id]);
      assert.deepEqual(getAddictionEffectIds(substance), [ae.id]);
      await persistMultiField(substance, "addiction.effectIds", []);
      assert.deepEqual(getAddictionEffectIds(substance), []);
    });

    it("persists withdrawal.effectIds and clears on empty list", async () => {
      const created = await substance.createEmbeddedDocuments("ActiveEffect", [
        { name: `${substance.name} Withdrawal`, transfer: false, changes: [] },
      ]);
      const withdrawalAe = created?.[0];
      assert.ok(withdrawalAe, "withdrawal AE should be created");
      try {
        await persistMultiField(substance, "withdrawal.effectIds", [withdrawalAe.id]);
        assert.deepEqual(getWithdrawalEffectIds(substance), [withdrawalAe.id]);
        await persistMultiField(substance, "withdrawal.effectIds", []);
        assert.deepEqual(getWithdrawalEffectIds(substance), []);
      } finally {
        if (substance.effects.get(withdrawalAe.id)) await withdrawalAe.delete();
      }
    });

    it("persists overdose.enabled toggle while preserving sibling fields", async () => {
      await persistField(substance, "overdose.chancePercent", "12");
      await persistField(substance, "overdose.description", "Hallucinations");
      await persistField(substance, "overdose.enabled", "true");
      const after = getOverdose(substance);
      assert.equal(after?.enabled, true);
      assert.equal(after?.chancePercent, 12);
      assert.equal(after?.description, "Hallucinations");
      await persistField(substance, "overdose.enabled", "false");
      assert.equal(getOverdose(substance)?.enabled, false);
    });

    it("clamps overdose.chancePercent to 1..100", async () => {
      await persistField(substance, "overdose.chancePercent", "0");
      assert.equal(getOverdose(substance)?.chancePercent, 1);
      await persistField(substance, "overdose.chancePercent", "250");
      assert.equal(getOverdose(substance)?.chancePercent, 100);
      await persistField(substance, "overdose.chancePercent", "37");
      assert.equal(getOverdose(substance)?.chancePercent, 37);
    });

    it("persists overdose.description as free text and clears on empty", async () => {
      await persistField(substance, "overdose.description", "Convulsions for 1d4 minutes.");
      assert.equal(getOverdose(substance)?.description, "Convulsions for 1d4 minutes.");
      await persistField(substance, "overdose.description", "");
      assert.equal(getOverdose(substance)?.description, "");
    });

  });
}

// ─── Batch: Details-tab paraphernalia field persistence ─────────────────────

function detailsTabParaphernaliaPersistenceBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("persistField round-trips paraphernalia fields", () => {
    let actor, paraphernalia;

    before(async () => {
      actor = await makeActor("S&P details-tab paraphernalia persistence test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      paraphernalia = await embedParaphernalia(actor, {
        name: "Details-tab Test Paraphernalia",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
    });

    afterEach(async () => {
      if (paraphernalia && actor.items.get(paraphernalia.id)) await paraphernalia.delete();
    });

    it("persists category and clears on empty value (category=any)", async () => {
      await persistField(paraphernalia, "category", "stimulant");
      assert.equal(getCategory(paraphernalia), "stimulant");
      await persistField(paraphernalia, "category", "");
      assert.equal(getCategory(paraphernalia), null);
    });

    it("persists subtype trimmed and clears on empty value", async () => {
      await persistField(paraphernalia, "subtype", "  vial  ");
      assert.equal(getSubtype(paraphernalia), "vial");
      await persistField(paraphernalia, "subtype", "");
      assert.equal(getSubtype(paraphernalia), null);
    });
  });
}

// ─── Batch: Grant-bypass button creates stub AE ─────────────────────────────

function grantBypassButtonBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("createBypassStubAE(item)", () => {
    let actor, paraphernalia;

    before(async () => {
      actor = await makeActor("S&P grant-bypass button test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      paraphernalia = await embedParaphernalia(actor, {
        name: "Grant-Bypass Test Pipe",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
    });

    afterEach(async () => {
      if (paraphernalia && actor.items.get(paraphernalia.id)) await paraphernalia.delete();
    });

    it("creates a transfer:true AE carrying a bypass modifier flag with default shape", async () => {
      const ae = await createBypassStubAE(paraphernalia);
      assert.ok(ae, "createBypassStubAE should return the created AE");
      assert.equal(ae.transfer, true);
      const block = getModifier(ae);
      assert.ok(block, "stub AE must carry a modifier flag block");
      assert.equal(block.kind, "bypass");
      assert.equal(block.type, "+N");
      assert.deepEqual(block.appliesTo, []);
    });

    it("names the AE using the item name", async () => {
      const ae = await createBypassStubAE(paraphernalia);
      assert.match(ae.name ?? "", new RegExp(paraphernalia.name));
    });

    it("becomes the AE the modifier pipeline picks up after grant", async () => {
      const stub = await createBypassStubAE(paraphernalia);
      // Reload so item.effects reflects the new AE deterministically.
      const fresh = actor.items.get(paraphernalia.id);
      const found = [...(fresh.effects ?? [])].find((e) => e.id === stub.id);
      assert.ok(found, "the created AE must be present on item.effects");
      assert.equal(getModifier(found)?.kind, "bypass");
    });
  });
}

// ─── Batch: Bypass-section +N display ───────────────────────────────────────

function bypassSectionDisplayBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("buildParaphernaliaContext — bypass.bonus rendering", () => {
    let actor, paraphernalia;

    before(async () => {
      actor = await makeActor("S&P bypass-section display test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      paraphernalia = await embedParaphernalia(actor, {
        name: "+N Bypass Test Pipe",
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
      });
    });

    afterEach(async () => {
      if (paraphernalia && actor.items.get(paraphernalia.id)) await paraphernalia.delete();
    });

    async function attachBypass(block) {
      const [ae] = await paraphernalia.createEmbeddedDocuments("ActiveEffect", [
        {
          name: `${paraphernalia.name} — Bypass`,
          transfer: true,
          changes: [],
          flags: { [MODULE_ID]: { modifier: block } },
        },
      ]);
      return ae;
    }

    it("surfaces isPlusN=false and no bonus row for an auto-pass bypass", async () => {
      await attachBypass({ kind: "bypass", type: "auto-pass", appliesTo: ["inhaled"] });
      const ctx = buildParaphernaliaContext(paraphernalia);
      assert.equal(ctx.bypass.present, true);
      assert.equal(ctx.bypass.isPlusN, false);
    });

    it("surfaces isPlusN=true and signed bonus text for a +N bypass", async () => {
      await attachBypass({
        kind: "bypass",
        type: "+N",
        appliesTo: ["inhaled"],
        bonus: 2,
      });
      const ctx = buildParaphernaliaContext(paraphernalia);
      assert.equal(ctx.bypass.present, true);
      assert.equal(ctx.bypass.isPlusN, true);
      assert.equal(ctx.bypass.bonusText, "+2");
    });

    it("falls back to the unset label when +N omits bonus", async () => {
      await attachBypass({ kind: "bypass", type: "+N", appliesTo: ["inhaled"] });
      const ctx = buildParaphernaliaContext(paraphernalia);
      assert.equal(ctx.bypass.isPlusN, true);
      assert.match(
        ctx.bypass.bonusText,
        /unset/i,
        "missing bonus should fall back to the localized 'unset' label",
      );
    });

    it("renders bypass.present=false when no bypass AE is attached", async () => {
      const ctx = buildParaphernaliaContext(paraphernalia);
      assert.equal(ctx.bypass.present, false);
    });
  });
}

// ─── Batch: Details-tab kind toggle ─────────────────────────────────────────

function kindToggleBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("persistKindToggle(item, intendedKind, checked)", () => {
    let actor;
    const created = [];

    before(async () => {
      actor = await makeActor("S&P kind-toggle test");
    });

    after(async () => {
      for (const item of created) {
        if (item && actor.items.get(item.id)) await item.delete();
      }
      await deleteActor(actor);
    });

    afterEach(async () => {
      // Each test creates a fresh, unflagged item; collect for batch cleanup.
    });

    async function makeBareConsumable() {
      const [item] = await actor.createEmbeddedDocuments("Item", [
        { name: "Bare Consumable", type: "consumable", img: "icons/svg/item-bag.svg" },
      ]);
      created.push(item);
      return item;
    }

    async function makeBareEquipment() {
      const [item] = await actor.createEmbeddedDocuments("Item", [
        { name: "Bare Equipment", type: "equipment", img: "icons/svg/item-bag.svg" },
      ]);
      created.push(item);
      return item;
    }

    it("flips a fresh consumable into a substance and back", async () => {
      const item = await makeBareConsumable();
      assert.equal(getKind(item), null, "fresh consumable starts unflagged");
      await persistKindToggle(item, "substance", true);
      assert.equal(getKind(item), "substance");
      await persistKindToggle(item, "substance", false);
      assert.equal(getKind(item), null, "unset must clear the flag, not leave 'substance'");
    });

    it("flips a fresh equipment into paraphernalia and back", async () => {
      const item = await makeBareEquipment();
      assert.equal(getKind(item), null);
      await persistKindToggle(item, "paraphernalia", true);
      assert.equal(getKind(item), "paraphernalia");
      await persistKindToggle(item, "paraphernalia", false);
      assert.equal(getKind(item), null);
    });
  });
}

// ─── Batch: Drag-to-inventory state injection ───────────────────────────────

function dragToInventoryBatch(context) {
  const { describe, it, assert, before, after, beforeEach, afterEach } = context;

  describe("applyDragOutcome", () => {
    let actor, substance;

    before(async () => {
      actor = await makeActor("S&P drag-inventory test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    beforeEach(async () => {
      substance = await embedSubstance(actor, { name: "Drag Test Substance" });
    });

    afterEach(async () => {
      const map = getActorWithdrawal(actor);
      for (const id of Object.keys(map)) {
        const ae = findAppliedAddictionEffect(actor, id);
        if (ae) await ae.delete();
      }
      for (const ae of [...(actor.effects ?? [])]) {
        if (ae.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId]) await ae.delete();
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
      if (substance && actor.items.get(substance.id)) await substance.delete();
    });

    it("decline: no addiction AE, no withdrawal entry, no benefit AE", async () => {
      await applyDragOutcome(actor, substance, "decline");
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
      const benefit = [...(actor.effects ?? [])].find(
        (e) =>
          e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === substance.id &&
          !/addict/i.test(e.name ?? ""),
      );
      assert.equal(benefit, undefined, "no benefit AE should land for decline");
    });

    it("addicted: applies addiction AE + writes withdrawal entry with computed rests", async () => {
      await applyDragOutcome(actor, substance, "addicted");
      const wMod = substance.flags?.[MODULE_ID]?.[FLAGS.addiction]?.withdrawalMod;
      const con = actor.system?.abilities?.con?.mod ?? 0;
      const expected = computeRestsRemaining(wMod, con);

      const entry = getActorWithdrawalEntry(actor, substance.id);
      assert.ok(entry, "withdrawal entry should be set");
      assert.equal(entry.restsRemaining, expected);

      const ae = findAppliedAddictionEffect(actor, substance.id);
      assert.ok(ae, "addiction AE should exist on actor");
      assert.match(ae.name ?? "", /addict/i);
    });

    it("withdrawing: writes withdrawal entry but applies no addiction AE", async () => {
      await applyDragOutcome(actor, substance, "withdrawing");
      const wMod = substance.flags?.[MODULE_ID]?.[FLAGS.addiction]?.withdrawalMod;
      const con = actor.system?.abilities?.con?.mod ?? 0;
      const expected = computeRestsRemaining(wMod, con);

      const entry = getActorWithdrawalEntry(actor, substance.id);
      assert.ok(entry, "withdrawal entry should be set");
      assert.equal(entry.restsRemaining, expected);

      assert.equal(
        findAppliedAddictionEffect(actor, substance.id),
        null,
        "withdrawing must not apply the addiction AE",
      );
    });

    it("tolerant: applies tolerance AE with stacks=1; second call increments to stacks=2", async () => {
      const result1 = await applyDragOutcome(actor, substance, "tolerant");
      assert.equal(result1?.applied, "tolerant");
      assert.equal(result1?.stacks, 1, "first tolerant should produce stacks=1");

      const tolAe = [...(actor.effects ?? [])].find(
        (e) =>
          e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === substance.id &&
          /tolerance/i.test(e.name ?? ""),
      );
      assert.ok(tolAe, "tolerance AE should be present after first tolerant");

      const result2 = await applyDragOutcome(actor, substance, "tolerant");
      assert.equal(result2?.stacks, 2, "second tolerant should bump to stacks=2");

      const tolerances = [...(actor.effects ?? [])].filter((e) =>
        /tolerance/i.test(e.name ?? ""),
      );
      assert.equal(tolerances.length, 1, "tolerant should not duplicate AEs");
    });

    it("overdosed: applies overdose marker AE", async () => {
      const result = await applyDragOutcome(actor, substance, "overdosed");
      assert.equal(result?.applied, "overdosed");

      const odAe = [...(actor.effects ?? [])].find(
        (e) =>
          e.flags?.[MODULE_ID]?.[FLAGS.sourceSubstanceId] === substance.id &&
          /overdose/i.test(e.name ?? ""),
      );
      assert.ok(odAe, "overdose marker AE should be present");
    });
  });

  describe("shouldShowDialog", () => {
    let pcActor, vehicleActor, substance;

    before(async () => {
      pcActor = await makeActor("S&P show-dialog PC");
      vehicleActor = await Actor.create({ name: "S&P show-dialog Vehicle", type: "vehicle" });
      substance = await embedSubstance(pcActor, { name: "Show-dialog Substance" });
    });

    after(async () => {
      await deleteActor(pcActor);
      if (vehicleActor && !vehicleActor.destroyed) await vehicleActor.delete();
    });

    const gmUser = { isGM: true, role: CONST.USER_ROLES.GAMEMASTER };
    const playerUser = { isGM: false, role: CONST.USER_ROLES.PLAYER };
    const assistantUser = { isGM: false, role: CONST.USER_ROLES.ASSISTANT };

    it("returns true for GM dropping substance on PC", () => {
      assert.equal(shouldShowDialog(gmUser, pcActor, substance), true);
    });

    it("returns true for ASSISTANT dropping substance on PC", () => {
      assert.equal(shouldShowDialog(assistantUser, pcActor, substance), true);
    });

    it("returns false for player dropping substance on PC", () => {
      assert.equal(shouldShowDialog(playerUser, pcActor, substance), false);
    });

    it("returns false for GM dropping substance on vehicle actor", () => {
      assert.equal(shouldShowDialog(gmUser, vehicleActor, substance), false);
    });
  });
}

// ─── Batch: Poisoned-coupling tri-state ────────────────────────────────────

function couplingModesBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("addictionPoisonedCoupling setting drives AE-apply behavior", () => {
    const COUPLING_KEY = "addictionPoisonedCoupling";
    let actor;
    let originalCoupling;
    const cleanup = [];

    before(async () => {
      actor = await makeActor("S&P coupling-modes test");
      originalCoupling = game.settings.get(MODULE_ID, COUPLING_KEY);
    });

    after(async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, originalCoupling);
      await deleteActor(actor);
    });

    afterEach(async () => {
      while (cleanup.length) {
        const item = cleanup.pop();
        if (item && actor.items.get(item.id)) await item.delete().catch(() => {});
      }
      for (const effect of [...(actor.effects ?? [])]) {
        await effect.delete({ fishutIntentional: true }).catch(() => {});
      }
      await actor.unsetFlag(MODULE_ID, FLAGS.withdrawal);
      await game.settings.set(MODULE_ID, COUPLING_KEY, "linked-cascade");
    });

    async function makeSubstanceWithPoisonedTemplate(name) {
      const sub = await embedSubstance(actor, { name });
      const ae = sub.effects.contents[0];
      await ae.update({ name: `${name} Addiction`, statuses: ["poisoned"] });
      cleanup.push(sub);
      return sub;
    }

    async function makeSubstanceWithoutStatuses(name) {
      const sub = await embedSubstance(actor, { name });
      const ae = sub.effects.contents[0];
      await ae.update({ name: `${name} Addiction` });
      cleanup.push(sub);
      return sub;
    }

    it("linked-cascade: applied AE retains the template's poisoned status", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "linked-cascade");
      const sub = await makeSubstanceWithPoisonedTemplate("Cascade Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created, "AE must be created");
      const statuses = [...(created.statuses ?? [])];
      assert.ok(statuses.includes("poisoned"), `expected poisoned in ${JSON.stringify(statuses)}`);
    });

    it("linked-isolated: applied AE retains poisoned status (link still visible)", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "linked-isolated");
      const sub = await makeSubstanceWithPoisonedTemplate("Isolated Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);
      const statuses = [...(created.statuses ?? [])];
      assert.ok(statuses.includes("poisoned"), `expected poisoned in ${JSON.stringify(statuses)}`);
    });

    it("independent: applied AE strips poisoned from statuses", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "independent");
      const sub = await makeSubstanceWithPoisonedTemplate("Independent Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);
      const statuses = [...(created.statuses ?? [])];
      assert.ok(
        !statuses.includes("poisoned"),
        `expected poisoned to be stripped, got ${JSON.stringify(statuses)}`,
      );
    });

    it("independent: leaves unrelated statuses on the template intact", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "independent");
      const sub = await embedSubstance(actor, { name: "Independent Multi-status Sub" });
      const ae = sub.effects.contents[0];
      await ae.update({
        name: "Multi Addiction",
        statuses: ["poisoned", "frightened"],
      });
      cleanup.push(sub);
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);
      const statuses = [...(created.statuses ?? [])];
      assert.ok(!statuses.includes("poisoned"), "poisoned must be stripped");
      assert.ok(statuses.includes("frightened"), "unrelated statuses must remain");
    });

    it("linked-isolated: onPreDeleteActiveEffect cancels external deletes of addiction AE", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "linked-isolated");
      const sub = await makeSubstanceWithPoisonedTemplate("Guard Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);

      // Simulate Foundry's hook callback for an external (un-flagged) delete.
      const blocked = api().addiction.onPreDeleteActiveEffect(created, {}, game.user.id);
      assert.equal(blocked, false, "guard must return false to cancel external delete");

      // And the inverse — a delete marked intentional must NOT be blocked.
      const allowed = api().addiction.onPreDeleteActiveEffect(
        created,
        { fishutIntentional: true },
        game.user.id,
      );
      assert.notEqual(allowed, false, "intentional delete must not be cancelled");
    });

    it("linked-cascade: onPreDeleteActiveEffect does not block external deletes", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "linked-cascade");
      const sub = await makeSubstanceWithPoisonedTemplate("Cascade Guard Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);
      const result = api().addiction.onPreDeleteActiveEffect(created, {}, game.user.id);
      assert.notEqual(result, false, "cascade mode must let Foundry's native cascade run");
    });

    it("independent: onPreDeleteActiveEffect does not block external deletes", async () => {
      await game.settings.set(MODULE_ID, COUPLING_KEY, "independent");
      const sub = await makeSubstanceWithoutStatuses("Independent Guard Sub");
      const created = await api().addiction.applyAddictionEffect(actor, sub);
      assert.ok(created);
      const result = api().addiction.onPreDeleteActiveEffect(created, {}, game.user.id);
      assert.notEqual(result, false, "independent mode must not block deletes");
    });

    it("isAppliedAddictionEffect: returns false for tolerance / withdrawal AEs", async () => {
      const sub = await makeSubstanceWithPoisonedTemplate("Predicate Sub");
      const addictionAE = await api().addiction.applyAddictionEffect(actor, sub);
      assert.equal(api().addiction.isAppliedAddictionEffect(addictionAE), true);

      const [tolAE] = await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: `Tolerance to ${sub.name} (1)`,
          icon: "icons/svg/upgrade.svg",
          changes: [],
          flags: { [MODULE_ID]: { [FLAGS.sourceSubstanceId]: sub.id } },
        },
      ]);
      assert.equal(
        api().addiction.isAppliedAddictionEffect(tolAE),
        false,
        "tolerance AE must NOT count as an addiction AE",
      );

      const [withdrawAE] = await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: `Withdrawal Bite — ${sub.name}`,
          icon: "icons/svg/sleep.svg",
          changes: [],
          flags: { [MODULE_ID]: { [FLAGS.sourceSubstanceId]: sub.id } },
        },
      ]);
      assert.equal(
        api().addiction.isAppliedAddictionEffect(withdrawAE),
        false,
        "withdrawal AE must NOT count as an addiction AE",
      );

      const [unrelatedAE] = await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Random Buff",
          icon: "icons/svg/aura.svg",
          changes: [],
          flags: {},
        },
      ]);
      assert.equal(
        api().addiction.isAppliedAddictionEffect(unrelatedAE),
        false,
        "unflagged AE must NOT count as an addiction AE",
      );
    });
  });
}

// ─── Batch: Simulate-dose round-trip + cleanup ──────────────────────────────

const SIM_TEST_PREFIX = "__fishut-test-";

function countTestActors() {
  return [...(game.actors ?? [])].filter(
    (a) => typeof a?.name === "string" && a.name.startsWith(SIM_TEST_PREFIX),
  ).length;
}

async function purgeOrphanTestActors() {
  const orphans = [...(game.actors ?? [])].filter(
    (a) => typeof a?.name === "string" && a.name.startsWith(SIM_TEST_PREFIX),
  );
  for (const a of orphans) {
    try {
      await a.delete();
    } catch {
      // best-effort
    }
  }
}

function simulateDoseBatch(context) {
  const { describe, it, assert, before, after, beforeEach } = context;

  describe("simulate-dose round-trip + cleanup", () => {
    let host;

    before(async () => {
      host = await makeActor("S&P Simulate-Dose Host");
    });

    beforeEach(async () => {
      await purgeOrphanTestActors();
    });

    after(async () => {
      await purgeOrphanTestActors();
      await deleteActor(host);
    });

    it("happy path: runs against a real substance, ok=true, no orphan actor remains", async () => {
      const sub = await embedSubstance(host, { name: "SimDose Happy Sub" });
      const beforeCount = countTestActors();
      const result = await runSimulation({
        substance: sub,
        conMod: 0,
        addictionState: "none",
        readySubtypes: [],
      });
      assert.equal(result?.ok, true, `runSimulation returned ok=false (error: ${result?.error})`);
      assert.equal(
        countTestActors(),
        beforeCount,
        "simulate-dose left a __fishut-test-* actor behind",
      );
    });

    it("invalid substance: returns ok=false without creating an actor", async () => {
      const beforeCount = countTestActors();
      const result = await runSimulation({ substance: null });
      assert.equal(result?.ok, false);
      assert.equal(
        countTestActors(),
        beforeCount,
        "invalid-substance path must not create a test actor",
      );
    });

    it("orphan sweep: deletes leftover __fishut-test-* actors", async () => {
      const orphan = await Actor.create({
        name: `${SIM_TEST_PREFIX}fakeorphan__SweepTarget`,
        type: "character",
      });
      assert.ok(orphan, "could not create orphan fixture");
      const swept = await sweepOrphanedTestActors();
      assert.ok(swept >= 1, `expected at least 1 actor swept (got ${swept})`);
      assert.equal(
        game.actors.get(orphan.id),
        undefined,
        "orphan actor still present after sweep",
      );
    });
  });
}

// ─── Batch: Long-rest abstain flow ──────────────────────────────────────────

function longRestAbstainFlowBatch(context) {
  const { describe, it, assert, before, after, beforeEach } = context;

  describe("voluntary abstain — composition with GM rest tick", () => {
    let actor;

    before(async () => {
      actor = await makeActor("S&P Abstain Test Actor");
    });

    beforeEach(async () => {
      // Wipe any existing withdrawal entries between tests.
      const map = getActorWithdrawal(actor) ?? {};
      for (const id of Object.keys(map)) {
        await actor.unsetFlag(MODULE_ID, `withdrawal.${id}`);
      }
    });

    after(async () => {
      await deleteActor(actor);
    });

    it("DC formula: 8 + Math.floor(withdrawalMod), min 8", () => {
      assert.equal(defaultAbstainDc(0), 8);
      assert.equal(defaultAbstainDc(2), 10);
      assert.equal(defaultAbstainDc(4), 12);
      assert.equal(defaultAbstainDc(-1), 7, "DC formula does not floor negatives");
      assert.equal(defaultAbstainDc(NaN), 8, "non-finite mod falls back to 8");
    });

  });
}

// ─── Batch: Remove-X macro presence ─────────────────────────────────────────

function removeXMacrosBatch(context) {
  const { describe, it, assert, before } = context;

  describe("Remove-X macros are present in the fishut-illicit-macros pack", () => {
    let macros;

    before(async () => {
      const pack = game.packs.get(`${MODULE_ID}.fishut-illicit-macros`);
      macros = pack ? await pack.getDocuments() : [];
    });

    it("Remove Tolerance macro is present and is a script macro", () => {
      const macro = macros.find((m) => m.name === "Remove Tolerance");
      assert.ok(macro, "Remove Tolerance macro missing from compendium");
      assert.equal(macro.type, "script");
      assert.match(macro.command ?? "", /tolerance/i, "macro body should reference tolerance");
    });

    it("Remove Overdose macro is present and is a script macro", () => {
      const macro = macros.find((m) => m.name === "Remove Overdose");
      assert.ok(macro, "Remove Overdose macro missing from compendium");
      assert.equal(macro.type, "script");
      assert.match(macro.command ?? "", /overdose/i, "macro body should reference overdose");
    });

    it("Remove Withdrawal macro is present and is a script macro", () => {
      const macro = macros.find((m) => m.name === "Remove Withdrawal");
      assert.ok(macro, "Remove Withdrawal macro missing from compendium");
      assert.equal(macro.type, "script");
      assert.match(macro.command ?? "", /withdraw/i, "macro body should reference withdraw");
    });

    it("All four Remove-X macros are GM-gated", () => {
      const names = ["Remove Addiction", "Remove Tolerance", "Remove Overdose", "Remove Withdrawal"];
      for (const name of names) {
        const macro = macros.find((m) => m.name === name);
        assert.ok(macro, `${name} macro missing`);
        assert.match(
          macro.command ?? "",
          /game\.user\.isGM/,
          `${name} macro should gate on game.user.isGM`,
        );
      }
    });
  });
}

// ─── Batch: Withdrawal vignette mounts to #interface ────────────────────────

function withdrawalVignetteBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("withdrawal vignette tracks owned-actor withdrawal AEs", () => {
    let actor;

    before(async () => {
      actor = await makeActor("S&P vignette test");
    });

    after(async () => {
      // Strip any leftover vignette so subsequent batches start clean.
      const el = document.querySelector("#interface > .fishut-vignette");
      if (el) el.remove();
      await deleteActor(actor);
    });

    afterEach(async () => {
      const effects = [...(actor.effects ?? [])];
      for (const e of effects) await e.delete();
      // Let the microtask-coalesced refresh settle.
      await new Promise((r) => setTimeout(r, 50));
    });

    it("mounts a fixed-position vignette div with data-active=true while a withdrawal AE is owned", async () => {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Quench Vignette Withdrawal",
          img: "icons/svg/poison.svg",
          changes: [],
          disabled: false,
        },
      ]);
      await new Promise((r) => setTimeout(r, 50));
      const el = document.querySelector("#interface > .fishut-vignette");
      assert.ok(el, "vignette element should be appended to #interface");
      assert.equal(el.dataset.active, "true");
    });

    it("flips data-active to false when the withdrawal AE is removed", async () => {
      const [ae] = await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Quench Vignette Withdrawal",
          img: "icons/svg/poison.svg",
          changes: [],
          disabled: false,
        },
      ]);
      await new Promise((r) => setTimeout(r, 50));
      const onMount = document.querySelector("#interface > .fishut-vignette");
      assert.ok(onMount, "vignette should mount while AE is present");
      assert.equal(onMount.dataset.active, "true");

      await ae.delete();
      await new Promise((r) => setTimeout(r, 50));
      const afterDelete = document.querySelector("#interface > .fishut-vignette");
      // Element is intentionally left in DOM so the opacity transition runs;
      // it just flips inactive.
      assert.ok(afterDelete, "vignette element stays in DOM (kept for fade-out transition)");
      assert.equal(afterDelete.dataset.active, "false");
    });

    it("never matches AEs whose name does not contain 'withdraw'", async () => {
      // Strip any inactive leftover so we can detect a no-mount cleanly.
      const stale = document.querySelector("#interface > .fishut-vignette");
      if (stale) stale.remove();

      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Some Random AE",
          img: "icons/svg/aura.svg",
          changes: [],
          disabled: false,
        },
      ]);
      await new Promise((r) => setTimeout(r, 50));
      const el = document.querySelector("#interface > .fishut-vignette");
      // No /withdraw/i AE → refresh sees no match → no mount path runs.
      assert.equal(el, null, "non-withdrawal AE must not trigger the vignette");
    });

    it("ignores disabled withdrawal AEs", async () => {
      const stale = document.querySelector("#interface > .fishut-vignette");
      if (stale) stale.remove();

      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Quench Vignette Withdrawal (disabled)",
          img: "icons/svg/poison.svg",
          changes: [],
          disabled: true,
        },
      ]);
      await new Promise((r) => setTimeout(r, 50));
      const el = document.querySelector("#interface > .fishut-vignette");
      assert.equal(el, null, "disabled withdrawal AE must not trigger the vignette");
    });

    it("vignette CSS is loaded — element computed style sits below dialog stacking", async () => {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Quench Vignette Withdrawal",
          img: "icons/svg/poison.svg",
          changes: [],
          disabled: false,
        },
      ]);
      await new Promise((r) => setTimeout(r, 50));
      const el = document.querySelector("#interface > .fishut-vignette");
      assert.ok(el, "vignette element should exist");
      const cs = getComputedStyle(el);
      assert.equal(cs.position, "fixed", "vignette must be position:fixed");
      assert.equal(cs.pointerEvents, "none", "vignette must not block clicks");
      // z-index 1 keeps the vignette above the canvas but below Foundry app
      // windows / notifications which render at much higher layers.
      assert.equal(cs.zIndex, "1");
    });
  });
}

// ─── Batch: TMFX preset round-trip ──────────────────────────────────────────

function tmfxPresetsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("TMFX presets are registered into the tmfx-main library", () => {
    let tm;
    let token;
    const addedFilterIds = [];

    before(() => {
      tm = globalThis.TokenMagic;
    });

    after(async () => {
      // Strip any filter we added so the test never leaves residue on a
      // canvas token. Filters are keyed by filterId, which TMFX overwrites
      // with the preset name during registration.
      if (token && tm && typeof tm.deleteFilters === "function") {
        for (const filterId of addedFilterIds) {
          try {
            await tm.deleteFilters(token, filterId);
          } catch {
            // Filter already gone or never landed — fine.
          }
        }
      }
    });

    it("TokenMagic global is bound (TMFX is required, so this must be true)", () => {
      assert.ok(tm, "globalThis.TokenMagic must be defined when TMFX is active");
      assert.equal(typeof tm.getPreset, "function", "TokenMagic.getPreset must exist");
      assert.equal(typeof tm.addPreset, "function", "TokenMagic.addPreset must exist");
    });

    it("verifyTmfxPresets reports all 9 presets registered, none missing", () => {
      const { registered, missing } = verifyTmfxPresets();
      assert.equal(
        registered.length,
        Object.keys(PRESETS).length,
        `expected ${Object.keys(PRESETS).length} registered, got ${registered.length}`,
      );
      assert.equal(
        missing.length,
        0,
        `presets missing from tmfx-main: ${missing.join(", ") || "(none)"}`,
      );
    });

    for (const name of Object.keys(PRESETS)) {
      it(`preset "${name}" is retrievable via TokenMagic.getPreset`, () => {
        const preset = tm.getPreset({ name, library: PRESET_LIBRARY });
        assert.ok(preset, `getPreset returned null/undefined for ${name}`);
      });
    }

    it("addFilters round-trip lands the preset on a canvas token (skips if no token)", async () => {
      const candidate = canvas?.tokens?.placeables?.[0];
      if (!candidate) {
        // No token on canvas — skip cleanly. Quench prints `it` as passing
        // but we surface the skip via a self-documenting assert message.
        assert.ok(true, "no token on canvas — round-trip skipped");
        return;
      }
      token = candidate;
      const presetName = "fishut-tmfx-fantasy-stimulant";

      await tm.addFilters(token, presetName);
      addedFilterIds.push(presetName);

      const hasFilter =
        typeof tm.hasFilterId === "function"
          ? tm.hasFilterId(token, presetName)
          : Boolean(token.TMFXhasFilterId?.(presetName));
      assert.ok(hasFilter, `token should have filter ${presetName} after addFilters`);
    });
  });
}

// ─── Batch: aeRole — renamed AE still removable via the flag ────────────────

function aeRoleRenameBatch(context) {
  const { describe, it, assert, beforeEach, afterEach } = context;

  describe("S&P · aeRole — renamed AE still removable", () => {
    let actor, substance;

    beforeEach(async () => {
      actor = await makeActor("Quench aeRole Rename");
      const items = await loadPackItems("fishut-illicit-substance");
      const src = items.find((i) => i?.name?.startsWith("Coalshade") && isSubstance(i));
      if (src) {
        [substance] = await actor.createEmbeddedDocuments("Item", [src.toObject()]);
      }
    });

    afterEach(async () => {
      await deleteActor(actor);
    });

    it("Remove Addiction macro finds AE renamed to a non-matching name via the aeRole flag", async () => {
      assert.ok(substance, "Coalshade substance must be importable from the shipped pack");

      await api().addiction.applyAddictionEffect(actor, substance);

      const ae = actor.effects.find(
        (e) => e.flags?.[MODULE_ID]?.aeRole === "addiction",
      );
      assert.ok(ae, "addiction AE should exist after applyAddictionEffect");

      // Rename to a non-matching string (German for "poisoned by coalshade powder")
      // so the substring fallback (`/addict/i`) cannot find it.
      await ae.update({ name: "Toxisch durch Kohlenschattenpulver" });

      // Simulate the Remove Addiction macro body (flag-first lookup).
      const matches = actor.effects.filter(
        (e) => e.flags?.[MODULE_ID]?.aeRole === "addiction",
      );
      assert.equal(matches.length, 1, "flag-first lookup must find the renamed AE");
      await actor.deleteEmbeddedDocuments(
        "ActiveEffect",
        matches.map((m) => m.id),
      );
      const remaining = actor.effects.filter(
        (e) => e.flags?.[MODULE_ID]?.aeRole === "addiction",
      );
      assert.equal(remaining.length, 0, "AE should be removed after delete");
    });
  });
}

// ─── Batch: aeRole — hand-authored AE warn-logs on substring fallback ───────

function aeRoleFallbackWarnBatch(context) {
  const { describe, it, assert, beforeEach, afterEach } = context;

  describe("S&P · aeRole — hand-authored AE without flag warn-logs", () => {
    let actor, originalWarn, warnCalls;

    beforeEach(async () => {
      actor = await makeActor("Quench Fallback Warn");
      warnCalls = [];
      // Spy on the module logger's `warn`. The logger object is a plain
      // exported singleton (see scripts/logger.js), so reassigning its
      // `warn` property is observable from the helper at the call site.
      originalWarn = logger.warn;
      logger.warn = (...args) => {
        warnCalls.push(args);
        originalWarn.apply(logger, args);
      };
    });

    afterEach(async () => {
      logger.warn = originalWarn;
      await deleteActor(actor);
    });

    it("findEffectsByRole emits a warn when matching via substring fallback", async () => {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Hand-authored Withdrawal AE",
          icon: "icons/svg/poison.svg",
          changes: [],
          duration: {},
        },
      ]);

      const found = api().flagSchema.findEffectsByRole(actor, "withdrawal");
      assert.equal(found.length, 1, "substring fallback must match the hand-authored AE");
      assert.equal(found[0].name, "Hand-authored Withdrawal AE");

      // Secondary: the logger spy should have captured at least one warn.
      // If the logger module ever switches to a frozen export the spy will
      // silently no-op — fall back to inspecting `actor.effects` only via
      // the primary `found.length` assert above.
      assert.ok(
        warnCalls.length >= 1,
        `expected at least one logger.warn for substring fallback (got ${warnCalls.length})`,
      );
    });
  });
}

// ─── Batch: Voluntary Abstain — fail triggers consumption ───────────────────

function abstainFailConsumesBatch(context) {
  const { describe, it, assert, beforeEach, afterEach } = context;

  describe("S&P · Voluntary Abstain · fail triggers consumption", () => {
    let actor, substance;

    beforeEach(async () => {
      const cls = CONFIG.Actor.documentClass;
      actor = await cls.create({
        name: "Quench Abstain Fail",
        type: "character",
        system: { abilities: { wis: { value: 3 } } }, // Wis -4, very low save
      });
      const items = await loadPackItems("fishut-illicit-substance");
      const src = items.find((i) => i?.name === "Coalshade Powder" && isSubstance(i));
      if (src) {
        [substance] = await actor.createEmbeddedDocuments("Item", [src.toObject()]);
        await substance.update({ "system.uses.value": 1, "system.uses.max": 1 });
        // Plant an active withdrawal AE so processAbstainFailure has a row to act on.
        await actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: `Withdrawal from ${substance.name}`,
            icon: "icons/svg/poison.svg",
            flags: {
              [MODULE_ID]: {
                aeRole: "withdrawal",
                [FLAGS.sourceSubstanceId]: substance.id,
              },
            },
          },
        ]);
      }
    });

    afterEach(async () => {
      if (actor) await deleteActor(actor);
    });

    it("fail path: uses decrement and addiction/tolerance/overdose chain runs", async () => {
      assert.ok(substance, "Coalshade substance must be importable from the shipped pack");
      const row = {
        substanceId: substance.id,
        itemName: substance.name,
        dc: 99, // unreachable → forced fail
        withdrawalMod: 4,
      };
      const before = Number(actor.items.get(substance.id).system.uses.value);
      await processAbstainFailure(actor, row);
      // Foundry's activity.use() is async + emits its own chat; allow microtask flush.
      await new Promise((r) => setTimeout(r, 100));
      const after = Number(actor.items.get(substance.id).system.uses.value);
      assert.equal(after, before - 1, "consumption fired and decremented uses by 1");
    });
  });
}

// ─── Batch: Voluntary Abstain — fail with no inventory soft-fails ───────────

function abstainFailSoftBatch(context) {
  const { describe, it, assert, beforeEach, afterEach } = context;

  describe("S&P · Voluntary Abstain · fail with no inventory soft-fails", () => {
    let actor;

    beforeEach(async () => {
      const cls = CONFIG.Actor.documentClass;
      actor = await cls.create({ name: "Quench Abstain SoftFail", type: "character" });
    });

    afterEach(async () => {
      if (actor) await deleteActor(actor);
    });

    it("missing inventory item posts FailNoSubstance and does not throw", async () => {
      const row = {
        substanceId: "nonexistent-item-id",
        itemName: "Coalshade Powder",
        dc: 99,
        withdrawalMod: 4,
      };
      // Should resolve without throwing.
      await processAbstainFailure(actor, row);
      // Inspect the recent chat history for the FailNoSubstance message.
      // Pull the expected text from the i18n bundle so a future locale string
      // tweak doesn't break this assertion.
      const expected = game.i18n.format("FISHUT.LongRestAbstain.FailNoSubstance", {
        actor: actor.name,
        item: "Coalshade Powder",
      });
      const recent = game.messages?.contents?.slice(-3) ?? [];
      const hit = recent.some((m) => m.content === expected);
      assert.ok(hit, "FailNoSubstance chat card emitted");
    });
  });
}
