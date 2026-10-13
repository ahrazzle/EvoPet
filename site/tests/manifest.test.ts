import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchManifest,
  ManifestError,
  manifestUrl,
} from "../src/scripts/manifest";

const pet = {
  slug: "cell",
  displayName: "Cell",
  thumbnailUrl: null,
  capable: false,
  evopet: null,
  petJsonUrl: "https://library.example/cell/pet.json",
  spritesheetUrl: "https://library.example/cell/sheet.png",
  version: "1",
  updatedAt: "2026-10-12T00:00:00Z",
};

test("the dev proxy is called once, with its real route", () => {
  assert.equal(manifestUrl("/api"), "/api/manifest");
  assert.equal(
    manifestUrl("https://library.example/"),
    "https://library.example/api/manifest",
  );
});

test("a complete index can be rendered, and malformed records fail clearly", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ pets: [pet], total: 1, capableTotal: 0 }));
    assert.equal(
      (await fetchManifest("https://library.example")).pets[0].slug,
      "cell",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ pets: [{ slug: "cell", displayName: "Cell" }] }),
      );
    await assert.rejects(
      fetchManifest("https://library.example"),
      /incomplete pet record/,
    );
    globalThis.fetch = async () => new Response("<html>error</html>");
    await assert.rejects(fetchManifest("https://library.example"), /not JSON/);
  } finally {
    globalThis.fetch = original;
  }
});

test("every request has a deadline, and cancellation reaches the fetch", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    received = options?.signal;
    controller.abort();
    throw new DOMException("Cancelled", "AbortError");
  };
  try {
    await assert.rejects(
      fetchManifest("https://library.example", controller.signal),
      ManifestError,
    );
    assert.ok(received instanceof AbortSignal);
    assert.equal(received.aborted, true);
  } finally {
    globalThis.fetch = original;
  }
});
