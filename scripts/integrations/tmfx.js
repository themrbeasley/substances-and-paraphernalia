import { logger } from "../logger.js";
import { isIntegrationEnabled } from "./index.js";

/**
 * TMFX preset palette — 3 settings × 3 categories = 9 presets.
 *
 * Substance benefit AEs reference these by name from a DAE
 * `macro.tokenMagic` Change row. DAE forwards `change.value` verbatim to
 * `TokenMagic.addFilters(token, value)` on apply and removes the matching
 * filter on remove. The preset name doubles as filterId — TMFX overwrites
 * each param's `filterId` with the preset name during registration, so add
 * / remove key cleanly off the same string.
 *
 * Re-registering on every load is intentional: TMFX's `addPreset` replaces
 * an existing preset with the same name+library, so this is the simplest
 * way to keep the palette in sync if filter params get tuned in a release.
 */
const PRESET_LIBRARY = "tmfx-main";

const PRESETS = Object.freeze({
  "fishut-tmfx-fantasy-mind-altering": [
    {
      filterType: "wave",
      amplitude: 1.5,
      time: 0,
      animated: { time: { active: true, speed: 0.0008, animType: "move" } },
    },
  ],
  "fishut-tmfx-fantasy-performance-enhancing": [
    {
      filterType: "glow",
      color: 0xcc2200,
      distance: 12,
      outerStrength: 5,
      innerStrength: 1,
      quality: 0.5,
      padding: 10,
      animated: {
        distance: {
          active: true,
          loopDuration: 1800,
          animType: "syncCosOscillation",
          val1: 8,
          val2: 14,
        },
      },
    },
  ],
  "fishut-tmfx-fantasy-stimulant": [
    {
      filterType: "glow",
      color: 0xff6b1a,
      distance: 8,
      outerStrength: 4,
      innerStrength: 0,
      quality: 0.5,
      padding: 8,
      animated: {
        color: {
          active: true,
          loopDuration: 4000,
          animType: "colorOscillation",
          val1: 0xff6b1a,
          val2: 0xff3300,
        },
      },
    },
  ],
  "fishut-tmfx-modern-mind-altering": [
    {
      filterType: "xglow",
      color: 0x9b30ff,
      thickness: 2,
      scale: 1.2,
      time: 0,
      animated: {
        time: { active: true, speed: 0.0008, animType: "move" },
        color: {
          active: true,
          loopDuration: 4000,
          animType: "colorOscillation",
          val1: 0xc22bff,
          val2: 0x39ffb5,
        },
      },
    },
  ],
  "fishut-tmfx-modern-performance-enhancing": [
    {
      filterType: "outline",
      color: 0xff1a1a,
      thickness: 2,
      quality: 5,
      padding: 4,
      animated: {
        thickness: {
          active: true,
          loopDuration: 1200,
          animType: "syncCosOscillation",
          val1: 1,
          val2: 3,
        },
      },
    },
  ],
  "fishut-tmfx-modern-stimulant": [
    {
      filterType: "bloom",
      blur: 4,
      bloomScale: 1.4,
      threshold: 0.5,
      animated: {
        bloomScale: {
          active: true,
          loopDuration: 1500,
          animType: "syncCosOscillation",
          val1: 1.0,
          val2: 1.6,
        },
      },
    },
  ],
  "fishut-tmfx-scifi-mind-altering": [
    {
      filterType: "ray",
      color: 0x8c30ff,
      time: 0,
      intensity: 2,
      amplitude: 1,
      blend: 8,
      divergence: 5,
      animated: { time: { active: true, speed: 0.0008, animType: "move" } },
    },
  ],
  "fishut-tmfx-scifi-performance-enhancing": [
    {
      filterType: "xglow",
      color: 0xc0c0e0,
      thickness: 1,
      scale: 1.5,
      time: 0,
      animated: { time: { active: true, speed: 0.001, animType: "move" } },
    },
  ],
  "fishut-tmfx-scifi-stimulant": [
    {
      filterType: "electric",
      color: 0x39b5ff,
      time: 0,
      blend: 2,
      intensity: 4,
      animated: { time: { active: true, speed: 0.0015, animType: "move" } },
    },
  ],
});

/**
 * Hooks `ready` to register the palette into TMFX's main library.
 * Registration is GM-only because the preset list is a world setting; no-op
 * for non-GMs and when the user has disabled the TMFX integration.
 */
export function registerTmfxPresets() {
  Hooks.once("ready", async () => {
    if (!game.user?.isGM) return;
    if (!isIntegrationEnabled("tokenmagic")) return;
    const tm = globalThis.TokenMagic;
    if (!tm || typeof tm.addPreset !== "function") return;

    for (const [name, params] of Object.entries(PRESETS)) {
      try {
        await tm.addPreset({ name, library: PRESET_LIBRARY }, params, /* silent */ true);
      } catch (err) {
        logger.error(`tmfx: failed to register preset ${name}`, err);
      }
    }
    logger.log(`tmfx: registered ${Object.keys(PRESETS).length} presets`);
  });
}
