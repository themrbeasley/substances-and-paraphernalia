import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkLanguagePhrasing } from "../../tools/validate-content-language.mjs";

describe("checkLanguagePhrasing — warn-level findings only", () => {
  it("returns empty array for compliant 2024 phrasing", () => {
    const compliant = [
      "The creature must make a Constitution saving throw against the substance.",
      "On a failed save, the creature gains the Poisoned condition until the end of its next turn.",
      "The creature regains 2d4 hit points at the start of its next turn.",
      "The substance's effect deals 1d6 fire damage on a failed save.",
      "You can't use this feature again until you finish a Long Rest.",
      "The bonus dies regain all expended uses at dawn.",
    ];
    for (const text of compliant) {
      const findings = checkLanguagePhrasing(text, { mode: "text-content-only" });
      assert.deepEqual(findings, [], `expected no findings for: ${text}`);
    }
  });

  it("flags 'once per day' as a recovery anti-pattern", () => {
    const findings = checkLanguagePhrasing("Usable once per day.", { mode: "text-content-only" });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].ruleId, "once-per-day");
  });

  it("flags 'become invisible' / 'become poisoned' as wrong verb", () => {
    const a = checkLanguagePhrasing("The creature becomes invisible until end of turn.", { mode: "text-content-only" });
    const b = checkLanguagePhrasing("On a failed save, become poisoned.", { mode: "text-content-only" });
    assert.ok(a.some((f) => f.ruleId === "become-condition"));
    assert.ok(b.some((f) => f.ruleId === "become-condition"));
  });

  it("flags 'roll a Constitution save'", () => {
    const findings = checkLanguagePhrasing("Roll a Constitution save against DC 14.", { mode: "text-content-only" });
    assert.ok(findings.some((f) => f.ruleId === "roll-a-save"));
  });

  it("flags 'restore N hit points' and 'recover N hit points'", () => {
    const a = checkLanguagePhrasing("Restores 1d4 hit points.", { mode: "text-content-only" });
    const b = checkLanguagePhrasing("Recover 5 hit points overnight.", { mode: "text-content-only" });
    assert.ok(a.some((f) => f.ruleId === "restore-hp"));
    assert.ok(b.some((f) => f.ruleId === "recover-hp"));
  });

  it("flags lowercase condition names in prose", () => {
    const findings = checkLanguagePhrasing("The target is poisoned.", { mode: "text-content-only" });
    assert.ok(findings.some((f) => f.ruleId === "lowercase-condition"));
  });

  it("does NOT flag lowercase condition names when mode is 'any' (data-field context)", () => {
    const findings = checkLanguagePhrasing('"subtype": "poisoned"', { mode: "any" });
    assert.equal(findings.filter((f) => f.ruleId === "lowercase-condition").length, 0);
  });

  it("flags 'long rest' uncapitalized", () => {
    const findings = checkLanguagePhrasing("Recovers after a long rest.", { mode: "text-content-only" });
    assert.ok(findings.some((f) => f.ruleId === "rest-not-capitalized"));
  });

  it("flags damage type names in prose when capitalized", () => {
    const findings = checkLanguagePhrasing("Deals 2d6 Fire damage on impact.", { mode: "text-content-only" });
    assert.ok(findings.some((f) => f.ruleId === "uppercase-damage-type"));
  });

  it("treats empty / non-string input as no-finding", () => {
    assert.deepEqual(checkLanguagePhrasing("", { mode: "text-content-only" }), []);
    assert.deepEqual(checkLanguagePhrasing(null, { mode: "text-content-only" }), []);
    assert.deepEqual(checkLanguagePhrasing(undefined, { mode: "text-content-only" }), []);
    assert.deepEqual(checkLanguagePhrasing(42, { mode: "text-content-only" }), []);
  });

  it("findings carry sourcePath when provided", () => {
    const findings = checkLanguagePhrasing("once per day", {
      mode: "text-content-only",
      sourcePath: "lang/en.json:FISHUT.Foo",
    });
    assert.equal(findings[0].sourcePath, "lang/en.json:FISHUT.Foo");
  });
});
