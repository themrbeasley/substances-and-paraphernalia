#!/usr/bin/env node
/**
 * Release guard (spec D14): a release needs a CHANGELOG section and a ROADMAP
 * mention for its version. Runs first in the release workflow and as
 * `npm run check:release` before tagging.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkReleaseDocs({ version, changelog, roadmap }) {
  const errors = [];
  if (!new RegExp(`^## \\[${escape(version)}\\]`, "m").test(changelog)) {
    errors.push(`CHANGELOG.md has no "## [${version}]" section`);
  }
  if (!new RegExp(`(^|[^\\d.])${escape(version)}(?![\\d])`).test(roadmap)) {
    errors.push(`ROADMAP.md doesn't mention ${version}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.env.GITHUB_REF_NAME;
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const version = tag?.startsWith("v") ? tag.slice(1) : pkg.version;
  const errors = checkReleaseDocs({
    version,
    changelog: await readFile(resolve(root, "CHANGELOG.md"), "utf8"),
    roadmap: await readFile(resolve(root, "ROADMAP.md"), "utf8"),
  });
  for (const e of errors) console.error(e);
  if (errors.length) process.exit(1);
  console.log(`release docs: OK for ${version}`);
}
