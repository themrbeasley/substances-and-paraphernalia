// scripts/ui/abstain-dialog.js
/**
 * Combined Phase 2 (long-rest) Abstain dialog. Renders one checkbox row per
 * substance the actor is currently addicted to. Unchecked → use; checked →
 * abstain. Rows with no doses left in inventory are rendered disabled-checked
 * (forced-abstain) with a tooltip.
 *
 * Returns a Promise resolving to a map of `{ [substanceId]: action }` where
 * action is "use" | "abstain" | "forced-abstain". Closing the dialog without
 * confirming resolves with every row defaulted to "use".
 */

import { MODULE_ID } from "../config.js";

/**
 * @typedef {Object} AbstainRow
 * @property {string} substanceId          Item id of the substance.
 * @property {string} name                 Display name.
 * @property {number} count                Current Tolerance Count.
 * @property {number} maxCount             Tier-derived MaxCount.
 * @property {number} dosesRemaining       0 → forced-abstain.
 */

/**
 * @param {Actor} actor
 * @param {AbstainRow[]} rows
 * @returns {Promise<Record<string, "use"|"abstain"|"forced-abstain">>}
 */
export async function openAbstainDialog(actor, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const title = game.i18n.localize("FISHUT.Phase2.Dialog.Title");
  const intro = game.i18n.localize("FISHUT.Phase2.Dialog.Intro");
  const confirmLabel = game.i18n.localize("FISHUT.Phase2.Dialog.Confirm");
  const dosesLeftLabel = (n) =>
    game.i18n.format("FISHUT.Phase2.Dialog.DosesRemaining", { n });
  const tolLabel = (count, max) =>
    game.i18n.format("FISHUT.Phase2.Dialog.Tolerance", { count, max });
  const forcedLabel = game.i18n.localize("FISHUT.Phase2.Dialog.ForcedAbstain");

  const rowsHtml = sorted
    .map((row) => {
      const forced = row.dosesRemaining <= 0;
      const checked = forced ? "checked disabled" : "";
      const dataset = `data-substance-id="${row.substanceId}" ${forced ? 'data-forced="1"' : ""}`;
      const tooltip = forced ? ` title="${forcedLabel}"` : "";
      return `
        <div class="fishut-abstain-row"${tooltip}>
          <label>
            <input type="checkbox" ${checked} ${dataset} />
            <span class="fishut-abstain-name">${escapeHtml(row.name)}</span>
            <span class="fishut-abstain-tol">${tolLabel(row.count, row.maxCount)}</span>
            <span class="fishut-abstain-doses">${dosesLeftLabel(row.dosesRemaining)}</span>
            ${forced ? `<span class="fishut-abstain-forced">[${forcedLabel}]</span>` : ""}
          </label>
        </div>`;
    })
    .join("");

  const content = `
    <section class="fishut-abstain-dialog">
      <p>${intro}</p>
      <div class="fishut-abstain-rows">${rowsHtml}</div>
    </section>
  `;

  return new Promise((resolve) => {
    const defaultToUse = () => {
      const out = {};
      for (const row of sorted) {
        out[row.substanceId] = row.dosesRemaining <= 0 ? "forced-abstain" : "use";
      }
      resolve(out);
    };

    const dialog = new foundry.applications.api.DialogV2({
      window: { title },
      content,
      buttons: [
        {
          action: "confirm",
          label: confirmLabel,
          default: true,
          callback: (_event, _button, dialog) => {
            const out = {};
            const root = dialog?.element ?? dialog;
            if (!root?.querySelectorAll) {
              defaultToUse();
              return;
            }
            const inputs = root.querySelectorAll('input[type="checkbox"]');
            for (const input of inputs) {
              const substanceId = input.dataset.substanceId;
              if (!substanceId) continue;
              if (input.dataset.forced === "1") {
                out[substanceId] = "forced-abstain";
              } else if (input.checked) {
                out[substanceId] = "abstain";
              } else {
                out[substanceId] = "use";
              }
            }
            resolve(out);
          },
        },
      ],
      close: () => defaultToUse(),
    });
    dialog.render(true);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
