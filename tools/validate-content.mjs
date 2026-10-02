#!/usr/bin/env node
/**
 * Content invariants validator (CLI wrapper).
 *
 * Walks `_source/fishut-illicit-substance/*.json` and
 * `_source/fishut-illicit-paraphernalia/*.json`, then defers per-file checks
 * to the pure helpers in `validate-content-checks.mjs` so the same invariants
 * can be unit-tested with synthetic JSON. Every `_source` pack (macros and
 * journals too) is also parsed and its document ids checked: 16 letters or
 * digits (`checkDocumentIds`).
 *
 * Substance contract (v0.8.1):
 *   - flags["substances-and-paraphernalia"].kind === "substance"
 *   - flags[…].schemaVersion === 7
 *   - system.type.value === "poison"
 *   - system.type.subtype is one of contact|ingested|inhaled|injury
 *   - addiction.save.dc is a finite number
 *   - addiction.enabled is boolean when present
 *   - withdrawal block is required (object); withdrawal.enabled boolean when present
 *   - withdrawal.dc is a finite number when addiction.enabled !== false
 *   - when withdrawal.enabled !== false:
 *       - withdrawal.abstain.ability is a non-empty string
 *       - withdrawal.abstain.dc is a finite number
 *       - withdrawal.duration.value is a positive number
 *       - withdrawal.duration.unit is one of minutes|hours|days|weeks|months
 *   - tolerance.decay is the Count+Points decay config (no tolerance.caps)
 *   - addiction.addictionEffectIds points to AEs on the same item whose names
 *     contain /addict/i
 *   - flags[…].overdose: when `enabled`, requires integer chancePercent 1..100
 *     and non-empty `description`; a blank `damage.formula` means no damage,
 *     otherwise it must be plain dice with a known `damage.type`
 *   - flags[…].withdrawal.effectIds (if set): must resolve to AEs on the same
 *     item; AE names must contain /withdraw/i; warn on
 *     disadvantage-on-attack/check or statuses:["poisoned"] (don't duplicate
 *     poisoned)
 *   - a withdrawal AE must not be able to delete itself (deleting the last one
 *     ends the addiction): errors on a flags.midi-qol.OverTime row (any key
 *     starting with that, as Midi does) with a save
 *     and no saveCount/failCount keep-alive (or a count ending in -), or with
 *     removeCondition, actionSave or itemName; on a non-empty
 *     flags.dae.specialDuration; and on flags.dae.stackable "none" or "noneName"
 *   - any modifier-bearing AE: when kind="bypass" type="+N" requires non-zero
 *     numeric bonus; kind="tolerance" is removed (Count+Points model)
 *
 * Gear coverage (spec D11): every substance's administration has gear from the
 * same setting whose appliesTo includes it and that needs no attunement
 * (`checkGearCoverage`, run across both packs).
 *
 * Paraphernalia contract (v0.8.1):
 *   - flags["substances-and-paraphernalia"].kind === "paraphernalia"
 *   - flags[…].schemaVersion === 7
 *   - subtype is a non-empty kebab-case string AND must be a built-in subtype
 *     from schema.json (custom subtypes are user-managed at runtime via the
 *     Subtype Manager app and can't be validated at build time)
 *   - legacy item-level paraphernaliaId / tags / addictionSaveBypass flags are
 *     hard errors (v0.3 clean break)
 *   - bypass intent is declared via an embedded AE with transfer:true carrying
 *     flags["substances-and-paraphernalia"].modifier:
 *       - kind === "bypass"
 *       - type is one of "auto-pass" | "advantage" | "+N"
 *       - appliesTo is optional; paraphernalia's own `appliesTo` is the
 *         canonical filter at resolution time; values are still validated
 *         when present so typo'd administration strings can't slip through
 *     and when usesPerDay is declared the host item must have
 *     system.uses.recovery including a day/recoverAll entry
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkSubstance,
  checkParaphernalia,
  checkDocumentIds,
  checkGearCoverage,
} from "./validate-content-checks.mjs";
import { checkLanguagePhrasing, isBlockingRule } from "./validate-content-language.mjs";

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
const macroFiles = await loadJsonFiles("_source/fishut-illicit-macros");
const journalFiles = await loadJsonFiles("_source/fishut-journals");
const builtinSubtypes = await loadBuiltinSubtypes();

if (substanceFiles.length === 0) {
  warnings.push("_source/fishut-illicit-substance is empty; no substance content to validate.");
}
if (paraphernaliaFiles.length === 0) {
  warnings.push(
    "_source/fishut-illicit-paraphernalia is empty; no paraphernalia content to validate.",
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
errors.push(
  ...checkGearCoverage(
    substanceFiles.filter((f) => !f.parseError).map((f) => f.data),
    paraphernaliaFiles.filter((f) => !f.parseError).map((f) => f.data),
  ),
);
for (const file of [...macroFiles, ...journalFiles]) {
  if (file.parseError) errors.push(`${file.relPath}: invalid JSON: ${file.parseError}`);
}
for (const file of [...substanceFiles, ...paraphernaliaFiles, ...macroFiles, ...journalFiles]) {
  if (!file.parseError) errors.push(...checkDocumentIds(file).errors);
}

// 2024 language audit (spec D15): every rule blocks a release except
// `lowercase-condition`, which stays a warning. Lang strings, templates and the
// shipped text (descriptions, effect descriptions, the guide page) all route
// their findings the same way.
function reportPhrasing(text, sourcePath) {
  const findings = checkLanguagePhrasing(text, { mode: "text-content-only", sourcePath });
  for (const f of findings) {
    const line = `${f.sourcePath} [${f.ruleId}]: "${f.match}": ${f.message}`;
    (isBlockingRule(f.ruleId) ? errors : warnings).push(line);
  }
}

const stripHtml = (html) => html.replace(/<[^>]+>/g, " ");

async function scanLangStringsForPhrasing() {
  const path = resolve(ROOT, "lang/en.json");
  let json;
  try {
    const raw = await readFile(path, "utf8");
    json = JSON.parse(raw);
  } catch (e) {
    warnings.push(`lang/en.json: failed to read for language scan: ${e.message}`);
    return;
  }
  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== "string") continue;
    reportPhrasing(value, `lang/en.json:${key}`);
  }
}

async function scanTemplatesForPhrasing() {
  const templatesRoot = resolve(ROOT, "templates");
  let entries;
  try {
    entries = await readdir(templatesRoot, { withFileTypes: true, recursive: true });
  } catch (e) {
    warnings.push(`templates/: failed to enumerate: ${e.message}`);
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".hbs")) continue;
    const path = resolve(entry.parentPath ?? entry.path, entry.name);
    const relPath = path.slice(ROOT.length + 1).replace(/\\/g, "/");
    let raw;
    try {
      raw = await readFile(path, "utf8");
    } catch (e) {
      warnings.push(`${relPath}: failed to read for language scan: ${e.message}`);
      continue;
    }
    // Strip Handlebars expressions {{...}} so we don't flag inner syntax.
    const stripped = raw.replace(/{{[\s\S]*?}}/g, " ");
    // Strip HTML tags so we scan visible text only.
    reportPhrasing(stripHtml(stripped), relPath);
  }
}

// Shipped text: drug and gear descriptions, embedded effect descriptions and
// the guide page. Tags are stripped first so only the visible words are scanned.
function scanSourceForPhrasing() {
  for (const file of [...substanceFiles, ...paraphernaliaFiles]) {
    if (file.parseError) continue;
    const { relPath, data } = file;
    const description = data.system?.description?.value;
    if (typeof description === "string") {
      reportPhrasing(stripHtml(description), `${relPath}:system.description.value`);
    }
    for (const effect of data.effects ?? []) {
      if (typeof effect.description !== "string") continue;
      reportPhrasing(stripHtml(effect.description), `${relPath}:effects["${effect.name}"].description`);
    }
  }
  for (const file of journalFiles) {
    if (file.parseError) continue;
    for (const page of file.data.pages ?? []) {
      const content = page.text?.content;
      if (typeof content !== "string") continue;
      reportPhrasing(stripHtml(content), `${file.relPath}:pages["${page.name}"].text.content`);
    }
  }
}

await scanLangStringsForPhrasing();
await scanTemplatesForPhrasing();
scanSourceForPhrasing();

const checked =
  substanceFiles.length + paraphernaliaFiles.length + macroFiles.length + journalFiles.length;
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
