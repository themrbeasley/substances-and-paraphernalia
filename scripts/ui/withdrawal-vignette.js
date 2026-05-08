import { MODULE_ID, FLAGS } from "../config.js";
import { logger } from "../logger.js";

const VIGNETTE_CLASS = "fishut-vignette";
const DEFAULT_COLOR = "#b91c1c";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

let booted = false;

export function registerWithdrawalVignette() {
  if (booted) return;
  booted = true;
  const refresh = () => scheduleRefresh();
  Hooks.on("createActiveEffect", refresh);
  Hooks.on("updateActiveEffect", refresh);
  Hooks.on("deleteActiveEffect", refresh);
  Hooks.on("controlToken", refresh);
  Hooks.on("userConnected", refresh);
  Hooks.on("updateUser", refresh);
  refresh();
}

let pending = false;
function scheduleRefresh() {
  if (pending) return;
  pending = true;
  // Coalesce rapid AE create/update/delete bursts (e.g. long-rest tick rebuilds
  // the withdrawal AE) into a single DOM mutation per microtask.
  queueMicrotask(() => {
    pending = false;
    try {
      refreshVignette();
    } catch (err) {
      logger.error("withdrawal vignette refresh failed", err);
    }
  });
}

function refreshVignette() {
  const interfaceEl = document.getElementById("interface");
  if (!interfaceEl) return;
  const ae = findOwnedWithdrawalEffect();
  if (!ae) {
    removeVignette(interfaceEl);
    return;
  }
  const color = sanitizeColor(ae.flags?.[MODULE_ID]?.[FLAGS.vignetteColor]);
  applyVignette(interfaceEl, color);
}

function findOwnedWithdrawalEffect() {
  const user = game.user;
  if (!user) return null;
  for (const actor of game.actors ?? []) {
    if (!actor.isOwner) continue;
    for (const effect of actor.effects ?? []) {
      if (!/withdraw/i.test(effect.name ?? "")) continue;
      if (effect.disabled) continue;
      return effect;
    }
  }
  return null;
}

function sanitizeColor(value) {
  if (typeof value !== "string") return null;
  return HEX_COLOR.test(value) ? value : null;
}

function applyVignette(parent, color) {
  let el = parent.querySelector(`:scope > .${VIGNETTE_CLASS}`);
  if (!el) {
    el = document.createElement("div");
    el.classList.add(VIGNETTE_CLASS);
    parent.appendChild(el);
  }
  el.style.setProperty("--fishut-vignette-color", color ?? DEFAULT_COLOR);
  el.dataset.active = "true";
}

function removeVignette(parent) {
  const el = parent.querySelector(`:scope > .${VIGNETTE_CLASS}`);
  if (!el) return;
  el.dataset.active = "false";
  // Leave the element in place but inactive so the opacity transition runs out;
  // it will be reused on the next apply.
}
