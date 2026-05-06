#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const manifestPath = resolve(repoRoot, "module.json");

const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;

if (!repo) {
  console.error("GITHUB_REPOSITORY not set");
  process.exit(1);
}
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error(`GITHUB_REF_NAME "${tag}" is not a vX.Y.Z tag`);
  process.exit(1);
}
const version = tag.replace(/^v/, "");

const text = await readFile(manifestPath, "utf8");
const mod = JSON.parse(text);
mod.version = version;
mod.manifest = `https://github.com/${repo}/releases/latest/download/module.json`;
mod.download = `https://github.com/${repo}/releases/download/${tag}/module.zip`;
await writeFile(manifestPath, JSON.stringify(mod, null, 2) + "\n");
console.log(`module.json patched: version=${version}, download=${mod.download}`);
