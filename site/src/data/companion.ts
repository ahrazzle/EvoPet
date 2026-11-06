import {
  DEFAULT_EVOLUTION_GATES,
  gateReport,
  levelForXp,
  MAX_LEVEL,
  STAGE_ORDER,
  TOP_XP,
  validateGates,
  xpForLevel,
} from "./curve";

export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export interface Snapshot {
  xp: number;
  gates: number[];
  stats: Record<string, number>;
  sources: { label: string; xp: number }[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function numeric(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative whole number.`);
  return value;
}
/** Only an allowlisted numeric projection leaves this function. Imported names and metadata are discarded. */
export function parseSnapshot(text: string): Snapshot {
  if (new TextEncoder().encode(text).length > MAX_SNAPSHOT_BYTES)
    throw new Error(
      "Snapshot is too large. Choose a file no larger than 4 MiB.",
    );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Choose a valid JSON ledger snapshot.");
  }
  if (!record(data) || data.schemaVersion !== 1 || !record(data.levels))
    throw new Error(
      "Expected a version 1 combined ledger with a levels contract.",
    );
  const levels = data.levels;
  if (levels.maxLevel !== MAX_LEVEL)
    throw new Error(
      `This ledger uses a different curve${typeof levels.maxLevel === "number" && Number.isSafeInteger(levels.maxLevel) ? ` (maximum level ${levels.maxLevel})` : ""}. This preview supports the 999-level EvoPet ladder; your file has not been changed.`,
    );
  if (levels.topXp !== TOP_XP)
    throw new Error(
      "The ledger curve does not match this preview. No progress was imported.",
    );
  if (
    !Array.isArray(levels.evolutionGates) ||
    levels.evolutionGates.some(
      (value) => typeof value !== "number" || !Number.isSafeInteger(value),
    )
  )
    throw new Error("Invalid evolution gates in ledger.");
  const gates = validateGates(levels.evolutionGates);
  // Verify meaningful published curve points instead of trusting an arbitrary formula string.
  if (
    !Array.isArray(levels.gateXp) ||
    !levels.gateXp.length ||
    levels.gateXp.length !== gates.length
  )
    throw new Error(
      "The ledger must declare its gate XP so the curve can be checked.",
    );
  for (const [index, row] of levels.gateXp.entries()) {
    if (!record(row)) throw new Error("Invalid gate XP contract.");
    const gate = numeric(row.gate ?? row.level, "Gate level");
    if (
      gate !== gates[index] ||
      gate < 1 ||
      gate > MAX_LEVEL ||
      row.xp !== xpForLevel(gate)
    )
      throw new Error(
        "The ledger curve does not match this preview. No progress was imported.",
      );
  }
  const totalXp = numeric(data.xp, "XP");
  let xp = totalXp;
  if (data.pets !== undefined && !record(data.pets))
    throw new Error("Invalid pet progression buckets.");
  if (record(data.pets) && Object.keys(data.pets).length > 0) {
    if (
      typeof data.activePetId !== "string" ||
      !Object.hasOwn(data.pets, data.activePetId) ||
      !record(data.pets[data.activePetId])
    )
      throw new Error("The ledger has pet buckets but no valid active pet.");
    xp = numeric(
      (data.pets[data.activePetId] as Record<string, unknown>).xp,
      "Active pet XP",
    );
    if (xp > totalXp)
      throw new Error("Active pet XP exceeds the combined total.");
  }
  const stats: Record<string, number> = {};
  if (data.stats !== undefined && !record(data.stats))
    throw new Error("Ledger stats must be an object.");
  for (const key of [
    "health",
    "energy",
    "mood",
    "bond",
    "focus",
    "resilience",
    "restlessness",
    "mess",
    "satiety",
  ]) {
    if (record(data.stats) && data.stats[key] !== undefined) {
      const value = numeric(data.stats[key], key);
      if (value > 100) throw new Error(`${key} must be between 0 and 100.`);
      stats[key] = value;
    }
  }
  const sources: Snapshot["sources"] = [];
  if (record(data.attribution)) {
    for (const [bucket, label] of [
      ["profiles", "Hermes profiles"],
      ["foreign", "Other agents"],
    ] as const) {
      const entries = data.attribution[bucket];
      if (entries === undefined) continue;
      if (!record(entries) || Object.keys(entries).length > 100)
        throw new Error("Invalid source attribution.");
      let total = 0;
      for (const entry of Object.values(entries)) {
        if (!record(entry)) throw new Error("Invalid source attribution.");
        total += numeric(
          entry[bucket === "profiles" ? "absorbed" : "xp"],
          "Source XP",
        );
        if (!Number.isSafeInteger(total))
          throw new Error("Source XP exceeds the supported range.");
      }
      sources.push({ label, xp: total });
    }
    if (sources.reduce((sum, source) => sum + source.xp, 0) > totalXp)
      throw new Error("Attributed XP exceeds the ledger total.");
  }
  return { xp, gates, stats, sources };
}
export function progress(
  xp: number,
  gates: readonly number[] = DEFAULT_EVOLUTION_GATES,
) {
  numeric(xp, "XP");
  const checked = validateGates(gates);
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = level < MAX_LEVEL ? xpForLevel(level + 1) : null;
  const rows = gateReport(checked);
  const reached = rows.filter((row) => xp >= row.xp).length;
  return {
    level,
    stage: STAGE_ORDER[reached],
    next: rows.find((row) => xp < row.xp) ?? null,
    floor,
    ceiling,
    percent:
      ceiling === null
        ? 100
        : Math.max(0, Math.min(100, ((xp - floor) / (ceiling - floor)) * 100)),
  };
}
export function addTurn(xp: number, outcome: "success" | "failure"): number {
  numeric(xp, "XP");
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    xp + (outcome === "success" ? 18 : 9),
  );
}
export function parseGateInput(value: string): number[] {
  const pieces = value.split(",").map((value) => value.trim());
  if (pieces.some((value) => !/^\d+$/.test(value)))
    throw new Error("Enter one to four whole levels separated by commas.");
  return validateGates(pieces.map(Number));
}
