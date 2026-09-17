import { describe, expect, it } from "bun:test";

/**
 * The EvoPet curve contract, pinned on the site side.
 *
 * `site/src/data/curve.ts` is documented as a literal port of the pet's own
 * `tamahermes/levels.py`, and every number the docs and the landing page render
 * comes out of it. Before this file the site had no test runner covering the
 * curve at all, so a constant could drift here and the pages would simply print
 * the wrong arithmetic. These tests freeze the shape: the spot table, an
 * exhaustive 1..999 digest, the cost-only-ever-rises rule, the extremes
 * `levelForXp` must survive, and -- the load-bearing one -- the migration
 * promise that no pet can be moved *down* by a curve change.
 *
 * The frozen old table is kept verbatim inside this file on purpose: nothing
 * else in the repo may quote the old numbers, and "a level once reached is
 * never lost" is only checkable against the curve pets were actually grown on.
 */

import {
  curveReport,
  DEFAULT_EVOLUTION_GATES,
  formatXp,
  gateReport,
  levelForXp,
  MAX_LEVEL,
  QUADRATIC_TERM,
  TAIL_DIVISOR,
  TOP_XP,
  validateGates,
  xpForLevel,
} from "../../site/src/data/curve";

// The seven rungs the contract pins by name.
const SPOT_LEVELS = [1, 10, 50, 99, 200, 500, 999];
const SPOT_XP = [0, 810, 24_024, 96_926, 458_114, 17_928_445, 998_019_880];

// FNV-1a (32-bit) over the 999 comma-separated values in level order, each
// followed by a comma. The same digest the pet tree pins, so the two ports are
// checked against one another and not merely against themselves.
const TABLE_DIGEST = "ece39a18";

// The curve this replaces, verbatim: round(100_000 * ((L - 1) / 98) ** 2.0) for
// L = 1..99, as the shipped code computed it.
const OLD_CURVE = [
  0, 10, 42, 94, 167, 260, 375, 510, 666, 843, 1_041, 1_260, 1_499, 1_760,
  2_041, 2_343, 2_666, 3_009, 3_374, 3_759, 4_165, 4_592, 5_040, 5_508, 5_998,
  6_508, 7_039, 7_591, 8_163, 8_757, 9_371, 10_006, 10_662, 11_339, 12_037,
  12_755, 13_494, 14_254, 15_035, 15_837, 16_660, 17_503, 18_367, 19_252,
  20_158, 21_085, 22_032, 23_001, 23_990, 25_000, 26_031, 27_082, 28_155,
  29_248, 30_362, 31_497, 32_653, 33_830, 35_027, 36_245, 37_484, 38_744,
  40_025, 41_327, 42_649, 43_992, 45_356, 46_741, 48_147, 49_573, 51_020,
  52_489, 53_978, 55_487, 57_018, 58_569, 60_142, 61_735, 63_349, 64_983,
  66_639, 68_315, 70_012, 71_731, 73_469, 75_229, 77_010, 78_811, 80_633,
  82_476, 84_340, 86_224, 88_130, 90_056, 92_003, 93_971, 95_960, 97_970,
  100_000,
];

// The live ledgers read at migration time, and the level their XP earns now.
const REAL_LEDGERS: [number, number][] = [
  [59, 3],
  [2_190, 15],
  [4_692, 22],
  [7_856, 29],
  [14_845, 39],
  [36_177, 61],
  [152_522, 123],
];

function curveValues(): number[] {
  const values: number[] = [];
  for (let level = 1; level <= MAX_LEVEL; level += 1)
    values.push(xpForLevel(level));
  return values;
}

function fnv1a32(text: string): string {
  // ASCII only: hash the code units, which for this table are the bytes.
  // (Iterating the string yields one-character strings, and `&` would coerce
  // "7" to the number 7 rather than to its byte 55.)
  let digest = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    digest ^= text.charCodeAt(index) & 0xff;
    digest = Math.imul(digest, 0x01000193) >>> 0;
  }
  return digest.toString(16).padStart(8, "0");
}

describe("the ladder's published constants", () => {
  it("is bounded at 999 levels with the sextic hybrid as its shape", () => {
    expect(MAX_LEVEL).toBe(999);
    expect(QUADRATIC_TERM).toBe(10);
    expect(TAIL_DIVISOR).toBe(1_000_000_000);
  });

  it("states the top rung as a value the formula itself produces", () => {
    expect(TOP_XP).toBe(998_019_880);
    expect(xpForLevel(MAX_LEVEL)).toBe(TOP_XP);
  });

  it("pins the named rungs exactly", () => {
    expect(SPOT_LEVELS.map((level) => xpForLevel(level))).toEqual(SPOT_XP);
  });
});

