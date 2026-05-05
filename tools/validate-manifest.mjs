#!/usr/bin/env node
/**
 * Validates module.json against the rules we care about for this repo.
 *
 * Foundry does not publish a stable, fetchable JSON Schema for module.json
 * across V13/V14, so a custom validator is more reliable than ajv against a
 * moving target. Checks here mirror the constraints called out in the plan.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function isSemverish(v) {
  return typeof v === "string" && /^\d+\.\d+\.\d+(-[\w.+-]+)?$/.test(v);
}

const manifestPath = resolve(ROOT, "module.json");
const raw = await readFile(manifestPath, "utf8");
let manifest;
try {
  manifest = JSON.parse(raw);
} catch (e) {
  err(`module.json is not valid JSON: ${e.message}`);
  printAndExit();
}

const schemaRaw = await readFile(resolve(ROOT, "scripts/data/schema.json"), "utf8");
const schema = JSON.parse(schemaRaw);

if (manifest.id !== schema.moduleId) {
  err(`module.json id "${manifest.id}" must match schema.json moduleId "${schema.moduleId}".`);
}

if (!manifest.title) err("module.json title is required.");
if (!isSemverish(manifest.version)) {
  err(`module.json version "${manifest.version}" is not a semver-ish string.`);
}

if (!manifest.compatibility?.minimum) err("module.json compatibility.minimum is required.");
if (!manifest.compatibility?.verified) err("module.json compatibility.verified is required.");

if (!Array.isArray(manifest.esmodules) || manifest.esmodules.length === 0) {
  err('module.json esmodules must list at least one entrypoint (e.g. "scripts/module.mjs").');
} else {
  for (const f of manifest.esmodules) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) warn(`esmodule entrypoint "${f}" does not exist yet.`);
  }
}

if (!Array.isArray(manifest.languages) || manifest.languages.length === 0) {
  err("module.json languages must declare at least one language.");
} else {
  for (const l of manifest.languages) {
    const p = resolve(ROOT, l.path);
    if (!existsSync(p)) warn(`language file "${l.path}" does not exist yet.`);
  }
}

if (manifest.flags?.canUpload) {
  warn("flags.canUpload is set — make sure this is intentional and documented.");
}

if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) {
  err("module.json packs must declare at least one pack.");
} else {
  const slugs = new Set();
  for (const pack of manifest.packs) {
    if (!pack.name) err(`pack missing name: ${JSON.stringify(pack)}`);
    if (slugs.has(pack.name)) err(`duplicate pack name: ${pack.name}`);
    slugs.add(pack.name);
    if (!pack.path?.startsWith("packs/")) {
      err(`pack "${pack.name}" path must begin with "packs/".`);
    }
    if (pack.ownership?.ASSISTANT && !["OBSERVER", "OWNER", "LIMITED", "NONE"].includes(pack.ownership.ASSISTANT)) {
      err(`pack "${pack.name}" has unrecognized ASSISTANT ownership: ${pack.ownership.ASSISTANT}`);
    }
  }
}

if (manifest.relationships?.systems?.length) {
  for (const s of manifest.relationships.systems) {
    if (!s.id) err(`relationships.systems entry missing id`);
    if (!s.compatibility?.minimum) {
      warn(`relationships.systems "${s.id}" has no compatibility.minimum pin.`);
    }
  }
}

if (manifest.relationships?.recommends?.length) {
  for (const r of manifest.relationships.recommends) {
    if (!r.id) err(`relationships.recommends entry missing id`);
    if (!r.compatibility?.minimum) {
      warn(`relationships.recommends "${r.id}" has no compatibility.minimum pin (verify at impl).`);
    }
  }
}

printAndExit();

function printAndExit() {
  if (warnings.length) {
    console.warn(`module.json: ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`module.json: ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`module.json: OK (${warnings.length} warning(s)).`);
  process.exit(0);
}
