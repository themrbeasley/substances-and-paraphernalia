import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, PRESET_LIBRARY } from "../../scripts/integrations/tmfx.js";

// The valid filter type set is sourced from TMFX 0.7.6.3+'s filter registry
// (Feu-Secret/Tokenmagic master, tokenmagic/module/tokenmagic.js). The
// palette must only use types from this list — unknown types fail
// registration silently in TMFX, which is exactly the v0.5.0 bug we shipped.
const VALID_TMFX_FILTER_TYPES = new Set([
  "adjustment",
  "ascii",
  "dot",
  "distortion",
  "crt",
  "oldfilm",
  "glow",
  "outline",
  "bevel",
  "xbloom",
  "shadow",
  "twist",
  "zoomblur",
  "blur",
  "bulgepinch",
  "zapshadow",
  "ray",
  "fog",
  "xfog",
  "electric",
  "wave",
  "shockwave",
  "fire",
  "fumes",
  "smoke",
  "flood",
  "images",
  "field",
  "xray",
  "liquid",
  "xglow",
  "pixel",
  "web",
  "ripples",
  "globes",
  "transform",
  "splash",
  "polymorph",
  "xfire",
  "sprite",
  "spriteMask",
  "replaceColor",
  "ddTint",
  "rgbSplit",
]);

const SETTINGS = ["fantasy", "modern", "scifi"];
const CATEGORIES = ["mind-altering", "performance-enhancing", "stimulant"];

describe("TMFX preset palette", () => {
  it("uses the tmfx-main library", () => {
    assert.equal(PRESET_LIBRARY, "tmfx-main");
  });

  it("registers exactly 9 presets (3 settings × 3 categories)", () => {
    assert.equal(Object.keys(PRESETS).length, 9);
  });

  it("covers every (setting × category) cell exactly once", () => {
    for (const setting of SETTINGS) {
      for (const category of CATEGORIES) {
        const expected = `fishut-tmfx-${setting}-${category}`;
        assert.ok(
          Object.prototype.hasOwnProperty.call(PRESETS, expected),
          `missing preset for ${setting}/${category} (expected key: ${expected})`,
        );
      }
    }
  });

  it("uses only the canonical fishut-tmfx-{setting}-{category} naming", () => {
    const valid = new Set();
    for (const s of SETTINGS) for (const c of CATEGORIES) valid.add(`fishut-tmfx-${s}-${c}`);
    for (const name of Object.keys(PRESETS)) {
      assert.ok(valid.has(name), `unexpected preset name: ${name}`);
    }
  });

  it("freezes the palette so it cannot be mutated at runtime", () => {
    assert.ok(Object.isFrozen(PRESETS));
  });

  describe("each preset", () => {
    for (const [name, params] of Object.entries(PRESETS)) {
      describe(name, () => {
        it("is a non-empty array of filter blocks", () => {
          assert.ok(Array.isArray(params), `${name}: params must be an array`);
          assert.ok(params.length > 0, `${name}: params must not be empty`);
        });

        it("declares a filterType valid in TMFX 0.7.6.3+", () => {
          for (const block of params) {
            assert.ok(
              typeof block?.filterType === "string",
              `${name}: every block needs a string filterType`,
            );
            assert.ok(
              VALID_TMFX_FILTER_TYPES.has(block.filterType),
              `${name}: filterType "${block.filterType}" is not in the TMFX 0.7.6.3+ filter registry`,
            );
          }
        });

        it("never names a filter `bloom` (it's `xbloom` in TMFX — `bloom` was the v0.5.0 regression)", () => {
          for (const block of params) {
            assert.notEqual(
              block.filterType,
              "bloom",
              `${name}: "bloom" is not a valid TMFX filter type — use "xbloom"`,
            );
          }
        });
      });
    }
  });
});
