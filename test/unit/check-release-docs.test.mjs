import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkReleaseDocs } from "../../tools/check-release-docs.mjs";

describe("checkReleaseDocs", () => {
  it("passes when both files name the version", () => {
    assert.deepEqual(
      checkReleaseDocs({
        version: "0.10.0",
        changelog: "## [0.10.0] (2026-10-03)",
        roadmap: "- 0.10.0: dose others",
      }),
      [],
    );
  });
  it("names each missing file", () => {
    assert.equal(
      checkReleaseDocs({ version: "0.10.0", changelog: "## [0.9.2]", roadmap: "" }).length,
      2,
    );
  });
  it("0.10.0 is not satisfied by 0.10.01 or 10.0", () => {
    assert.equal(
      checkReleaseDocs({ version: "0.10.0", changelog: "## [0.10.01]", roadmap: "v10.0" }).length,
      2,
    );
  });
});
