import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSubstance,
  checkParaphernalia,
  checkDocumentIds,
  checkGearCoverage,
  overTimeProblems,
} from "../../tools/validate-content-checks.mjs";

const SCOPE = "substances-and-paraphernalia";

/**
 * Return a fully-valid v0.8.1 substance file fixture, deep-merging the
 * provided overrides into the flags block. Callers can supply:
 *   { withdrawal: { ... } }: replaces the withdrawal block wholesale
 *   { addiction: { ... } }: merges into the addiction block
 *   etc.
 */
function makeValidSubstance(flagOverrides = {}) {
  const defaultFlags = {
    kind: "substance",
    schemaVersion: 7,
    category: "stimulant",
    setting: "fantasy",
    addiction: {
      save: { ability: "con", dc: 14 },
      addictionEffectIds: ["ae-addict-001"],
    },
    withdrawal: {
      dc: 12,
      abstain: { ability: "wis", dc: 10 },
      duration: { value: 3, unit: "days" },
      effectIds: ["ae-withdraw-001"],
    },
  };

  // Explicit per-key merge: top-level flag keys are replaced; nested blocks
  // (addiction, withdrawal) are spread so partial overrides work cleanly.
  const mergedFlags = { ...defaultFlags };
  for (const [key, value] of Object.entries(flagOverrides)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      defaultFlags[key] !== null &&
      typeof defaultFlags[key] === "object"
    ) {
      mergedFlags[key] = { ...defaultFlags[key], ...value };
    } else {
      mergedFlags[key] = value;
    }
  }

  return {
    relPath: "_source/fishut-illicit-substance/test.json",
    data: {
      name: "Test Substance",
      type: "consumable",
      system: { type: { value: "poison", subtype: "inhaled" } },
      flags: {
        [SCOPE]: mergedFlags,
      },
      effects: [
        {
          _id: "ae-addict-001",
          name: "Addicted to Test Substance",
          system: { changes: [] },
          flags: { [SCOPE]: { aeRole: "addiction" } },
        },
        {
          _id: "ae-withdraw-001",
          name: "Withdrawing from Test Substance",
          system: { changes: [] },
          statuses: [],
          flags: { [SCOPE]: { aeRole: "withdrawal" } },
        },
      ],
    },
  };
}

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
          schemaVersion: 7,
          category: "stimulant",
          setting: "fantasy",
          addiction: {
            save: { ability: "con", dc: 14 },
            addictionEffectIds: ["ae-addict-001"],
          },
          withdrawal: {
            dc: 12,
            abstain: { ability: "wis", dc: 10 },
            duration: { value: 3, unit: "days" },
          },
        },
      },
      effects: [
        {
          _id: "ae-addict-001",
          name: "Addicted to Test Substance",
          system: { changes: [] },
          flags: { [SCOPE]: { aeRole: "addiction" } },
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
          schemaVersion: 7,
          subtype: "pipe",
        },
      },
      effects: [],
      ...overrides,
    },
  };
}

describe("checkSubstance: v0.8.1 baseline (regression)", () => {
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

  it("errors when schemaVersion is wrong", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].schemaVersion = 3;
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /schemaVersion must be 7/.test(e)),
      true,
    );
  });

  it("errors when addictionEffectIds points at nothing", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].addiction.addictionEffectIds = ["missing"];
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /not found in effects/.test(e)),
      true,
    );
  });

  it("errors when addiction AE name does not contain 'addict'", () => {
    const file = baseSubstance();
    file.data.effects[0].name = "Tweaky Vibes";
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /must contain "addict"/.test(e)),
      true,
    );
  });
});

