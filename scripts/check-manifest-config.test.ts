import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const required = [
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

function preflight(
  event: string,
  configured: boolean | "database-only",
  mode = "apply",
) {
  const dir = mkdtempSync(join(tmpdir(), "manifest-config-"));
  const output = join(dir, "output");
  const summary = join(dir, "summary");
  writeFileSync(output, "");
  writeFileSync(summary, "");
  try {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      GITHUB_EVENT_NAME: event,
      MODE: mode,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    };
    if (configured) {
      const keys = configured === "database-only" ? ["DATABASE_URL"] : required;
      for (const key of keys) env[key] = "secret-must-not-appear";
    }
    const result = Bun.spawnSync({
      cmd: ["bash", `${import.meta.dir}/check-manifest-config.sh`],
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      code: result.exitCode,
      output: readFileSync(output, "utf8"),
      diagnostic: result.stdout.toString() + result.stderr.toString(),
      summary: readFileSync(summary, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("manifest workflow configuration", () => {
  test("scheduled run reports missing configuration and skips publication", () => {
    const result = preflight("schedule", false);
    expect(result.code).toBe(0);
    expect(result.output).toBe("skip=true\n");
    expect(result.summary).toContain("Manifest snapshots were not published");
    for (const key of required) expect(result.diagnostic).toContain(key);
  });

  test("manual run fails when explicitly requested publication cannot proceed", () => {
    const result = preflight("workflow_dispatch", false);
    expect(result.code).toBe(1);
    expect(result.output).toBe("skip=true\n");
    expect(result.diagnostic).toContain("::error::");
  });

  test("manual dry-run needs the database but no upload credentials", () => {
    const result = preflight("workflow_dispatch", "database-only", "check");
    expect(result.code).toBe(0);
    expect(result.output).toBe("skip=false\n");
    expect(result.diagnostic).not.toContain("secret-must-not-appear");
    expect(preflight("workflow_dispatch", false, "check").code).toBe(1);
  });

  test("apply requires upload configuration and rejects unknown modes", () => {
    expect(preflight("workflow_dispatch", "database-only", "apply").code).toBe(
      1,
    );
    expect(preflight("workflow_dispatch", true, "unknown").code).toBe(2);
  });

  test("complete configuration permits either trigger without revealing secrets", () => {
    for (const event of ["schedule", "workflow_dispatch"]) {
      const result = preflight(event, true);
      expect(result.code).toBe(0);
      expect(result.output).toBe("skip=false\n");
      expect(result.diagnostic + result.summary).not.toContain(
        "secret-must-not-appear",
      );
    }
  });
});
