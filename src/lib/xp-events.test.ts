import { describe, expect, it } from "bun:test";

/**
 * The XP event table, pinned on the site side.
 *
 * `site/src/data/xp-events.ts` claims its numbers are the values in
 * `tamahermes/state.py`'s `EVENT_DELTAS`, but that file lives in the
 * TamaHermes repo -- nothing in this checkout fails if upstream drifts.
 * This test freezes the seven documented values so a drift becomes a loud
 * red test instead of a silent docs lie. If upstream `EVENT_DELTAS` changes,
 * update both `site/src/data/xp-events.ts` and the table below.
 */

import { XP_EVENTS } from "../../site/src/data/xp-events";

describe("XP_EVENTS pins the TamaHermes EVENT_DELTAS values", () => {
  const expected: [string, number][] = [
    ["task_success", 14],
    ["recovery", 6],
    ["task_failure", 5],
    ["review_opened", 5],
    ["prompt_sent", 4],
    ["care", 3],
    ["session_start", 2],
  ];

  it("has exactly the seven documented events in order", () => {
    expect(XP_EVENTS.map((row) => row.event)).toEqual(expected.map(([event]) => event));
  });

  it("matches the documented XP values", () => {
    for (const [event, xp] of expected) {
      const row = XP_EVENTS.find((candidate) => candidate.event === event);
      expect(row, `missing XP_EVENTS row for ${event}`).toBeDefined();
      expect(row!.xp).toBe(xp);
    }
  });

  it("has no duplicate events", () => {
    const events = XP_EVENTS.map((row) => row.event);
    expect(new Set(events).size).toBe(events.length);
  });
});