describe("checkSubstance: overdose flag (v0.4)", () => {
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
    assert.equal(
      errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)),
      true,
    );
  });

  it("errors when chancePercent is out of 1..100", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 0, description: "x" };
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)),
      true,
    );
  });

  it("errors when chancePercent is 101", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 101, description: "x" };
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /chancePercent must be an integer 1\.\.100/.test(e)),
      true,
    );
  });

  it("errors when description is empty while enabled", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = { enabled: true, chancePercent: 5, description: "   " };
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /description must be a non-empty string/.test(e)),
      true,
    );
  });

  it("errors when overdose flag is not an object", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = "yes please";
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /overdose flag must be an object/.test(e)),
      true,
    );
  });

  it("accepts overdose damage that is plain dice with a known type", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = {
      enabled: true,
      chancePercent: 10,
      description: "x",
      damage: { formula: "2d8", type: "poison" },
    };
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("errors when overdose damage is malformed or has an unknown type", () => {
    for (const damage of [
      { formula: "2d", type: "poison" },
      { formula: "2d6", type: "pain" },
    ]) {
      const file = baseSubstance();
      file.data.flags[SCOPE].overdose = {
        enabled: true,
        chancePercent: 10,
        description: "x",
        damage,
      };
      const { errors } = checkSubstance(file);
      assert.equal(
        errors.some((e) => /overdose\.damage must be plain dice/.test(e)),
        true,
        JSON.stringify(damage),
      );
    }
  });

  it("accepts a blank overdose damage formula as no damage", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].overdose = {
      enabled: true,
      chancePercent: 10,
      description: "x",
      damage: { formula: "", type: "" },
    };
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkSubstance: withdrawal.effectId (v0.4)", () => {
  function withWithdrawalAe(file, ae) {
    file.data.effects.push(ae);
    file.data.flags[SCOPE].withdrawal.effectIds = [ae._id];
    return file;
  }

  it("accepts a missing withdrawal.effectIds", () => {
    const file = baseSubstance();
    const { errors, warnings } = checkSubstance(file);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("errors when withdrawal.effectIds entry points at nothing", () => {
    const file = baseSubstance();
    file.data.flags[SCOPE].withdrawal.effectIds = ["ghost"];
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /withdrawal\.effectIds entry "ghost" not found/.test(e)),
      true,
    );
  });

  it("errors when the resolved AE name does not contain 'withdraw'", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, { _id: "wd1", name: "Crash Phase", system: { changes: [] }, flags: {} });
    const { errors } = checkSubstance(file);
    assert.equal(
      errors.some((e) => /withdrawal AE name .+ must contain "withdraw"/.test(e)),
      true,
    );
  });

  it("accepts a properly-named withdrawal AE with no content-guidance violations", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, {
      _id: "wd1",
      name: "Withdrawing from Test",
      system: {
        changes: [{ key: "system.attributes.exhaustion", type: "add", value: "1", priority: 20 }],
      },
      flags: { [SCOPE]: { aeRole: "withdrawal" } },
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
      system: {
        changes: [
          { key: "system.bonuses.msak.attack", type: "add", value: "disadvantage", priority: 20 },
        ],
      },
      flags: { [SCOPE]: { aeRole: "withdrawal" } },
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
      system: { changes: [] },
      statuses: ["poisoned"],
      flags: { [SCOPE]: { aeRole: "withdrawal" } },
    });
    const { warnings } = checkSubstance(file);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /duplicates poisoned/);
  });
});

