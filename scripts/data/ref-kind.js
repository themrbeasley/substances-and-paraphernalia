/**
 * Ref-shape detection for paraphernalia references.
 *
 * Kept dependency-free so Node `--test` can import this module directly
 * without pulling in Foundry globals or the world-config bootstrap.
 */

/**
 * Whether a paraphernalia ref is a Compendium UUID rather than a slug.
 *
 * Compendium refs look like `Compendium.<module>.<pack>.Item.<id>` (and may
 * point at packs outside this module). Slugs are kebab-case identifiers like
 * `dubious-pipe`. Slugs and UUIDs may coexist freely in any `anyOf` group.
 *
 * @param {unknown} ref
 * @returns {boolean}
 */
export function isCompendiumRef(ref) {
  return typeof ref === "string" && ref.startsWith("Compendium.");
}
