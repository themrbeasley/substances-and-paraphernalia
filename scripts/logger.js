import { MODULE_ID } from "./config.js";

const PREFIX = "[Substances and Paraphernalia]";

function debugEnabled() {
  try {
    return game?.settings?.get?.(MODULE_ID, "debug") === true;
  } catch {
    return false;
  }
}

export const logger = {
  log(...args) {
    if (debugEnabled()) console.log(PREFIX, ...args);
  },
  info(...args) {
    if (debugEnabled()) console.info(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