describe("checkSubstance: requiredSubtypes removal (v0.5)", () => {
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

describe("checkSubstance: withdrawal v0.8.1 shape", () => {
  test("missing withdrawal.dc emits error when addiction.enabled !== false", () => {
    const file = {
      relPath: "_source/fishut-illicit-substance/foo.json",
      data: {
        name: "Foo",
        flags: {
          [SCOPE]: {
            kind: "substance",
            schemaVersion: 7,
            addiction: { save: { dc: 14 }, addictionEffectIds: ["a1"] },
            withdrawal: { enabled: false }, // shape requires dc only when addiction.enabled !== false
          },
        },
        system: { type: { value: "poison", subtype: "ingested" } },
        effects: [
          { _id: "a1", name: "Foo Addiction", flags: { [SCOPE]: { aeRole: "addiction" } } },
        ],
      },
    };
    const result = checkSubstance(file);
    // addiction.enabled defaults to true → dc required even with withdrawal.enabled === false
    assert.ok(result.errors.some((e) => /withdrawal\.dc is required/.test(e)));
  });

  test("withdrawal block accepts new v0.8.1 shape", () => {
    const file = makeValidSubstance({
      withdrawal: {
        dc: 15,
        abstain: { ability: "wis", dc: 12 },
        duration: { value: 3, unit: "days" },
        effectIds: ["ae-withdraw-001"],
      },
    });
    const result = checkSubstance(file);
    assert.deepEqual(result.errors, []);
  });

  test("withdrawal.duration.unit must be in allowed set", () => {
    const file = makeValidSubstance({
      withdrawal: {
        dc: 15,
        abstain: { ability: "wis", dc: 12 },
        duration: { value: 3, unit: "fortnights" },
      },
    });
    const result = checkSubstance(file);
    assert.ok(result.errors.some((e) => /duration\.unit must be one of/.test(e)));
  });

  test("withdrawal.abstain block is required when withdrawal.enabled !== false", () => {
    // Use baseSubstance and replace withdrawal wholesale to ensure abstain is absent
    const file = baseSubstance();
    file.data.flags[SCOPE].withdrawal = { dc: 12, duration: { value: 3, unit: "days" } };
    const result = checkSubstance(file);
    assert.ok(result.errors.some((e) => /withdrawal\.abstain block is required/.test(e)));
  });

  test("withdrawal.duration block is required when withdrawal.enabled !== false", () => {
    // Use baseSubstance and replace withdrawal wholesale to ensure duration is absent
    const file = baseSubstance();
    file.data.flags[SCOPE].withdrawal = { dc: 12, abstain: { ability: "wis", dc: 10 } };
    const result = checkSubstance(file);
    assert.ok(result.errors.some((e) => /withdrawal\.duration block is required/.test(e)));
  });

  test("withdrawal.dc not required when addiction.enabled is false", () => {
    const file = makeValidSubstance({
      addiction: {
        enabled: false,
        save: { ability: "con", dc: 14 },
        addictionEffectIds: ["ae-addict-001"],
      },
      withdrawal: {
        // no dc: addiction disabled so dc not required
        abstain: { ability: "wis", dc: 10 },
        duration: { value: 3, unit: "days" },
      },
    });
    const result = checkSubstance(file);
    assert.ok(!result.errors.some((e) => /withdrawal\.dc is required/.test(e)));
  });
});

describe("checkSubstance: modifier-bearing AEs (v0.4)", () => {
  it("accepts a tolerance AE with substanceId + addictionDcBump", () => {
    const file = baseSubstance();
    file.data.effects.push({
      _id: "tol1",
      name: "Tolerance to Test",
      system: { changes: [] },
      flags: {
        [SCOPE]: {
          aeRole: "tolerance",
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
      system: { changes: [] },
      flags: {
        [SCOPE]: {
          aeRole: "tolerance",
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

describe("checkParaphernalia: v0.8.1 baseline (regression)", () => {
  it("passes a clean paraphernalia unchanged", () => {
    const { errors, warnings } = checkParaphernalia(baseParaphernalia());
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("errors when subtype is not kebab-case", () => {
    const file = baseParaphernalia();
    file.data.flags[SCOPE].subtype = "Pipe With Spaces";
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /subtype must be a kebab-case string/.test(e)),
      true,
    );
  });

  it("errors when legacy addictionSaveBypass flag is present", () => {
    const file = baseParaphernalia();
    file.data.flags[SCOPE].addictionSaveBypass = { type: "auto-pass" };
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /legacy item-level "addictionSaveBypass"/.test(e)),
      true,
    );
  });

  it("errors when schemaVersion is wrong", () => {
    const file = baseParaphernalia();
    file.data.flags[SCOPE].schemaVersion = 3;
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.some((e) => /schemaVersion must be 7/.test(e)),
      true,
    );
  });
});

describe("checkParaphernalia: subtype against built-ins (v0.4)", () => {
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

describe("checkParaphernalia: +N bypass (v0.4)", () => {
  function withBypassAe(file, modifier) {
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass: inhaled",
      transfer: true,
      system: { changes: [] },
      flags: {
        [SCOPE]: {
          aeRole: "bypass",
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
      errors.some((e) =>
        /modifier\.type "\+N" requires a non-zero numeric modifier\.bonus/.test(e),
      ),
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
    assert.equal(
      errors.some((e) => /modifier\.type must be one of/.test(e)),
      true,
    );
  });

  it("accepts an auto-pass AE (regression: existing v0.3 type)", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "auto-pass" });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });

  it("accepts an advantage AE (regression: existing v0.3 type)", () => {
    const file = withBypassAe(baseParaphernalia(), { type: "advantage" });
    const { errors } = checkParaphernalia(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkParaphernalia: daily-recovery contract (regression)", () => {
  it("errors when usesPerDay is set without daily recovery", () => {
    const file = baseParaphernalia();
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass: inhaled",
      transfer: true,
      system: { changes: [] },
      flags: {
        [SCOPE]: {
          aeRole: "bypass",
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
      errors.some((e) =>
        /system\.uses\.recovery: \[\{ period: "day", type: "recoverAll" \}\]/.test(e),
      ),
      true,
    );
  });

  it("passes when usesPerDay is set and daily recovery is present", () => {
    const file = baseParaphernalia();
    file.data.system.uses.recovery = [{ period: "day", type: "recoverAll" }];
    file.data.effects.push({
      _id: "byp1",
      name: "Bypass: inhaled",
      transfer: true,
      system: { changes: [] },
      flags: {
        [SCOPE]: {
          aeRole: "bypass",
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

describe("MODIFIER_TYPES (reroll-on-fail)", () => {
  it("accepts a bypass AE with type 'reroll-on-fail'", async () => {
    const file = baseParaphernalia({
      system: {
        uses: { spent: 0, max: "1", recovery: [{ period: "day", type: "recoverAll" }] },
      },
      effects: [
        {
          _id: "ae-reroll-test",
          name: "Reroll Test: Bypass",
          transfer: true,
          system: { changes: [] },
          flags: {
            [SCOPE]: {
              aeRole: "bypass",
              modifier: {
                kind: "bypass",
                type: "reroll-on-fail",
                appliesTo: ["ingested"],
                usesPerDay: "1",
              },
            },
          },
        },
      ],
    });
    const { errors } = checkParaphernalia(file);
    assert.equal(
      errors.find((e) => /modifier\.type must be one of/.test(e)),
      undefined,
      `unexpected modifier.type error: ${errors.join(" | ")}`,
    );
  });
});

describe("checkSubstance: V14 effect shape (v0.9)", () => {
  function withWithdrawalAe(file, ae) {
    file.data.effects.push(ae);
    file.data.flags[SCOPE].withdrawal.effectIds = [ae._id];
    return file;
  }

  const withdrawalAe = (extra) => ({
    _id: "wd1",
    name: "Withdrawing from Test",
    flags: { [SCOPE]: { aeRole: "withdrawal" } },
    ...extra,
  });

  it("errors on the legacy top-level changes array", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, withdrawalAe({ changes: [] }));
    const { errors } = checkSubstance(file);
    assert.ok(
      errors.some((e) => /legacy top-level "changes"/.test(e)),
      errors.join("\n"),
    );
  });

  it("errors on a numeric change mode", () => {
    const file = baseSubstance();
    withWithdrawalAe(
      file,
      withdrawalAe({
        system: { changes: [{ key: "system.attributes.exhaustion", mode: 2, value: "1" }] },
      }),
    );
    const { errors } = checkSubstance(file);
    assert.ok(
      errors.some((e) => /string "type"/.test(e)),
      errors.join("\n"),
    );
  });

  it("errors on a legacy duration.seconds", () => {
    const file = baseSubstance();
    withWithdrawalAe(file, withdrawalAe({ system: { changes: [] }, duration: { seconds: 600 } }));
    const { errors } = checkSubstance(file);
    assert.ok(
      errors.some((e) => /legacy duration\.seconds/.test(e)),
      errors.join("\n"),
    );
  });

  it("accepts a V14 duration and typed change rows", () => {
    const file = baseSubstance();
    withWithdrawalAe(
      file,
      withdrawalAe({
        system: { changes: [{ key: "system.attributes.exhaustion", type: "add", value: "1" }] },
        duration: { value: 600, units: "seconds" },
      }),
    );
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkDocumentIds", () => {
  const file = (data) => ({ relPath: "_source/x/test.json", data });

  it("accepts 16-character ids, top-level and embedded", () => {
    const r = checkDocumentIds(
      file({ _id: "fhParaOracleT001", effects: [{ _id: "fhAEOracleTByp01" }] }),
    );
    assert.deepEqual(r.errors, []);
  });

  it("rejects a 15-character top-level id", () => {
    const r = checkDocumentIds(file({ _id: "fhParaOracleT01" }));
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /fhParaOracleT01/);
  });

  it("rejects a bad embedded effect id", () => {
    const r = checkDocumentIds(
      file({ _id: "fhParaOracleT001", effects: [{ _id: "fhAEOracleTByp" }] }),
    );
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /effects\[0\]/);
  });
});

describe("checkSubstance: the high on an activity", () => {
  const withAltered = (activityEffects) => {
    const f = makeValidSubstance();
    f.data.effects.push({
      _id: "ae-altered-001",
      name: "Altered by Test Substance",
      system: { changes: [] },
      flags: { [SCOPE]: { aeRole: "altered" } },
    });
    f.data.system.activities = { act1: { _id: "act1", name: "Use", effects: activityEffects } };
    return f;
  };

  it("warns when an activity lists the Altered effect", () => {
    const r = checkSubstance(withAltered([{ _id: "ae-altered-001" }]));
    assert.ok(r.warnings.some((w) => /lists the Altered effect/.test(w)));
  });

  it("stays quiet when the activity lists no effects", () => {
    const r = checkSubstance(withAltered([]));
    assert.ok(!r.warnings.some((w) => /lists the Altered effect/.test(w)));
  });

  it("stays quiet when the activity lists only a non-Altered effect", () => {
    const r = checkSubstance(withAltered([{ _id: "ae-withdraw-001" }]));
    assert.ok(!r.warnings.some((w) => /lists the Altered effect/.test(w)));
  });

  it("names the activity by id when its name is empty", () => {
    const f = withAltered([{ _id: "ae-altered-001" }]);
    f.data.system.activities.act1.name = "";
    const r = checkSubstance(f);
    assert.ok(r.warnings.some((w) => /activity "act1" lists the Altered effect/.test(w)));
  });
});

describe("checkSubstance: blank DCs (v0.9.2)", () => {
  for (const blank of [null, ""]) {
    it(`errors on a ${JSON.stringify(blank)} Withdrawal DC`, () => {
      const file = baseSubstance();
      file.data.flags[SCOPE].withdrawal.dc = blank;
      assert.ok(checkSubstance(file).errors.some((e) => /withdrawal\.dc is required/.test(e)));
    });
    it(`errors on a ${JSON.stringify(blank)} Abstain DC`, () => {
      const file = baseSubstance();
      file.data.flags[SCOPE].withdrawal.abstain.dc = blank;
      assert.ok(
        checkSubstance(file).errors.some((e) =>
          /withdrawal\.abstain\.dc must be a finite number/.test(e),
        ),
      );
    });
  }
});

describe("overTimeProblems", () => {
  it("damage only is fine", () => {
    assert.deepEqual(
      overTimeProblems("turn=start,damageRoll=1d4,damageType=psychic,label=Withdrawal"),
      [],
    );
  });
  it("a save with a keep-alive count is fine", () => {
    assert.deepEqual(
      overTimeProblems(
        "turn=start,saveAbility=con,saveDC=13,saveCount=9999,damageRoll=1d4,damageType=psychic",
      ),
      [],
    );
  });
  it("a save with no count, or a count ending in -, ends withdrawal early", () => {
    assert.equal(overTimeProblems("turn=start,saveAbility=con,saveDC=13").length, 1);
    assert.equal(overTimeProblems("turn=start,saveDC=13,saveCount=3-").length, 1);
  });
  it("removeCondition, actionSave and itemName are refused", () => {
    assert.equal(
      overTimeProblems("turn=start,damageRoll=1d4,removeCondition=true,actionSave=roll,itemName=X")
        .length,
      3,
    );
  });
});

describe("checkSubstance: withdrawal effects can't remove themselves (v0.10.0)", () => {
  function withWithdrawalChanges(changes, extra = {}) {
    const file = makeValidSubstance();
    const ae = file.data.effects.find((e) => e._id === "ae-withdraw-001");
    ae.system.changes = changes;
    Object.assign(ae.flags, extra.flags);
    return file;
  }

  it("accepts a damage-only OverTime row", () => {
    const file = withWithdrawalChanges([
      {
        key: "flags.midi-qol.OverTime",
        type: "override",
        value: "turn=start,damageRoll=1d4,damageType=psychic,label=Withdrawal",
        priority: 20,
      },
    ]);
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });

  it("errors on an OverTime row with a save and no keep-alive", () => {
    const file = withWithdrawalChanges([
      { key: "flags.midi-qol.OverTime", type: "override", value: "turn=start,saveDC=13", priority: 20 },
    ]);
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /OverTime/);
    assert.match(errors[0], /saveCount/);
  });

  it("errors on a suffixed OverTime key, which Midi also runs as OverTime", () => {
    const file = withWithdrawalChanges([
      {
        key: "flags.midi-qol.OverTime.withdrawal",
        type: "override",
        value: "turn=start,saveDC=13",
        priority: 20,
      },
    ]);
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /saveCount/);
  });

  it("errors on a DAE special duration", () => {
    const file = withWithdrawalChanges([], {
      flags: { dae: { specialDuration: ["isDamaged"] } },
    });
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /special duration/);
  });

  it("errors on a DAE stacking policy of none or noneName", () => {
    for (const stackable of ["none", "noneName"]) {
      const file = withWithdrawalChanges([], { flags: { dae: { stackable } } });
      const { errors } = checkSubstance(file);
      assert.equal(errors.length, 1, stackable);
      assert.match(errors[0], /stack/);
    }
  });

  it("accepts an empty special duration list and a stacking policy that allows copies", () => {
    const file = withWithdrawalChanges([], {
      flags: { dae: { specialDuration: [], stackable: "multi" } },
    });
    const { errors } = checkSubstance(file);
    assert.deepEqual(errors, []);
  });
});

describe("checkSubstance: dose marker and dose-others activities (v0.10.0)", () => {
  const marker = (extra = {}) => ({
    _id: "ae-dose-001",
    name: "Dosed with Test Substance",
    transfer: false,
    statuses: [],
    system: { changes: [] },
    flags: { [SCOPE]: { aeRole: "dose" } },
    ...extra,
  });

  // The drug's own "Use" plus a dose-others activity that lists the marker.
  function withMarker({ markerExtra, others = {} } = {}) {
    const file = makeValidSubstance();
    file.data.effects.push(marker(markerExtra));
    file.data.system.activities = {
      act1: { _id: "act1", name: "Use", type: "utility", effects: [] },
      act2: {
        _id: "act2",
        name: "Dose another",
        type: "save",
        target: { affects: { type: "creature" } },
        effects: [{ _id: "ae-dose-001" }],
        ...others,
      },
    };
    return file;
  }

  it("accepts a clean marker and a dose-others activity", () => {
    assert.deepEqual(checkSubstance(withMarker()).errors, []);
  });

  it("errors on a marker with a status", () => {
    const { errors } = checkSubstance(withMarker({ markerExtra: { statuses: ["poisoned"] } }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /dose marker "Dosed with Test Substance" must have no statuses/);
  });

  it("errors on a marker with a change row", () => {
    const row = { key: "system.attributes.ac.bonus", type: "add", value: "1", priority: 20 };
    const { errors } = checkSubstance(withMarker({ markerExtra: { system: { changes: [row] } } }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /must have no changes/);
  });

  it("errors on a transferred marker", () => {
    const { errors } = checkSubstance(withMarker({ markerExtra: { transfer: true } }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /must have transfer: false/);
  });

  it("errors on a marker that carries sourceSubstanceId", () => {
    const flags = { [SCOPE]: { aeRole: "dose", sourceSubstanceId: "abc" } };
    const { errors } = checkSubstance(withMarker({ markerExtra: { flags } }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /must not carry sourceSubstanceId/);
  });

  it("errors on an activity that lists the marker but targets self", () => {
    const { errors } = checkSubstance(
      withMarker({ others: { target: { affects: { type: "self" } } } }),
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /activity "Dose another" doses others but targets self/);
  });

  it("errors when every activity lists the marker", () => {
    const file = withMarker();
    file.data.system.activities.act1.effects = [{ _id: "ae-dose-001" }];
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /needs an activity that doses the user, for the Long Rest relapse/);
  });

  it("errors on a dose-named effect with no aeRole", () => {
    const file = makeValidSubstance();
    file.data.effects.push({
      _id: "ae-dose-001",
      name: "Dosed with Voltbeans",
      system: { changes: [] },
    });
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /matches role "dose" by name but aeRole flag is missing/);
  });

  it("keeps an Overdose effect an overdose, not a dose", () => {
    const file = makeValidSubstance();
    file.data.effects.push({
      _id: "ae-over-001",
      name: "Black Lift Overdose",
      system: { changes: [] },
    });
    const { errors } = checkSubstance(file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /matches role "overdose" by name/);
  });

  it("errors on an attack that doses others without otherActivityId none", () => {
    for (const other of [undefined, null, "", "someOtherId"]) {
      const file = withMarker({ others: { type: "attack", otherActivityId: other } });
      const { errors } = checkSubstance(file);
      assert.equal(errors.length, 1, String(other));
      assert.match(
        errors[0],
        /activity "Dose another" doses others by attack and must set otherActivityId: "none" \(Midi would pair it with the self-dose\)/,
      );
    }
  });

  it("accepts an attack that doses others with otherActivityId none", () => {
    const file = withMarker({ others: { type: "attack", otherActivityId: "none" } });
    assert.deepEqual(checkSubstance(file).errors, []);
  });

  it("does not ask a save activity for otherActivityId", () => {
    assert.deepEqual(checkSubstance(withMarker({ others: { type: "save" } })).errors, []);
  });
});

describe("checkGearCoverage", () => {
  const drug = (setting, admin, name = "Test Drug") => ({
    name,
    system: { type: { subtype: admin } },
    flags: { [SCOPE]: { kind: "substance", setting } },
  });
  const gear = (setting, appliesTo, attunement = "") => ({
    name: "Test Gear",
    system: { attunement },
    flags: { [SCOPE]: { kind: "paraphernalia", setting, appliesTo } },
  });

  it("errors when the only gear for a drug's administration needs attunement", () => {
    const errors = checkGearCoverage(
      [drug("fantasy", "ingested", "Elixir")],
      [gear("fantasy", ["ingested"], "required")],
    );
    assert.deepEqual(errors, [
      "Elixir: no fantasy gear without attunement applies to ingested substances",
    ]);
  });

  it("passes once a non-attuned gear from the same setting covers the administration", () => {
    const errors = checkGearCoverage(
      [drug("fantasy", "ingested")],
      [gear("fantasy", ["ingested"], "required"), gear("fantasy", ["ingested"])],
    );
    assert.deepEqual(errors, []);
  });

  it("does not count gear from another setting", () => {
    const errors = checkGearCoverage([drug("fantasy", "ingested")], [gear("sciFi", ["ingested"])]);
    assert.equal(errors.length, 1);
  });

  it("does not count gear for a different administration", () => {
    const errors = checkGearCoverage([drug("modern", "injury")], [gear("modern", ["inhaled"])]);
    assert.equal(errors.length, 1);
  });
});
