import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickGroupReason } from "../../scripts/data/requirements-core.js";

const ready = () => ({ ready: true, reason: null });
const missing = () => ({ ready: false, reason: "missing" });
const unequipped = () => ({ ready: false, reason: "unequipped" });
const unattuned = () => ({ ready: false, reason: "unattuned" });

describe("pickGroupReason(inspections)", () => {
  it("returns null when any candidate is ready", () => {
    assert.equal(pickGroupReason([ready()]), null);
    assert.equal(pickGroupReason([missing(), ready()]), null);
    assert.equal(pickGroupReason([unequipped(), unattuned(), ready()]), null);
  });

  it("returns 'missing' when all candidates are missing", () => {
    assert.equal(pickGroupReason([missing()]), "missing");
    assert.equal(pickGroupReason([missing(), missing(), missing()]), "missing");
  });

  it("prefers 'unequipped' over 'missing' (closer to ready)", () => {
    assert.equal(pickGroupReason([missing(), unequipped()]), "unequipped");
    assert.equal(pickGroupReason([unequipped(), missing()]), "unequipped");
  });

  it("prefers 'unattuned' over 'unequipped' (closer to ready)", () => {
    assert.equal(pickGroupReason([unequipped(), unattuned()]), "unattuned");
    assert.equal(pickGroupReason([unattuned(), unequipped()]), "unattuned");
  });

  it("prefers 'unattuned' over 'missing'", () => {
    assert.equal(pickGroupReason([missing(), unattuned()]), "unattuned");
  });

  it("returns null for empty input (no constraints to fail)", () => {
    assert.equal(pickGroupReason([]), null);
  });

  it("returns null for non-array input", () => {
    assert.equal(pickGroupReason(null), null);
    assert.equal(pickGroupReason(undefined), null);
    assert.equal(pickGroupReason("not an array"), null);
  });

  it("falls back to 'missing' when reasons are unrecognized", () => {
    assert.equal(
      pickGroupReason([{ ready: false, reason: "weird-reason" }]),
      "weird-reason",
    );
    assert.equal(
      pickGroupReason([{ ready: false, reason: undefined }]),
      "missing",
    );
  });

  it("handles a mix of all three reasons (returns highest rank)", () => {
    assert.equal(
      pickGroupReason([missing(), unequipped(), unattuned()]),
      "unattuned",
    );
  });
});
