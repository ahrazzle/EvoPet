import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_R2_PUBLIC_BASE } from "../../../src/lib/r2-public-url";
import { isTrustedAssetUrl, TRUSTED_ASSET_HOSTS } from "./asset-hosts";

function serverHosts(base: string): string[] {
  // Load the real leaf module with an explicit deployment configuration.
  // The root mock env deliberately uses mock.invalid; it is not CLI policy.
  const modulePath = fileURLToPath(
    new URL("../../../src/lib/r2-public-url.ts", import.meta.url),
  );
  const child = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--no-env-file",
      "-e",
      `import { R2_TRUSTED_HOSTS } from ${JSON.stringify(modulePath)}; console.log(JSON.stringify([...R2_TRUSTED_HOSTS]));`,
    ],
    env: { ...process.env, R2_PUBLIC_BASE: base },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(child.exitCode).toBe(0);
  return JSON.parse(child.stdout.toString());
}

describe("allowlist sync with canonical server", () => {
  test("TRUSTED_ASSET_HOSTS matches the canonical server asset allowlist", () => {
    expect(new Set(TRUSTED_ASSET_HOSTS)).toEqual(
      new Set(serverHosts(DEFAULT_R2_PUBLIC_BASE)),
    );
  });

  test("every canonical server asset URL is accepted by the CLI", () => {
    for (const host of serverHosts(DEFAULT_R2_PUBLIC_BASE)) {
      expect(
        isTrustedAssetUrl(`https://${host}/pets/boba/spritesheet.webp`),
      ).toBe(true);
    }
  });

  test("server deployment overrides do not broaden published CLI trust", () => {
    expect(serverHosts("https://cdn.example.com")).toContain("cdn.example.com");
    expect(
      isTrustedAssetUrl("https://cdn.example.com/pets/boba/spritesheet.webp"),
    ).toBe(false);
    expect(
      isTrustedAssetUrl("https://mock.invalid/pets/boba/spritesheet.webp"),
    ).toBe(false);
  });
});

describe("isTrustedAssetUrl", () => {
  test("accepts the canonical asset host", () => {
    expect(
      isTrustedAssetUrl("https://assets.petdex.dev/pets/boba/spritesheet.webp"),
    ).toBe(true);
  });

  test("rejects the retired R2 worker host", () => {
    expect(
      isTrustedAssetUrl(
        "https://petdex-assets.raillyhugo.workers.dev/pets/boba/spritesheet.webp",
      ),
    ).toBe(false);
  });

  test("rejects the retired R2 public bucket host", () => {
    expect(
      isTrustedAssetUrl(
        "https://pub-94495283df974cfea5e98d6a9e3fa462.r2.dev/pets/boba/spritesheet.webp",
      ),
    ).toBe(false);
  });

  test("rejects http (must be https)", () => {
    expect(
      isTrustedAssetUrl("http://assets.petdex.dev/pets/boba/spritesheet.webp"),
    ).toBe(false);
  });

  test("rejects an unknown host even on https", () => {
    expect(isTrustedAssetUrl("https://attacker.example.com/pet.json")).toBe(
      false,
    );
  });

  test("rejects javascript: / data: / file: pseudo-URLs", () => {
    expect(isTrustedAssetUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedAssetUrl("data:text/html,evil")).toBe(false);
    expect(isTrustedAssetUrl("file:///etc/passwd")).toBe(false);
  });

  test("rejects malformed URLs", () => {
    expect(isTrustedAssetUrl("not a url")).toBe(false);
    expect(isTrustedAssetUrl("")).toBe(false);
  });

  test("rejects subdomain spoof attempts", () => {
    expect(isTrustedAssetUrl("https://attacker.r2.dev/x")).toBe(false);
    // A hostname suffix attack must not slip through a substring match.
    expect(
      isTrustedAssetUrl(
        "https://pub-94495283df974cfea5e98d6a9e3fa462.r2.dev.attacker.com/x",
      ),
    ).toBe(false);
  });
});

describe("asset origin boundary", () => {
  test("rejects nonstandard ports on the trusted host", () => {
    expect(isTrustedAssetUrl("https://assets.petdex.dev:444/pet.json")).toBe(
      false,
    );
    expect(isTrustedAssetUrl("https://assets.petdex.dev:443/pet.json")).toBe(
      true,
    );
  });

  test("rejects embedded URL credentials", () => {
    expect(
      isTrustedAssetUrl("https://user:password@assets.petdex.dev/pet.json"),
    ).toBe(false);
    expect(isTrustedAssetUrl("https://user@assets.petdex.dev/pet.json")).toBe(
      false,
    );
  });
});
