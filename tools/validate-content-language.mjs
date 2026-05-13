/**
 * 2024 D&D 5e language compliance — pure phrasing invariants. Returns
 * warn-level findings (never errors) per Item 11 v0.8 portion: ship the
 * invariant as a non-blocking signal so authors can clean up their content
 * before v0.9 / Item 12 flips it to error-blocking.
 *
 * Each finding carries { ruleId, match, sourcePath, message } so the caller
 * can format the warning consistently.
 */

const CONDITIONS = [
  "blinded", "charmed", "deafened", "exhaustion", "frightened",
  "grappled", "incapacitated", "invisible", "paralyzed", "petrified",
  "poisoned", "prone", "restrained", "stunned", "unconscious",
];

const RULES = [
  {
    id: "once-per-day",
    pattern: /once per day/i,
    message: 'use "regains all expended uses at dawn" or "you can\'t use this again until you finish a Long Rest"',
  },
  {
    id: "become-condition",
    pattern: new RegExp(`\\bbecomes? (${CONDITIONS.join("|")})\\b`, "i"),
    message: 'use "gain the X condition" instead of "become X"',
  },
  {
    id: "roll-a-save",
    pattern: /roll a \w+ save\b/i,
    message: 'use "make a [Ability] saving throw" instead of "roll a [Ability] save"',
  },
  {
    id: "make-a-save-bare",
    pattern: /make a \w+ save\b(?! saving throw)(?! ing)/i,
    message: 'spell it out: "make a [Ability] saving throw"',
  },
  {
    id: "restore-hp",
    pattern: /restore[ds]? (\d+|\w+) hit points/i,
    message: 'use "regain [N] hit points" instead of "restore"',
  },
  {
    id: "recover-hp",
    pattern: /recover[ds]? (\d+|\w+) hit points/i,
    message: 'use "regain [N] hit points" instead of "recover"',
  },
  {
    id: "lowercase-condition",
    pattern: new RegExp(`\\b(${CONDITIONS.join("|")})\\b`),
    message: "condition names are capitalized (e.g. Poisoned, Charmed)",
    appliesTo: "text-content-only",
  },
  {
    id: "uppercase-damage-type",
    pattern: /\b(Fire|Cold|Acid|Lightning|Necrotic|Radiant|Psychic|Force|Thunder)\b/,
    message: "damage type names are lowercase in prose (fire, cold, etc.)",
    appliesTo: "text-content-only",
  },
  {
    id: "rest-not-capitalized",
    pattern: /\b(long rest|short rest)\b/,
    message: 'capitalize "Long Rest" / "Short Rest"',
    appliesTo: "text-content-only",
  },
];

/**
 * Scan `text` and return warn-level findings.
 *
 * @param {string} text
 * @param {{sourcePath?: string, mode?: "text-content-only" | "any"}} [opts]
 * @returns {Array<{ruleId: string, match: string, sourcePath?: string, message: string}>}
 */
export function checkLanguagePhrasing(text, opts = {}) {
  const { sourcePath = "<input>", mode = "any" } = opts;
  if (typeof text !== "string" || text.length === 0) return [];
  const findings = [];
  for (const rule of RULES) {
    if (rule.appliesTo === "text-content-only" && mode !== "text-content-only") continue;
    const m = text.match(rule.pattern);
    if (!m) continue;
    findings.push({
      ruleId: rule.id,
      match: m[0],
      sourcePath,
      message: rule.message,
    });
  }
  return findings;
}

export const _LANGUAGE_RULES = RULES;
