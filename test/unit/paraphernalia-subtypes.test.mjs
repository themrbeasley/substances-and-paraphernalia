import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveParaphernaliaSubtypes,
  validateCustomParaphernaliaSubtypes,
} from "../../scripts/data/paraphernalia-subtypes.js";
import { SCHEMA } from "../../scripts/config.js";

describe("getEffectiveParaphernaliaSubtypes", () => {
  it("returns the built-in seed list when no custom entries supplied", () => {
    const result = getEffectiveParaphernaliaSubtypes({ custom: [] });
    const expectedIds = SCHEMA.paraphernaliaSubtypes.map((s) => s.id);
    assert.deepEqual(
      result.map((r) => r.id),
      expectedIds,
    );
    assert.equal(
      result.every((r) => r.readOnly === true && r.source === "builtin"),
      true,
    );
  });

  it("appends custom entries after built-ins, flagged source: custom", () => {
    const result = getEffectiveParaphernaliaSubtypes({
      custom: [
        { id: "thurible", label: "Thurible" },
        { id: "rolled-leaf", label: "Rolled Leaf" },
      ],
    });
    const customs = result.filter((r) => r.source === "custom");
    assert.deepEqual(
      customs.map((c) => ({ id: c.id, label: c.label, readOnly: c.readOnly })),
      [
        { id: "thurible", label: "Thurible", readOnly: false },
        { id: "rolled-leaf", label: "Rolled Leaf", readOnly: false },
      ],
    );
    const builtinCount = SCHEMA.paraphernaliaSubtypes.length;
    assert.equal(result.length, builtinCount + 2);
  });

  it("drops a custom entry whose id collides with a built-in", () => {
    const result = getEffectiveParaphernaliaSubtypes({
      custom: [{ id: "pipe", label: "Custom Pipe" }],
    });
    const pipes = result.filter((r) => r.id === "pipe");
    assert.equal(pipes.length, 1);
    assert.equal(pipes[0].source, "builtin");
  });

  it("drops a custom entry whose id collides with another custom (last writer loses)", () => {
    const result = getEffectiveParaphernaliaSubtypes({
      custom: [
        { id: "thurible", label: "First" },
        { id: "thurible", label: "Second" },
      ],
    });
    const thuribles = result.filter((r) => r.id === "thurible");
    assert.equal(thuribles.length, 1);
    assert.equal(thuribles[0].label, "First");
  });

  it("falls back to id when a custom entry has an empty label", () => {
    const result = getEffectiveParaphernaliaSubtypes({
      custom: [{ id: "thurible", label: "" }],
    });
    const entry = result.find((r) => r.id === "thurible");
    assert.equal(entry.label, "thurible");
  });

  it("ignores malformed custom entries", () => {
    const result = getEffectiveParaphernaliaSubtypes({
      custom: [null, { id: 7 }, { id: "  " }, undefined],
    });
    const customs = result.filter((r) => r.source === "custom");
    assert.equal(customs.length, 0);
  });
});

describe("validateCustomParaphernaliaSubtypes", () => {
  it("accepts a clean kebab-case list", () => {
    const r = validateCustomParaphernaliaSubtypes([
      { id: "thurible", label: "Thurible" },
      { id: "rolled-leaf", label: "Rolled Leaf" },
    ]);
    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, []);
  });

  it("flags non-kebab ids", () => {
    const r = validateCustomParaphernaliaSubtypes([{ id: "Foo Bar", label: "x" }]);
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors, [{ index: 0, code: "notKebab" }]);
  });

  it("flags collisions with built-ins", () => {
    const r = validateCustomParaphernaliaSubtypes([{ id: "pipe", label: "Custom Pipe" }]);
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors, [{ index: 0, code: "collidesWithBuiltin" }]);
  });

  it("flags duplicates within the proposed list", () => {
    const r = validateCustomParaphernaliaSubtypes([
      { id: "thurible", label: "First" },
      { id: "thurible", label: "Second" },
    ]);
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors, [{ index: 1, code: "duplicate" }]);
  });

  it("flags missing ids", () => {
    const r = validateCustomParaphernaliaSubtypes([{ id: "", label: "x" }]);
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors, [{ index: 0, code: "missingId" }]);
  });
});
