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
  getAddictionEffectId,
  getAddictionSave,
  getCategory,
  getKind,
  getModifier,
  getRequiredSubtypes,
  getSetting,
  getSubtype,
  getWithdrawalMod,
  getActorWithdrawal,
  getActorWithdrawalEntry,
  isParaphernalia,
  isSubstance,
  setRequiredSubtypes,
} from "../../scripts/data/flag-schema.js";
import { actorHasSubtype, inspectSubtypeOnActor } from "../../scripts/data/references.js";
import {
  createBypassStubAE,
  persistField,
  persistKindToggle,
} from "../../scripts/ui/details-tab.js";
import { computeRestsRemaining } from "../../scripts/data/withdrawal.js";
import { applyDragOutcome, shouldShowDialog } from "../../scripts/hooks/drag-to-inventory.js";

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
      `${BATCH_PREFIX}.kind-toggle`,
      kindToggleBatch,
      { displayName: "S&P · Details-tab kind toggle round-trip" },
    );
    quench.registerBatch(
      `${BATCH_PREFIX}.drag-to-inventory-dialog`,
      dragToInventoryBatch,
      { displayName: "S&P · Drag-to-inventory state injection" },
    );
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
          [FLAGS.requiredSubtypes]: [],
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
    await item.update({ [`flags.${MODULE_ID}.${FLAGS.addiction}.addictionEffectId`]: ae.id });
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

    it("references an addiction AE that exists on the same item and matches /addict/i", () => {
      for (const item of substances) {
        const id = getAddiction(item)?.addictionEffectId;
        assert.ok(id, `${item.name}: addictionEffectId is required`);
        const ae =
          item.effects?.get?.(id) ?? [...(item.effects ?? [])].find((e) => e.id === id || e._id === id);
        assert.ok(ae, `${item.name}: addictionEffectId ${id} not found on item.effects`);
        assert.match(
          ae.name ?? "",
          /addict/i,
          `${item.name}: addiction AE name "${ae.name}" must contain "addict"`,
        );
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
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "smokestick" } },
      });
      try {
        const arr = inspectSubtypeOnActor(actor, "smokestick");
        assert.equal(arr.length, 1);
        assert.equal(arr[0].ready, false);
        assert.equal(arr[0].reason, "missing");
        assert.equal(actorHasSubtype(actor, "smokestick"), false);
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
        flags: {
          [MODULE_ID]: {
            [FLAGS.requiredSubtypes]: [],
          },
        },
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
        flags: { [MODULE_ID]: { [FLAGS.subtype]: "pipe" } },
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
        flags: { [MODULE_ID]: { [FLAGS.requiredSubtypes]: [] } },
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
        flags: { [MODULE_ID]: { [FLAGS.requiredSubtypes]: [] } },
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

    it("persists setting and clears on empty value", async () => {
      await persistField(substance, "setting", "modern");
      assert.equal(getSetting(substance), "modern");
      await persistField(substance, "setting", "");
      assert.equal(getSetting(substance), null);
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

    it("persists withdrawalMod as integer", async () => {
      await persistField(substance, "withdrawalMod", "6");
      assert.equal(getWithdrawalMod(substance), 6);
    });

    it("clears withdrawalMod when value is empty", async () => {
      await persistField(substance, "withdrawalMod", "");
      assert.equal(getWithdrawalMod(substance), null);
    });

    it("persists addictionEffectId and clears on empty value", async () => {
      const ae = substance.effects?.contents?.[0];
      assert.ok(ae, "embedSubstance should produce one AE");
      await persistField(substance, "addictionEffectId", ae.id);
      assert.equal(getAddictionEffectId(substance), ae.id);
      await persistField(substance, "addictionEffectId", "");
      assert.equal(getAddictionEffectId(substance), null);
    });

    it("round-trips requiredSubtypes via setRequiredSubtypes", async () => {
      await setRequiredSubtypes(substance, ["pipe", "vial"]);
      assert.deepEqual(getRequiredSubtypes(substance), ["pipe", "vial"]);
    });

    it("clears requiredSubtypes when set to empty array", async () => {
      await setRequiredSubtypes(substance, ["pipe"]);
      assert.deepEqual(getRequiredSubtypes(substance), ["pipe"]);
      await setRequiredSubtypes(substance, []);
      assert.deepEqual(getRequiredSubtypes(substance), []);
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

    it("persists setting and clears on empty value", async () => {
      await persistField(paraphernalia, "setting", "modern");
      assert.equal(getSetting(paraphernalia), "modern");
      await persistField(paraphernalia, "setting", "");
      assert.equal(getSetting(paraphernalia), null);
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
      assert.equal(block.type, "auto-pass");
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
