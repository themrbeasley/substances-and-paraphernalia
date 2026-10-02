import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOSE_ROLE,
  doseMarkerIds,
  dosesOthers,
  firstSelfDoseActivity,
  spendsDrug,
  drugUuidFrom,
  doseTurn,
  doseLands,
  findOwnCopy,
  emptyCopyData,
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
    assert.equal(
      spendsDrug({ consumption: { targets: [{ type: "itemUses", target: "" }] } }),
      true,
    );
  });
  it("a cloud tick spends nothing", () => {
    assert.equal(spendsDrug({ consumption: { targets: [] } }), false);
    assert.equal(spendsDrug({}), false);
  });
  it("spending another item's uses doesn't spend the drug", () => {
    assert.equal(
      spendsDrug({ consumption: { targets: [{ type: "itemUses", target: "abc" }] } }),
      false,
    );
  });
});

describe("drugUuidFrom", () => {
  it("reads the drug from the activity Midi records", () => {
    assert.equal(
      drugUuidFrom({
        activityUuid: "Actor.aaaaaaaaaaaaaaaa.Item.fhSubVoltBeans01.Activity.fhActVoltBeans02",
      }),
      "Actor.aaaaaaaaaaaaaaaa.Item.fhSubVoltBeans01",
    );
  });
  it("falls back to the origin, including token actors", () => {
    assert.equal(
      drugUuidFrom({
        origin: "Scene.s.Token.t.Actor.a.Item.fhSubVoltBeans01.ActiveEffect.fhAEVoltBeansDos",
      }),
      "Scene.s.Token.t.Actor.a.Item.fhSubVoltBeans01",
    );
  });
  it("reads a world item, whose uuid has no parent prefix", () => {
    assert.equal(
      drugUuidFrom({ origin: "Item.fhSubVoltBeans01.ActiveEffect.fhAEVoltBeansDos" }),
      "Item.fhSubVoltBeans01",
    );
  });
  it("skips an activity uuid that names no drug and reads the origin", () => {
    assert.equal(
      drugUuidFrom({
        activityUuid: "junk",
        origin: "Item.fhSubVoltBeans01.ActiveEffect.fhAEVoltBeansDos",
      }),
      "Item.fhSubVoltBeans01",
    );
  });
  it("returns null when neither names a drug", () => {
    assert.equal(drugUuidFrom({ origin: "Actor.x.ActiveEffect.y" }), null);
    assert.equal(drugUuidFrom({ activityUuid: 7, origin: null }), null);
    assert.equal(drugUuidFrom({}), null);
    assert.equal(drugUuidFrom(), null);
  });
});

describe("findOwnCopy", () => {
  // Items answer flag reads through getFlag, as Foundry's do (flag-schema.js).
  const kindStub = (kind) => (_scope, key) => (key === "kind" ? kind : undefined);
  const sameId = { id: "fhSubVoltBeans01", name: "Voltbeans", getFlag: kindStub("substance") };
  const sameName = { id: "worldCopy0000001", name: "Voltbeans", getFlag: kindStub("substance") };
  const sword = { id: "sword00000000001", name: "Voltbeans", getFlag: kindStub(undefined) };
  const source = { id: "fhSubVoltBeans01", name: "Voltbeans" };
  it("prefers the same id, then a drug with the same name", () => {
    assert.equal(findOwnCopy([sameName, sameId], source), sameId);
    assert.equal(findOwnCopy([sword, sameName], source), sameName);
    assert.equal(findOwnCopy([sword], source), null);
  });
  it("finds a copy held under another id by name, so no second copy is made", () => {
    assert.equal(findOwnCopy(new Set([sameName]), source), sameName);
  });
  it("finds nothing among no items", () => {
    assert.equal(findOwnCopy([], source), null);
    assert.equal(findOwnCopy(undefined, source), null);
  });
});

describe("emptyCopyData", () => {
  it("makes a 0-dose copy and leaves the source alone", () => {
    const src = {
      _id: "fhSubVoltBeans01",
      name: "Voltbeans",
      folder: "f",
      sort: 5,
      ownership: {},
      system: { quantity: 3, uses: { spent: 1, max: "1" } },
    };
    const copy = emptyCopyData(src);
    assert.equal(copy.system.quantity, 0);
    assert.equal(copy.system.uses.spent, 0);
    assert.equal(copy.system.uses.max, "1");
    assert.equal(copy.folder, undefined);
    assert.equal(src.system.quantity, 3);
    assert.equal(src.system.uses.spent, 1);
  });
  it("drops what ties the copy to the source's place, keeps its id and effects", () => {
    const src = {
      _id: "fhSubVoltBeans01",
      sort: 5,
      ownership: { default: 3 },
      _stats: { coreVersion: "14" },
      effects: [{ _id: "fhAEVoltBeansDos" }],
      system: { container: "thrower0backpack" },
    };
    const copy = emptyCopyData(src);
    assert.equal(copy.sort, undefined);
    assert.equal(copy.ownership, undefined);
    assert.equal(copy._stats, undefined);
    assert.equal(copy.system.container, null);
    assert.equal(src.system.container, "thrower0backpack");
    assert.equal(copy._id, "fhSubVoltBeans01");
    assert.deepEqual(copy.effects, [{ _id: "fhAEVoltBeansDos" }]);
    assert.equal(copy.system.quantity, 0);
    assert.equal(copy.system.uses.spent, 0);
  });
  it("keeps the compendium source, so a later drop of the same drug stacks onto it", () => {
    const compendiumSource =
      "Compendium.substances-and-paraphernalia.substances.Item.fhSubVoltBeans01";
    const src = {
      _id: "fhSubVoltBeans01",
      _stats: { compendiumSource, coreVersion: "14", createdTime: 5 },
      system: {},
    };
    const copy = emptyCopyData(src);
    assert.deepEqual(copy._stats, { compendiumSource });
    assert.deepEqual(src._stats, { compendiumSource, coreVersion: "14", createdTime: 5 });
  });
});

describe("doseTurn", () => {
  const combat = { id: "cbt1", started: true, round: 2, turn: 3 };
  it("a started combat gives its id, round and turn", () => {
    assert.equal(doseTurn(combat, 500), "cbt1.2.3");
  });
  it("a new turn gives a different value", () => {
    assert.notEqual(doseTurn({ ...combat, turn: 4 }, 500), doseTurn(combat, 500));
    assert.notEqual(doseTurn({ ...combat, round: 3, turn: 0 }, 500), doseTurn(combat, 500));
  });
  it("no combat, or one not started, gives the world time", () => {
    assert.equal(doseTurn(null, 500), "time.500");
    assert.equal(doseTurn(undefined, 500), "time.500");
    assert.equal(doseTurn({ ...combat, started: false }, 500), "time.500");
  });
});

describe("doseLands", () => {
  it("lands with no previous dose", () => {
    assert.equal(doseLands(undefined, "t1", false), true);
    assert.equal(doseLands(undefined, "t1", true), true);
  });
  it("two direct doses in the same turn both land", () => {
    assert.equal(doseLands({ turn: "t1", tick: false }, "t1", false), true);
  });
  it("a cloud tick after a dose in the same turn doesn't land", () => {
    assert.equal(doseLands({ turn: "t1", tick: false }, "t1", true), false);
  });
  it("a direct dose after a cloud tick in the same turn doesn't land", () => {
    assert.equal(doseLands({ turn: "t1", tick: true }, "t1", false), false);
  });
  it("a different turn lands", () => {
    assert.equal(doseLands({ turn: "t1", tick: true }, "t2", true), true);
  });
});
