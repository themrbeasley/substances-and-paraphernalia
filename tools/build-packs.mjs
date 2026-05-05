#!/usr/bin/env node
/**
 * Compiles `_source/<pack>/` JSON into LevelDB packs in `packs/<pack>/`,
 * and the inverse for `unpack`. Wraps @foundryvtt/foundryvtt-cli.
 *
 * Phase 1 ships the structure only; `_source/` is empty until Phase 3, so
 * an empty source dir is treated as success ("nothing to compile yet").
 */

import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

const cmd = process.argv[2];
if (!["pack", "unpack"].includes(cmd)) {
  console.error("Usage: build-packs.mjs <pack|unpack>");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(resolve(ROOT, "module.json"), "utf8"));

let cli;
try {
  cli = await import("@foundryvtt/foundryvtt-cli");
} catch {
  console.error(
    "@foundryvtt/foundryvtt-cli is not installed. Run `npm install` before `npm run pack`.",
  );
  process.exit(1);
}

const compilePack = cli.compilePack ?? cli.default?.compilePack;
const extractPack = cli.extractPack ?? cli.default?.extractPack;
if (!compilePack || !extractPack) {
  console.error("Could not locate compilePack/extractPack exports on @foundryvtt/foundryvtt-cli.");
  process.exit(1);
}

const sourceRoot = resolve(ROOT, "_source");
const packsRoot = resolve(ROOT, "packs");

if (cmd === "pack") {
  await mkdir(packsRoot, { recursive: true });
  for (const pack of manifest.packs) {
    const src = join(sourceRoot, pack.name);
    const dst = resolve(ROOT, pack.path);
    if (!existsSync(src)) {
      console.log(`[skip] _source/${pack.name} missing — nothing to compile.`);
      continue;
    }
    const entries = await readdir(src);
    const docEntries = entries.filter((e) => !e.startsWith("."));
    if (docEntries.length === 0) {
      console.log(`[skip] _source/${pack.name} is empty — nothing to compile.`);
      continue;
    }
    await rm(dst, { recursive: true, force: true });
    await mkdir(dst, { recursive: true });
    console.log(`[pack] ${src} → ${dst}`);
    await compilePack(src, dst, { yaml: false });
  }
  console.log("pack: done.");
} else {
  for (const pack of manifest.packs) {
    const src = resolve(ROOT, pack.path);
    const dst = join(sourceRoot, pack.name);
    if (!existsSync(src)) {
      console.log(`[skip] packs/${pack.name} missing — nothing to extract.`);
      continue;
    }
    await mkdir(dst, { recursive: true });
    console.log(`[unpack] ${src} → ${dst}`);
    await extractPack(src, dst, { yaml: false });
  }
  console.log("unpack: done.");
}