describe("the whole table", () => {
  it("matches its frozen digest across all 999 levels", () => {
    const values = curveValues();
    expect(values.length).toBe(999);
    expect(fnv1a32(`${values.join(",")},`)).toBe(TABLE_DIGEST);
  });

  it("stays strictly increasing, with every level costlier than the last", () => {
    const margins: number[] = [];
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      const current = xpForLevel(level);
      const next = xpForLevel(level + 1);
      expect(next).toBeGreaterThan(current);
      margins.push(next - current);
    }
    for (let index = 1; index < margins.length; index += 1) {
      expect(margins[index]).toBeGreaterThan(margins[index - 1]);
    }
    expect(margins[0]).toBe(10);
    expect(margins[margins.length - 1]).toBe(5_945_329);
  });

  it("round-trips every level through its own floor", () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level < MAX_LEVEL) {
        expect(levelForXp(xpForLevel(level + 1) - 1)).toBe(level);
      }
    }
  });

  it("computes each level's cost from the level below it", () => {
    const rows = curveReport([1, 2, 50, 999]);
    expect(rows.map((row) => row.xp)).toEqual([0, 10, 24_024, 998_019_880]);
    expect(rows.map((row) => row.costXp)).toEqual([0, 10, 972, 5_945_329]);
  });
});

describe("levelForXp at the extremes", () => {
  it("answers the top of the ladder for anything at or above it", () => {
    for (const xp of [
      TOP_XP,
      TOP_XP + 1,
      10 ** 9,
      Number.MAX_SAFE_INTEGER,
      Infinity,
    ]) {
      expect(levelForXp(xp)).toBe(MAX_LEVEL);
    }
  });

  it("clamps instead of throwing on input that is not a number", () => {
    const garbage = [
      Number.NaN,
      "junk",
      null,
      undefined,
      {},
    ] as unknown as number[];
    for (const xp of garbage) {
      expect(() => levelForXp(xp)).not.toThrow();
      expect(levelForXp(xp)).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it("starts at level 1 and never reads a negative as a level", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(9)).toBe(1);
    expect(levelForXp(10)).toBe(2);
  });

  it("puts 96,926 at the start of level 99 with a real span above it", () => {
    // The old curve's top was this XP's ceiling; the new one only reaches level
    // 99 here, so the band the bar fills against still has room in it.
    expect(levelForXp(96_926)).toBe(99);
    expect(xpForLevel(100) - xpForLevel(99)).toBe(2_025);
  });
});

describe("the migration cannot move a pet down", () => {
  it("costs no more than the old curve at every level 1..99, and crosses it nowhere", () => {
    expect(OLD_CURVE.length).toBe(99);
    const differences: number[] = [];
    for (let level = 1; level <= 99; level += 1) {
      differences.push(xpForLevel(level) - OLD_CURVE[level - 1]);
    }
    expect(Math.max(...differences)).toBe(0);
    for (const difference of differences)
      expect(difference).toBeLessThanOrEqual(0);
  });

  it("still earns at least the level the old curve gave at the same XP", () => {
    for (let level = 1; level <= 99; level += 1) {
      expect(levelForXp(OLD_CURVE[level - 1])).toBeGreaterThanOrEqual(level);
    }
  });

  it("reads the old top as level 100 of 999, not as the end of the ladder", () => {
    expect(levelForXp(100_000)).toBe(100);
    expect(levelForXp(100_000)).toBeLessThan(MAX_LEVEL);
  });

  it("maps the real ledgers to the levels their XP earns", () => {
    for (const [xp, level] of REAL_LEDGERS) {
      expect(levelForXp(xp)).toBe(level);
    }
    expect(levelForXp(152_522)).toBe(123);
  });
});

describe("the gates the site renders", () => {
  it("prices the default pet's gates on the published curve", () => {
    expect(DEFAULT_EVOLUTION_GATES).toEqual([11, 23, 32, 45]);
    expect(gateReport().map((row) => row.xp)).toEqual([
      1_000, 4_840, 9_611, 19_367,
    ]);
    expect(gateReport().map((row) => row.stepXp)).toEqual([
      1_000, 3_840, 4_771, 9_756,
    ]);
    expect(gateReport()[0]).toMatchObject({
      gate: 11,
      from: "egg",
      to: "hatchling",
    });
  });

  it("keeps each default gate within the 5% the creator targets allow", () => {
    const targets = [1_000, 5_000, 10_000, 20_000];
    gateReport().forEach((row, index) => {
      expect(Math.abs(row.xp - targets[index]) / targets[index]).toBeLessThan(
        0.05,
      );
    });
  });

  it("refuses a gate outside the range with the runtime's own 1..999 wording", () => {
    expect(() => validateGates([120])).not.toThrow(); // reachable today, not out of range
    expect(() => validateGates([1000])).toThrow(
      "evolution gate 1000 is outside 1..999",
    );
    expect(() => validateGates([0])).toThrow(
      "evolution gate 0 is outside 1..999",
    );
    expect(() => validateGates([MAX_LEVEL])).not.toThrow();
  });

  it("keeps its other refusals word for word", () => {
    expect(() => validateGates([40, 20])).toThrow(
      "evolution gates must strictly increase; 20 follows 40",
    );
    expect(() => validateGates([])).toThrow(
      "a pet needs at least one evolution gate",
    );
    expect(() => validateGates([1, 2, 3, 4, 5])).toThrow(
      "at most 4 gates supported (5 forms); got 5",
    );
  });
});

describe("formatXp", () => {
  it("groups the numbers the same way the prose does", () => {
    expect(formatXp(TOP_XP)).toBe("998,019,880");
    expect(formatXp(1_000)).toBe("1,000");
  });
});
