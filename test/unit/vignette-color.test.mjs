import test from "node:test";
import assert from "node:assert/strict";
import { resolveVignetteColor } from "../../scripts/data/vignette-color.js";

const SCOPE = "substances-and-paraphernalia";

test("resolveVignetteColor returns null when actor flag missing", () => {
  assert.equal(resolveVignetteColor({ flags: {} }), null);
  assert.equal(resolveVignetteColor({ flags: { [SCOPE]: {} } }), null);
  assert.equal(resolveVignetteColor({}), null);
  assert.equal(resolveVignetteColor(null), null);
});

test("resolveVignetteColor returns sanitized hex string", () => {
  const actor = { flags: { [SCOPE]: { vignetteColor: "#3366ff" } } };
  assert.equal(resolveVignetteColor(actor), "#3366ff");
});

test("resolveVignetteColor rejects malformed strings", () => {
  const cases = ["3366ff", "#fff", "#xyzxyz", "red", "", " #3366ff "];
  for (const value of cases) {
    const actor = { flags: { [SCOPE]: { vignetteColor: value } } };
    assert.equal(resolveVignetteColor(actor), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test("resolveVignetteColor rejects non-string values", () => {
  for (const value of [123, true, {}, []]) {
    const actor = { flags: { [SCOPE]: { vignetteColor: value } } };
    assert.equal(resolveVignetteColor(actor), null);
  }
});
