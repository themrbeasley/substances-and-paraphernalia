import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Defense in depth against the v0.8.1 regression class: a stale named import
// (`import { foo } from "./bar.js"` where `bar.js` no longer exports `foo`)
// throws SyntaxError at link time, killing module.mjs evaluation before
// Hooks.once("init") ever registers anything. ESLint's import/named rule
// catches it in the editor; this test catches it in CI even when the rule
// is bypassed (e.g. dynamic imports, plugin misconfiguration).
//
// Strategy: stub the Foundry globals that fire at module top-level so we can
// distinguish a link-time SyntaxError (the regression class — must fail the
// test) from a runtime ReferenceError (expected — we're not in Foundry).
describe("module entry imports cleanly", () => {
  it("scripts/module.mjs links without missing-export errors", async () => {
    globalThis.Hooks = { on: () => {}, once: () => {}, callAll: () => {} };
    try {
      await import("../../scripts/module.mjs");
    } catch (err) {
      if (err instanceof SyntaxError) {
        assert.fail(`module link error: ${err.message}`);
      }
      // ReferenceError or similar = link succeeded, top-level code hit an
      // unstubbed Foundry global. That's not what this test guards against.
    }
  });
});
