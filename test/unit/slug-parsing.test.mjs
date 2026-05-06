import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCompendiumRef } from "../../scripts/data/ref-kind.js";

describe("isCompendiumRef(ref)", () => {
  it("returns true for a full compendium UUID", () => {
    assert.equal(
      isCompendiumRef(
        "Compendium.substances-and-paraphernalia.fishut-illicit-paraphernalia.Item.fhParaDubsPipe01",
      ),
      true,
    );
  });

  it("returns true for any string starting with 'Compendium.'", () => {
    assert.equal(isCompendiumRef("Compendium.foo.bar.Item.baz"), true);
    assert.equal(isCompendiumRef("Compendium.third-party-mod.pack.Item.x"), true);
  });

  it("returns false for kebab-case slugs", () => {
    assert.equal(isCompendiumRef("dubious-pipe"), false);
    assert.equal(isCompendiumRef("rolling-papers"), false);
    assert.equal(isCompendiumRef("snuff-horn"), false);
    assert.equal(isCompendiumRef("athletes-logbook"), false);
  });

  it("returns false for empty string", () => {
    assert.equal(isCompendiumRef(""), false);
  });

  it("returns false for non-string inputs", () => {
    assert.equal(isCompendiumRef(undefined), false);
    assert.equal(isCompendiumRef(null), false);
    assert.equal(isCompendiumRef(42), false);
    assert.equal(isCompendiumRef({}), false);
    assert.equal(isCompendiumRef(["Compendium.foo"]), false);
  });

  it("is case-sensitive (refuses lowercase 'compendium')", () => {
    assert.equal(isCompendiumRef("compendium.foo.bar.Item.baz"), false);
  });
});
