import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("OpenCode plugin isolated runtime and drain contract", () => {
  const home = mkdtempSync(join(tmpdir(), "petdex-opencode-"));
  try {
    const result = spawnSync(
      "node",
      [
        "--test",
        fileURLToPath(
          new URL("./opencode_plugin_fixture.mjs", import.meta.url),
        ),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: home },
      },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
