// test/quench/phase2-dialog-close.test.mjs
/**
 * Spec §8.1: Closing the dialog without confirming == Confirm with nothing
 * checked == every addicted substance uses normally.
 */

import { openAbstainDialog } from "../../scripts/ui/abstain-dialog.js";

export function registerPhase2DialogClose(quench) {
  quench.registerBatch(
    "fishut.phase2-dialog-close",
    (context) => {
      const { describe, it, assert } = context;
      describe("Phase 2: dialog close semantics", () => {
        it("close-without-confirm resolves with action=use for every row", async () => {
          const rows = [
            { substanceId: "a", name: "A", count: 1, maxCount: 5, dosesRemaining: 2 },
            { substanceId: "b", name: "B", count: 0, maxCount: 5, dosesRemaining: 0 },
          ];
          const decisions = await new Promise((resolve) => {
            // Open dialog, then immediately call .close() on the rendered DialogV2.
            const result = openAbstainDialog({ name: "Fixture" }, rows);
            // Wait one tick, then find and close the rendered app:
            setTimeout(() => {
              const app = ui.windows && Object.values(ui.windows).find((w) => w.constructor.name === "DialogV2");
              app?.close();
              result.then(resolve);
            }, 50);
          });
          assert.equal(decisions.a, "use");
          assert.equal(decisions.b, "forced-abstain", "forced rows resolve as forced-abstain even on close");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Dialog Close" },
  );
}
