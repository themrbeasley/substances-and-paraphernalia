import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { abstainBranch } from "../../scripts/data/abstain-branch.js";

describe("abstainBranch", () => {
  const cases = [
    [{ forced: true, inWithdrawal: false }, "withdrawal-save"],
    [{ forced: true, inWithdrawal: true }, "hold"],
    [{ forced: false, inWithdrawal: false, willpowerPassed: false }, "relapse"],
    [{ forced: false, inWithdrawal: true, willpowerPassed: false }, "relapse"],
    [{ forced: false, inWithdrawal: false, willpowerPassed: true }, "withdrawal-save"],
    [{ forced: false, inWithdrawal: true, willpowerPassed: true }, "hold"],
    // No Wisdom check authored: nothing to fail, so it isn't a relapse.
    [{ forced: false, inWithdrawal: false, willpowerPassed: undefined }, "withdrawal-save"],
  ];
  for (const [state, expected] of cases) {
    it(`${JSON.stringify(state)} -> ${expected}`, () => {
      assert.equal(abstainBranch(state), expected);
    });
  }
});
