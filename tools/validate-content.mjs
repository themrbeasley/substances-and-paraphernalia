#!/usr/bin/env node
/**
 * Content invariants validator (CLI wrapper).
 *
 * Walks `_source/fishut-illicit-substance/*.json` and
 * `_source/fishut-illicit-paraphernalia/*.json`, then defers per-file checks
 * to the pure helpers in `validate-content-checks.mjs` so the same invariants
 * can be unit-tested with synthetic JSON.
 *
 * Substance contract (v0.4):
 *   - flags["substances-and-paraphernalia"].kind === "substance"
 *   - flags[…].schemaVersion === 2
 *   - system.type.value === "poison"
 *   - system.type.subtype is one of contact|ingested|inhaled|injury
 *   - addiction.save.dc is a finite number
 *   - addiction.enabled is boolean when present
 *   - withdrawal.mod is a positive integer; withdrawal.enabled boolean when present
 *   - addiction.addictionEffectId points to an AE on the same item whose name
 *     contains /addict/i
 *   - flags[…].overdose: when `enabled`, requires integer chancePercent 1..100
 *     and non-empty `description`
 *   - flags[…].withdrawal.effectId (if set): must resolve to AE on the same
 *     item; AE name must contain /withdraw/i; warn on
 *     disadvantage-on-attack/check or statuses:["poisoned"] (don't duplicate
 *     poisoned)
 *   - any modifier-bearing AE: when kind="bypass" type="+N" requires non-zero
 *     numeric bonus; kind="tolerance" requires substanceId + at least one of
 *     attenuateAltered / addictionDcBump / withdrawalAmplify
 *
 * Paraphernalia contract (v0.4):
 *   - flags["substances-and-paraphernalia"].kind === "paraphernalia"
 *   - flags[…].schemaVersion === 2
 *   - subtype is a non-empty kebab-case string AND must be a built-in subtype
 *     from schema.json (custom subtypes are user-managed at runtime via the
 *     Subtype Manager app and can't be validated at build time)
 *   - legacy item-level paraphernaliaId / tags / addictionSaveBypass flags are
 *     hard errors (v0.3 clean break)
 *   - bypass intent is declared via an embedded AE with transfer:true carrying
 *     flags["substances-and-paraphernalia"].modifier:
 *       - kind === "bypass"
 *       - type is one of "auto-pass" | "advantage" | "+N"
 *       - appliesTo is optional — paraphernalia's own `appliesTo` is the
 *         canonical filter at resolution time; values are still validated
 *         when present so typo'd administration strings can't slip through
 *     and when usesPerDay is declared the host item must have
 *     system.uses.recovery including a day/recoverAll entry
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkSubstance, checkParaphernalia } from "./validate-content-checks.mjs";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

async function loadJsonFiles(relDir) {
  const dir = resolve(ROOT, relDir);
  const entries = await readdir(dir);
  const out = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    if (name.startsWith("_folder_")) continue;
    const path = resolve(dir, name);
    const raw = await readFile(path, "utf8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      out.push({ relPath: `${relDir}/${name}`, parseError: e.message });
      continue;
    }
    if (typeof data?._key === "string" && data._key.startsWith("!folders!")) continue;
    out.push({ relPath: `${relDir}/${name}`, data });
  }
  return out;
}

async function loadBuiltinSubtypes() {
  const schemaPath = resolve(ROOT, "scripts/data/schema.json");
  const raw = await readFile(schemaPath, "utf8");
  const schema = JSON.parse(raw);
  const ids = (schema.paraphernaliaSubtypes ?? []).map((entry) => entry?.id).filter(Boolean);
  return new Set(ids);
}

const errors = [];
const warnings = [];

const substanceFiles = await loadJsonFiles("_source/fishut-illicit-substance");
const paraphernaliaFiles = await loadJsonFiles("_source/fishut-illicit-paraphernalia");
const builtinSubtypes = await loadBuiltinSubtypes();

if (substanceFiles.length === 0) {
  warnings.push("_source/fishut-illicit-substance is empty — no substance content to validate.");
}
if (paraphernaliaFiles.length === 0) {
  warnings.push(
    "_source/fishut-illicit-paraphernalia is empty — no paraphernalia content to validate.",
  );
}

for (const file of substanceFiles) {
  if (file.parseError) {
    errors.push(`${file.relPath}: invalid JSON: ${file.parseError}`);
    continue;
  }
  const result = checkSubstance(file);
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}
for (const file of paraphernaliaFiles) {
  if (file.parseError) {
    errors.push(`${file.relPath}: invalid JSON: ${file.parseError}`);
    continue;
  }
  const result = checkParaphernalia(file, { builtinSubtypes });
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}

const checked = substanceFiles.length + paraphernaliaFiles.length;
if (warnings.length) {
  console.warn(`content: ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length) {
  console.error(`content: ${errors.length} error(s) across ${checked} file(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`content: OK (${checked} file(s) checked, ${warnings.length} warning(s)).`);
process.exit(0);
