import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Defense in depth against the v0.8.1/v0.8.2 regression class: code references
// a FISHUT.* lang key that doesn't exist in lang/en.json, so Foundry renders
// the literal key string instead of a label. ESLint can't catch this — the
// keys are string literals, not symbols. This test scans details-tab.js for
// every literal FISHUT.* key reference and asserts it exists in en.json.
//
// Dynamic key references (template literals with ${…}) are extracted as the
// static prefix + each enumerated suffix value we know about. Add new suffix
// enumerations here if you introduce a new dynamic key.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");

const STATIC_KEY = /["']FISHUT\.[A-Za-z0-9_.]+["']/g;
const DYNAMIC_KEY = /["'`]FISHUT\.[A-Za-z0-9_.]+\.\$\{[a-zA-Z_]+\}["'`]/g;

// Known enumerations for dynamic keys referenced via template literals.
// Keep in sync with the source list in the corresponding code file.
const DYNAMIC_ENUMS = {
  "FISHUT.DetailsTab.Field.WithdrawalDurationUnit": ["minutes", "hours", "days", "weeks", "months"],
};

describe("details-tab.js lang key references", () => {
  it("every FISHUT.* key in details-tab.js exists in lang/en.json", async () => {
    const [source, langJson] = await Promise.all([
      readFile(resolve(REPO, "scripts/ui/details-tab.js"), "utf8"),
      readFile(resolve(REPO, "lang/en.json"), "utf8"),
    ]);
    const lang = JSON.parse(langJson);
    // en.json is flat-keyed at the top level (e.g. "FISHUT.Foo.Bar"), so the
    // set we check against is just Object.keys — no recursion needed.
    const knownKeys = new Set(Object.keys(lang));

    const referenced = new Set();
    for (const match of source.matchAll(STATIC_KEY)) {
      referenced.add(match[0].slice(1, -1));
    }
    for (const match of source.matchAll(DYNAMIC_KEY)) {
      const literal = match[0].slice(1, -1);
      const prefix = literal.replace(/\.\$\{[a-zA-Z_]+\}$/, "");
      const suffixes = DYNAMIC_ENUMS[prefix];
      assert.ok(
        suffixes,
        `dynamic key prefix "${prefix}" not enumerated in DYNAMIC_ENUMS — add it to the test`,
      );
      for (const s of suffixes) referenced.add(`${prefix}.${s}`);
    }

    const missing = [...referenced].filter((k) => !knownKeys.has(k)).sort();
    assert.deepEqual(
      missing,
      [],
      `details-tab.js references lang keys not present in lang/en.json:\n  ${missing.join("\n  ")}`,
    );
  });
});

// Used vs declared: this is intentionally asymmetric. A key declared in
// en.json but not referenced by details-tab.js is fine (might be used by
// another module file, by template strings, or by AE template content).
// Only the reverse — referenced but missing — is the regression class.

// Regression guard for v0.8.6: Foundry's i18n loader runs every translation
// file through `foundry.utils.expandObject`, which turns dotted keys into a
// nested object tree. If en.json declares both a string at "A.B.C" and a
// child at "A.B.C.D", expansion does setProperty(obj, "A.B.C.D", …) on top
// of a leaf string and throws `Cannot use 'in' operator to search for 'D' in
// <string>`. The throw aborts the *entire* file load, so every FISHUT.* key
// falls back to its literal in the UI — which is the user-visible bug from
// v0.8.3 through v0.8.5. We can't import Foundry's expandObject in Node, but
// the collision is purely structural: no key can be a strict dotted-prefix
// of another key.
describe("lang/en.json structural validity", () => {
  it("no key is a dotted-prefix of another (would crash Foundry's expandObject)", async () => {
    const langJson = await readFile(resolve(REPO, "lang/en.json"), "utf8");
    const keys = Object.keys(JSON.parse(langJson));
    const keySet = new Set(keys);
    const collisions = [];
    for (const key of keys) {
      const parts = key.split(".");
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join(".");
        if (keySet.has(prefix)) collisions.push([prefix, key]);
      }
    }
    assert.deepEqual(
      collisions,
      [],
      `lang/en.json has dotted-prefix collisions that crash Foundry's i18n loader:\n  ${collisions
        .map(([a, b]) => `"${a}" is a prefix of "${b}"`)
        .join("\n  ")}`,
    );
  });
});
