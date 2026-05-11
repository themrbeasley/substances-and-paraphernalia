/**
 * Pure content-validation helpers.
 *
 * `tools/validate-content.mjs` is the CLI wrapper that reads files from
 * `_source/` and aggregates results. The check functions below are exported
 * so unit tests can exercise them with synthetic JSON without touching disk.
 *
 * Each check returns `{ errors: string[], warnings: string[] }`. Callers
 * accumulate across files and decide on exit code.
 */

export const FLAG_SCOPE = "substances-and-paraphernalia";
export const ADMIN_VALUES = new Set(["contact", "ingested", "inhaled", "injury"]);
export const MODIFIER_TYPES = new Set(["auto-pass", "reroll-on-fail", "advantage", "+N"]);
export const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function flagsOf(data) {
  return data?.flags?.[FLAG_SCOPE] ?? null;
}

function effectsOf(data) {
  return Array.isArray(data?.effects) ? data.effects : [];
}

function findEffect(data, id) {
  return effectsOf(data).find((e) => e?._id === id) ?? null;
}

/**
 * Substance contract. See top-of-file comment in validate-content.mjs for the
 * v0.3 baseline. v0.4 adds:
 *   - flags[…].overdose: when `enabled`, require chancePercent (1–100) and
 *     non-empty `description`.
 *   - flags[…].withdrawal: top-level block { enabled?, mod, effectId? }.
 *     `mod` is required and positive-integer. `effectId`, when set, must
 *     resolve to an AE on the same item whose name contains "withdraw";
 *     that AE warns if it imposes disadvantage on attack or check
 *     (escalate, don't duplicate poisoned).
 *
 * @param {{relPath: string, data: object}} file
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkSubstance(file) {
  const errors = [];
  const warnings = [];
  const { relPath, data } = file;
  const tag = `${relPath} (${data?.name ?? "?"})`;
  const err = (msg) => errors.push(`${tag}: ${msg}`);
  const warn = (msg) => warnings.push(`${tag}: ${msg}`);

  const flags = flagsOf(data);
  if (!flags) {
    err(`missing flags["${FLAG_SCOPE}"]`);
    return { errors, warnings };
  }
  if (flags.kind !== "substance") {
    err(`kind must be "substance" (got ${flags.kind})`);
    return { errors, warnings };
  }
  if (flags.schemaVersion !== 2) {
    err(`schemaVersion must be 2 (got ${flags.schemaVersion})`);
  }
  if (flags.administration !== undefined) {
    err(
      `legacy "administration" flag is removed in v0.3 — administration now lives on system.type.subtype (dnd5e Poison subtype)`,
    );
  }
  const poisonValue = data?.system?.type?.value;
  if (poisonValue !== "poison") {
    err(`system.type.value must be "poison" (got ${poisonValue})`);
  }
  const subtype = data?.system?.type?.subtype;
  if (!ADMIN_VALUES.has(subtype)) {
    err(`system.type.subtype must be one of ${[...ADMIN_VALUES].join("|")} (got ${subtype})`);
  }

  const addiction = flags.addiction;
  if (!addiction || typeof addiction !== "object") {
    err(`addiction block is required`);
    return { errors, warnings };
  }
  if (addiction.enabled !== undefined && typeof addiction.enabled !== "boolean") {
    err(`addiction.enabled must be a boolean when present (got ${typeof addiction.enabled})`);
  }
  if (addiction.withdrawalMod !== undefined) {
    err(
      `addiction.withdrawalMod is removed in v0.4 — move to flags.withdrawal.mod`,
    );
  }
  const dc = addiction.save?.dc;
  if (typeof dc !== "number" || !Number.isFinite(dc)) {
    err(`addiction.save.dc must be a finite number (got ${dc})`);
  }

  const withdrawal = flags.withdrawal;
  if (!withdrawal || typeof withdrawal !== "object" || Array.isArray(withdrawal)) {
    err(`withdrawal block is required (object with at least { mod })`);
  } else {
    if (withdrawal.enabled !== undefined && typeof withdrawal.enabled !== "boolean") {
      err(`withdrawal.enabled must be a boolean when present (got ${typeof withdrawal.enabled})`);
    }
    const w = withdrawal.mod;
    if (!Number.isInteger(w) || w <= 0) {
      err(`withdrawal.mod must be a positive integer (got ${w})`);
    }
  }

  const addictionIds = resolveEffectIdList(
    addiction.addictionEffectIds,
    addiction.addictionEffectId,
  );
  if (addictionIds.length === 0) {
    err(`addiction.addictionEffectIds is required (non-empty array of AE ids)`);
  } else {
    for (const aeId of addictionIds) {
      const ae = findEffect(data, aeId);
      if (!ae) {
        err(`addiction.addictionEffectIds entry "${aeId}" not found in effects[]`);
      } else if (!/addict/i.test(ae.name ?? "")) {
        err(`addiction AE name "${ae.name}" must contain "addict"`);
      }
    }
  }

  if (flags.requiredParaphernalia !== undefined) {
    err(
      `legacy "requiredParaphernalia" flag is removed in v0.3 — paraphernalia gating now keys on system.type.subtype matched against paraphernalia appliesTo`,
    );
  }
  if (flags.requiredSubtypes !== undefined) {
    err(
      `legacy "requiredSubtypes" flag is removed in v0.5 — paraphernalia gating now keys on system.type.subtype (poison administration) matched against paraphernalia appliesTo`,
    );
  }

  // v0.4 — overdose flag shape.
  if (flags.overdose !== undefined && flags.overdose !== null) {
    const ov = flags.overdose;
    if (typeof ov !== "object" || Array.isArray(ov)) {
      err(`overdose flag must be an object (got ${typeof ov})`);
    } else if (ov.enabled === true) {
      const pct = ov.chancePercent;
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        err(`overdose.chancePercent must be an integer 1..100 when enabled (got ${pct})`);
      }
      if (typeof ov.description !== "string" || ov.description.trim() === "") {
        err(`overdose.description must be a non-empty string when enabled`);
      }
    }
  }

  // v0.4 — withdrawal.effectIds resolution + name-contract + content guidance.
  if (flags.withdrawalEffectId !== undefined) {
    err(
      `legacy "withdrawalEffectId" flag is removed in v0.4 — declare flags["${FLAG_SCOPE}"].withdrawal.effectIds instead`,
    );
  }
  const withdrawalIds = resolveEffectIdList(
    flags.withdrawal?.effectIds,
    flags.withdrawal?.effectId,
  );
  for (const withdrawalId of withdrawalIds) {
    const withdrawalAe = findEffect(data, withdrawalId);
    if (!withdrawalAe) {
      err(`withdrawal.effectIds entry "${withdrawalId}" not found in effects[]`);
      continue;
    }
    if (!/withdraw/i.test(withdrawalAe.name ?? "")) {
      err(`withdrawal AE name "${withdrawalAe.name}" must contain "withdraw"`);
    }
    if (aeViolatesContentGuidance(withdrawalAe)) {
      warn(
        `withdrawal AE "${withdrawalAe.name}" imposes disadvantage on attacks/checks — duplicates poisoned. Escalate instead (exhaustion, disadv on saves, speed reduction, stat penalty).`,
      );
    }
  }

  // v0.4 — overdose.effectIds resolution + name-contract.
  const overdoseIds = resolveEffectIdList(
    flags.overdose?.effectIds,
    flags.overdose?.effectId,
  );
  for (const overdoseId of overdoseIds) {
    const overdoseAe = findEffect(data, overdoseId);
    if (!overdoseAe) {
      err(`overdose.effectIds entry "${overdoseId}" not found in effects[]`);
      continue;
    }
    if (!/overdose/i.test(overdoseAe.name ?? "")) {
      err(`overdose AE name "${overdoseAe.name}" must contain "overdose"`);
    }
  }

  // v0.4 — tolerance.effectIds resolution + name-contract.
  const toleranceIds = resolveEffectIdList(
    flags.tolerance?.effectIds,
    flags.tolerance?.effectId,
  );
  for (const toleranceId of toleranceIds) {
    const toleranceAe = findEffect(data, toleranceId);
    if (!toleranceAe) {
      err(`tolerance.effectIds entry "${toleranceId}" not found in effects[]`);
      continue;
    }
    if (!/tolerance/i.test(toleranceAe.name ?? "")) {
      err(`tolerance AE name "${toleranceAe.name}" must contain "tolerance"`);
    }
  }

  // v0.4 — modifier-bearing AEs (tolerance template lives on the substance).
  for (const ae of effectsOf(data)) {
    const modErrs = checkModifierShape(ae, tag);
    errors.push(...modErrs);
  }

  return { errors, warnings };
}

/**
 * Paraphernalia contract. See top-of-file comment in validate-content.mjs for
 * the v0.3 baseline. v0.4 adds:
 *   - "+N" modifier type with required numeric `bonus`.
 *   - subtype must be in `builtinSubtypes` when provided (custom subtypes from
 *     world setting can't be checked at build time — runtime authoring path
 *     validates against the live composed list).
 *
 * @param {{relPath: string, data: object}} file
 * @param {{builtinSubtypes?: Set<string>}} [opts]
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkParaphernalia(file, opts = {}) {
  const errors = [];
  const warnings = [];
  const { relPath, data } = file;
  const tag = `${relPath} (${data?.name ?? "?"})`;
  const err = (msg) => errors.push(`${tag}: ${msg}`);

  const flags = flagsOf(data);
  if (!flags) {
    err(`missing flags["${FLAG_SCOPE}"]`);
    return { errors, warnings };
  }
  if (flags.kind !== "paraphernalia") {
    err(`kind must be "paraphernalia" (got ${flags.kind})`);
    return { errors, warnings };
  }
  if (flags.schemaVersion !== 2) {
    err(`schemaVersion must be 2 (got ${flags.schemaVersion})`);
  }
  if (typeof flags.subtype !== "string" || !KEBAB.test(flags.subtype)) {
    err(`subtype must be a kebab-case string (got ${JSON.stringify(flags.subtype)})`);
  } else if (opts.builtinSubtypes && !opts.builtinSubtypes.has(flags.subtype)) {
    // Shipped paraphernalia may only declare built-in subtypes — custom
    // subtypes are user-managed at runtime via the Subtype Manager app.
    err(
      `subtype "${flags.subtype}" is not a built-in (custom subtypes are runtime-only; ship content using built-in subtypes only)`,
    );
  }
  if (flags.paraphernaliaId !== undefined) {
    err(
      `legacy "paraphernaliaId" flag is removed in v0.3 — declare flags["${FLAG_SCOPE}"].subtype instead`,
    );
  }
  if (flags.tags !== undefined) {
    err(
      `legacy "tags" flag is removed in v0.3 — paraphernalia identity is the subtype id alone`,
    );
  }
  if (flags.addictionSaveBypass !== undefined) {
    err(
      `legacy item-level "addictionSaveBypass" flag is removed in v0.3 — declare bypass via an embedded transfer:true AE with flags["${FLAG_SCOPE}"].modifier instead`,
    );
  }

  const effects = effectsOf(data);
  const bypassEffects = [];
  for (const effect of effects) {
    const modifier = effect?.flags?.[FLAG_SCOPE]?.modifier;
    if (!modifier || modifier.kind !== "bypass") continue;
    bypassEffects.push({ effect, modifier });
  }

  // Per-AE modifier-shape checks apply to every modifier-bearing AE,
  // including tolerance AEs that may live on paraphernalia.
  for (const ae of effects) {
    const modErrs = checkModifierShape(ae, tag);
    errors.push(...modErrs);
  }

  if (bypassEffects.length === 0) return { errors, warnings };

  let needsDailyRecovery = false;
  for (const { effect, modifier } of bypassEffects) {
    const aeTag = `${tag} effect "${effect?.name ?? effect?._id ?? "?"}"`;
    if (effect.transfer !== true) {
      errors.push(`${aeTag}: bypass-granting AE must declare transfer:true`);
    }
    if (!MODIFIER_TYPES.has(modifier.type)) {
      errors.push(
        `${aeTag}: modifier.type must be one of ${[...MODIFIER_TYPES].join("|")} (got ${modifier.type})`,
      );
    }
    // appliesTo on the bypass AE is no longer authored — paraphernalia's
    // own `flags[…].appliesTo` is the canonical filter at resolution time.
    // We still validate the AE-side array's *values* if it happens to be
    // present (legacy authored content) so a typo'd administration string
    // doesn't slip through silently.
    if (Array.isArray(modifier.appliesTo)) {
      for (const a of modifier.appliesTo) {
        if (!ADMIN_VALUES.has(a)) {
          errors.push(`${aeTag}: modifier.appliesTo contains invalid administration "${a}"`);
        }
      }
    }
    if (
      modifier.usesPerDay !== undefined &&
      modifier.usesPerDay !== null &&
      modifier.usesPerDay !== ""
    ) {
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
        `paraphernalia granting a usesPerDay-bounded bypass must declare system.uses.recovery: [{ period: "day", type: "recoverAll" }]`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate the per-AE modifier flag block. Returns errors only (no warnings).
 * Centralized so both checkSubstance (tolerance AE on substance) and
 * checkParaphernalia (bypass AE on paraphernalia) get identical shape checks.
 */
