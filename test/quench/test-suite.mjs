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
  getAddictionSaveBypass,
  getAdministration,
  getActorWithdrawal,
  getActorWithdrawalEntry,
  isParaphernalia,
  isSubstance,
} from "../../scripts/data/flag-schema.js";
import { inspectParaphernalia } from "../../scripts/data/references.js";

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
      { displayName: "S&P · inspectParaphernalia readiness" },
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
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ADMIN_VALUES = new Set(["inhaled", "ingested", "injected", "sublingual", "topical"]);

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
      system: { quantity: 1, uses: { spent: 0, max: "1" } },
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
          [FLAGS.administration]: "inhaled",
          [FLAGS.addiction]: {
            save: { ability: "con", dc: 13 },
            withdrawalMod: 4,
          },
          [FLAGS.requiredParaphernalia]: [],
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
          [FLAGS.paraphernaliaId]: overrides.flags?.[MODULE_ID]?.[FLAGS.paraphernaliaId] ?? "test-paraphernalia",
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

    it("declares a valid administration", () => {
      for (const item of substances) {
        const a = getAdministration(item);
        assert.ok(
          ADMIN_VALUES.has(a),
          `${item.name}: administration must be one of ${[...ADMIN_VALUES].join("|")}, got ${a}`,
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

    describe("with addictionSaveBypass set", () => {
      it("uses type 'auto-pass' (only supported value in v2)", () => {
        for (const item of paraphernalia) {
          const bypass = getAddictionSaveBypass(item);
          if (!bypass) continue;
          assert.equal(
            bypass.type,
            "auto-pass",
            `${item.name}: bypass.type must be 'auto-pass' (got ${bypass.type})`,
          );
        }
      });

      it("declares appliesTo as a non-empty array of valid administrations", () => {
        for (const item of paraphernalia) {
          const bypass = getAddictionSaveBypass(item);
          if (!bypass) continue;
          assert.ok(
            Array.isArray(bypass.appliesTo) && bypass.appliesTo.length > 0,
            `${item.name}: appliesTo must be a non-empty array`,
          );
          for (const a of bypass.appliesTo) {
            assert.ok(
              ADMIN_VALUES.has(a),
              `${item.name}: appliesTo contains invalid administration "${a}"`,
            );
          }
        }
      });

      it("declares a usesPerDay value", () => {
        for (const item of paraphernalia) {
          const bypass = getAddictionSaveBypass(item);
          if (!bypass) continue;
          assert.ok(
            bypass.usesPerDay !== undefined && bypass.usesPerDay !== null && bypass.usesPerDay !== "",
            `${item.name}: usesPerDay must be set`,
          );
        }
      });

      it("ships with system.uses.recovery containing a daily/recoverAll entry", () => {
        for (const item of paraphernalia) {
          const bypass = getAddictionSaveBypass(item);
          if (!bypass) continue;
          const recovery = item.system?.uses?.recovery;
          assert.ok(
            Array.isArray(recovery) &&
              recovery.some((r) => r?.period === "day" && r?.type === "recoverAll"),
            `${item.name}: must declare system.uses.recovery: [{ period: "day", type: "recoverAll" }]`,
          );
        }
      });
    });
  });
}

// ─── Batch: inspectParaphernalia readiness ──────────────────────────────────

function referencesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("inspectParaphernalia(actor, ref)", () => {
    let actor;

    before(async () => {
      actor = await makeActor("S&P refs test");
    });

    after(async () => {
      await deleteActor(actor);
    });

    it("returns missing when nothing on the actor matches the slug", () => {
      const r = inspectParaphernalia(actor, "absent-slug");
      assert.equal(r.item, null);
      assert.equal(r.ready, false);
      assert.equal(r.reason, "missing");
    });

    it("returns ready when an equipped item matches by slug", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Equipped Test Pipe",
        flags: { [MODULE_ID]: { [FLAGS.paraphernaliaId]: "ref-equipped" } },
      });
      try {
        const r = inspectParaphernalia(actor, "ref-equipped");
        assert.equal(r.ready, true);
        assert.equal(r.reason, null);
        assert.equal(r.item?.id, item.id);
      } finally {
        await item.delete();
      }
    });

    it("returns unequipped when equipment isn't equipped", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Unequipped Test Pipe",
        system: { equipped: false },
        flags: { [MODULE_ID]: { [FLAGS.paraphernaliaId]: "ref-unequipped" } },
      });
      try {
        const r = inspectParaphernalia(actor, "ref-unequipped");
        assert.equal(r.ready, false);
        assert.equal(r.reason, "unequipped");
      } finally {
        await item.delete();
      }
    });

    it("returns missing when consumable quantity is 0", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Empty Test Papers",
        type: "consumable",
        system: { quantity: 0 },
        flags: { [MODULE_ID]: { [FLAGS.paraphernaliaId]: "ref-no-qty" } },
      });
      try {
        const r = inspectParaphernalia(actor, "ref-no-qty");
        assert.equal(r.ready, false);
        assert.equal(r.reason, "missing");
      } finally {
        await item.delete();
      }
    });

    it("returns unattuned when attunement is required but not satisfied", async () => {
      const item = await embedParaphernalia(actor, {
        name: "Unattuned Test Pipe",
        system: { equipped: true, attunement: "required", attuned: false },
        flags: { [MODULE_ID]: { [FLAGS.paraphernaliaId]: "ref-unattuned" } },
      });
      try {
        const r = inspectParaphernalia(actor, "ref-unattuned");
        assert.equal(r.ready, false);
        assert.equal(r.reason, "unattuned");
      } finally {
        await item.delete();
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

    it("on bypass outcome posts chat + applies no AE/flag", async () => {
      await api().addiction.applyOutcome(actor, substance, {
        bypass: { bypassed: true, paraphernalia: { name: "Test Pipe" }, type: "auto-pass" },
      });
      assert.equal(getActorWithdrawalEntry(actor, substance.id), null);
      assert.equal(findAppliedAddictionEffect(actor, substance.id), null);
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

    async function makePipe({ appliesTo = ["inhaled"], usesMax = "4", spent = 0 } = {}) {
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
            [FLAGS.paraphernaliaId]: "test-bypass-pipe",
            [FLAGS.addictionSaveBypass]: { type: "auto-pass", appliesTo, usesPerDay: usesMax },
          },
        },
      });
      cleanup.push(pipe);
      return pipe;
    }

    async function makeSubstance({ administration = "inhaled", anyOf = ["test-bypass-pipe"] } = {}) {
      const sub = await embedSubstance(actor, {
        name: "Test Bypass Substance",
        flags: {
          [MODULE_ID]: {
            [FLAGS.administration]: administration,
            [FLAGS.requiredParaphernalia]: anyOf.length ? [{ anyOf }] : [],
          },
        },
      });
      cleanup.push(sub);
      return sub;
    }

    it("returns bypassed:true and increments pipe.system.uses.spent when matching pipe is ready", async () => {
      const pipe = await makePipe();
      const sub = await makeSubstance();
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.bypassed, true);
      assert.equal(result.type, "auto-pass");
      // Reread spent from the actor's copy of the pipe.
      assert.equal(actor.items.get(pipe.id).system.uses.spent, 1);
    });

    it("returns bypassed:false when substance has no administration", async () => {
      await makePipe();
      const sub = await makeSubstance({ administration: undefined });
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.bypassed, false);
    });

    it("returns bypassed:false when pipe.appliesTo does not cover the administration", async () => {
      await makePipe({ appliesTo: ["sublingual"] });
      const sub = await makeSubstance({ administration: "inhaled" });
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.bypassed, false);
    });

    it("returns bypassed:false when bypass-grantor is not in requiredParaphernalia", async () => {
      await makePipe();
      const sub = await makeSubstance({ anyOf: ["different-paraphernalia"] });
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.bypassed, false);
    });

    it("returns bypassed:false when all matching pipes have 0 uses remaining", async () => {
      // spent = max → 0 remaining
      await makePipe({ usesMax: "2", spent: 2 });
      const sub = await makeSubstance();
      const result = await api().saveBypass.consumeBypassIfAvailable(actor, sub);
      assert.equal(result.bypassed, false);
    });
  });
}
