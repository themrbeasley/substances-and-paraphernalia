/**
 * Foundry V14 Active Effect data helpers.
 *
 * V14 moved change rows to `system.changes` (string `type` instead of numeric
 * `mode`), stores duration as `value` + `units`, treats `value: 0` as already
 * expired, and keeps any `start` already present on data passed to create.
 * Every effect this module applies to an actor goes through `prepareEffectPayload`, so
 * those rules live here and nowhere else.
 *
 * Pure: operates on plain data (e.g. `template.toObject()`), so it runs under
 * `node --test` without Foundry globals.
 */

import { MODULE_ID, FLAGS } from "../config.js";

/**
 * Change rows of an effect document or plain effect data.
 * @param {object|null|undefined} effect
 * @returns {Array<{key:string, type:string, value:any, priority?:number}>}
 */
export const effectChanges = (effect) => effect?.system?.changes ?? [];

/**
 * Turn template data into a create payload for an actor-owned effect.
 * Mutates and returns `data`.
 *
 * @param {object} data  Plain effect data (e.g. `template.toObject()`).
 * @param {object} opts
 * @param {string} opts.sourceSubstanceId  Substance item id, stamped into our flags.
 * @param {string} opts.origin             Substance item UUID.
 * @param {string} [opts.role]             `aeRole` flag value; left alone when omitted.
 * @param {number|null} [opts.duration]    `undefined` keeps the template's duration;
 *   `null` or a non-positive number makes the effect permanent; a positive
 *   number sets that many seconds.
 * @returns {object}
 */
export function prepareEffectPayload(data, { sourceSubstanceId, origin, role, duration } = {}) {
  delete data._id;
  delete data.start; // V14 keeps an incoming start; a stale one can expire the effect on arrival.
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = {
    ...(data.flags[MODULE_ID] ?? {}),
    [FLAGS.sourceSubstanceId]: sourceSubstanceId,
    ...(role ? { [FLAGS.aeRole]: role } : {}),
  };
  data.origin = origin;
  data.disabled = false;

  // A template copied from an already-expired effect carries expired: true;
  // V14 would then never send the "mark expired" update at real expiry.
  data.duration = { ...(data.duration ?? {}), expired: false };
  if (duration === undefined) return data;
  if (typeof duration === "number" && duration > 0) {
    Object.assign(data.duration, { value: duration, units: "seconds" });
  } else {
    // Permanent. Clearing `expiry` matters: V14 counts an effect with an expiry
    // event as temporary even without a value, and would expire it at that event.
    Object.assign(data.duration, { value: null, expiry: null });
  }
  return data;
}
