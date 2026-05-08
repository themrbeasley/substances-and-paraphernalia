import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTmfxConfig } from "../../scripts/data/tmfx-config.js";

const MODULE_ID = "substances-and-paraphernalia";

function fakeItem(tmfx) {
  return { flags: { [MODULE_ID]: { tmfx } } };
}

describe("parseTmfxConfig(item)", () => {
  it("returns mode:none when the item has no flags", () => {
    assert.deepEqual(parseTmfxConfig({}), { mode: "none" });
  });

  it("returns mode:none when the tmfx flag is missing", () => {
    assert.deepEqual(parseTmfxConfig({ flags: { [MODULE_ID]: {} } }), { mode: "none" });
  });

  it("returns mode:none for a null/undefined item", () => {
    assert.deepEqual(parseTmfxConfig(null), { mode: "none" });
    assert.deepEqual(parseTmfxConfig(undefined), { mode: "none" });
  });

  it("returns mode:none when mode is explicitly 'none'", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "none" })), { mode: "none" });
  });

  it("normalizes a preset config", () => {
    assert.deepEqual(
      parseTmfxConfig(fakeItem({ mode: "preset", presetName: "Glow Red" })),
      { mode: "preset", presetName: "Glow Red" },
    );
  });

  it("normalizes a macro config", () => {
    assert.deepEqual(
      parseTmfxConfig(fakeItem({ mode: "macro", macroUuid: "Compendium.foo.Macro.bar" })),
      { mode: "macro", macroUuid: "Compendium.foo.Macro.bar" },
    );
  });

  it("degrades a preset config with a missing presetName to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "preset" })), { mode: "none" });
  });

  it("degrades a preset config with an empty presetName to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "preset", presetName: "" })), {
      mode: "none",
    });
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "preset", presetName: "   " })), {
      mode: "none",
    });
  });

  it("degrades a macro config with a missing macroUuid to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "macro" })), { mode: "none" });
  });

  it("degrades a macro config with an empty macroUuid to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "macro", macroUuid: "" })), {
      mode: "none",
    });
  });

  it("degrades unknown modes to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem({ mode: "lasers" })), { mode: "none" });
  });

  it("degrades non-object flag values to mode:none", () => {
    assert.deepEqual(parseTmfxConfig(fakeItem("preset")), { mode: "none" });
    assert.deepEqual(parseTmfxConfig(fakeItem(42)), { mode: "none" });
    assert.deepEqual(parseTmfxConfig(fakeItem(null)), { mode: "none" });
  });

  it("trims whitespace around presetName and macroUuid", () => {
    assert.deepEqual(
      parseTmfxConfig(fakeItem({ mode: "preset", presetName: "  Glow Red  " })),
      { mode: "preset", presetName: "Glow Red" },
    );
    assert.deepEqual(
      parseTmfxConfig(fakeItem({ mode: "macro", macroUuid: "  Macro.abc  " })),
      { mode: "macro", macroUuid: "Macro.abc" },
    );
  });
});
