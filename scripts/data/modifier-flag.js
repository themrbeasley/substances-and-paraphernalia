/**
 * Pure shape accessor for the AE-side modifier block.
 *
 * v0.4 surfaces the modifier block as **editable Change rows** on the AE so
 * the standard Foundry "Changes" tab is the canonical authoring surface:
 * GMs see and edit the per-stack tunables in the same place they edit any
 * other AE change. Storage convention: rows whose `key` is
 * `flags.<scope>.modifier.<field>` with mode `OVERRIDE`. Nested objects
 * (`attenuateAltered`, `withdrawalAmplify`) are flattened across rows
 * (`...modifier.attenuateAltered.durationFactor`).
 *
 * Kept dependency-free so Node `--test` can exercise round-trip without
 * pulling in Foundry globals or the world-config bootstrap. The Foundry-
 * coupled wrappers `getModifier` / `setModifier` live in `flag-schema.js`.
 *
 * @typedef {"bypass" | "tolerance"} ModifierKind
 *   v0.4 adds "tolerance" — actor-side stack-counted state (no per-shot consumption).
 *   "bypass" is the original paraphernalia-grants-save-relief pipeline.
 *
 * @typedef {"auto-pass" | "advantage" | "+N"} ModifierType
 *   For `kind: "bypass"` only. Tier strength: auto-pass > advantage > +N.
 *
 * @typedef {Object} ToleranceFactor
 * @property {number}  [durationFactor]   Per-stack additive delta on a 1.0 baseline.
 * @property {number}  [modifierFactor]   Per-stack additive delta on a 1.0 baseline.
 * @property {boolean} [dropAdvantage]    OR'd across stacks ≥ 1.
 *
 * @typedef {Object} WithdrawalAmplifyFactor
 * @property {number}  [durationFactor]
 * @property {number}  [modifierFactor]
 * @property {boolean} [addDisadvantage]
 *
 * @typedef {Object} ModifierBlock
 * @property {ModifierKind}  kind
 * @property {ModifierType}  [type]                  (bypass only)
 * @property {string[]}      [appliesTo]             (bypass only) Administrations the modifier applies to.
 * @property {number|string} [usesPerDay]            (bypass only) Numeric or formula (e.g. "@prof").
 * @property {number}        [bonus]                 (bypass, type === "+N")
 * @property {string}        [substanceId]           (tolerance only) Item id of the addictive substance.
 * @property {ToleranceFactor}         [attenuateAltered]   (tolerance only)
 * @property {number}                  [addictionDcBump]    (tolerance only)
 * @property {WithdrawalAmplifyFactor} [withdrawalAmplify]  (tolerance only)
 */

const MODIFIER_KEY = "modifier";
const OVERRIDE_MODE = 5;
const DEFAULT_PRIORITY = 20;

const NUMERIC_LEAVES = new Set([
  "addictionDcBump",
  "bonus",
  "attenuateAltered.durationFactor",
  "attenuateAltered.modifierFactor",
  "withdrawalAmplify.durationFactor",
  "withdrawalAmplify.modifierFactor",
]);
const BOOLEAN_LEAVES = new Set([
  "attenuateAltered.dropAdvantage",
  "withdrawalAmplify.addDisadvantage",
]);
const ARRAY_LEAVES = new Set(["appliesTo"]);
// usesPerDay is special: it accepts both numbers and formula strings, so we
// only coerce when the stored string parses cleanly as a finite number.
const COERCED_NUMBER_OR_STRING = new Set(["usesPerDay"]);

/**
 * Build the full `flags.<scope>.modifier.` key prefix used for Change rows.
 *
 * @param {string} scope  Module flag scope (e.g. `"substances-and-paraphernalia"`).
 */
export const modifierChangeKeyPrefix = (scope) => `flags.${scope}.${MODIFIER_KEY}.`;

/**
 * Read the modifier block from a module-scoped flag namespace.
 *
 * Retained for callers that still consult `effect.flags.<scope>.modifier`
 * directly (legacy authored content, Quench fixtures pre-migration). For
 * v0.4 stub-created AEs, `readModifierFromChanges` is the canonical reader.
 *
 * @param {object|null|undefined} flagsScope
 *   The value of `effect.flags["substances-and-paraphernalia"]`.
 * @returns {ModifierBlock|null}
 */
export function readModifier(flagsScope) {
  return flagsScope?.[MODIFIER_KEY] ?? null;
}

