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
 *   - system.type.value === "poison"
 *   - system.type.subtype is one of contact|ingested|inhaled|injury
 *     (dnd5e Poison subtype is the source of truth for administration)
 *   - addiction.save.dc is a finite number
 *   - addiction.withdrawalMod is a positive integer
 *   - addiction.addictionEffectId points to an AE on the same item whose name
 *     contains /addict/i
 *   - requiredSubtypes (if present) is a flat array of kebab-case subtype ids;
 *     the legacy requiredParaphernalia AND-of-OR shape is a hard error
 *
 * Paraphernalia contract:
 *   - flags["substances-and-paraphernalia"].kind === "paraphernalia"
 *   - flags[…].schemaVersion === 2
 *   - subtype is a non-empty kebab-case string identifying the paraphernalia
 *     class (open enum — schema seeds well-known ids but custom subtypes are
 *     allowed)
 *   - legacy item-level paraphernaliaId / tags / addictionSaveBypass flags are
 *     hard errors (v0.3 clean break)
 *   - bypass intent is declared via an embedded AE with transfer:true carrying
 *     flags["substances-and-paraphernalia"].modifier:
 *       - kind === "bypass"
 *       - type is one of "auto-pass" | "advantage" (v0.3 ships these only)
 *       - appliesTo is a non-empty array of valid administration strings
 *     and when usesPerDay is declared the host item must have
 *     system.uses.recovery including a day/recoverAll entry
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const FLAG_SCOPE = "substances-and-paraphernalia";

const ADMIN_VALUES = new Set(["contact", "ingested", "inhaled", "injury"]);
const MODIFIER_TYPES = new Set(["auto-pass", "advantage"]);
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
  if (flags.administration !== undefined) {
    err(
      `${tag}: legacy "administration" flag is removed in v0.3 — administration now lives on system.type.subtype (dnd5e Poison subtype)`,
    );
  }
  const poisonValue = data?.system?.type?.value;
  if (poisonValue !== "poison") {
    err(`${tag}: system.type.value must be "poison" (got ${poisonValue})`);
  }
  const subtype = data?.system?.type?.subtype;
  if (!ADMIN_VALUES.has(subtype)) {
    err(
      `${tag}: system.type.subtype must be one of ${[...ADMIN_VALUES].join("|")} (got ${subtype})`,
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

  if (flags.requiredParaphernalia !== undefined) {
    err(
      `${tag}: legacy "requiredParaphernalia" flag is removed in v0.3 — declare a flat "requiredSubtypes" array of paraphernalia subtype ids instead`,
    );
  }
  if (flags.requiredSubtypes !== undefined) {
    if (!Array.isArray(flags.requiredSubtypes)) {
      err(`${tag}: requiredSubtypes must be an array of subtype id strings`);
    } else {
      for (const s of flags.requiredSubtypes) {
        if (typeof s !== "string" || !KEBAB.test(s)) {
          err(`${tag}: requiredSubtypes entry must be a kebab-case string (got ${JSON.stringify(s)})`);
        }
      }
    }
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
  if (typeof flags.subtype !== "string" || !KEBAB.test(flags.subtype)) {
    err(`${tag}: subtype must be a kebab-case string (got ${JSON.stringify(flags.subtype)})`);
  }
  if (flags.paraphernaliaId !== undefined) {
    err(
      `${tag}: legacy "paraphernaliaId" flag is removed in v0.3 — declare flags["${FLAG_SCOPE}"].subtype instead`,
    );
  }
  if (flags.tags !== undefined) {
    err(
      `${tag}: legacy "tags" flag is removed in v0.3 — paraphernalia identity is the subtype id alone`,
    );
  }

  if (flags.addictionSaveBypass !== undefined) {
    err(
      `${tag}: legacy item-level "addictionSaveBypass" flag is removed in v0.3 — declare bypass via an embedded transfer:true AE with flags["${FLAG_SCOPE}"].modifier instead`,
    );
  }

  const effects = Array.isArray(data.effects) ? data.effects : [];
  const bypassEffects = [];
  for (const effect of effects) {
    const modifier = effect?.flags?.[FLAG_SCOPE]?.modifier;
    if (!modifier || modifier.kind !== "bypass") continue;
    bypassEffects.push({ effect, modifier });
  }
  if (bypassEffects.length === 0) return;

  let needsDailyRecovery = false;
  for (const { effect, modifier } of bypassEffects) {
    const aeTag = `${tag} effect "${effect?.name ?? effect?._id ?? "?"}"`;
    if (effect.transfer !== true) {
      err(`${aeTag}: bypass-granting AE must declare transfer:true`);
    }
    if (!MODIFIER_TYPES.has(modifier.type)) {
      err(
        `${aeTag}: modifier.type must be one of ${[...MODIFIER_TYPES].join("|")} (got ${modifier.type})`,
      );
    }
    if (!Array.isArray(modifier.appliesTo) || modifier.appliesTo.length === 0) {
      err(`${aeTag}: modifier.appliesTo must be a non-empty array`);
    } else {
      for (const a of modifier.appliesTo) {
        if (!ADMIN_VALUES.has(a)) {
          err(`${aeTag}: modifier.appliesTo contains invalid administration "${a}"`);
        }
      }
    }
    if (modifier.usesPerDay !== undefined && modifier.usesPerDay !== null && modifier.usesPerDay !== "") {
      needsDailyRecovery = true;
    }
  }

  if (needsDailyRecovery) {
    const recovery = data.system?.uses?.recovery;
    const hasDailyRecovery =
      Array.isArray(recovery) &&
      recovery.some((r) => r?.period === "day" && r?.type === "recoverAll");
    if (!hasDailyRecovery) {
      err(
        `${tag}: paraphernalia granting a usesPerDay-bounded bypass must declare system.uses.recovery: [{ period: "day", type: "recoverAll" }]`,
      );
    }
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
