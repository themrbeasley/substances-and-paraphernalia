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
  if (!updates?.delete?.includes(itemId)) return false;
  // dnd5e queues one delete per consumption row that empties the item. Splice
  // in place: dnd5e keeps using this same array after the hook.
  for (let i = updates.delete.length - 1; i >= 0; i--) {
    if (updates.delete[i] === itemId) updates.delete.splice(i, 1);
  }
  const change = { "system.quantity": 0, "system.uses.spent": 0 };
  const queued = updates.item.find((u) => u._id === itemId);
  if (queued) Object.assign(queued, change);
  else updates.item.push({ _id: itemId, ...change });
  return true;
}
