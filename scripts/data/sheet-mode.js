// dnd5e ItemSheet5e exposes a view/edit pencil toggle independent of Foundry's
// document-level edit permission. `app.isEditable` only reflects ownership; the
// toggle drives `app._mode` (PLAY=1, EDIT=2), and dnd5e's own `_disableFields`
// runs when `_mode === PLAY`. Our hook fires after dnd5e finishes, so we have
// to repeat the resolution ourselves — checking only `isEditable` lets the
// view-mode lock leak through, which is the v0.8.5/v0.8.6 regression class.

export const SHEET_MODE_PLAY = 1;
export const SHEET_MODE_EDIT = 2;

export function resolveSheetEditable({ isEditable, mode } = {}) {
  if (isEditable === false) return false;
  if (mode === undefined || mode === null) return true;
  return mode === SHEET_MODE_EDIT;
}
