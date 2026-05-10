import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkSubstance,
  checkParaphernalia,
} from "../../tools/validate-content-checks.mjs";

const SCOPE = "substances-and-paraphernalia";

function baseSubstance(overrides = {}) {
  return {
    relPath: "_source/fishut-illicit-substance/test.json",
    data: {
      name: "Test Substance",
      type: "consumable",
      system: { type: { value: "poison", subtype: "inhaled" } },
      flags: {
        [SCOPE]: {
          kind: "substance",
          schemaVersion: 2,
          category: "stimulant",
          setting: "fantasy",
          addiction: {
            save: { ability: "con", dc: 14 },
            addictionEffectId: "ae-addict-001",
          },
          withdrawal: { mod: 3 },
        },
      },
      effects: [
        {
          _id: "ae-addict-001",
          name: "Addicted to Test Substance",
          changes: [],
          flags: {},
        },
      ],
      ...overrides,
    },
  };
}

function baseParaphernalia(overrides = {}) {
  return {
    relPath: "_source/fishut-illicit-paraphernalia/test.json",
    data: {
      name: "Test Pipe",
      type: "equipment",
      system: { uses: { recovery: [] } },
      flags: {
        [SCOPE]: {
          kind: "paraphernalia",
          schemaVersion: 2,
          subtype: "pipe",
        },
      },
      effects: [],
      ...overrides,
    },
  };
}

describe("checkSubstance — v0.3 baseline (regression)", () => {
  it("passes a clean substance unchanged", () => {
    const { errors, warnings } = checkSubstance(baseSubstance());
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("errors when kind is wrong", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].kind = "paraphernalia";
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /kind must be "substance"/);
  });

  it("errors when addictionEffectId points at nothing", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].addiction.addictionEffectId = "missing";
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /not found in effects/.test(e)), true);
  });

  it("errors when addiction AE name does not contain 'addict'", () => {
    const file = baseSubstance();
    file.data.effects[0].name = "Tweaky Vibes";
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /must contain "addict"/.test(e)), true);
  });
});

describe("checkSubstance — overdose flag (v0.4)", () => {
  it("accepts a missing overdose flag", () => {
    const file = baseSubstance();
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("accepts a disabled overdose block without further checks", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: false, chancePercent: 0, description: "" };
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("accepts an enabled overdose block with valid chancePercent + description", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = {
      enabled: true,
      chancePercent: 7,
      description: "<p>Heart goes brrr.</p>",
    };
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("errors when chancePercent is missing while enabled", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, description: "x" };
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)), true);
  });

  it("errors when chancePercent is out of 1..100", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 0, description: "x" };
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)), true);
  });

  it("errors when chancePercent is 101", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 101, description: "x" };
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)), true);
  });

  it("errors when description is empty while enabled", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 5, description: "   " };
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /description must be a non-empty string/.test(e)), true);
  });

  it("errors when overdose flag is not an object", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = "yes please";
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /overdose flag must be an object/.test(e)), true);
  });
});

describe("checkSubstance — withdrawal.effectId (v0.4)", () => {
  function withWithdrawalAe(file, ae) {
    file.data.effects.push(ae);
    file.data.flags[SCOPE].withdrawal.effectId = ae._id;
    return file;
  }

  it("accepts a missing withdrawal.effectId", () => {
    const file = baseSubstance();
    const { errors, warnings } = checkSubstance(file);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("errors when withdrawal.effectId points at nothing", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].withdrawal.effectId = "ghost";
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /withdrawal\.effectIds entry "ghost" not found/.test(e)),
      true,
    );
  });

  it("errors when the resolved AE name does not contain 'withdraw'", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, { _id: "wd1", name: "Crash Phase", changes: [], flags: {} });
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /withdrawal AE name .+ must contain "withdraw"/.test(e)), true);
  });

  it("accepts a properly-named withdrawal AE with no content-guidance violations", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, {
      _id: "wd1",
      name: "Withdrawing from Test",
      changes: [
        { key: "system.attributes.exhaustion", mode: 2, value: "1", priority: 20 },
      ],
      flags: {},
    });
    const { errors, warnings } = checkSubstance(file);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("warns when the withdrawal AE imposes disadvantage on attacks", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, {
      _id: "wd1",
      name: "Withdrawing from Test",
      changes: [
        { key: "system.bonuses.msak.attack", mode: 2, value: "disadvantage", priority: 20 },
      ],
      flags: {},
    });
    const { errors, warnings } = checkSubstance(file);
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /duplicates poisoned/);
  });

  it("warns when the withdrawal AE redundantly stamps poisoned via statuses", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, {
      _id: "wd1",
      name: "Withdrawing from Test",
      changes: [],
      statuses: ["poisoned"],
      flags: {},
    });
    const { warnings } = checkSubstance(file);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /duplicates poisoned/);
  });
});

describe("checkSubstance — requiredSubtypes removal (v0.5)", () => {
  it("errors when the legacy requiredSubtypes flag is present", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].requiredSubtypes = ["pipe"];
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /legacy "requiredSubtypes" flag is removed in v0\.5/.test(e)),
      true,
    );
  });
});

