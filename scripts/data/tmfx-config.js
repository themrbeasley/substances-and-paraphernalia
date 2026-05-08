import { MODULE_ID, FLAGS } from "../config.js";

const NONE = Object.freeze({ mode: "none" });

/**
 * Pure helper. Reads the substance item's TMFX flag block and normalizes it
 * into one of three shapes:
 *   - `{ mode: "none" }`
 *   - `{ mode: "preset", presetName }`
 *   - `{ mode: "macro", macroUuid }`
 *
 * Any malformed/incomplete config (missing payload field, unknown mode,
 * non-object flag, junk values) degrades to `{ mode: "none" }` so the
 * integration dispatcher can blindly switch on `mode` without per-call
 * defensive checks.
 *
 * Lives in `scripts/data/*` so it stays Node-testable — no Foundry globals.
 *
 * @param {object} item — Foundry item document or any object with a `flags`
 *   bag. Both `item.flags?.[MODULE_ID]?.tmfx` and an absent flag are valid.
 * @returns {{mode: "none"} | {mode: "preset", presetName: string} | {mode: "macro", macroUuid: string}}
 */
export function parseTmfxConfig(item) {
  const raw = item?.flags?.[MODULE_ID]?.[FLAGS.tmfx];
  if (!raw || typeof raw !== "object") return { ...NONE };

  if (raw.mode === "preset") {
    const presetName = typeof raw.presetName === "string" ? raw.presetName.trim() : "";
    if (!presetName) return { ...NONE };
    return { mode: "preset", presetName };
  }

  if (raw.mode === "macro") {
    const macroUuid = typeof raw.macroUuid === "string" ? raw.macroUuid.trim() : "";
    if (!macroUuid) return { ...NONE };
    return { mode: "macro", macroUuid };
  }

  return { ...NONE };
}
