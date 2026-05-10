import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveIntegrationState } from "../../scripts/integrations/index.js";

describe("resolveIntegrationState(enabled, moduleActive)", () => {
  it("returns true only when both flags are true", () => {
    assert.equal(resolveIntegrationState(true, true), true);
  });

  it("returns false when the user setting is on but the module isn't installed/active", () => {
    assert.equal(resolveIntegrationState(true, false), false);
  });

  it("returns false when the user has explicitly disabled the integration", () => {
    assert.equal(resolveIntegrationState(false, true), false);
  });

  it("returns false when both are false", () => {
    assert.equal(resolveIntegrationState(false, false), false);
  });

  it("coerces truthy/falsy inputs the way a boolean AND would", () => {
    assert.equal(resolveIntegrationState(1, "yes"), true);
    assert.equal(resolveIntegrationState(0, true), false);
    assert.equal(resolveIntegrationState(true, undefined), false);
    assert.equal(resolveIntegrationState(null, true), false);
  });
});