function checkModifierShape(ae, tag) {
  const errors = [];
  const modifier = ae?.flags?.[FLAG_SCOPE]?.modifier;
  if (!modifier || typeof modifier !== "object") return errors;
  const aeTag = `${tag} effect "${ae?.name ?? ae?._id ?? "?"}"`;

  if (modifier.kind === "bypass") {
    if (modifier.type === "+N") {
      const bonus = Number(modifier.bonus);
      if (!Number.isFinite(bonus) || bonus === 0) {
        errors.push(
          `${aeTag}: modifier.type "+N" requires a non-zero numeric modifier.bonus (got ${JSON.stringify(modifier.bonus)})`,
        );
      }
    }
  } else if (modifier.kind === "tolerance") {
    if (typeof modifier.substanceId !== "string" || modifier.substanceId === "") {
      errors.push(
        `${aeTag}: tolerance modifier requires a non-empty substanceId (got ${JSON.stringify(modifier.substanceId)})`,
      );
    }
    const hasAtt = isObject(modifier.attenuateAltered);
    const hasBump = Number.isFinite(Number(modifier.addictionDcBump));
    const hasAmp = isObject(modifier.withdrawalAmplify);
    if (!hasAtt && !hasBump && !hasAmp) {
      errors.push(
        `${aeTag}: tolerance modifier must declare at least one of attenuateAltered / addictionDcBump / withdrawalAmplify`,
      );
    }
  }
  return errors;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Mirror flag-schema's plural-with-singular-fallback shape so the validator
 * accepts both v0.4 canonical `*EffectIds` arrays and pre-v0.4 singular
 * `*EffectId` strings during the migration window.
 */
function resolveEffectIdList(plural, singular) {
  if (Array.isArray(plural)) {
    return plural.filter((id) => typeof id === "string" && id.length > 0);
  }
  if (typeof singular === "string" && singular.length > 0) return [singular];
  return [];
}

/**
 * Heuristic for the "don't duplicate poisoned" content guidance: if the
 * withdrawal AE imposes disadvantage on attacks or checks, warn the author.
 *
 * Coarse but useful — catches the most common authoring mistake. False
 * positives are easy to fix by re-authoring; false negatives just don't get
 * flagged (the check is a warning, not an error).
 */
function aeViolatesContentGuidance(ae) {
  const changes = Array.isArray(ae?.changes) ? ae.changes : [];
  for (const c of changes) {
    const key = String(c?.key ?? "");
    const value = String(c?.value ?? "");
    if (/diadv|disadvantage/i.test(key)) return true;
    if (/diadv|disadvantage/i.test(value) && /attack|check/i.test(key)) return true;
  }
  if (Array.isArray(ae?.statuses) && ae.statuses.includes("poisoned")) {
    // Withdrawal AE redundantly stamping poisoned on top of the addiction AE
    // is the literal "duplicate poisoned" footgun.
    return true;
  }
  return false;
}
