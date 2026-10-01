import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recoveryAction } from "../../scripts/data/recovery.js";

describe("recoveryAction", () => {
  it("waits while another withdrawal effect of the substance remains", () => {
    assert.equal(recoveryAction({ withdrawalsLeft: 1, relapse: false, addicted: true }), "wait");
    assert.equal(recoveryAction({ withdrawalsLeft: 2, relapse: true, addicted: true }), "wait");
  });
  it("recovers when the last withdrawal effect goes and the character is addicted", () => {
    assert.equal(recoveryAction({ withdrawalsLeft: 0, relapse: false, addicted: true }), "recover");
  });
  it("only clears the record on a relapse: the addiction stays", () => {
    assert.equal(recoveryAction({ withdrawalsLeft: 0, relapse: true, addicted: true }), "clear");
  });
  it("only clears the record when there is no addiction left to end", () => {
    assert.equal(recoveryAction({ withdrawalsLeft: 0, relapse: false, addicted: false }), "clear");
  });
});
