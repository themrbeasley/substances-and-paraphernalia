import { logger } from "../logger.js";
import { resolveVignetteColor } from "../data/vignette-color.js";

const VIGNETTE_CLASS = "fishut-vignette";
const DEFAULT_COLOR = "#b91c1c";

let booted = false;

export function registerWithdrawalVignette() {
  if (booted) return;
  booted = true;
  const refresh = () => scheduleRefresh();
  Hooks.on("createActiveEffect", refresh);
  Hooks.on("updateActiveEffect", refresh);
  Hooks.on("deleteActiveEffect", refresh);
  Hooks.on("updateActor", refresh);
  Hooks.on("controlToken", refresh);
  Hooks.on("userConnected", refresh);
  Hooks.on("updateUser", refresh);
  refresh();
}

let pending = false;
function scheduleRefresh() {
  if (pending) return;
  pending = true;
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
  const actor = findOwnedWithdrawalActor();
  if (!actor) {
    removeVignette(interfaceEl);
    return;
  }
  const color = resolveVignetteColor(actor) ?? DEFAULT_COLOR;
  applyVignette(interfaceEl, color);
}

function findOwnedWithdrawalActor() {
  const user = game.user;
  if (!user) return null;
  for (const actor of game.actors ?? []) {
    if (!actor.isOwner) continue;
    for (const effect of actor.effects ?? []) {
      if (!/withdraw/i.test(effect.name ?? "")) continue;
      if (effect.disabled) continue;
      return actor;
    }
  }
  return null;
}

function applyVignette(parent, color) {
  let el = parent.querySelector(`:scope > .${VIGNETTE_CLASS}`);
  if (!el) {
    el = document.createElement("div");
    el.classList.add(VIGNETTE_CLASS);
    parent.appendChild(el);
  }
  el.style.setProperty("--fishut-vignette-color", color);
  el.dataset.active = "true";
}

function removeVignette(parent) {
  const el = parent.querySelector(`:scope > .${VIGNETTE_CLASS}`);
  if (!el) return;
  el.dataset.active = "false";
}
