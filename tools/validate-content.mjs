#!/usr/bin/env node
/**
 * Content invariants validator.
 *
 * Walks `_source/fishut-illicit-substance/*.json` and
 * `_source/fishut-illicit-paraphernalia/*.json`. Asserts the v2 flag-schema
 * shape on every shipped substance and paraphernalia so a malformed file is
 * caught at build time rather than at world-load time. Files prefixed with
 * `_folder_` are folder records and are skipped.
 *
 * Substance contract:
 *   - flags["substances-and-paraphernalia"].kind === "substance"
 *   - flags[…].schemaVersion === 2
 *   - administration is one of inhaled|ingested|injected|sublingual|topical
 *   - addiction.save.dc is a finite number
 *   - addiction.withdrawalMod is a positive integer
 *   - addiction.addictionEffectId points to an AE on the same item whose name
 *     contains /addict/i
 *
 * Paraphernalia contract:
 *   - flags["substances-and-paraphernalia"].kind === "paraphernalia"
 *   - flags[…].schemaVersion === 2
 *   - paraphernaliaId is a kebab-case slug
 *   - if addictionSaveBypass is set:
 *       - type === "auto-pass" (only supported in v2)
 *       - appliesTo is a non-empty array of valid administration strings
 *       - usesPerDay is set
 *       - system.uses.recovery includes a day/recoverAll entry
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const FLAG_SCOPE = "substances-and-paraphernalia";

const ADMIN_VALUES = new Set(["inhaled", "ingested", "injected", "sublingual", "topical"]);
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

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
      err(`${relDir}/${name}: invalid JSON: ${e.message}`);
      continue;
    }
    out.push({ relPath: `${relDir}/${name}`, data });
  }
  return out;
}

function flagsOf(data) {
  return data?.flags?.[FLAG_SCOPE] ?? null;
}

function checkSubstance({ relPath, data }) {
  const tag = `${relPath} (${data?.name ?? "?"})`;
  const flags = flagsOf(data);
  if (!flags) {
    err(`${tag}: missing flags["${FLAG_SCOPE}"]`);
    return;
  }
  if (flags.kind !== "substance") {
    err(`${tag}: kind must be "substance" (got ${flags.kind})`);
    return;
  }
  if (flags.schemaVersion !== 2) {
    err(`${tag}: schemaVersion must be 2 (got ${flags.schemaVersion})`);
  }
  if (!ADMIN_VALUES.has(flags.administration)) {
    err(
      `${tag}: administration must be one of ${[...ADMIN_VALUES].join("|")} (got ${flags.administration})`,
    );
  }

  const addiction = flags.addiction;
  if (!addiction || typeof addiction !== "object") {
    err(`${tag}: addiction block is required`);
    return;
  }
  const dc = addiction.save?.dc;
  if (typeof dc !== "number" || !Number.isFinite(dc)) {
    err(`${tag}: addiction.save.dc must be a finite number (got ${dc})`);
  }
  const w = addiction.withdrawalMod;
  if (!Number.isInteger(w) || w <= 0) {
    err(`${tag}: addiction.withdrawalMod must be a positive integer (got ${w})`);
  }

  const aeId = addiction.addictionEffectId;
  if (!aeId) {
    err(`${tag}: addiction.addictionEffectId is required`);
    return;
  }
  const effects = Array.isArray(data.effects) ? data.effects : [];
  const ae = effects.find((e) => e?._id === aeId);
  if (!ae) {
    err(`${tag}: addiction.addictionEffectId "${aeId}" not found in effects[]`);
    return;
  }
  if (!/addict/i.test(ae.name ?? "")) {
    err(`${tag}: addiction AE name "${ae.name}" must contain "addict"`);
  }
}

function checkParaphernalia({ relPath, data }) {
  const tag = `${relPath} (${data?.name ?? "?"})`;
  const flags = flagsOf(data);
  if (!flags) {
    err(`${tag}: missing flags["${FLAG_SCOPE}"]`);
    return;
  }
  if (flags.kind !== "paraphernalia") {
    err(`${tag}: kind must be "paraphernalia" (got ${flags.kind})`);
    return;
  }
  if (flags.schemaVersion !== 2) {
    err(`${tag}: schemaVersion must be 2 (got ${flags.schemaVersion})`);
  }
  if (typeof flags.paraphernaliaId !== "string" || !KEBAB.test(flags.paraphernaliaId)) {
    err(`${tag}: paraphernaliaId must be kebab-case (got ${flags.paraphernaliaId})`);
  }

  const bypass = flags.addictionSaveBypass;
  if (!bypass) return;

  if (bypass.type !== "auto-pass") {
    err(`${tag}: addictionSaveBypass.type must be "auto-pass" in v2 (got ${bypass.type})`);
  }
  if (!Array.isArray(bypass.appliesTo) || bypass.appliesTo.length === 0) {
    err(`${tag}: addictionSaveBypass.appliesTo must be a non-empty array`);
  } else {
    for (const a of bypass.appliesTo) {
      if (!ADMIN_VALUES.has(a)) {
        err(`${tag}: addictionSaveBypass.appliesTo contains invalid administration "${a}"`);
      }
    }
  }
  if (bypass.usesPerDay === undefined || bypass.usesPerDay === null || bypass.usesPerDay === "") {
    err(`${tag}: addictionSaveBypass.usesPerDay must be set`);
  }

  const recovery = data.system?.uses?.recovery;
  const hasDailyRecovery =
    Array.isArray(recovery) &&
    recovery.some((r) => r?.period === "day" && r?.type === "recoverAll");
  if (!hasDailyRecovery) {
    err(
      `${tag}: addictionSaveBypass-granting paraphernalia must declare system.uses.recovery: [{ period: "day", type: "recoverAll" }]`,
    );
  }
}

const substanceFiles = await loadJsonFiles("_source/fishut-illicit-substance");
const paraphernaliaFiles = await loadJsonFiles("_source/fishut-illicit-paraphernalia");

if (substanceFiles.length === 0) {
  warn("_source/fishut-illicit-substance is empty — no substance content to validate.");
}
if (paraphernaliaFiles.length === 0) {
  warn("_source/fishut-illicit-paraphernalia is empty — no paraphernalia content to validate.");
}

for (const file of substanceFiles) checkSubstance(file);
for (const file of paraphernaliaFiles) checkParaphernalia(file);

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
