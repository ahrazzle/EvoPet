import { describe, expect, test } from "bun:test";

import {
  addTurn,
  MAX_SNAPSHOT_BYTES,
  parseGateInput,
  parseSnapshot,
  progress,
} from "../src/data/companion";
import { gateReport, TOP_XP } from "../src/data/curve";

const fixture = () => ({
  schemaVersion: 1,
  xp: 1040,
  levels: {
    maxLevel: 999,
    topXp: TOP_XP,
    evolutionGates: [11, 23, 32, 45],
    gateXp: gateReport(),
  },
  stats: { energy: 70 },
  attribution: {
    profiles: { privateName: { absorbed: 1000 } },
    foreign: { codex: { xp: 40 } },
  },
  cursor: { privatePath: "/private" },
  prompt: "private content",
});
describe("companion progression", () => {
  test("turns, evolution boundaries and top level use the canonical curve", () => {
    expect(addTurn(0, "success")).toBe(18);
    expect(addTurn(0, "failure")).toBe(9);
    expect(progress(999).stage).toBe("egg");
    expect(progress(1000).stage).toBe("hatchling");
    expect(progress(1000).percent).toBe(0);
    expect(progress(TOP_XP).level).toBe(999);
    expect(progress(TOP_XP).ceiling).toBeNull();
  });
  test("rejects fractional, unsafe or invalid numbers and gate lists", () => {
    for (const xp of [-1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => progress(xp)).toThrow();
    for (const gates of ["2.2,5", "2,2", "10,2", "", "2,3,4,5,6"])
      expect(() => parseGateInput(gates)).toThrow();
    expect(parseGateInput("11, 23, 32, 45")).toEqual([11, 23, 32, 45]);
  });
});
describe("local snapshot boundary", () => {
  test("projects only safe supported numbers and anonymous source groups", () => {
    const parsed = parseSnapshot(JSON.stringify(fixture()));
    expect(parsed.xp).toBe(1040);
    expect(parsed.stats).toEqual({ energy: 70 });
    expect(parsed.sources).toEqual([
      { label: "Hermes profiles", xp: 1000 },
      { label: "Other agents", xp: 40 },
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(/private|codex|prompt|cursor/);
  });
  test("uses active pet XP without leaking its name or conflating attribution", () => {
    const data = {
      ...fixture(),
      activePetId: "privatePet",
      pets: { privatePet: { xp: 40 } },
    };
    const parsed = parseSnapshot(JSON.stringify(data));
    expect(parsed.xp).toBe(40);
    expect(JSON.stringify(parsed)).not.toContain("privatePet");
    expect(() =>
      parseSnapshot(JSON.stringify({ ...data, activePetId: "missing" })),
    ).toThrow("active pet");
  });
  test("accepts a realistic retained dedupe cursor without retaining it", () => {
    const data = {
      ...fixture(),
      cursor: {
        consumed: Array.from(
          { length: 1000 },
          (_, i) => `event-${i}-${"a".repeat(120)}`,
        ),
        consumed_hashes: Array.from({ length: 2000 }, () => "b".repeat(64)),
      },
    };
    const encoded = JSON.stringify(data);
    expect(encoded.length).toBeGreaterThan(262144);
    expect(parseSnapshot(encoded).xp).toBe(1040);
    expect(JSON.stringify(parseSnapshot(encoded))).not.toContain("consumed");
  });
  test("curve mismatch messages never reflect imported nonnumeric metadata", () => {
    const data = fixture();
    const levels = data.levels as unknown as Record<string, unknown>;
    levels.maxLevel = "PRIVATE_PROMPT_SENTINEL";
    try {
      parseSnapshot(JSON.stringify(data));
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as Error).message).not.toContain("PRIVATE");
      expect((error as Error).message).toContain("different curve");
    }
  });
  test("refuses old and conflicting contracts", () => {
    const data = fixture();
    data.levels.maxLevel = 99;
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow(
      "different curve",
    );
    data.levels.maxLevel = 999;
    data.levels.topXp = 100000;
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow("curve");
    data.levels.topXp = TOP_XP;
    data.levels.gateXp[0].xp++;
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow("curve");
  });
  test("refuses malformed, oversized, unsafe stats and impossible source counts", () => {
    for (const text of ["null", "[]", "{", " ".repeat(MAX_SNAPSHOT_BYTES + 1)])
      expect(() => parseSnapshot(text)).toThrow();
    const data = fixture();
    data.stats.energy = 101;
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow("energy");
    data.stats.energy = 70;
    data.attribution.profiles.privateName.absorbed = 2000;
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow("exceeds");
  });
});
