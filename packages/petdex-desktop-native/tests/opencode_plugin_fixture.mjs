import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

// Load the shipped source, with only its HTTP peer and OpenCode client replaced.
test("OpenCode turns carry phases and outcomes without per-tool XP inflation", async () => {
  const home = process.env.HOME;
  assert.ok(
    home?.includes("petdex-opencode-"),
    "fixture needs isolated startup HOME",
  );
  const oldHome = process.env.HOME;
  const oldFetch = globalThis.fetch;
  process.env.HOME = home;
  const runtime = join(home, ".petdex/runtime");
  await mkdir(runtime, { recursive: true });
  await writeFile(join(runtime, "update-token"), "test-token");
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers["X-Petdex-Update-Token"], "test-token");
    requests.push({
      kind: url.endsWith("/state") ? "state" : "bubble",
      body: JSON.parse(options.body),
    });
    return { ok: true };
  };
  try {
    const source = await readFile(
      new URL("../src/assets/opencode-plugin.js", import.meta.url),
      "utf8",
    );
    const { default: plugin } = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    const hooks = await plugin({
      client: {
        session: { get: async () => ({ data: { title: "A session" } }) },
      },
    });
    const input = { sessionID: "session-1" };
    const event = (type) => hooks.event({ event: { type, properties: input } });
    const run = async (tools, failed = false) => {
      await hooks["chat.message"](input, {});
      for (let i = 0; i < tools; i++) {
        await hooks["tool.execute.before"](
          { ...input, tool: "read" },
          { args: { path: "same.txt" } },
        );
        await hooks["tool.execute.after"]({
          ...input,
          tool: "read",
          args: { path: "same.txt" },
        });
      }
      await event(failed ? "session.error" : "session.idle");
      const completedLength = requests.length;
      await event("session.idle");
      assert.ok(
        requests
          .slice(completedLength)
          .every(({ body }) => body.phase === undefined),
        "duplicate idle or idle after error stays visual only",
      );
    };
    await hooks["chat.message"]({}, {});
    assert.equal(
      requests.length,
      0,
      "invalid session IDs cannot enter turn tracking",
    );
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "already-running" },
      },
    });
    assert.equal(requests.at(-1).body.text, "Done.");
    assert.equal(
      requests.at(-1).body.phase,
      undefined,
      "unknown turns preserve visuals without XP",
    );
    requests.length = 0;
    await run(0);
    await run(8);
    await run(2, true);
    // Identical subsequent turns must remain distinct under content-hash dedupe.
    await run(0);
    const bubbles = requests.filter(({ kind }) => kind === "bubble");
    assert.equal(
      bubbles.filter(({ body }) => body.phase === "user-prompt").length,
      4,
    );
    assert.equal(bubbles.filter(({ body }) => body.phase === "stop").length, 4);
    assert.equal(bubbles.filter(({ body }) => body.phase === "pre").length, 10);
    assert.equal(
      bubbles.filter(({ body }) => body.phase === "post").length,
      10,
    );
    for (let i = 0; i < requests.length; i += 2) {
      const state = requests[i];
      const bubble = requests[i + 1];
      assert.equal(state.kind, "state");
      assert.equal(bubble.kind, "bubble");
      assert.equal(state.body.event_id, bubble.body.event_id);
      assert.equal(state.body.phase, bubble.body.phase);
      assert.equal(state.body.session_id, "session-1");
      if (bubble.body.phase === "stop") {
        assert.ok(["jumping", "failed"].includes(state.body.state));
        assert.equal(bubble.body.agent_state, state.body.state);
      }
    }
    assert.equal(
      new Set(bubbles.map(({ body }) => body.event_id)).size,
      bubbles.length,
    );

    // Optional cross-repository contract check against the real drain implementation.
    if (process.env.TAMAHERMES_REFERENCE) {
      const check = spawnSync(
        "python3",
        [
          "-c",
          `
import json, sys
from pathlib import Path
from tamahermes.evopet_drain import classify
rows = json.load(sys.stdin)
events = [(Path(f"{i:06d}-{row['kind']}.json"), row['body']) for i, row in enumerate(rows)]
result = classify(events)
assert result['awarded'] == {'prompt_sent': 4, 'task_success': 3, 'task_failure': 1}, result
assert result['xp'] == 63, result
assert result['unresolved_turns'] == 0, result
# Replay the same accepted files: content dedupe must prevent any second award.
assert classify(events, seen_hashes=result['hashes'])['xp'] == 0
# Every possible two-batch split must retain exactly the same XP. Also
# consume one HTTP post per drain batch: no in-memory state may be required.
for split in range(len(events) + 1):
    first = classify(events[:split])
    second = classify(events[split:], seen_hashes=first['hashes'])
    assert first['xp'] + second['xp'] == 63, (split, first, second)
assert sum(classify([event])['xp'] for event in events) == 63
print('real drain: 4 prompts, 3 successes, 1 failure; 63 XP; replay 0 XP')
`,
        ],
        {
          input: JSON.stringify(requests),
          encoding: "utf8",
          env: { ...process.env, PYTHONPATH: process.env.TAMAHERMES_REFERENCE },
        },
      );
      assert.equal(check.status, 0, check.stderr || check.stdout);
      process.stdout.write(check.stdout);
    }
    await writeFile(join(runtime, "hooks-disabled"), "");
    const before = requests.length;
    await hooks["chat.message"](input, {});
    assert.equal(requests.length, before, "killswitch is preserved");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
});
