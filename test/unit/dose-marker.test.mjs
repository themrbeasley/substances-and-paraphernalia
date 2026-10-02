import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOSE_ROLE,
  doseMarkerIds,
  dosesOthers,
  firstSelfDoseActivity,
  spendsDrug,
} from "../../scripts/data/dose-marker.js";

const SCOPE = "substances-and-paraphernalia";
const marker = { _id: "fhAEVoltBeansDos", flags: { [SCOPE]: { aeRole: DOSE_ROLE } } };
const high = { _id: "fhAEVoltBeansBen", flags: { [SCOPE]: { aeRole: "altered" } } };
const selfUse = { _id: "fhActVoltBeans01", effects: [] };
const spike = { _id: "fhActVoltBeans02", effects: [{ _id: "fhAEVoltBeansDos" }] };

describe("dose marker", () => {
  it("finds the marker ids among a drug's effects", () => {
    assert.deepEqual(doseMarkerIds([high, marker]), ["fhAEVoltBeansDos"]);
    assert.deepEqual(doseMarkerIds(undefined), []);
  });

  it("an activity listing the marker doses others", () => {
    assert.equal(dosesOthers(spike, ["fhAEVoltBeansDos"]), true);
    assert.equal(dosesOthers(selfUse, ["fhAEVoltBeansDos"]), false);
    assert.equal(dosesOthers({}, ["fhAEVoltBeansDos"]), false);
  });

  it("the relapse uses the first activity that doses the user", () => {
    assert.equal(firstSelfDoseActivity([spike, selfUse], ["fhAEVoltBeansDos"]), selfUse);
    assert.equal(firstSelfDoseActivity([spike], ["fhAEVoltBeansDos"]), null);
  });
});

describe("spendsDrug", () => {
  it("a use that spends this item's uses spends the drug", () => {
    assert.equal(spendsDrug({ consumption: { targets: [{ type: "itemUses", target: "" }] } }), true);
  });
  it("a cloud tick spends nothing", () => {
    assert.equal(spendsDrug({ consumption: { targets: [] } }), false);
    assert.equal(spendsDrug({}), false);
  });
  it("spending another item's uses doesn't spend the drug", () => {
    assert.equal(spendsDrug({ consumption: { targets: [{ type: "itemUses", target: "abc" }] } }), false);
  });
});
