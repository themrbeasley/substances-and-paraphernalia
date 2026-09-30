/**
 * dnd5e deletes a consumable when its last use is spent (`autoDestroy`). The
 * Long Rest needs a drug's rules even at 0 doses (spec D11), so rewrite the
 * pending delete into "0 left". Mutates `updates` in place, as dnd5e's
 * `dnd5e.activityConsumption` hook expects.
 *
 * @param {{item: object[], delete: string[]}} updates  dnd5e ActivityUsageUpdates
 * @param {string} itemId
 * @returns {boolean} true when a delete was rewritten
 */
export function keepLastDose(updates, itemId) {
  const index = updates?.delete?.indexOf(itemId) ?? -1;
  if (index === -1) return false;
  updates.delete.splice(index, 1);
  const change = { "system.quantity": 0, "system.uses.spent": 0 };
  const queued = updates.item.find((u) => u._id === itemId);
  if (queued) Object.assign(queued, change);
  else updates.item.push({ _id: itemId, ...change });
  return true;
}