describe("checkSubstance — modifier-bearing AEs (v0.4)", () => {
  it("errors when a tolerance AE on the substance lacks substanceId", () => {
    const file = baseSubstance();
    file.data.effects.push({
      _id: "tol1",
      name: "Tolerance to Test",
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: { kind: "tolerance", addictionDcBump: 1 },
        },
      },
    });
    const { errors } = checkSubstance(file);
    assert.equal(errors.some((e) => /requires a non-empty substanceId/.test(e)), true);
  });

  it("errors when a tolerance AE has no measurable effect declared", () => {
    const file = baseSubstance();
    file.data.effects.push({
      _id: "tol1",
      name: "Tolerance to Test",
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: { kind: "tolerance", substanceId: "abc" },
        },
      },
    });
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /at least one of attenuateAltered \/ addictionDcBump \/ withdrawalAmplify/.test(e)),
      true,
    );
  });

  it("accepts a tolerance AE with substanceId + addictionDcBump", () => {
    const file = baseSubstance();
    file.data.effects.push({
      _id: "tol1",
      name: "Tolerance to Test",
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: { kind: "tolerance", substanceId: "abc", addictionDcBump: 2 },
        },
      },
    });
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("accepts a tolerance AE with substanceId + attenuateAltered", () => {
    const file = baseSubstance();
    file.data.effects.push({
      _id: "tol1",
      name: "Tolerance to Test",
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: {
            kind: "tolerance",
            substanceId: "abc",
            attenuateAltered: { durationFactor: 0.8 },
          },
        },
      },
    });
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkParaphernalia — v0.3 baseline (regression)", () => {
  it("passes a clean paraphernalia unchanged", () => {
    const { errors, warnings } = checkParaphernalia(baseParaphernalia());
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("errors when subtype is not kebab-case", () => {
    const file = baseParaphernalia();
    file.data.flags[SCOPE].subtype = "Pipe With Spaces";
    const { errors } = checkParaphernalia(file);
    assert.equal(errors.some((e) => /subtype must be a kebab-case string/.test(e)), true);
  });

  it("errors when legacy addictionSaveBypass flag is present", () => {
    const file = baseParaphernalia();
    file.data.flags[SCOPE].addictionSaveBypass = { type: "auto-pass" };
    const { errors } = checkParaphernalia(file);
    assert.equal(errors.some((e) => /legacy item-level "addictionSaveBypass"/.test(e)), true);
  });
});

describe("checkParaphernalia — subtype against built-ins (v0.4)", () => {
  it("accepts a built-in subtype when builtinSubtypes is supplied", () => {
    const builtin = new Set(["pipe", "syringe", "vial"]);
    const { errors } = checkParaphernalia(baseParaphernalia(), { builtinSubtypes: builtin });
    assert.deepEqual(errors, []);
  });

  it("errors when subtype is not in the built-in set", () => {
    const builtin = new Set(["pipe", "syringe", "vial"]);
    const file = baseParaphernalia();
    file.data.flags[SCOPE].subtype = "neon-bong";
    const { errors } = checkParaphernalia(file, { builtinSubtypes: builtin });
    assert.equal(
      errors.some((e) => /subtype "neon-bong" is not a built-in/.test(e)),
      true,
    );
  });

  it("does not error on unknown subtypes when builtinSubtypes is omitted", () => {
    // Runtime authoring path validates against the live composed list; the
    // build-time validator only enforces built-ins for shipped content when
    // the caller opts in by passing the set.
    const file = baseParaphernalia();
    file.data.flags[SCOPE].subtype = "neon-bong";
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkParaphernalia — +N bypass (v0.4)", () => {
  function withBypassAe(file, modifier) {
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass — inhaled",
      transfer: true,
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: { kind: "bypass", appliesTo: ["inhaled"], ...modifier },
        },
      },
    });
    return file;
  }

  it("accepts a +N AE with a non-zero numeric bonus", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "+N", bonus: 2 });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });

  it("errors on a +N AE missing bonus", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "+N" });
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /modifier\.type "\+N" requires a non-zero numeric modifier\.bonus/.test(e)),
      true,
    );
  });

  it("errors on a +N AE with bonus 0", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "+N", bonus: 0 });
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /requires a non-zero numeric modifier\.bonus/.test(e)),
      true,
    );
  });

  it("errors on a +N AE with non-numeric bonus", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "+N", bonus: "two" });
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /requires a non-zero numeric modifier\.bonus/.test(e)),
      true,
    );
  });

  it("still errors on the v0.3-removed legacy types via type-enum check", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "auto-pass-yes-please" });
    const { errors } = checkParaphernalia(file);
    assert.equal(errors.some((e) => /modifier\.type must be one of/.test(e)), true);
  });

  it("accepts an auto-pass AE (regression — existing v0.3 type)", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "auto-pass" });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });

  it("accepts an advantage AE (regression — existing v0.3 type)", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "advantage" });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkParaphernalia — daily-recovery contract (regression)", () => {
  it("errors when usesPerDay is set without daily recovery", () => {
    const file = baseParaphernalia();
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass — inhaled",
      transfer: true,
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: {
            kind: "bypass",
            type: "auto-pass",
            appliesTo: ["inhaled"],
            usesPerDay: 3,
          },
        },
      },
    });
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /system\.uses\.recovery: \[\{ period: "day", type: "recoverAll" \}\]/.test(e)),
      true,
    );
  });

  it("passes when usesPerDay is set and daily recovery is present", () => {
    const file = baseParaphernalia();
    file.data.system.uses.recovery = [{ period: "day", type: "recoverAll" }];
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass — inhaled",
      transfer: true,
      changes: [],
      flags: {
        [SCOPE]: {
          modifier: {
            kind: "bypass",
            type: "auto-pass",
            appliesTo: ["inhaled"],
            usesPerDay: 3,
          },
        },
      },
    });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });
});
