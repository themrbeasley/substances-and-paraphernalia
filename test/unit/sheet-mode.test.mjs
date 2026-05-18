import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSheetEditable,
  SHEET_MODE_PLAY,
  SHEET_MODE_EDIT,
} from "../../scripts/data/sheet-mode.js";

// Regression guard for the v0.8.3-v0.8.6 view-mode lock leak. The Details-tab
// injection had been reading `app.isEditable !== false` and treating that as
// "sheet is in edit mode" — but dnd5e's `isEditable` only reflects ownership.
// The pencil-icon toggle drives `app._mode` (PLAY=1 / EDIT=2). For an owner
// who has flipped the sheet to view mode, `isEditable === true` but
// `_mode === 1`, so our gate let writes and visual interaction through. This
// table locks in the correct resolution.

describe("resolveSheetEditable", () => {
  it("returns false when isEditable is explicitly false (permission)", () => {
    assert.equal(resolveSheetEditable({ isEditable: false, mode: SHEET_MODE_EDIT }), false);
    assert.equal(resolveSheetEditable({ isEditable: false, mode: SHEET_MODE_PLAY }), false);
    assert.equal(resolveSheetEditable({ isEditable: false, mode: undefined }), false);
  });

  it("returns false when mode is PLAY even if isEditable is true", () => {
    assert.equal(resolveSheetEditable({ isEditable: true, mode: SHEET_MODE_PLAY }), false);
  });

  it("returns true when mode is EDIT and isEditable is true", () => {
    assert.equal(resolveSheetEditable({ isEditable: true, mode: SHEET_MODE_EDIT }), true);
  });

  it("returns true when mode is missing (non-dnd5e sheet) and isEditable is truthy", () => {
    assert.equal(resolveSheetEditable({ isEditable: true, mode: undefined }), true);
    assert.equal(resolveSheetEditable({ isEditable: true, mode: null }), true);
    assert.equal(resolveSheetEditable({ isEditable: true }), true);
  });

  it("treats missing isEditable as truthy (defer to mode)", () => {
    assert.equal(resolveSheetEditable({ mode: SHEET_MODE_EDIT }), true);
    assert.equal(resolveSheetEditable({ mode: SHEET_MODE_PLAY }), false);
    assert.equal(resolveSheetEditable({}), true);
    assert.equal(resolveSheetEditable(), true);
  });

  it("MODES constants match dnd5e ItemSheet5e.MODES values", () => {
    // dnd5e.mjs:50919-50922 — { PLAY: 1, EDIT: 2 }. If dnd5e ever renumbers
    // these, this test breaks on purpose so the resolver can be updated.
    assert.equal(SHEET_MODE_PLAY, 1);
    assert.equal(SHEET_MODE_EDIT, 2);
  });
});
