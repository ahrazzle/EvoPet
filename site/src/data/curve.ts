/**
 * The ladder, ported from the pet's own contract.
 *
 * Source of truth: `evopet-pet/tamahermes/levels.py` (read, not remembered).
 * Every number on this site is computed here from the published formula rather
 * than typed into prose, on the server for the first render and in the browser
 * for the gate control. One function, two callers, no drift.
 *
 * The port is deliberate and literal: same constants, same rounding, and the
 * same refusal messages as `validate_gates`, because those messages are shown
 * to a reader as the guardrails of the gate control.
 */

export const MAX_LEVEL = 999;
export const QUADRATIC_TERM = 10;
export const TAIL_DIVISOR = 1_000_000_000;
/**
 * The ladder's top rung: `xpForLevel(MAX_LEVEL)`. A derived value, not a cap —
 * the number is the same in the pet's own module and is pinned by a test on
 * both sides so the two ports cannot drift apart.
 */
export const TOP_XP = 998_019_880;
export const MANIFEST_KEY = 'evopet';

export const STAGE_ORDER = ['egg', 'hatchling', 'child', 'teen', 'adult'] as const;

/** Reaching level 11 → 1,000 XP · 23 → 4,840 · 32 → 9,611 · 45 → 19,367 */
export const DEFAULT_EVOLUTION_GATES: readonly number[] = [11, 23, 32, 45];

export interface GateRow {
  gate: number;
  xp: number;
  from: string;
  to: string;
  /** XP between this gate and the one before it (prose: "XP this step costs"). */
  stepXp: number;
}

export interface CurveRow {
  level: number;
  xp: number;
  /** Marginal XP cost of this level: xp(level) − xp(level − 1). */
  costXp: number;
}

/**
 * Cumulative XP needed to *reach* `level`. Level 1 is 0, level `MAX_LEVEL` is
 * the top rung. `10 * u²` is the early ladder every pet actually climbs; the
 * `u⁶ / 1e9` tail is under 1 XP through level 31 and only dominates past level
 * ~300, which is what keeps each level costlier than the one before it.
 */
export function xpForLevel(level: number): number {
  const u = Math.max(0, Math.min(MAX_LEVEL - 1, Math.trunc(level) - 1));
  return QUADRATIC_TERM * u * u + Math.round(u ** 6 / TAIL_DIVISOR);
}

/**
 * The level a pet holding `xp` cumulative XP is in (1..999): the largest level
 * whose floor the XP has reached. A binary search over the bounded range — ten
 * probes against the single `xpForLevel`, monotone by construction, with no
 * inverse to get wrong and no early return at a round number. Anything the
 * ladder cannot hold (`Infinity`, a value past `2⁵³ − 1`) answers `MAX_LEVEL`
 * rather than throwing, because a growth event must never strand a pet.
 */
export function levelForXp(xp: number): number {
  const value = Math.max(0, Math.trunc(xp));
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xpForLevel(mid) <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * A creator's gate list, checked. Throws with the same wording as
 * `levels.validate_gates` so the site can show the runtime's own refusals
 * instead of inventing friendlier ones.
 */
export function validateGates(gates: readonly number[]): number[] {
  const cleaned: number[] = [];
  for (const raw of gates) {
    const value = Math.trunc(Number(raw));
    if (Number.isNaN(value)) throw new Error(`evolution gate ${raw} is outside 1..${MAX_LEVEL}`);
    if (value < 1 || value > MAX_LEVEL) {
      throw new Error(`evolution gate ${value} is outside 1..${MAX_LEVEL}`);
    }
    if (cleaned.length > 0 && value <= cleaned[cleaned.length - 1]) {
      throw new Error(
        `evolution gates must strictly increase; ${value} follows ${cleaned[cleaned.length - 1]}`,
      );
    }
    cleaned.push(value);
  }
  if (cleaned.length === 0) throw new Error('a pet needs at least one evolution gate');
  if (cleaned.length > STAGE_ORDER.length - 1) {
    throw new Error(
      `at most ${STAGE_ORDER.length - 1} gates supported (${STAGE_ORDER.length} forms); got ${cleaned.length}`,
    );
  }
  return cleaned;
}

/** Form names for a gate list: one more form than gate, taken from the fixed order. */
export function formsForGates(gates: readonly number[]): string[] {
  const checked = validateGates(gates);
  const names = Array.from(STAGE_ORDER.slice(0, checked.length + 1));
  return names;
}

/** The creator-facing gate table: level, XP to reach it, and the form it opens. */
export function gateReport(gates: readonly number[] = DEFAULT_EVOLUTION_GATES): GateRow[] {
  const checked = validateGates(gates);
  const forms = formsForGates(checked);
  return checked.map((gate, index) => {
    const xp = xpForLevel(gate);
    const previous = index === 0 ? 0 : xpForLevel(checked[index - 1]);
    return { gate, xp, from: forms[index], to: forms[index + 1], stepXp: xp - previous };
  });
}

/** Cumulative XP at the levels a reader cares about, plus what that level costs. */
export function curveReport(levels: readonly number[]): CurveRow[] {
  return levels.map((level) => ({
    level,
    xp: xpForLevel(level),
    costXp: level > 1 ? xpForLevel(level) - xpForLevel(level - 1) : 0,
  }));
}

/** `1,000` — every number on the site is grouped by this, never by eye. */
export function formatXp(value: number): string {
  return value.toLocaleString('en-US');
}