/**
 * Reconstruct a `ModifierBlock` from an AE's `changes[]` array.
 *
 * Walks rows whose key starts with `flags.<scope>.modifier.`, decodes the
 * suffix into the block (flat or nested), and coerces the string `value`
 * to its declared type. Returns `null` if no rows match or the resulting
 * block has no `kind` (the block's mandatory discriminator).
 *
 * @param {Array<{key:string, value:any}>|null|undefined} changes
 * @param {string} scope
 * @returns {ModifierBlock|null}
 */
export function readModifierFromChanges(changes, scope) {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  const prefix = modifierChangeKeyPrefix(scope);
  const block = {};
  for (const row of changes) {
    const key = row?.key;
    if (typeof key !== "string" || !key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length);
    if (!path) continue;
    const decoded = decodeChangeValue(path, row?.value);
    setPath(block, path, decoded);
  }
  return block.kind ? block : null;
}

/**
 * Render a `ModifierBlock` as an array of `{ key, mode, value, priority }`
 * Change rows for an AE. Nested objects are flattened to one row per leaf.
 *
 * Numeric values become strings (Foundry stores Change values as strings);
 * arrays are JSON-encoded so a single row remains editable in the UI.
 * `null` / `undefined` / `""` leaves are emitted as empty-string rows so
 * the row is visible (and trivially editable) in the Changes tab.
 *
 * @param {ModifierBlock} block
 * @param {string} scope
 * @param {{ priority?: number }} [opts]
 * @returns {Array<{key:string, mode:number, value:string, priority:number}>}
 */
export function writeModifierAsChanges(block, scope, { priority = DEFAULT_PRIORITY } = {}) {
  if (!block || typeof block !== "object") return [];
  const prefix = modifierChangeKeyPrefix(scope);
  const rows = [];
  for (const [path, leaf] of flattenLeaves(block)) {
    rows.push({
      key: `${prefix}${path}`,
      mode: OVERRIDE_MODE,
      value: encodeChangeValue(path, leaf),
      priority,
    });
  }
  return rows;
}

/**
 * Build the union of an existing AE's Change rows and the rows representing
 * `block`. Existing rows whose key starts with the modifier prefix are
 * dropped (so updates replace the modifier subset cleanly); non-modifier
 * rows are preserved. Useful for `setModifier(effect, block)` which must
 * not clobber unrelated authored changes (status overrides, raw stat
 * tweaks the GM put on the AE alongside the modifier).
 *
 * @param {Array<{key:string}>|null|undefined} existingChanges
 * @param {ModifierBlock} block
 * @param {string} scope
 * @param {{ priority?: number }} [opts]
 * @returns {Array<{key:string, mode:number, value:string, priority:number}>}
 */
export function mergeModifierIntoChanges(existingChanges, block, scope, opts) {
  const prefix = modifierChangeKeyPrefix(scope);
  const preserved = Array.isArray(existingChanges)
    ? existingChanges.filter((row) => typeof row?.key !== "string" || !row.key.startsWith(prefix))
    : [];
  return [...preserved, ...writeModifierAsChanges(block, scope, opts)];
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function decodeChangeValue(path, raw) {
  if (raw === undefined || raw === null) return null;
  const str = typeof raw === "string" ? raw : String(raw);

  if (BOOLEAN_LEAVES.has(path)) {
    if (str === "true") return true;
    if (str === "false") return false;
    return null;
  }
  if (ARRAY_LEAVES.has(path)) {
    return parseArrayValue(str);
  }
  if (NUMERIC_LEAVES.has(path)) {
    if (str === "") return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }
  if (COERCED_NUMBER_OR_STRING.has(path)) {
    if (str === "") return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : str;
  }
  // strings: kind, type, substanceId, anything not in the known sets.
  return str;
}

function encodeChangeValue(path, value) {
  if (value === null || value === undefined) return "";
  if (ARRAY_LEAVES.has(path)) {
    if (!Array.isArray(value)) return "[]";
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

function parseArrayValue(str) {
  const trimmed = str.trim();
  if (trimmed === "") return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr.map(String).filter((s) => s.length > 0) : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cursor[key] == null || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

// Walk a (possibly nested) object yielding [dottedPath, leafValue] pairs.
// Arrays and primitives are leaves; plain objects recurse.
function* flattenLeaves(obj, prefix = "") {
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      yield* flattenLeaves(val, path);
    } else {
      yield [path, val];
    }
  }
}
